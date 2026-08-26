#!/usr/bin/env node
/**
 * scripts/page-size.mjs — is the page size settled, and what is it?
 *
 *   node scripts/page-size.mjs --project <id>
 *   node scripts/page-size.mjs --project <id> --use A4 --decision "<what was asked and answered>"
 *   node scripts/page-size.mjs --project <id> --use 612x783.446 --decision "..."
 *
 * `import-reference` measures the page and asks when the measurement is not
 * conclusive, which covers the moment a project is created. It does not cover
 * the rest of a project's life, and that is the gap this closes:
 *
 *   - A revision does not re-import the reference, so nothing on the revise
 *     path ever looked at the page size. A project created before the
 *     measurement existed carries no `referenceGeometry` at all and would go on
 *     being revised at whatever size its template happened to say.
 *   - `import-reference` asks, but nothing recorded the answer at the project
 *     level. Every later revision would have to ask again — and a question
 *     asked repeatedly is a question that gets answered carelessly.
 *
 * So: this reads `referenceGeometry` when it is there, measures the reference
 * on the spot when it is not (and records what it found, so the next reader is
 * not measuring again), and answers with an exit code. `--use` writes the
 * user's decision down where it survives.
 *
 * The verdict and the decision are kept apart on purpose. `verdict` is what the
 * pixels say and never changes; `pageSize` is what the document is built at,
 * and on an inconclusive measurement it exists only once a person has said so.
 * Collapsing the two would lose the distinction between "this was measured" and
 * "this was decided", which is the distinction the whole change is about.
 *
 * Exit: 0 settled · 2 usage · 3 no such project · 4 the reference could not be
 *       measured · 5 the page size is a question nobody has answered yet
 */

import fs from "node:fs";
import path from "node:path";

import {
  describeWorkspaceLine,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import {
  STANDARD_PAGE_SIZES,
  measureReferenceGeometry,
  rankStandards,
} from "./lib/page-geometry.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/page-size.mjs --project <id> [options]\n\n" +
      "  --project <id>       the project to answer about\n" +
      "  --use <size>         record a decision: A4 | LETTER | LEGAL | <width>x<height> in points\n" +
      "  --decision <text>    what the user was asked and answered (required with --use)\n" +
      "  --root <dir>         workspace override (default: discovered)\n" +
      "  --json               machine-readable result\n\n" +
      "exit: 0 settled | 2 usage | 3 no such project | 4 unmeasurable | 5 unanswered\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, use: null, decision: null, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--use") out.use = argv[++i];
    else if (a === "--decision") out.decision = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else usage(2);
  }
  return out;
}

function fail(message, code) {
  process.stderr.write(`[page-size] ${message}\n`);
  process.exit(code);
}

/** The reference pages on disk, in page order, the way import-reference names them. */
function referencePages(projectDir) {
  const dir = path.join(projectDir, "reference");
  const first = path.join(dir, "reference.png");
  if (!fs.existsSync(first)) return [];
  const pages = [first];
  for (let page = 2; ; page += 1) {
    const next = path.join(dir, `reference-page-${page}.png`);
    if (!fs.existsSync(next)) break;
    pages.push(next);
  }
  return pages;
}

/**
 * Turn `--use` into a page size, oriented the way the reference is.
 *
 * A standard is named and its dimensions come from the table, so "A4" on a
 * landscape reference resolves to the turned page rather than to a portrait one
 * the caller would then have to remember to turn. A `WxH` pair is taken as
 * given: someone spelling out both numbers has already decided the orientation.
 */
function resolveRequestedSize(use, measuredAspect) {
  const standard = STANDARD_PAGE_SIZES.find((s) => s.name === use.toUpperCase());
  if (standard) {
    const oriented = rankStandards(measuredAspect).find((c) => c.name === standard.name);
    return {
      source: "user-confirmed-standard",
      format: oriented.name,
      orientation: oriented.orientation,
      widthPt: oriented.widthPt,
      heightPt: oriented.heightPt,
      deviationPercent: oriented.deviationPercent,
    };
  }

  const pair = /^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/.exec(use.trim());
  if (!pair) {
    fail(
      `unrecognised size "${use}". Use one of ` +
        `${STANDARD_PAGE_SIZES.map((s) => s.name).join(", ")}, or <width>x<height> in points.`,
      2,
    );
  }
  const widthPt = Number(pair[1]);
  const heightPt = Number(pair[2]);
  if (!(widthPt > 0) || !(heightPt > 0)) fail(`a page cannot be ${widthPt}x${heightPt}`, 2);
  return {
    source: "user-confirmed-custom",
    format: "CUSTOM",
    orientation: heightPt >= widthPt ? "portrait" : "landscape",
    widthPt,
    heightPt,
  };
}

