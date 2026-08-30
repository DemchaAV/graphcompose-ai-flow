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
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createLiveMirror } from "./live-mirror.mjs";
import { acquireProjectLock, ProjectLockedError } from "./project-lock.mjs";
import { describeSeal, sealState } from "./revision-seal.mjs";
import { ensureSkillValidationVerdict } from "./skill-validation-gate.mjs";

/** A short content hash, for cache stamps. */
function hashFile(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

/**
 * The renderer jar the JVM will actually open: a copy named by the install
 * jar's size and mtime, under the OS temp directory.
 *
 * The install jar is shared mutable state between every session on the
 * machine. A rebuild in one terminal while another terminal's JVM is reading
 * it ends that render with NoClassDefFoundError (the JVM loads lazily; the
 * class it needs next is in a jar that no longer exists), and on Windows the
 * rebuild itself fails because the running JVM holds the file. Opening a
 * private copy breaks both: the install jar is never open during a render,
 * and a render's jar cannot change under it. The copy is made once per
 * build (the name carries size and mtime) and reused by every session.
 */
function stableJarCopy(jar) {
  try {
    const stat = fs.statSync(jar);
    const dir = path.join(os.tmpdir(), "graphcompose-flow", "renderer");
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, `preview-renderer-${stat.size}-${Math.round(stat.mtimeMs)}.jar`);
    if (!fs.existsSync(copy)) {
      const tmp = `${copy}.${process.pid}.tmp`;
      fs.copyFileSync(jar, tmp);
      try {
        fs.renameSync(tmp, copy);
      } catch {
        // Another session won the rename; ours is redundant.
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* fine */
        }
      }
    }
    return fs.existsSync(copy) ? copy : jar;
  } catch {
    return jar;
  }
}

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

  // One render per project at a time. Two terminals on one project race on
  // its target/, its classpath file and current.pdf; the loser's failure names
  // a file the winner was busy with. Released on exit, whichever way this
  // process leaves — `run()` exits on the first failing step.
  try {
    acquireProjectLock(projectDir);
  } catch (err) {
    if (err instanceof ProjectLockedError) abort(err.message);
    throw err;
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
  // The debug render (guide lines drawn on) is for a person's eyes; no diff,
  // gate or evidence reads it. It was rendered on every pass — a second JVM,
  // a second PDF, a second raster — for a picture nobody opened on most of
  // them. It now runs when asked: RENDER_DEBUG=1 for one pass, or
  // `render.debugPass: true` in template-project.json for every pass. A
  // project that set it false keeps that.
  const debugPass =
    renderConfig.debugPass === true ||
    (renderConfig.debugPass !== false && process.env.RENDER_DEBUG === "1");
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
      // If the source was already edited, say so. The gate stops the render,
      // and the edit happens before it — so by the time anyone reads this, the
      // revision being protected may already be a state nobody can return to.
      const seal = describeSeal(sealState(revisionDir));
      abort(
        `${revisionId} already has a visual-review.json — its pass has been judged, so ` +
          "rendering into it again would overwrite the render the review was written about."+"\n" +
          (seal ? `  Already edited: ${seal}\n` : "") +
          "  Open a revision for this change:\n" +
          `    node tools/revision-manager/bin/graphcompose-flow.mjs new-revision "<what you are changing>" --project ${projectDir}\n` +
          "  new-revision copies the body forward, so an edit already made is carried over."+"\n" +
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

  // 3. build the renderer if its sources moved; the runner compiles after the
  // classpath is known (step 4), through javac when the pom is the shape the
  // scaffold writes, and through Maven otherwise.
  let runnerNeedsCompile = false;
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
      // Only when the sources have actually moved. This jar lives in the
      // INSTALL, not in the project, so every render rebuilding it makes it
      // shared mutable state between anything else using the harness at the
      // same time — a second template session, or the test suite.
      //
      // The failure is not a missing file. Maven's shade plugin replaces the
      // jar atomically, but a JVM loads classes lazily, so swapping it under a
      // live process invalidates the handle it has not finished reading from:
      //
      //     NoClassDefFoundError: org/apache/pdfbox/contentstream/operator/
      //                           text/SetTextHorizontalScaling
      //       at PDFRenderer.createPageDrawer(PDFRenderer.java:528)
      //
      // A class PDFBox needs only for some content streams, gone from a jar
      // that was complete when the JVM started. The render that dies is not the
      // one that rebuilt, so the symptom points at the wrong template entirely.
      // RENDER_NO_SKIP=1 means skip nothing, and it has to keep meaning that:
      // it is the escape hatch someone reaches for precisely when they suspect
      // a stale artifact, which is the one situation where a staleness check
      // deciding for them is worthless.
      const stale = forceFullPipeline
        ? "RENDER_NO_SKIP=1"
        : jarIsStale(previewRendererJar, [rendererSources, previewRendererPom]);
      if (stale) {
        console.log(`> preview-renderer rebuild (${stale})`);
        runMaven(
          ["-q", "-B", "-f", previewRendererPom, "-DskipTests=true", "package"],
          repoRoot,
        );
      } else {
        console.log("> preview-renderer build skipped (jar is newer than its sources)");
      }
    } else if (fs.existsSync(previewRendererJar)) {
      console.log("> preview-renderer build skipped (installed copy; using the shipped jar)");
    } else {
      abort(
        `preview renderer missing and not buildable here: ${previewRendererJar} does not exist ` +
          `and ${rendererSources} was not shipped. Reinstall the harness, or run npm run setup in a checkout.`,
      );
    }
    runnerNeedsCompile = true;
  }

  // 4. classpath build — once per pom, not once per render.
  //
  // `dependency:build-classpath` ran on every pass and answered the same
  // question every time: the runner's dependencies change when its pom
  // changes and not otherwise. Measured on a warm machine it is a Maven
  // start-up plus a resolution, several seconds a pass, times seven renders
  // a revision. The answer is cached beside its input's hash; a pom edit, a
  // jar that has since vanished from the local repository, or
  // RENDER_NO_SKIP=1 recomputes it.
  const classpathStamp = path.join(runnerDir, "target", "runtime-classpath.stamp");
  const pomHash = hashFile(runnerPom);
  const cachedClasspath =
    !forceFullPipeline &&
    fs.existsSync(classpathFile) &&
    fs.existsSync(classpathStamp) &&
    fs.readFileSync(classpathStamp, "utf8").trim() === pomHash &&
    fs
      .readFileSync(classpathFile, "utf8")
      .trim()
      .split(path.delimiter)
      .filter(Boolean)
      .every((entry) => fs.existsSync(entry));
  if (cachedClasspath) {
    console.log("> classpath reused (render-runner/pom.xml unchanged since it was resolved)");
  } else {
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
    try {
      fs.writeFileSync(classpathStamp, `${pomHash}\n`, "utf8");
    } catch {
      /* a stamp that cannot be written costs one more resolution next time */
    }
  }
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

  // 4b. compile the runner — the revision's template plus the runner's own
  // sources — now that the classpath is known.
  if (runnerNeedsCompile) {
    compileRunner({
      runnerDir,
      runnerPom,
      revisionId,
      revisionDir,
      dependencyClasspath,
      forceMaven: forceFullPipeline || process.env.RENDER_USE_MAVEN === "1",
    });
  }

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

  // The jar the JVM opens is a private copy of the install's; see stableJarCopy.
  const rendererJar = stableJarCopy(previewRendererJar);
  if (rendererJar !== previewRendererJar) console.log(`> renderer jar: ${rendererJar}`);

  // 5. Render pass 1 — clean PDF + output.png
  runJava(
    [
      // Both names while published templates read either. `template.dir` is
      // what authoring-rules tells new templates to read; `revision.dir` is
      // what every bundle published before that rule reads, and its provider
      // throws when the property is unset rather than defaulting.
      `-Dgraphcompose.template.dir=${revisionDir}`,
      `-Dgraphcompose.revision.dir=${revisionDir}`,
      ...(dataFile ? [`-Dgraphcompose.data.file=${dataFile}`] : []),
      "-jar",
      rendererJar,
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
      //
      // Not for a fixture. A checker reads its PDF and nobody looks at its
      // pages, which is what the early return below is for — asking for them
      // here would undo that silently and make the line it prints untrue.
      ...(fixtureRender ? [] : ["--pages", String(pages)]),
    ],
    repoRoot,
  );

  // A suffixed render is a fixture, not something anyone looks at: a checker
  // reads its PDF. The debug overlay exists for a human and the page rasters for
  // the diff, and neither applies — so both are skipped, which halves what an
  // overflow fixture costs a loop pass and removes the only way it could
  // overwrite the real render's artifacts, since those two passes write their
  // names without the suffix.
  if (fixtureRender) {
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
      // Both names while published templates read either. `template.dir` is
      // what authoring-rules tells new templates to read; `revision.dir` is
      // what every bundle published before that rule reads, and its provider
      // throws when the property is unset rather than defaulting.
      `-Dgraphcompose.template.dir=${revisionDir}`,
      `-Dgraphcompose.revision.dir=${revisionDir}`,
      ...(dataFile ? [`-Dgraphcompose.data.file=${dataFile}`] : []),
      "-jar",
      rendererJar,
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

/**
 * Whether `jar` needs rebuilding from `inputs`, and if so, why.
 *
 * Returns a short reason for the log, or `null` when the jar is current. The
 * reason is worth carrying: "rebuild" with no cause is the kind of line a
 * reader stops seeing, and the whole point of this check is that a rebuild
 * should now be an event rather than the norm.
 *
 * Mtime, not content hashing. A hash would be stricter and cost a full walk of
 * the source tree on every render to answer a question that mtime answers for
 * free — and the failure mode this guards against is a stale jar, which mtime
 * catches. A source restored from backup with an older timestamp would fool it;
 * `npm run setup` and `mvn package` remain the way to force a build.
 *
 * @param {string} jar the built artifact
 * @param {string[]} inputs files or directories it is built from
 * @returns {string|null}
 */
export function jarIsStale(jar, inputs) {
  if (!fs.existsSync(jar)) return "no jar yet";
  const jarTime = fs.statSync(jar).mtimeMs;

  let newest = 0;
  let newestPath = null;
  const visit = (target) => {
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      return; // vanished mid-walk; nothing to compare against
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
      return;
    }
    if (stat.mtimeMs > newest) {
      newest = stat.mtimeMs;
      newestPath = target;
    }
  };
  for (const input of inputs) visit(input);

  if (newest <= jarTime) return null;
  return `${path.basename(newestPath ?? "a source")} is newer than the jar`;
}

