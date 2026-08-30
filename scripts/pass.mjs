#!/usr/bin/env node
/**
 * scripts/pass.mjs — one loop pass, two commands, one screen.
 *
 *   node scripts/pass.mjs --project <id> --open "<what this pass fixes>" [--report "<user's words>"]
 *   node scripts/pass.mjs --project <id> [--revision <id>] [--against parent] [--skip-render] [--json]
 *
 * ## Why
 *
 * A pass of the loop was six to eight model turns: open a revision, copy the
 * sources into it by hand, edit, render, diff, ask for evidence, write the
 * review, ask whether to continue — and read a page of JSON at each step to
 * find the one line that mattered. The corpus shows what that cost: seven
 * renders per revision, most of them inside one folder because opening the
 * next one was work, and 43 raw ImageMagick calls where `evidence.mjs` sat
 * unused because nothing put its answer in front of the agent.
 *
 * This is the pass as two calls:
 *
 *   --open   opens the next revision (sources carried forward, the user's
 *            report recorded when there is one) and prints what this pass is
 *            aimed at: the focus, the evidence's owner and properties for it,
 *            what has already been tried, and the budget.
 *   (none)   renders and measures the current draft through render-and-diff,
 *            and prints ONE screen: the figure and its movement, the worst
 *            regions, the cause and owner of each, the gates, the loop state,
 *            and the next command.
 *
 * Between the two the agent edits one method. After the second it writes the
 * review and asks iterate-status — which is the third and last call.
 *
 * It decides nothing render-and-diff and iterate-status do not already decide;
 * it removes the taxi rides between them and the JSON in between. The exit
 * code of a render pass is render-and-diff's (0 ready, 2 revise, 3 blocked,
 * 4 budget spent, 1 a step failed); --open exits 0 when the revision opened.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  describeWorkspaceLine,
  installRoot,
  requireProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { describeAttempts, readAttempts } from "./lib/attempts.mjs";

const repoRoot = installRoot();

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/pass.mjs --project <id> --open \"<what this pass fixes>\" [--report \"<user's words>\"] [--report-id <id>]\n" +
      "       node scripts/pass.mjs --project <id> [--revision <id>] [--against parent|reference] [--skip-render] [--json]\n\n" +
      "  --open <message>   open the next revision (sources carried forward) and print what this pass is aimed at\n" +
      "  --report <quote>   with --open: the user's own words naming a difference (kept in front until addressed)\n" +
      "  --revision <id>    the revision to render (default: the project's current draft)\n" +
      "  --against          reference (default) or parent — the scope's gate decides\n" +
      "  --skip-render      measure the existing render only\n" +
      "  --debug            also render the debug PDF with guide lines (current-debug.pdf); off by default\n" +
      "  --root <workspace> --json\n\n" +
      "exit (render): 0 ready | 2 revise | 3 blocked | 4 budget spent | 1 a step failed;  --open: 0 opened\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    project: null, revision: null, open: null, report: null, reportId: null,
    against: "reference", skipRender: false, root: null, json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--skip-render") out.skipRender = true;
    else if (a === "--debug") out.debug = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--open") out.open = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--report-id") out.reportId = argv[++i];
    else if (a === "--against") out.against = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[pass] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.project) usage(2);
  if (out.against !== "reference" && out.against !== "parent") usage(2);
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

let projectDir;
try {
  projectDir = requireProjectDir(workspace, args.project);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

const readJsonOr = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

function run(script, scriptArgs) {
  const spawned = spawnSync(process.execPath, [path.join(repoRoot, ...script), ...scriptArgs], { encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text */
  }
  return { status: spawned.status, parsed, stdout: spawned.stdout ?? "", output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
}

function iterateStatus(revisionId) {
  const extra = revisionId ? ["--revision", revisionId] : [];
  return run(["scripts", "iterate-status.mjs"], [args.project, "--root", workspace.root, "--json", ...extra]).parsed;
}

const project = readJsonOr(path.join(projectDir, "template-project.json"));
if (!project) {
  console.error(`[pass] no template-project.json in ${projectDir}`);
  process.exit(2);
}

// ------------------------------------------------------------------ --open ---

