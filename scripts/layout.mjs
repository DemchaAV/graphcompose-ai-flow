#!/usr/bin/env node
/**
 * scripts/layout.mjs — where did this node end up, and why there?
 *
 *   node scripts/layout.mjs inspect <node> --project <id> --revision <id>
 *   node scripts/layout.mjs explain <node> <x|y|width|height|contentX|contentY> …
 *   node scripts/layout.mjs diff <revA> <revB> --project <id> [--region <node>]
 *
 * The render is measured. `layout-snapshot.json` in the revision folder is
 * GraphCompose's own post-layout measurement of every node in the document —
 * where it sits, how big it is, what its insets are. It is the file that turns
 * "the Languages block looks too far right" from a guess into arithmetic.
 *
 * It is also 227 KB for a one-page CV, so handing it to a model is the wrong
 * move twice: it costs the context budget, and it buries the one row that
 * matters under 247 that do not. This is the targeted query instead. `inspect`
 * answers where a node is; `explain` answers why, as an additive chain that
 * names every node contributing to the number:
 *
 *     HeadingText_CONTACT.x = 26
 *       canvas.margin.left               0
 *     + Sidebar.padding.left            17
 *     + Heading_CONTACT.padding.left     9
 *     = 26   (exact)
 *
 * Two owners, named, with each contribution. That is what makes a fix land on
 * the node that caused the offset rather than the node that shows it.
 *
 * Sometimes the honest answer is that the file cannot say. A paragraph is as
 * wide as its text and the text metrics are not in the snapshot; a weighted row
 * column's x comes from weights the snapshot does not record. Those report
 * `not derivable` and say what it would take, because a tool that always
 * produces a chain is guessing with extra steps.
 *
 * `diff` answers the third question, the one a pixel comparison cannot: did the
 * patch move what it claimed and *nothing else*. It separates what a person
 * edited — margins, padding, tree position — from what the engine then
 * computed, so "47 nodes changed" becomes "one padding was edited, three
 * children followed it, and one node moved that no edit explains".
 *
 * Not to be confused with `scripts/probe.mjs`: that answers "how does
 * GraphCompose behave?" by running the library. This answers "how did *this*
 * template lay out?" by reading what it measured. No model is called here.
 *
 * Exit: 0 answered · 1 unreadable snapshot · 2 usage · 3 no such node
 *       4 no snapshot in that revision
 *
 * `diff` exits 0 whether or not it finds anything. It is evidence, the same
 * contract `check-structural-smells.mjs` has — a heuristic that blocked the loop
 * would be worse than the guessing it replaces.
 */

import fs from "node:fs";
import path from "node:path";

import { describeWorkspaceLine, resolveWorkspace, projectDir } from "./lib/workspace.mjs";
import {
  COORDINATES,
  LayoutSnapshotError,
  NodeQueryError,
  explain,
  inspectNode,
  loadSnapshot,
  resolveNode,
} from "./lib/layout-inspector.mjs";
import { diffSnapshots } from "./lib/layout-diff.mjs";
import { diagnose, impact } from "./lib/layout-doctor.mjs";

const SNAPSHOT = "layout-snapshot.json";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/layout.mjs <inspect|explain|diff> … [options]\n\n" +
      "  inspect <node>              where the node is: placement box, content box, insets, page\n" +
      "  explain <node> <coord>      why that coordinate is the number it is, as an additive chain\n" +
      `                              coord is one of: ${COORDINATES.join(", ")}\n` +
      "  diff <revA> <revB>          what moved between two renders, and what no edit explains\n" +
      "  doctor                      geometry that sits on children when it belongs on their parent\n" +
      "  impact <node>               which nodes a change to this one reaches, structurally\n\n" +
      "  <node> is the name you would say — `Languages` — or a path suffix, or the full node path.\n" +
      "  An ambiguous name lists the candidates instead of guessing.\n\n" +
      "  --project <id>              project holding the revision\n" +
      "  --revision <id>             revision whose render to read\n" +
      "  --snapshot <path>           read this file directly, instead of --project/--revision\n" +
      "  --against <path>            (diff) the second snapshot, when using --snapshot\n" +
      "  --region <node>             (diff) compare only this node's subtree\n" +
      "  --root <dir>                workspace override (default: discovered)\n" +
      "  --children                  (inspect) also list the immediate children\n" +
      "  --ancestors                 (inspect) also list the chain from the root\n" +
      "  --json                      machine-readable output\n\n" +
      "exit: 0 answered | 1 unreadable snapshot | 2 usage | 3 no such node | 4 no snapshot\n",
  );
  process.exit(code);
}

