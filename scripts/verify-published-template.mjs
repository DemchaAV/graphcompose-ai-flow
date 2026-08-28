#!/usr/bin/env node
/**
 * scripts/verify-published-template.mjs — does this bundle stand on its own?
 *
 *   node scripts/verify-published-template.mjs --template-id <id> [--root <ws>] [--build] [--render]
 *
 * A published bundle is what someone else builds against, so the only honest
 * test is to take `templates/<id>/` and nothing else, and see whether it works.
 * Publishing already scans what it wrote; this verifies the result as a
 * consumer receives it.
 *
 * The first real acceptance run made the case: the published bundle's example
 * data named `assets/avatar.png`, the file existed in the approved revision,
 * and the publisher copied only `assets/icons/`. Nothing noticed, because
 * nothing ever tried to use the bundle.
 *
 * Three tiers, each a superset of the last:
 *
 *   static   (default)   manifest, sources, data and every asset the data
 *                        references — no toolchain needed, runs in CI
 *   --build              synthesises a Maven project from template.json alone
 *                        and compiles the bundle's sources against it, which
 *                        is what catches a dependency the manifest forgot
 *   --render             renders data/<docKind>-data.example.json through the
 *                        preview renderer, which is what catches a missing
 *                        image
 *
 * Exit codes: 0 verified, 1 the bundle is broken, 2 a usage error.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describeWorkspaceLine, installRoot, resolveWorkspace } from "./lib/workspace.mjs";
import { bundleSources, readManifest } from "./lib/template-bundle.mjs";
import { blocking, formatFinding, known, scanPortability } from "./lib/bundle-portability.mjs";
import { generatePom, maven, stageResources, stageSources } from "./lib/bundle-project.mjs";
import { countRenderPages, pagePairs, renderPageFile } from "./lib/page-pairs.mjs";

const repoRoot = installRoot();

/** --template-id value meaning "every bundle in this workspace". */
const ALL = "all";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/verify-published-template.mjs --template-id <id> [--root <workspace>]\n" +
      "                                                 [--build] [--render] [--keep] [--json]\n\n" +
      "  --template-id <id>   the bundle under the workspace's templates/, or \"all\"\n" +
      "  --root <workspace>   workspace override (default: discovered)\n" +
      "  --build              also compile the bundle standalone (needs Maven)\n" +
      "  --render             also render its example data (implies --build)\n" +
      "  --keep               keep the scratch project instead of deleting it\n" +
      "  --json               machine-readable result\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { templateId: null, root: null, build: false, render: false, keep: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--build") out.build = true;
    else if (a === "--render") {
      out.render = true;
      out.build = true;
    } else if (a === "--keep") out.keep = true;
    else if (a === "--json") out.json = true;
    else if (a === "--template-id" || a === "-t") out.templateId = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[verify-template] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.templateId) {
    process.stderr.write("[verify-template] --template-id is required\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

// --all re-runs this script once per bundle rather than looping in place: each
// bundle then gets its own clean scratch project and its own exit code, and a
// crash in one cannot be mistaken for a pass in another.
if (args.templateId === ALL) {
  const templates = fs.existsSync(workspace.templatesDir)
    ? fs.readdirSync(workspace.templatesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  if (templates.length === 0) {
    console.log("[verify-template] no published bundles in this workspace");
    process.exit(0);
  }
  let failed = 0;
  for (const id of templates) {
    // Replace only the value that follows --template-id. Rewriting every
    // argument equal to "all" would also rewrite, say, `--root all`.
    const original = process.argv.slice(2);
    const forwarded = original.map((a, index) => {
      const flag = original[index - 1];
      return (flag === "--template-id" || flag === "-t") && a === ALL ? id : a;
    });
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...forwarded], {
      stdio: "inherit",
    });
    if (run.status !== 0) failed += 1;
  }
  console.log(
    failed === 0
      ? `[verify-template] all ${templates.length} bundle(s) verified`
      : `[verify-template] ${failed} of ${templates.length} bundle(s) have problems`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

const bundleDir = path.join(workspace.templatesDir, args.templateId);
if (!fs.existsSync(bundleDir)) {
  process.stderr.write(`[verify-template] no bundle at ${bundleDir}\n`);
  process.exit(1);
}

const problems = [];
const checked = [];
const problem = (message) => problems.push(message);
const ok = (message) => checked.push(message);
// A check that could not run is neither a pass nor a failure, and reporting it
// as either is how a gate stops meaning anything: silently skipped reads as
// verified, and failed reads as broken when nothing is.
const skipped = [];
const note = (message) => skipped.push(message);
/** What the page-by-page comparison found, for a caller that has to act on it. */
let parity = null;

// ---------------------------------------------------------------- static ---

const manifestPath = path.join(bundleDir, "template.json");
let manifest = null;
if (!fs.existsSync(manifestPath)) {
  problem("template.json is missing — a consumer has no way to know what this is");
} else {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    ok("template.json parses");
  } catch (cause) {
    problem(`template.json is not valid JSON: ${cause.message}`);
  }
}

const srcDir = path.join(bundleDir, "src");
const sources = bundleSources(bundleDir);
if (sources.length === 0) problem("src/ holds no Java sources");
else ok(`${sources.length} Java source(s)`);

if (manifest?.className) {
  // The entry class stays at the top of `src/` in both layouts; the sections and
  // composites of a structured bundle hang off it in sub-packages.
  const expected = `${manifest.className}.java`;
  if (!sources.includes(expected)) {
    problem(`template.json names className "${manifest.className}" but src/${expected} does not exist`);
  } else {
    ok(`className matches src/${expected}`);
  }
}

// Data, and every asset it points at. This is the check the acceptance run
// needed: the reference is in the data file, the file it names was never
// copied, and only an attempt to use the bundle reveals it.
const dataDir = path.join(bundleDir, "data");
const dataFiles = fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"))
  : [];
for (const name of dataFiles) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
    ok(`data/${name} parses`);
  } catch (cause) {
    problem(`data/${name} is not valid JSON: ${cause.message}`);
    continue;
  }
  for (const ref of collectAssetReferences(data)) {
    if (!fs.existsSync(path.join(bundleDir, ref))) {
      problem(`data/${name} references "${ref}", which the bundle does not contain`);
    } else {
      ok(`asset ${ref} present`);
    }
  }
}