if (args.open) {
  const parentId = args.revision ?? project.currentDraftRevisionId ?? project.currentApprovedRevisionId ?? null;
  const cliArgs = ["new-revision", args.open, "--project", projectDir];
  if (args.revision) cliArgs.push("--base", args.revision);
  if (args.report) cliArgs.push("--report", args.report);
  if (args.reportId) cliArgs.push("--report-id", args.reportId);
  const opened = run(["tools", "revision-manager", "bin", "graphcompose-flow.mjs"], cliArgs);
  if (opened.status !== 0) {
    process.stderr.write(opened.output);
    process.exit(opened.status || 1);
  }
  const created = /created (revision-\d+)/.exec(opened.stdout)?.[1] ?? null;
  const carried = Number(/carried (\d+) source file/.exec(opened.stdout)?.[1] ?? 0);
  if (!created) {
    process.stderr.write(opened.output);
    process.exit(1);
  }

  // What this pass is aimed at: the loop's state as of the parent.
  const status = parentId ? iterateStatus(parentId) : null;
  const parentDir = parentId ? path.join(projectDir, "revisions", parentId) : null;
  const evidence = parentDir ? evidenceFor(parentDir, status?.largestMismatch ?? null) : [];
  const revisionDir = path.join(projectDir, "revisions", created);
  const sources = fs.readdirSync(revisionDir).filter((n) => /\.java$|-data(\.[a-z0-9-]+)?\.json$/i.test(n) && !/test/i.test(n));

  const report = {
    project: args.project,
    opened: created,
    parent: parentId,
    carriedFiles: carried,
    report: args.report ? { quote: args.report, id: args.reportId ?? null } : null,
    aimedAt: status
      ? { focus: status.largestMismatch, focusSource: status.focusSource, rootCause: status.rootCause, verdict: status.verdict }
      : null,
    evidence,
    tried: status?.attempts ?? [],
    budget: status ? budgetOf(status) : null,
    limitations: status?.limitations ?? null,
    sources,
    next: `edit the one owning property in ${sources.length ? sources.join(", ") : "the template"}, then: node scripts/pass.mjs --project ${args.project}`,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`\nopened ${created}` + (parentId ? ` from ${parentId}` : "") + (carried ? `, ${carried} source file(s) carried forward` : ""));
    if (args.report) console.log(`  report    "${args.report}" — recorded; it stays the focus until a review marks it addressed`);
    if (status?.largestMismatch) {
      console.log(
        `  aimed at  "${status.largestMismatch}"` +
          (status.focusSource === "human" ? " (reported by the user)" : "") +
          (status.rootCause ? ` — cause "${status.rootCause}"` : ""),
      );
    }
    printEvidence(evidence);
    printTried(status);
    if (status) console.log(`  budget    ${budgetLine(status)}`);
    printLimitations(status);
    console.log(`\n  next: ${report.next}\n`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- a render ---

const revisionId = args.revision ?? project.currentDraftRevisionId ?? null;
if (!revisionId) {
  console.error(`[pass] ${args.project} has no current draft; open one: node scripts/pass.mjs --project ${args.project} --open "<what this pass fixes>"`);
  process.exit(2);
}
const revisionDir = path.join(projectDir, "revisions", revisionId);
if (!fs.existsSync(revisionDir)) {
  console.error(`[pass] revision not found: ${revisionDir}`);
  process.exit(2);
}
if (!args.skipRender && fs.existsSync(path.join(revisionDir, "visual-review.json"))) {
  console.error(
    `[pass] ${revisionId} already carries a visual-review.json — its pass has been judged, and rendering over it ` +
      "would replace the render the review was written about.\n" +
      `  next pass:  node scripts/pass.mjs --project ${args.project} --open "<what this pass fixes>"\n` +
      `  re-measure: node scripts/pass.mjs --project ${args.project} --revision ${revisionId} --skip-render`,
  );
  process.exit(2);
}

const radArgs = ["--project", args.project, "--revision", revisionId, "--root", workspace.root, "--against", args.against, "--json"];
if (args.skipRender) radArgs.push("--skip-render");
// The debug render (guide lines) is for a person's eyes and runs only when
// asked; the render runtime reads this from the environment.
if (args.debug) process.env.RENDER_DEBUG = "1";
const rad = run(["scripts", "render-and-diff.mjs"], radArgs);
const pass = rad.parsed;
if (!pass) {
  process.stderr.write(rad.output);
  process.exit(rad.status || 1);
}

const reviewed = fs.existsSync(path.join(revisionDir, "visual-review.json"));
const status = reviewed ? iterateStatus(revisionId) : null;
const parentId = readJsonOr(path.join(revisionDir, "revision.json"))?.parentRevisionId ?? null;
const parentStatus = !reviewed && parentId ? iterateStatus(parentId) : null;
const evidence = evidenceFor(revisionDir, null);
const attempts = describeAttempts(readAttempts(revisionDir));

const report = {
  project: args.project,
  revision: revisionId,
  pass,
  status,
  aimedAt: parentStatus?.largestMismatch ?? null,
  evidence,
  attempts,
  next: pass.loop?.next ?? null,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(rad.status ?? 1);
}

const failed = (pass.steps ?? []).filter((s) => !s.ok);
console.log(`\npass  ${args.project} / ${revisionId}` + (attempts.renders > 0 ? `   render #${attempts.renders} on this revision` : ""));
for (const step of failed) {
  console.log(`  FAIL ${step.name}`);
  if (step.error) console.log(`       ${String(step.error).split("\n").slice(0, 12).join("\n       ")}`);
}
if (pass.diff) {
  const d = pass.diff;
  const attempt = pass.attempt;
  const moved = attempt && attempt.moved !== null ? ` (${attempt.moved >= 0 ? "+" : ""}${attempt.moved.toFixed(3)} vs the previous render)` : "";
  const pages = d.pages && d.pages.length > 1 ? ` · pages ${d.renderPages}/${d.referencePages}, worst page ${d.worstPage}` : "";
  console.log(`  diff      ${d.percent.toFixed(3)}% (${d.mismatchPx} px) — ${d.classification} vs ${d.against}${moved}${pages}`);
  if (d.perceptual) {
    console.log(
      `  perceptual ${d.perceptual.ssim} — ${d.perceptual.classification} (provisional; 0.93+ is where approved invoices sit)` +
        (d.perceptual.worstWindow ? ` · worst ${d.perceptual.worstWindow.size}px window at (${d.perceptual.worstWindow.x}, ${d.perceptual.worstWindow.y})` : ""),
    );
  }
  if (attempts.trail.length > 1) console.log(`  trail     ${attempts.trail.map((p) => `${p.toFixed(2)}%`).join(" → ")}${attempts.stalled ? "   ← the last two moved under 0.25%" : ""}`);
  if (attempt?.sameSourcesAsPrevious) console.log("  note      same sources as the previous render — a re-run, not a try");
  if (d.aspectMismatchPages?.length) console.log("  WARNING   the reference was stretched to fit the render; every figure above understates the difference");
}
if (pass.regions?.ranked?.length) {
  console.log(
    "  regions   " +
      pass.regions.ranked
        .slice(0, 4)
        .map((r) => `${r.id} ${r.concentration === null ? "" : `${r.concentration.toFixed(2)}x`} (${r.percentOfRegion}% of region)`)
        .join(" · "),
  );
}
printEvidence(evidence);
if (parentStatus?.largestMismatch) console.log(`  aimed at  "${parentStatus.largestMismatch}"${parentStatus.focusSource === "human" ? " (reported by the user)" : ""}`);
console.log(`  checks    ${checksLine(pass)}`);
if (pass.source) console.log(`  source    ${Math.round(pass.source.touchedShare * 100)}% of methods touched vs ${pass.source.against}${pass.source.rewroteMostOfIt ? " — a different construction; that belongs in a revision of its own" : ""}`);
if (pass.loop) {
  const l = pass.loop;
  console.log(`  loop      ${l.verdict} — focus "${l.focus ?? "(none)"}"${l.focusSource ? ` (${l.focusSource})` : ""}` + (status ? ` · ${budgetLine(status)}` : ""));
}
printTried(status);
printLimitations(status);
for (const reason of status?.reasons ?? []) console.log(`  - ${reason}`);
if (pass.loop?.next) console.log(`\n  next: ${pass.loop.next}\n`);
process.exit(rad.status ?? 1);

// ------------------------------------------------------------------ helpers ---

/** The evidence packages of a revision, the focus's first when one is named. */
function evidenceFor(dir, focusId) {
  const raw = readJsonOr(path.join(dir, "evidence.json"), []);
  const list = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  const packages = list.map((p) => ({
    region: p.region?.id ?? null,
    cause: p.cause ?? null,
    candidates: p.causeCandidates ?? [],
    basis: p.causeBasis ?? null,
    owner: p.layout?.name ?? null,
    displacement: p.layout?.displacement ?? null,
    recommendedProperties: p.recommendedProperties ?? [],
    prohibition: p.prohibition ?? null,
    concentration: p.appearance?.concentration ?? null,
  }));
  if (!focusId) return packages;
  const focusFirst = packages.filter((p) => p.region === focusId || p.mismatch === focusId);
  return [...focusFirst, ...packages.filter((p) => !focusFirst.includes(p))];
}

function printEvidence(evidence) {
  for (const e of evidence.slice(0, 3)) {
    const move = e.displacement
      ? ` dx ${fmt(e.displacement.deltaX)} dy ${fmt(e.displacement.deltaY)}` +
        (e.displacement.deltaWidth ? ` dw ${fmt(e.displacement.deltaWidth)}` : "") +
        (e.displacement.deltaHeight ? ` dh ${fmt(e.displacement.deltaHeight)}` : "")
      : "";
    const props = e.recommendedProperties.length
      ? ` → ${e.recommendedProperties.map((p) => (typeof p === "string" ? p : p.property ?? JSON.stringify(p))).join(", ")}`
      : "";
    const cands = e.cause === "UNKNOWN" && e.candidates.length ? ` (${e.candidates.join(" | ")})` : "";
    console.log(`  evidence  ${e.region}: ${e.cause ?? "?"}${cands}` + (e.owner ? ` — owner ${e.owner}${move}` : " — no owning node") + props);
    if (e.prohibition) console.log(`            ${e.prohibition}`);
  }
}

function printTried(status) {
  if (!status || (status.attempts ?? []).length === 0) return;
  console.log(`  tried     ${status.attempts.map((a) => `${a.revision}: ${a.action ?? "(no action recorded)"}${a.percent === null ? "" : ` → ${a.percent}%`}`).join(" ; ")}`);
  if (status.diminishingReturns?.stalled) console.log("            the last two passes moved under the material threshold — change approach or accept the residual");
}

function printLimitations(status) {
  const skipped = status?.limitations?.skipped ?? [];
  if (skipped.length) console.log(`  accepted  ${skipped.map((s) => `${s.id} (by ${s.limitation})`).join(", ")} — not the focus, not blocking`);
}

function budgetOf(status) {
  return {
    iterations: status.agentIterations,
    maxIterations: status.limits?.maxIterations ?? null,
    sameCause: status.sameMismatchAttempts,
    maxSameCause: status.limits?.maxSameMismatchAttempts ?? null,
    renders: status.renders?.total ?? 0,
  };
}

function budgetLine(status) {
  const b = budgetOf(status);
  return `iterations ${b.iterations}/${b.maxIterations} · same cause ${b.sameCause}/${b.maxSameCause} · renders ${b.renders}`;
}

function checksLine(pass) {
  const parts = [];
  if (pass.links) parts.push(pass.links.missing?.length ? `links: ${pass.links.missing.length} dead` : "links ok");
  if (pass.document) parts.push(pass.document.defects?.length ? `document: ${pass.document.defects.map((d) => d.id).join(", ")}` : `document ok${pass.document.pageCount ? ` (${pass.document.pageCount} page(s)${pass.document.flow ? `, ${pass.document.flow}` : ""})` : ""}`);
  if (pass.roles) parts.push(pass.roles.findings?.length ? `roles: ${pass.roles.findings.length} finding(s)` : "roles ok");
  if (pass.furniture) parts.push(pass.furniture.defects?.length ? `furniture: ${pass.furniture.defects.map((d) => d.id).join(", ")}` : "furniture ok");
  if (pass.structure) parts.push(pass.structure.findings?.length ? `structure: ${pass.structure.findings.length} smell(s)` : "structure ok");
  if (pass.layout) parts.push(pass.layout.collateral?.length ? `collateral: ${pass.layout.collateral.length} node(s) moved that no edit explains` : "collateral none");
  return parts.join(" · ") || "(none ran)";
}

function fmt(n) {
  return typeof n === "number" ? `${n >= 0 ? "+" : ""}${n.toFixed(1)}` : "?";
}