/**
 * Compile the render runner: its own sources plus the revision's template.
 *
 * Through javac when the pom is the shape `scaffold-runner` writes — an antrun
 * copy of the revision's template into generated-sources, build-helper adding
 * that directory, the compiler plugin, no resources — and through Maven
 * otherwise, or when asked (RENDER_USE_MAVEN=1, RENDER_NO_SKIP=1). Maven's
 * `package` on the runner is a JVM start-up, a plugin resolution and a jar
 * nobody reads, for a compile of two or three files; javac with the cached
 * classpath is the compile alone. A compile error surfaces the same way
 * either route: the compiler's own output, and a non-zero exit.
 */
function compileRunner({ runnerDir, runnerPom, revisionId, revisionDir, dependencyClasspath, forceMaven }) {
  const plan = forceMaven ? null : planFastCompile({ runnerDir, runnerPom, revisionDir });
  if (!plan) {
    if (!forceMaven) console.log("> runner: pom is not the scaffold's shape, or javac is absent — compiling through Maven");
    runMaven(
      ["-q", "-B", "-f", runnerPom, `-Drevision.id=${revisionId}`, "-DskipTests=true", "package"],
      path.dirname(runnerDir),
    );
    return;
  }

  // What antrun would have done: the revision's template, under the package
  // path the pom names, in generated-sources.
  fs.mkdirSync(path.dirname(plan.generatedTemplate), { recursive: true });
  fs.copyFileSync(plan.templateSource, plan.generatedTemplate);
  const classesDir = path.join(runnerDir, "target", "classes");
  fs.mkdirSync(classesDir, { recursive: true });

  const sources = [...plan.sources, plan.generatedTemplate];
  // An argument file, so a long classpath never meets a command-line limit.
  const argFile = path.join(runnerDir, "target", "javac.args");
  const quote = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  fs.writeFileSync(
    argFile,
    [
      "-d", quote(classesDir),
      "-encoding", "UTF-8",
      ...(plan.release ? ["--release", plan.release] : []),
      "-cp", quote(dependencyClasspath),
      ...sources.map(quote),
    ].join("\n"),
    "utf8",
  );
  console.log(`> javac ${sources.length} source(s) (runner + ${path.basename(plan.templateSource)}), classpath cached`);
  run("javac", [`@${argFile}`], runnerDir);
}

