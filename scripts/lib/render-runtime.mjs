/**
 * Project-agnostic render runtime for the GraphCompose AI Template Flow.
 *
 * Reads template-project.json + revision.json, runs the same end-to-end
 * pipeline every reference example used to duplicate by hand:
 *
 *   1. Skill validation gate (cache lookup → revision/skill-validation-report.md).
 *   2. Asset resolver (when revision/asset-request.json exists; skipped on
 *      data-only revisions whose manifest + icons inherited from parent).
 *   3. `mvn -q package` for the preview-renderer + the per-project
 *      render-runner module (skipped on data-only / asset-only revisions
 *      when target/classes + preview-renderer.jar already exist).
 *   4. `mvn dependency:build-classpath` to materialise the runner's
 *      transitive runtime classpath.
 *   5. Two render passes via tools/preview-renderer: clean PDF +
 *      output.png, then debug PDF (`--guide-lines true`) +
 *      output-debug.png.
 *   6. Continuation pages, rasterised inside the render pass itself — the JVM
 *      that built the PDF is holding it open, so `render.pages` is passed
 *      through as `--pages` rather than paid for one process at a time.
 *
 * The runtime knows nothing about CV vs invoice vs proposal vs
 * cover-letter. All doc-kind-specific choices live in
 * template-project.json's `render` block.
 *
 * Required fields under `template-project.json.render`:
 *   - templateClass       — fully-qualified Java class the runner instantiates
 *
 * Optional fields with safe defaults:
 *   - specProviderClass   — falls back to template-project.json.specProviderClass
 *   - dataFileName        — defaults to "<docKind>-data.json"
 *   - pages               — defaults to 1 (only output.png is written)
 *   - runnerPomRelPath    — defaults to "render-runner/pom.xml"
 *   - debugPass           — defaults to true
 *   - assetResolverEnabled — defaults to true (and only fires when
 *                            asset-request.json actually exists in the
 *                            revision folder)
 *
 * RENDER_NO_SKIP=1 forces the full pipeline regardless of scope.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createLiveMirror } from "./live-mirror.mjs";
import { ensureSkillValidationVerdict } from "./skill-validation-gate.mjs";

/**
 * Render one revision.
 *
 * `repoRoot` is the INSTALL root — where preview-renderer, the asset resolver
 * and the live mirror live. `projectDir` is where the work is, which is only
 * the same tree in development mode; callers that resolve a workspace pass it
 * explicitly. Left out, it falls back to <install>/examples/<projectId> so the
 * per-example shims keep working unchanged.
 */