// Anything the sources load by relative path must be here too. The pattern is
// deliberately narrow — path characters and a file extension. A looser
// `[^"]+` matched a Javadoc sentence that happened to quote a filename
// mid-prose, and reported the whole clause as a missing file.
for (const file of sources) {
  const text = fs.readFileSync(path.join(srcDir, file), "utf8");
  for (const [, ref] of text.matchAll(/"((?:assets|data)\/[\w./-]+\.[A-Za-z0-9]+)"/g)) {
    if (!fs.existsSync(path.join(bundleDir, ref))) {
      problem(`src/${file} loads "${ref}", which the bundle does not contain`);
    }
  }
}

if (!fs.existsSync(path.join(bundleDir, "README.md"))) {
  problem("README.md is missing");
}

// Would this work on someone else's machine? Publishing runs the same scan, so
// anything found here got in before that gate existed — but the bundle is what
// a consumer receives, and it is the consumer who discovers a path that only
// resolves where it was published.
const portability = scanPortability(bundleDir);
for (const finding of blocking(portability)) {
  problem(formatFinding(finding));
}
const knownLeaks = known(portability);
if (knownLeaks.length > 0) {
  // Counted rather than listed: it is the same scheduled leak on every line,
  // and repeating it seven times buries the findings that need acting on.
  const rules = [...new Set(knownLeaks.map((f) => f.rule))].join(", ");
  ok(`portable, apart from ${knownLeaks.length} known leak(s) (${rules})`);
} else if (blocking(portability).length === 0) {
  ok("portable — no path that resolves only where it was published");
}

// ----------------------------------------------------------------- build ---