/**
 * Everything the fast path needs, read off the pom — or null when the pom is
 * not the shape it reads.
 */
function planFastCompile({ runnerDir, runnerPom, revisionDir }) {
  if (!javacAvailable()) return null;
  let pom;
  try {
    pom = fs.readFileSync(runnerPom, "utf8");
  } catch {
    return null;
  }
  // The scaffold's three plugins, and nothing that would change what a compile
  // means: a resources directory, extra source roots, annotation-processor
  // paths, or a second module.
  if (!/maven-antrun-plugin/.test(pom) || !/build-helper-maven-plugin/.test(pom)) return null;
  if (/<resources>|<annotationProcessorPaths>|<modules>/.test(pom)) return null;
  if (fs.existsSync(path.join(runnerDir, "src", "main", "resources"))) return null;

  const toFile = /tofile="\$\{revision\.generated\.sources\}\/([^"]+)"/.exec(pom)?.[1];
  const canonical = /value="\$\{project\.basedir\}\/\.\.\/revisions\/\$\{revision\.id\}\/([^"]+)"/.exec(pom)?.[1];
  const legacy = /else="\$\{project\.basedir\}\/\.\.\/revisions\/\$\{revision\.id\}\/([^"]+)"/.exec(pom)?.[1];
  if (!toFile || (!canonical && !legacy)) return null;

  const candidates = [canonical, legacy].filter(Boolean).map((name) => path.join(revisionDir, name));
  const templateSource = candidates.find((file) => fs.existsSync(file));
  if (!templateSource) return null;

  const release = /<maven\.compiler\.(?:release|source)>(\d+)<\//.exec(pom)?.[1] ?? null;
  const sources = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".java")) sources.push(full);
    }
  };
  walk(path.join(runnerDir, "src", "main", "java"));

  return {
    sources,
    templateSource,
    generatedTemplate: path.join(runnerDir, "target", "generated-sources", "revision", ...toFile.split("/")),
    release,
  };
}

let javacProbe = null;
function javacAvailable() {
  if (javacProbe === null) {
    try {
      // No shell: CreateProcess resolves javac.exe from PATH on Windows, and a
      // shell with arguments is the thing Node deprecates (DEP0190).
      javacProbe = spawnSync("javac", ["-version"], { encoding: "utf8" }).status === 0;
    } catch {
      javacProbe = false;
    }
  }
  return javacProbe;
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