export function runRender({
  repoRoot,
  projectId,
  revisionId,
  projectDir: explicitProjectDir,
  dataFileOverride = null,
  outputSuffix = "",
}) {
  const projectDir = explicitProjectDir ?? path.join(repoRoot, "examples", projectId);
  const templateProjectPath = path.join(projectDir, "template-project.json");
  if (!fs.existsSync(templateProjectPath)) {
    abort(`template-project.json not found: ${templateProjectPath}`);
  }
  const templateProject = JSON.parse(
    fs.readFileSync(templateProjectPath, "utf8"),
  );

  const revisionDir = path.join(projectDir, "revisions", revisionId);
  if (!fs.existsSync(revisionDir)) {
    abort(`revision not found: ${revisionDir}`);
  }

  const renderConfig = templateProject.render || {};
  const templateClass = renderConfig.templateClass;
  if (!templateClass) {
    abort(
      `template-project.json.render.templateClass is required (project: ${projectId}). ` +
        `Add a "render" block; see scripts/lib/render-runtime.mjs for the contract.`,
    );
  }

  const docKind = templateProject.docKind || "doc";
  // dataFileName: undefined → default to <docKind>-data.json (spec
  //                       provider conditional on file existence);
  //                null → project ships inline data, spec provider
  //                       runs unconditionally (invoice-style);
  //                string → explicit name with conditional behaviour.
  const dataFileName =
    dataFileOverride
      ?? (renderConfig.dataFileName === undefined
        ? `${docKind}-data.json`
        : renderConfig.dataFileName);
  const dataDriven = dataFileName !== null;
  const specProviderClass =
    renderConfig.specProviderClass || templateProject.specProviderClass || null;
  const pages = Math.max(1, Number(renderConfig.pages) || 1);
  const debugPass = renderConfig.debugPass !== false;
  const runnerPomRelPath =
    renderConfig.runnerPomRelPath || "render-runner/pom.xml";
  const runnerPom = path.join(projectDir, runnerPomRelPath);
  const runnerDir = path.dirname(runnerPom);
  const assetResolverEnabled = renderConfig.assetResolverEnabled !== false;

  const previewRendererDir = path.join(repoRoot, "tools", "preview-renderer");
  const previewRendererPom = path.join(previewRendererDir, "pom.xml");
  const previewRendererJar = path.join(
    previewRendererDir,
    "target",
    "preview-renderer.jar",
  );
  const assetResolverCli = path.join(
    repoRoot,
    "tools",
    "asset-resolver",
    "src",
    "cli.mjs",
  );

  const assetRequestFile = path.join(revisionDir, "asset-request.json");
  const classpathFile = path.join(
    runnerDir,
    "target",
    "runtime-classpath.txt",
  );
  const renderClasspathFile = path.join(
    runnerDir,
    "target",
    `${revisionId}-render-classpath.txt`,
  );
  // A suffix lets one revision hold more than one render of the same template:
  // the reference-shaped one the diff compares, and an overflow fixture that
  // proves the pagination path. Empty by default, so the ordinary render keeps
  // the names every other tool already reads.
  const fixtureRender = outputSuffix !== "";
  const outputPdf = path.join(revisionDir, `output${outputSuffix}.pdf`);
  const debugPdf = path.join(revisionDir, `output${outputSuffix}-debug.pdf`);
  const dataFile = dataDriven ? path.join(revisionDir, dataFileName) : null;
  // 0. Revision discipline
  //
  // A revision that already carries a review has had its pass judged. Rendering
  // into it again is the moment a correction should have opened a new revision
  // and did not — and nothing said so, because `new-revision` is a command
  // nobody is obliged to run.
  //
  // Measured on a real proposal run: one revision lived 2h 23m and absorbed
  // three corrections in place. The template was rewritten, the render replaced
  // and the review overwritten, so there was no state to roll back to, the two
  // corrections survive nowhere in the record, and `iterate-status` — which
  // counts iterations by walking the revision chain — saw one pass where there
  // had been three. Every loop bound was off for that run.
  //
  // A failed compile fixed and re-rendered within the same pass is not this:
  // that revision has no review yet.
  if (!fixtureRender && fs.existsSync(path.join(revisionDir, "visual-review.json"))) {
    if (process.env.RENDER_SAME_REVISION !== "1") {
      abort(
        `${revisionId} already has a visual-review.json — its pass has been judged, so ` +
          "rendering into it again would overwrite the render the review was written about."+"\n" +
          "  Open a revision for this change:\n" +
          `    node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<what you are changing>" --project ${projectDir}\n` +
          "  Re-rendering the same revision on purpose: RENDER_SAME_REVISION=1",
      );
    }
    console.log(
      `> re-rendering ${revisionId}, which already has a review (RENDER_SAME_REVISION=1)`,
    );
  }

  const live = createLiveMirror(repoRoot, projectDir);

  // 1. Skill validation gate
  ensureSkillValidationVerdict({
    repoRoot,
    revisionDir,
    project: templateProject,
  });

  // 2-3. Short-circuit decisions (per orchestrator scope contract)
  const revisionJsonFile = path.join(revisionDir, "revision.json");
  const revisionJson = fs.existsSync(revisionJsonFile)
    ? JSON.parse(fs.readFileSync(revisionJsonFile, "utf8"))
    : {};
  const scope = revisionJson.scope ?? null;
  const forceFullPipeline = process.env.RENDER_NO_SKIP === "1";

  const skipAssetResolver =
    !forceFullPipeline &&
    scope === "data-only" &&
    fs.existsSync(path.join(revisionDir, "assets-manifest.json")) &&
    fs.existsSync(path.join(revisionDir, "assets", "icons"));

  const cachedClasses = path.join(runnerDir, "target", "classes");
  const skipMavenPackage =
    !forceFullPipeline &&
    (scope === "data-only" || scope === "asset-only") &&
    fs.existsSync(cachedClasses) &&
    fs.existsSync(previewRendererJar);

  // 2. Asset resolver
  if (!assetResolverEnabled) {
    console.log(`> asset-resolver disabled by project config`);
  } else if (skipAssetResolver) {
    console.log(
      `> asset-resolver skipped (scope=data-only; manifest + icons inherited)`,
    );
  } else if (fs.existsSync(assetRequestFile)) {
    console.log(`> asset-resolver --revision ${revisionDir}`);
    run("node", [assetResolverCli, "--revision", revisionDir], repoRoot);
  } else {
    console.log(
      `> asset-resolver skipped (no ${path.relative(repoRoot, assetRequestFile)})`,
    );
  }

  // 3. mvn package
  if (skipMavenPackage) {
    console.log(
      `> mvn package skipped (scope=${scope}; runner target/classes + preview-renderer.jar reused)`,
    );
  } else {
    // Only rebuild the renderer where its source actually lives. An installed
    // harness ships the built jar and the pom but not the sources, and a
    // `package` there does not fail — it succeeds, producing a jar with no
    // classes in it, overwriting the working one. The first Codex acceptance
    // run died on "Could not find or load main class" for exactly this.
    const rendererSources = path.join(previewRendererDir, "src");
    if (fs.existsSync(rendererSources)) {
      runMaven(
        ["-q", "-B", "-f", previewRendererPom, "-DskipTests=true", "package"],
        repoRoot,
      );
    } else if (fs.existsSync(previewRendererJar)) {
      console.log("> preview-renderer build skipped (installed copy; using the shipped jar)");
    } else {
      abort(
        `preview renderer missing and not buildable here: ${previewRendererJar} does not exist ` +
          `and ${rendererSources} was not shipped. Reinstall the harness, or run npm run setup in a checkout.`,
      );
    }
    runMaven(
      [
        "-q",
        "-B",
        "-f",
        runnerPom,
        `-Drevision.id=${revisionId}`,
        "-DskipTests=true",
        "package",
      ],
      repoRoot,
    );
  }

  // 4. classpath build
  runMaven(
    [
      "-q",
      "-B",
      "-f",
      runnerPom,
      `-Drevision.id=${revisionId}`,
      "dependency:build-classpath",
      "-Dmdep.outputFile=target/runtime-classpath.txt",
    ],
    repoRoot,
  );
  const dependencyClasspath = fs.existsSync(classpathFile)
    ? fs.readFileSync(classpathFile, "utf8").trim()
    : "";
  const classpath = [
    path.join(runnerDir, "target", "classes"),
    dependencyClasspath,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  fs.writeFileSync(renderClasspathFile, classpath, "utf8");

  // Spec provider logic:
  //   - data-driven project (dataFileName set, file present) → pass
  //     --spec-provider; the provider reads the JSON from
  //     graphcompose.revision.dir (already set on the java call).
  //   - data-driven project but file missing → drop the spec; the
  //     template's zero-arg compose() path runs (e.g. early CV
  //     revisions before the JSON was produced).
  //   - non-data-driven project (dataFileName: null) → ALWAYS pass
  //     the spec provider; invoice-style providers build the spec
  //     inline. preview-renderer requires --spec-provider when the
  //     template's compose() takes two args.
  let specProviderArgs = [];
  if (specProviderClass) {
    if (!dataDriven) {
      specProviderArgs = ["--spec-provider", specProviderClass];
      console.log(`> using spec-provider ${specProviderClass} (inline data)`);
    } else if (fs.existsSync(dataFile)) {
      specProviderArgs = ["--spec-provider", specProviderClass];
      console.log(
        `> using spec-provider for ${path.relative(repoRoot, dataFile)}`,
      );
    } else {
      console.log(
        `> spec-provider skipped (no ${path.relative(repoRoot, dataFile)})`,
      );
    }
  } else {
    console.log(`> spec-provider skipped (project has none)`);
  }

  // 5. Render pass 1 — clean PDF + output.png
  runJava(
    [
      `-Dgraphcompose.revision.dir=${revisionDir}`,
      ...(dataFile ? [`-Dgraphcompose.data.file=${dataFile}`] : []),
      "-jar",
      previewRendererJar,
      "render",
      "--revision",
      revisionDir,
      "--template-class",
      templateClass,
      ...specProviderArgs,
      "--classpath-file",
      renderClasspathFile,
      "--output",
      `output${outputSuffix}.pdf`,
      "--preview",
      `output${outputSuffix}.png`,
      "--dpi",
      "150",
      "--page",
      "0",
      // Every page, in the JVM that just built the PDF and is still holding it
      // open. This used to be one more `java -jar` per continuation page, per
      // pass, and again for the debug render: 1.7s each against 0.22s of bare
      // JVM startup, so a twelve-page document paid about thirty-seven seconds
      // of process launches on every loop pass.
      "--pages",
      String(pages),
    ],
    repoRoot,
  );

  // A suffixed render is a fixture, not something anyone looks at: a checker
  // reads its PDF. The debug overlay exists for a human and the page rasters for
  // the diff, and neither applies — so both are skipped, which halves what an
  // overflow fixture costs a loop pass and removes the only way it could
  // overwrite the real render's artifacts, since those two passes write their
  // names without the suffix.
  const fixtureOnly = outputSuffix !== "";
  if (fixtureOnly) {
    // And it does not touch the live mirror. current.pdf is what a person has
    // open while they work; replacing their document with a thirty-row overflow
    // fixture every loop pass would be worse than showing nothing.
    console.log(`> fixture render complete (${path.basename(outputPdf)}); debug pass and page rasters skipped`);
    return;
  }

  // 6. Continuation pages came out of the render pass above, in the same JVM.

  // Mirror the clean render into the live-preview folder (live/current.*).
  live.update(outputPdf, "current.pdf");
  live.update(path.join(revisionDir, "output.png"), "current.png", "shared");
  live.manifest({ projectId, revisionId, revisionDir, hasDebug: false });

  if (!debugPass) {
    console.log(`> debug pass skipped by project config`);
    live.announce();
    return;
  }

  // 7. Render pass 2 — debug PDF + output-debug.png
  console.log("> rendering debug pass with --guide-lines");
  runJava(
    [
      `-Dgraphcompose.revision.dir=${revisionDir}`,
      ...(dataFile ? [`-Dgraphcompose.data.file=${dataFile}`] : []),
      "-jar",
      previewRendererJar,
      "render",
      "--revision",
      revisionDir,
      "--template-class",
      templateClass,
      ...specProviderArgs,
      "--classpath-file",
      renderClasspathFile,
      "--output",
      "output-debug.pdf",
      "--preview",
      "output-debug.png",
      "--dpi",
      "150",
      "--page",
      "0",
      "--pages",
      String(pages),
      "--guide-lines",
      "true",
    ],
    repoRoot,
  );

  // The debug pass asks for its continuation pages the same way.

  live.update(debugPdf, "current-debug.pdf");
  live.update(path.join(revisionDir, "output-debug.png"), "current-debug.png", "shared");
  live.manifest({ projectId, revisionId, revisionDir, hasDebug: true });
  live.announce();
}

function runMaven(args, cwd) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "mvn", ...args], cwd);
    return;
  }
  run("mvn", args, cwd);
}

function runJava(args, cwd) {
  run("java", args, cwd);
}

function run(command, args, cwd) {
  console.log(`> ${command} ${args.map(quoteArg).join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function quoteArg(arg) {
  return /\s/.test(arg) ? `"${arg}"` : arg;
}

function abort(message) {
  console.error(`[render-runtime] ${message}`);
  process.exit(2);
}