function fail(code, message) {
  process.stderr.write(`[layout] ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    command: null,
    node: null,
    coordinate: null,
    project: null,
    revision: null,
    snapshot: null,
    against: null,
    region: null,
    root: null,
    children: false,
    ancestors: false,
    json: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--children") out.children = true;
    else if (a === "--ancestors") out.ancestors = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--snapshot") out.snapshot = argv[++i];
    else if (a === "--against") out.against = argv[++i];
    else if (a === "--region") out.region = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (a.startsWith("-")) {
      process.stderr.write(`[layout] unknown argument: ${a}\n`);
      usage(2);
    } else positional.push(a);
  }
  const COMMANDS = ["inspect", "explain", "diff", "doctor", "impact"];
  [out.command] = positional;
  if (!COMMANDS.includes(out.command)) {
    process.stderr.write(out.command ? `[layout] unknown command: ${out.command}\n` : "[layout] no command given\n");
    usage(2);
  }

  if (out.command === "diff") {
    // `diff <revA> <revB>` with --project, or --snapshot/--against with two files.
    [, out.revisionA, out.revisionB] = positional;
    if (!out.snapshot && (!out.revisionA || !out.revisionB)) {
      process.stderr.write("[layout] diff needs two revisions — `diff <revA> <revB> --project <id>` — or --snapshot and --against\n");
      usage(2);
    }
    if (out.snapshot && !out.against) {
      process.stderr.write("[layout] --snapshot needs --against <path> for a diff\n");
      usage(2);
    }
    if (positional.length > 3) {
      process.stderr.write(`[layout] unexpected argument: ${positional[3]}\n`);
      usage(2);
    }
    return out;
  }

  // `doctor` walks the whole document, so it is the one command that names no node.
  if (out.command === "doctor") {
    if (positional.length > 1) {
      process.stderr.write(`[layout] unexpected argument: ${positional[1]}\n`);
      usage(2);
    }
    return out;
  }

  [, out.node, out.coordinate] = positional;
  if (!out.node) {
    process.stderr.write(`[layout] ${out.command} needs a node\n`);
    usage(2);
  }
  if (out.command === "impact" && positional.length > 2) {
    process.stderr.write(`[layout] unexpected argument: ${positional[2]}\n`);
    usage(2);
  }
  if (out.command === "explain" && !out.coordinate) {
    process.stderr.write(`[layout] explain needs a coordinate — one of ${COORDINATES.join(", ")}\n`);
    usage(2);
  }
  if (positional.length > (out.command === "explain" ? 3 : 2)) {
    process.stderr.write(`[layout] unexpected argument: ${positional[out.command === "explain" ? 3 : 2]}\n`);
    usage(2);
  }
  return out;
}

/**
 * Where the snapshot is. `--snapshot` wins so a file outside any workspace can
 * be inspected — a revision folder someone sent you, or a fixture.
 */
function locateSnapshot(args) {
  if (args.snapshot) {
    if (!fs.existsSync(args.snapshot)) fail(4, `no such file: ${args.snapshot}`);
    return { file: args.snapshot, workspaceLine: null };
  }
  if (!args.project || !args.revision) {
    process.stderr.write("[layout] give --project and --revision, or --snapshot <path>\n");
    usage(2);
  }
  const workspace = resolveWorkspace({ explicitRoot: args.root });
  const file = path.join(projectDir(workspace, args.project), "revisions", args.revision, SNAPSHOT);
  if (!fs.existsSync(file)) {
    fail(
      4,
      `no ${SNAPSHOT} in ${args.project}/${args.revision}.\n` +
        "        The renderer writes it from GraphCompose's own measurement, and only from 1.6.0 " +
        "onward — a project pinned older renders fine and produces no snapshot. The render log says which.",
    );
  }
  return { file, workspaceLine: describeWorkspaceLine(workspace) };
}

/** The two files a diff compares, in `before, after` order. */
function locateDiffSnapshots(args) {
  if (args.snapshot) {
    for (const file of [args.snapshot, args.against]) {
      if (!fs.existsSync(file)) fail(4, `no such file: ${file}`);
    }
    return { before: args.snapshot, after: args.against, workspaceLine: null };
  }
  const a = locateSnapshot({ ...args, revision: args.revisionA });
  const b = locateSnapshot({ ...args, revision: args.revisionB });
  return { before: a.file, after: b.file, workspaceLine: a.workspaceLine };
}

/** Display only. The chain is checked by the reader, so the numbers stay exactly as measured. */
const fmt = (n) => String(n);

function renderChain(result, node) {
  const name = node.entityName ?? node.entityKind;
  const lines = [`${name}.${result.coordinate} = ${fmt(result.value)}`, ""];

  if (!result.derivable) {
    lines.push("  not derivable from this snapshot", "", `  ${result.note}`);
    return lines.join("\n");
  }

  const width = Math.max(...result.terms.map((t) => t.label.length), 0);
  result.terms.forEach((t, i) => {
    const sign = i === 0 ? " " : t.value < 0 ? "-" : "+";
    const value = i === 0 ? t.value : Math.abs(t.value);
    lines.push(`  ${sign} ${t.label.padEnd(width)}  ${String(fmt(value)).padStart(10)}`);
  });
  if (!result.exact) {
    const sign = result.residual < 0 ? "-" : "+";
    lines.push(`  ${sign} ${"unattributed".padEnd(width)}  ${String(fmt(Math.abs(result.residual))).padStart(10)}`);
  }
  lines.push(`  ${"=".padEnd(width + 2)}  ${String(fmt(result.value)).padStart(10)}   (${result.rule}${result.exact ? ", exact" : ""})`);
  lines.push("", `  ${result.note}`);
  return lines.join("\n");
}

const insets = (i) => `${fmt(i.top)} ${fmt(i.right)} ${fmt(i.bottom)} ${fmt(i.left)}`;

function renderInspect(view, model) {
  const lines = [];
  lines.push(`${view.name ?? view.kind}  (${view.kind})`);
  lines.push(`  path      ${view.path}`);
  lines.push(`  parent    ${view.parent ? `${view.parent.name ?? view.parent.kind}  (${view.parent.path})` : "— root"}`);
  const pages = view.pages.spansPages
    ? `${view.pages.start + 1}–${view.pages.end + 1} of ${model.totalPages} (spans pages; one box for the whole node)`
    : `${view.pages.start + 1} of ${model.totalPages}`;
  lines.push(`  page      ${pages}`);
  lines.push(
    `  position  depth ${view.depth} · child ${view.childIndex} of ${view.siblingCount} · layer ${view.layer}` +
      (view.childCount ? ` · ${view.childCount} children, laid out as a ${view.laysOutAs}` : " · leaf"),
  );
  lines.push("");
  lines.push(`  placement x ${view.placement.x}  y ${view.placement.y}  w ${view.placement.width}  h ${view.placement.height}   (top ${view.placement.top}, right ${view.placement.right})`);
  lines.push(`  content   x ${view.content.x}  y ${view.content.y}  w ${view.content.width}  h ${view.content.height}   (top ${view.content.top}) — computed from placement and padding`);
  lines.push(`  margin    ${insets(view.margin)}      padding   ${insets(view.padding)}    (top right bottom left)`);
  for (const run of view.typography ?? []) {
    const font = run.fontSubstituted
      ? `${run.declaredFont} → ${run.resolvedFont}  ⚠ substituted`
      : run.resolvedFont;
    lines.push(`  type      ${font}  ${run.fontSize}pt · ${run.lineCount} line(s)` +
      (run.verticalAlign && run.verticalAlign !== "DEFAULT" ? ` · seated ${run.verticalAlign}` : ""));
  }
  if (view.typography?.some((run) => run.fontSubstituted)) {
    lines.push("            The style named a font the document is not set in. It renders without");
    lines.push("            error, so nothing else will tell you — see `fontSubstituted`.");
  }
  if (view.children) {
    lines.push("", `  children (${view.children.length}):`);
    for (const c of view.children) lines.push(`    ${String(c.name ?? c.kind).padEnd(24)} x ${c.x}  y ${c.y}  w ${c.width}  h ${c.height}`);
  }
  if (view.ancestors) {
    lines.push("", "  ancestors (root first):");
    view.ancestors.forEach((a, i) => lines.push(`    ${"  ".repeat(i)}${String(a.name ?? a.kind).padEnd(22)} x ${a.x}  y ${a.y}  w ${a.width}  h ${a.height}`));
  }
  lines.push("");
  lines.push("  y is bottom-up: a larger y is higher on the page.");
  return lines.join("\n");
}

const nameOf = (entry) => entry.name ?? `<${entry.kind}>`;

/** `placementX 0 → 12` */
const changeList = (changes) =>
  Object.entries(changes)
    .map(([property, [from, to]]) => `${property} ${fmt(from)} → ${fmt(to)}`)
    .join(", ");

function renderDiff(diff, beforeLabel, afterLabel) {
  const lines = [];
  lines.push(`layout diff  ${beforeLabel} → ${afterLabel}`);
  if (diff.scope) lines.push(`  region    ${diff.scope.name ?? diff.scope.region} (${diff.scope.nodes} nodes)`);
  lines.push(
    `  nodes     ${diff.totals.before} → ${diff.totals.after} · ` +
      `${diff.totals.changed} changed, ${diff.totals.unchanged} unchanged` +
      (diff.added.length ? `, ${diff.added.length} added` : "") +
      (diff.removed.length ? `, ${diff.removed.length} removed` : ""),
  );
  if (diff.pagination.changed) {
    lines.push(`  ⚠ pages    ${diff.pagination.before} → ${diff.pagination.after} — the document paginated differently, so every node comparison below is against a different layout`);
  }
  lines.push("");

  if (diff.totals.changed === 0 && !diff.added.length && !diff.removed.length) {
    lines.push("  Nothing moved. The two renders are geometrically identical.");
    return lines.join("\n");
  }

  if (diff.authoredChanges.length) {
    lines.push(`  edited (${diff.authoredChanges.length}) — insets and structure, the things a person writes:`);
    for (const entry of diff.authoredChanges) {
      lines.push(`    ${nameOf(entry)}`);
      lines.push(`      ${changeList(entry.changes.authored)}`);
      if (Object.keys(entry.changes.derived).length) {
        lines.push(`      and moved: ${changeList(entry.changes.derived)}`);
      }
    }
    lines.push("");
  }

  if (diff.affectedDescendants.length) {
    lines.push(`  followed (${diff.affectedDescendants.length}) — moved because an ancestor was edited:`);
    for (const entry of diff.affectedDescendants) {
      lines.push(`    ${String(nameOf(entry)).padEnd(22)} ${changeList(entry.changes.derived)}`);
    }
    lines.push("");
  }

  if (diff.collateral.length) {
    lines.push(`  ⚠ collateral (${diff.collateral.length}) — moved, and no edit in this diff explains it:`);
    for (const entry of diff.collateral) {
      lines.push(`    ${String(nameOf(entry)).padEnd(22)} ${changeList(entry.changes.derived)}`);
      lines.push(`      ${entry.path}`);
    }
    lines.push(
      "",
      "  Collateral is not automatically a defect — a parent grows when its widest",
      "  child does, and that is the engine working. It is listed because nothing in",
      "  the edit said so, and a reviewer who is not told will not think to look.",
      "",
    );
  }

  for (const entry of diff.added) lines.push(`  + added    ${nameOf(entry)}  ${entry.path}`);
  for (const entry of diff.removed) lines.push(`  - removed  ${nameOf(entry)}  ${entry.path}`);
  if (diff.added.length || diff.removed.length) lines.push("");

  for (const finding of diff.ownership) {
    lines.push(`  ownership: ${finding.pattern}`);
    lines.push(`    ${finding.siblings.length} siblings each gained ${finding.property} ${fmt(finding.delta)}`);
    for (const sibling of finding.siblings) lines.push(`      ${sibling}`);
    lines.push(`    → put it on ${finding.recommendedOwnerName ?? finding.recommendedOwner} as ${finding.propertyCandidate}`);
    lines.push(`      ${finding.recommendedOwner}`);
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "");
}

/** Read and validate one snapshot, or exit 1 saying which file was wrong. */
function readModel(file) {
  try {
    return loadSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    return fail(1, `${file}: ${err.message}`);
  }
}

function runDiff(args) {
  const { before, after, workspaceLine } = locateDiffSnapshots(args);
  const beforeModel = readModel(before);
  const afterModel = readModel(after);

  let regionNode = null;
  if (args.region) {
    try {
      regionNode = resolveNode(afterModel, args.region);
    } catch (err) {
      if (!(err instanceof NodeQueryError)) throw err;
      process.stderr.write(`[layout] --region ${err.message}\n`);
      for (const candidate of err.candidates) process.stderr.write(`          ${candidate}\n`);
      process.exit(3);
    }
  }

  const diff = diffSnapshots(beforeModel, afterModel, { regionNode });
  const labels = args.snapshot ? [args.snapshot, args.against] : [args.revisionA, args.revisionB];
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ before: labels[0], after: labels[1], ...diff }, null, 2)}\n`);
  } else {
    if (workspaceLine) process.stdout.write(`${workspaceLine}\n\n`);
    process.stdout.write(`${renderDiff(diff, labels[0], labels[1])}\n`);
  }
  process.exit(0);
}

