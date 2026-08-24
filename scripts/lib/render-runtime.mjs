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
 *   6. Page rasterisation for every extra page declared in the project's
 *      `render.pages` field (page 2 of a two-page CV, etc.).
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

import { ensureSkillValidationVerdict } from "./skill-validation-gate.mjs";

// --- live preview mirror -----------------------------------------------------
// A single, stable set of files that always reflects the MOST RECENT render,
// regardless of which project/revision produced it. Open live/current.pdf once
// in a viewer that auto-reloads on change and does not lock the file (e.g.
// SumatraPDF) and watch every render update live — no hunting for the latest
// revision folder.
//
//   live/current.pdf        clean render (the one to open)
//   live/current-debug.pdf  debug render with guide lines
//   live/current.png        page-1 raster of the clean render
//   live/current-debug.png  page-1 raster of the debug render
//   live/current.txt        which project / revision / time this reflects
//
// Location: <repoRoot>/live by default; override with GRAPHCOMPOSE_LIVE_DIR
// (e.g. a path outside OneDrive to avoid sync churn). Disable with
// RENDER_NO_LIVE=1. Mirroring is best-effort: a failure here only warns, it
// never fails the render.

const LIVE_README = `# Live preview

This folder always reflects the MOST RECENT render, regardless of which
project or revision produced it. It is regenerated on every render and is
gitignored — do not edit by hand.

Files:
  current.pdf        clean render (open this one)
  current-debug.pdf  debug render with guide lines
  current.png        page-1 raster of the clean render
  current-debug.png  page-1 raster of the debug render
  current.txt        which project / revision / time this reflects

## Watch renders update live (SumatraPDF)

SumatraPDF reloads a PDF automatically when the file changes on disk and does
not lock it. Open current.pdf once and leave it open; every render refreshes
the view in place.

  node scripts/preview-live.mjs           # opens live/current.pdf
  node scripts/preview-live.mjs --debug   # opens live/current-debug.pdf

Or open current.pdf in this folder manually in SumatraPDF.

## Options

  GRAPHCOMPOSE_LIVE_DIR   move this folder elsewhere (e.g. off OneDrive):
                            $env:GRAPHCOMPOSE_LIVE_DIR = "C:\\Temp\\gc-live"
  RENDER_NO_LIVE=1        disable this live mirror entirely
`;

function resolveLiveDir(repoRoot) {
  const override = process.env.GRAPHCOMPOSE_LIVE_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(repoRoot, "live");
}

function mirrorFileToLive(liveDir, srcPath, destName) {
  if (!srcPath || !fs.existsSync(srcPath)) return false;
  const dest = path.join(liveDir, destName);
  const tmp = path.join(liveDir, `.${destName}.tmp`);
  // Copy to a temp file, then rename over the target. rename is atomic on the
  // same volume, so a watching viewer never sees a half-written PDF (the same
  // trick the LaTeX + SumatraPDF live-preview workflow relies on). Fall back to
  // a direct copy if the rename is refused (e.g. a cross-volume live dir).
  try {
    fs.copyFileSync(srcPath, tmp);
    fs.renameSync(tmp, dest);
    return true;
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.copyFileSync(srcPath, dest);
      return true;
    } catch (err) {
      console.warn(`> live mirror: could not update ${destName} (${err.message})`);
      return false;
    }
  }
}

function writeLiveManifest(liveDir, info) {
  const lines = [
    `project:   ${info.projectId}`,
    `revision:  ${info.revisionId}`,
    `rendered:  ${new Date().toISOString()}`,
    `source:    ${info.revisionDir}`,
    ``,
    `current.pdf       <- output.pdf`,
  ];
  if (info.hasDebug) lines.push(`current-debug.pdf <- output-debug.pdf`);
  lines.push("");
  try {
    fs.writeFileSync(path.join(liveDir, "current.txt"), lines.join("\n"), "utf8");
  } catch (err) {
    console.warn(`> live mirror: could not write current.txt (${err.message})`);
  }
}

const NOOP_LIVE_MIRROR = { update() {}, manifest() {}, announce() {} };

function createLiveMirror(repoRoot) {
  if (process.env.RENDER_NO_LIVE === "1") return NOOP_LIVE_MIRROR;
  let dir;
  try {
    dir = resolveLiveDir(repoRoot);
    fs.mkdirSync(dir, { recursive: true });
    const readme = path.join(dir, "README.md");
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, LIVE_README, "utf8");
  } catch (err) {
    console.warn(`> live mirror disabled (${err.message})`);
    return NOOP_LIVE_MIRROR;
  }
  let updated = 0;
  return {
    update(srcPath, destName) {
      if (mirrorFileToLive(dir, srcPath, destName)) updated += 1;
    },
    manifest(info) {
      writeLiveManifest(dir, info);
    },
    announce() {
      if (updated > 0) {
        console.log(`> live preview updated -> ${path.join(dir, "current.pdf")}`);
      }
    },
  };
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
export function runRender({ repoRoot, projectId, revisionId, projectDir: explicitProjectDir }) {
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
    renderConfig.dataFileName === undefined
      ? `${docKind}-data.json`
      : renderConfig.dataFileName;
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
  const outputPdf = path.join(revisionDir, "output.pdf");
  const debugPdf = path.join(revisionDir, "output-debug.pdf");
  const dataFile = dataDriven ? path.join(revisionDir, dataFileName) : null;
  const live = createLiveMirror(repoRoot);

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
    runMaven(
      ["-q", "-B", "-f", previewRendererPom, "-DskipTests=true", "package"],
      repoRoot,
    );
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
      "output.pdf",
      "--preview",
      "output.png",
      "--dpi",
      "150",
      "--page",
      "0",
    ],
    repoRoot,
  );

  // 6. Extra-page rasterisation
  for (let pageIdx = 1; pageIdx < pages; pageIdx += 1) {
    const previewOut = path.join(
      revisionDir,
      `output-page-${pageIdx + 1}.png`,
    );
    runJava(
      [
        "-jar",
        previewRendererJar,
        "preview",
        "--pdf",
        outputPdf,
        "--out",
        previewOut,
        "--dpi",
        "150",
        "--page",
        String(pageIdx),
      ],
      repoRoot,
    );
  }

  // Mirror the clean render into the live-preview folder (live/current.*).
  live.update(outputPdf, "current.pdf");
  live.update(path.join(revisionDir, "output.png"), "current.png");
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
      "--guide-lines",
      "true",
    ],
    repoRoot,
  );

  for (let pageIdx = 1; pageIdx < pages; pageIdx += 1) {
    const debugOut = path.join(
      revisionDir,
      `output-debug-page-${pageIdx + 1}.png`,
    );
    runJava(
      [
        "-jar",
        previewRendererJar,
        "preview",
        "--pdf",
        debugPdf,
        "--out",
        debugOut,
        "--dpi",
        "150",
        "--page",
        String(pageIdx),
      ],
      repoRoot,
    );
  }

  // Mirror the debug render too, then point the user at the live file.
  live.update(debugPdf, "current-debug.pdf");
  live.update(path.join(revisionDir, "output-debug.png"), "current-debug.png");
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