if (args.build && problems.length === 0) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `gcverify-${args.templateId}-`));
  try {
    buildAndMaybeRender(scratch);
  } finally {
    if (args.keep) {
      if (!args.json) console.log(`[verify-template] scratch kept at ${scratch}`);
    } else {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
} else if (args.build) {
  problem("skipped the build: the static checks already failed");
}

function buildAndMaybeRender(dir) {
  // The contract as a consumer reads it. The static tier above deliberately
  // parses template.json by hand, so that a missing or malformed one is a
  // reported problem rather than a crash; by here it has parsed, and the build
  // is the tier that has to see what a consumer sees.
  const contract = readManifest(bundleDir);

  // Staged through the same library `use-template` uses, so a bundle that
  // verifies here is a bundle that instantiates there — the two cannot drift
  // apart, because there is only one implementation to drift.
  stageSources(bundleDir, dir, { className: contract.className });

  // The pom is generated from template.json alone. That is the point: if the
  // manifest's dependencies are wrong or incomplete, this fails to compile,
  // which is exactly the report we want.
  fs.writeFileSync(path.join(dir, "pom.xml"), generatePom(contract), "utf8");

  const compile = maven(["-q", "-B", "compile"], dir);
  if (compile.status !== 0) {
    problem("the bundle does not compile against the dependencies template.json declares");
    reportTail(`${compile.stdout ?? ""}${compile.stderr ?? ""}`, (line) => /ERROR|error:/.test(line));
    return;
  }
  ok("compiles standalone against template.json's dependencies");

  if (!args.render) return;

  const rendererJar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
  if (!fs.existsSync(rendererJar)) {
    problem(`preview renderer not built: ${rendererJar} (run npm run setup)`);
    return;
  }

  const classpathFile = path.join(dir, "classpath.txt");
  const cp = maven(["-q", "-B", "dependency:build-classpath", `-Dmdep.outputFile=${classpathFile}`], dir);
  if (cp.status !== 0 || !fs.existsSync(classpathFile)) {
    problem("could not resolve the bundle's runtime classpath");
    return;
  }
  fs.writeFileSync(
    classpathFile,
    `${path.join(dir, "target", "classes")}${path.delimiter}${fs.readFileSync(classpathFile, "utf8").trim()}`,
    "utf8",
  );

  // The renderer reads data and assets relative to one directory, so the bundle
  // is staged as that directory — the same shape a revision has, and the same
  // shape `use-template` produces. The asset manifest goes with them: a template
  // that draws icons resolves it against this directory, and without it the
  // render fails on the first icon for a reason that has nothing to do with the
  // template being verified.
  const stage = path.join(dir, "stage");
  stageResources(bundleDir, stage, contract);

  // The renderer patches pendingArtifacts in the revision it renders into, so
  // the stage needs one even though nothing here is a revision. A stub keeps
  // the renderer unchanged rather than teaching it a second input shape.
  fs.writeFileSync(
    path.join(stage, "revision.json"),
    `${JSON.stringify({ id: "verify", status: "DRAFT", pendingArtifacts: [], artifacts: {} }, null, 2)}\n`,
    "utf8",
  );

  const approved = approvedRevisionDir();
  const parityPages = approved ? Math.max(1, countRenderPages(approved)) : 1;

  const render = spawnSync(
    "java",
    [
      // Both names: this has to render a bundle written to either contract.
      `-Dgraphcompose.template.dir=${stage}`,
      `-Dgraphcompose.revision.dir=${stage}`,
      "-jar",
      rendererJar,
      "render",
      "--revision",
      stage,
      "--template-class",
      contract.entrypoint.templateClass,
      ...(contract.entrypoint.providerClass ? ["--spec-provider", contract.entrypoint.providerClass] : []),
      "--classpath-file",
      classpathFile,
      "--output",
      "output.pdf",
      "--preview",
      "output.png",
      "--dpi",
      "150",
      "--page",
      "0",
      // As many pages as the revision this bundle came from produced. One JVM
      // rasterises them all; asking for one left a two-page CV half measured.
      "--pages",
      String(parityPages),
    ],
    { cwd: dir, encoding: "utf8" },
  );

  const rendered = path.join(stage, "output.pdf");
  if (render.status !== 0 || !fs.existsSync(rendered)) {
    problem("the bundle does not render its own example data");
    reportTail(`${render.stdout ?? ""}${render.stderr ?? ""}`, Boolean);
    return;
  }
  ok(`renders its example data (${fs.statSync(rendered).size} bytes of PDF)`);

  checkParity(stage, approved);
}

/**
 * The revision this bundle was published from, when it is in this workspace.
 *
 * Absent is normal: a bundle installed anywhere else has no revision to compare
 * against, and there is nothing wrong with that.
 */
function approvedRevisionDir() {
  const project = manifest?.sourceProject;
  const revision = manifest?.sourceRevision;
  if (!project || !revision) return null;
  const dir = path.join(workspace.projectsDir, project, "revisions", revision);
  return fs.existsSync(dir) ? dir : null;
}

/**
 * Does the bundle render what the user approved?
 *
 * Publishing now restructures the template — theme, sections, composites and a
 * support class instead of one file — and a restructuring that changes the
 * output is a defect, not a layout. Only a pixel comparison can say so: the
 * split moves methods between classes without touching a single value, so a
 * mistake in it looks exactly like correct code until something is drawn.
 *
 * **Every page.** The first version of this rasterised one page and compared
 * it, which on `cv-reference` — a two-page CV whose revisions carry
 * `output-page-2.png` — left half the document unmeasured while reporting that
 * the bundle "renders exactly what revision-009 did". A member reached only
 * from `renderPageTwo` could have moved to the wrong class and the gate would
 * have passed it. `scope-routing.md` states the exact-diff gate as AE == 0 on
 * every page, and this is the check standing in for it.
 *
 * Evidence, not a leap of faith. The comparison is skipped, loudly, when there
 * is nothing to compare against; inventing a pass there would make the check
 * meaningless everywhere.
 */
function checkParity(stage, approved) {
  const project = manifest?.sourceProject;
  const revision = manifest?.sourceRevision;

  if (!project || !revision) {
    note("no sourceProject/sourceRevision in the manifest; skipped the parity check");
    return;
  }
  if (!approved) {
    note(`${project}/${revision} is not in this workspace; skipped the parity check`);
    return;
  }
  if (!fs.existsSync(renderPageFile(stage, 1))) {
    // The render tier takes the PDF as proof of success and never looks at the
    // preview. A silent return here reads as a pass, which is the failure the
    // `note` channel exists to prevent.
    note("the render produced no preview image; skipped the parity check");
    return;
  }

  const { pairs, missingFromRender, extraInRender } = pagePairs({
    revisionDir: stage,
    parentDir: approved,
    against: "parent",
  });

  // A page the approved revision has and the bundle does not is not a gap to
  // pass over: it is the document coming out shorter than the one that was
  // accepted.
  for (const page of missingFromRender) {
    problem(`the bundle renders no page ${page}, which ${revision} has`);
  }
  for (const page of extraInRender) {
    problem(`the bundle renders a page ${page} that ${revision} does not have`);
  }

  const pages = [];
  for (const pair of pairs) {
    const stats = comparePage(pair);
    if (!stats) return;
    pages.push({ page: pair.page, mismatchPx: stats.mismatchPx, percent: stats.percent });
    if (stats.mismatchPx !== 0) {
      problem(
        `the bundle does not render what ${revision} did on page ${pair.page}: `
          + `${stats.mismatchPx} px differ (${stats.percent}%, ${stats.classification}) — diff at ${stats.diff}`,
      );
    }
  }

  const clean = pages.length > 0 && pages.every((p) => p.mismatchPx === 0);
  if (clean && missingFromRender.length === 0 && extraInRender.length === 0) {
    ok(
      `renders exactly what ${revision} did, on all ${pages.length} page(s) `
        + `(${pages.reduce((n, p) => n + p.mismatchPx, 0)} px differ)`,
    );
  }

  // Structured, so a caller does not have to read the prose. `approve-and-publish`
  // decides whether to republish flat on this, and keying that decision on the
  // wording of a sentence in another file is a coupling nothing would catch
  // when the sentence changed.
  parity = {
    project,
    revision,
    pages,
    missingFromRender,
    extraInRender,
    mismatchPx: pages.reduce((n, p) => n + p.mismatchPx, 0),
    identical: clean && missingFromRender.length === 0 && extraInRender.length === 0,
  };
}

/** One page, through the same differ the loop uses. */
function comparePage(pair) {
  const diff = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "tools", "visual-diff", "bin", "visual-diff.mjs"),
      pair.reference,
      pair.render,
      "--json",
      "--out",
      pair.diff,
    ],
    { encoding: "utf8" },
  );
  if (diff.status !== 0) {
    problem(`could not compare page ${pair.page} with the approved revision`);
    reportTail(`${diff.stdout ?? ""}${diff.stderr ?? ""}`, Boolean);
    return null;
  }
  try {
    return JSON.parse(diff.stdout);
  } catch {
    problem(`the parity comparison for page ${pair.page} returned output that is not JSON`);
    return null;
  }
}