function renderDoctor(result) {
  const lines = [];
  lines.push(`layout doctor  ${result.examined} parent(s) examined${result.scope ? ` under ${result.scope}` : ""}`);
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("  Nothing to report. Every shared value already sits on a parent.");
    return lines.join("\n");
  }
  for (const finding of result.findings) {
    lines.push(`  ${finding.parent.label}  —  ${finding.kind}`);
    lines.push(
      finding.property
        ? `    ${finding.count} of ${finding.siblings} children carry ${finding.property} = ${finding.value}`
        : `    ${finding.count} negative inset(s) among ${finding.siblings} children`,
    );
    for (const child of finding.children.slice(0, 4)) {
      lines.push(`      ${child.name ?? child.path}${child.property ? `  ${child.property} = ${child.value}` : ""}`);
    }
    if (finding.children.length > 4) lines.push(`      … and ${finding.children.length - 4} more`);
    lines.push(`    → ${finding.suggestion}`);
    lines.push(`      ${finding.parent.path}`);
    lines.push("");
  }
  lines.push("  Maintainability findings, not rendering defects: the page looks the same either way.");
  lines.push("  They say what a later revision will have to move, and in how many places.");
  lines.push("  `check-structural-smells.mjs` asks the same question of the source. A snapshot cannot");
  lines.push("  tell a repeated literal from one shared constant, so the two disagree by design.");
  return lines.join("\n");
}