/** How the page reads to a person: the answer, then the evidence behind it. */
function formatSettled(geometry) {
  const size = geometry.pageSize;
  const first = geometry.pages?.[0];
  const measured = first ? `measured ${first.widthPx}x${first.heightPx}px, aspect ${geometry.aspect}` : "";
  const how =
    size.source === "measured-standard"
      ? `matched within ${geometry.tolerancePercent}%`
      : "decided by the user";
  return (
    `[page-size] ${size.format} ${size.orientation} — ` +
    `${size.widthPt} x ${size.heightPt} pt (${how})\n` +
    (measured ? `  ${measured}\n` : "") +
    (size.decision ? `  decision: ${size.decision}\n` : "")
  );
}

/** How an open question reads: the ranking, then what has to be asked. */
function formatUnsettled(geometry) {
  const table = (geometry.candidates ?? [])
    .map((c) => `    ${c.name.padEnd(6)} aspect ${String(c.aspect).padEnd(8)} off by ${c.deviationPercent}%`)
    .join("\n");
  return (
    "[page-size] UNDECIDED — the page size has never been answered.\n" +
    (table ? `  nearest standards:\n${table}\n` : "") +
    `\n  ${geometry.question}\n\n` +
    "  Record the answer so no later revision has to ask again:\n" +
    "    node scripts/page-size.mjs --project <id> --use <A4|LETTER|LEGAL|WxH> --decision \"...\"\n"
  );
}

// --- run ---------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (!args.project) usage(2);
if (args.decision && !args.use) fail("--decision only means something with --use", 2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const projectFile = path.join(projectDir, "template-project.json");
if (!fs.existsSync(projectFile)) {
  fail(`project not found: ${path.relative(workspace.root, projectFile) || projectFile}`, 3);
}

const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
let geometry = project.referenceGeometry ?? null;
let measuredNow = false;

// A project created before the measurement existed carries nothing. Measure it
// here rather than refusing: the reference is on disk, the answer is two
// integers in a PNG header, and making the caller re-import to learn something
// that was always readable would be a worse tool.
if (!geometry) {
  const pages = referencePages(projectDir);
  if (pages.length === 0) {
    fail(
      `no reference to measure under ${path.join(projectDir, "reference")}\n` +
        `  import one: node scripts/import-reference.mjs --project ${args.project} --file <path>`,
      4,
    );
  }
  try {
    const fresh = measureReferenceGeometry(pages);
    geometry = {
      ...fresh,
      measuredAt: new Date().toISOString(),
      pages: fresh.pages.map((p) => ({
        ...p,
        file: path.relative(projectDir, p.file).split(path.sep).join("/"),
      })),
    };
    measuredNow = true;
  } catch (error) {
    fail(`the reference could not be measured: ${error instanceof Error ? error.message : error}`, 4);
  }
}

if (args.use) {
  // `inconsistent` is not a question a decision can answer.
  //
  // The other two verdicts ask which of several defensible page sizes the
  // source had, and the user knows. `inconsistent` says the pages disagree
  // with each other by more than tolerance — the import rasterised at mixed
  // dpi, or the pages are not all from one document — and a document has ONE
  // page size, so there is no size to confirm. Recording one anyway writes a
  // `pageSize`, exits 0, and silences the question permanently for every
  // later revision, including revise-template's step 0: the damaged import
  // becomes invisible at the exact moment someone was looking at it.
  if (geometry.verdict === "inconsistent") {
    fail(
      "--use cannot settle an inconsistent measurement: the reference pages disagree with " +
        "each other by more than tolerance, so there is no one page size to confirm.\n" +
        "  Either the import rasterised at mixed dpi, or the pages are not all from the " +
        "same document.\n" +
        `  Re-import: node scripts/import-reference.mjs --project ${args.project} --file <path>`,
      2,
    );
  }
  // The schema requires a decision note of real length for a user-confirmed
  // size, and for the same reason: a nearby standard and the exact measured
  // size are both defensible, the numbers do not say which was chosen or why,
  // and "ok" recorded now is nothing recovered later.
  if (!args.decision || args.decision.trim().length < 20) {
    fail(
      "--use needs --decision: one or two sentences on what the user was asked and answered.\n" +
        "  Both answers are defensible and the numbers do not say which was taken.",
      2,
    );
  }
  geometry = {
    ...geometry,
    pageSize: {
      ...resolveRequestedSize(args.use, geometry.aspect),
      decision: args.decision.trim(),
      decidedAt: new Date().toISOString(),
    },
  };
  measuredNow = true;
}

// Write back whenever we learned something — a first measurement or a decision.
// Not on a plain read: answering a question should not touch the file it
// answered from.
if (measuredNow) {
  project.referenceGeometry = geometry;
  project.updatedAt = new Date().toISOString();
  fs.writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");
}

const settled = Boolean(geometry.pageSize);
const result = {
  project: args.project,
  settled,
  verdict: geometry.verdict,
  aspect: geometry.aspect,
  pageSize: geometry.pageSize ?? null,
  candidates: geometry.candidates ?? [],
  question: settled ? null : (geometry.question ?? null),
  recorded: measuredNow,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(settled ? formatSettled(geometry) : formatUnsettled(geometry));
}

// exitCode rather than exit(): stdout is asynchronous when it is a pipe, and
// exiting outright can drop the payload this block just wrote.
process.exitCode = settled ? 0 : 5;