// ---------------------------------------------------------------- report ---

if (args.json) {
  process.stdout.write(
    `${JSON.stringify(
      {
        templateId: args.templateId,
        bundle: bundleDir,
        verified: problems.length === 0,
        tiers: { static: true, build: args.build, render: args.render },
        checks: checked,
        skipped,
        parity,
        problems,
      },
      null,
      2,
    )}\n`,
  );
} else {
  for (const line of checked) console.log(`  ok   ${line}`);
  for (const line of skipped) console.log(`  --   ${line}`);
  for (const line of problems) console.error(`  FAIL ${line}`);
  console.log(
    problems.length === 0
      ? `[verify-template] ${args.templateId} verified (${checked.length} checks)`
      : `[verify-template] ${args.templateId}: ${problems.length} problem(s)`,
  );
}
process.exit(problems.length === 0 ? 0 : 1);

// --------------------------------------------------------------- helpers ---

/** Every string in the data that looks like a path into the bundle. */
function collectAssetReferences(node, found = new Set()) {
  if (typeof node === "string") {
    if (/^(?:assets|data)\//.test(node)) found.add(node);
  } else if (Array.isArray(node)) {
    for (const item of node) collectAssetReferences(item, found);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectAssetReferences(value, found);
  }
  return found;
}

function reportTail(output, keep) {
  for (const line of output.split(/\r?\n/).filter(keep).slice(-8)) {
    if (line.trim()) problem(`  ${line.trim()}`);
  }
}