function renderImpact(result) {
  const lines = [];
  lines.push(`${result.node.name ?? result.node.path}  —  what a property change here reaches`);
  lines.push("");
  const list = (label, items) => {
    lines.push(`  ${label} (${items.length})`);
    for (const item of items.slice(0, 8)) lines.push(`    ${item.name ?? item.path}`);
    if (items.length > 8) lines.push(`    … and ${items.length - 8} more`);
  };
  list("directly — its own children", result.directly);
  list("transitively — deeper descendants", result.transitively);
  list("stacked after it — siblings that follow in the flow", result.siblingsAfter);
  lines.push("");
  lines.push(`  ${result.unaffectedCount} node(s) are not reachable from this one.`);
  lines.push("");
  lines.push("  Structural reach only. What the page then looks like needs a re-render — predicting");
  lines.push("  it from here would be inventing the geometry this tool exists to measure.");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "diff") runDiff(args);

  const { file, workspaceLine } = locateSnapshot(args);
  const model = readModel(file);

  if (args.command === "doctor") {
    const result = diagnose(model);
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      if (workspaceLine) process.stdout.write(`${workspaceLine}\n\n`);
      process.stdout.write(`${renderDoctor(result)}\n`);
    }
    process.exit(0);
  }

  let node;
  try {
    node = resolveNode(model, args.node);
  } catch (err) {
    if (!(err instanceof NodeQueryError)) throw err;
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ error: err.message, candidates: err.candidates }, null, 2)}\n`);
    } else {
      process.stderr.write(`[layout] ${err.message}\n`);
      for (const candidate of err.candidates) process.stderr.write(`          ${candidate}\n`);
    }
    process.exit(3);
  }

  if (args.command === "inspect") {
    const view = inspectNode(model, node, { children: args.children, ancestors: args.ancestors });
    if (args.json) process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
    else {
      if (workspaceLine) process.stdout.write(`${workspaceLine}\n\n`);
      process.stdout.write(`${renderInspect(view, model)}\n`);
    }
    process.exit(0);
  }

  if (args.command === "impact") {
    const result = impact(model, node);
    if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      if (workspaceLine) process.stdout.write(`${workspaceLine}\n\n`);
      process.stdout.write(`${renderImpact(result)}\n`);
    }
    process.exit(0);
  }

  let result;
  try {
    result = explain(model, node, args.coordinate);
  } catch (err) {
    if (!(err instanceof NodeQueryError)) throw err;
    fail(2, err.message);
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ path: node.path, name: node.entityName, ...result }, null, 2)}\n`);
  } else {
    if (workspaceLine) process.stdout.write(`${workspaceLine}\n\n`);
    process.stdout.write(`${renderChain(result, node)}\n`);
  }
  process.exit(0);
}

main();
