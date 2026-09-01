#!/usr/bin/env node
/**
 * scripts/check-knowledge-drift.mjs — does any live document still teach the
 * hand-built version of a primitive the pinned pack has?
 *
 *   node scripts/check-knowledge-drift.mjs [--version 2.2] [--json]
 *
 * A skill that says a primitive does not exist is not a harmless inaccuracy: it
 * is an instruction. The agent reads "work-experience timelines currently
 * require bullets plus `LineBuilder.vertical(...)` and margin tuning", believes
 * it, and writes a hand-assembled timeline with repeated sibling margins —
 * low-level, unmaintainable, and wrong against a library that has shipped
 * `addTimeline` for two minor versions. The generated code then reads as the
 * agent's judgement rather than as stale documentation, which is where the cost
 * hides.
 *
 * ## What this checks, and what it deliberately does not
 *
 * The first version of this scanned prose generally: any absence phrase near
 * any symbol the allow-list declares. It was unusable. Documents discuss
 * absence in the abstract constantly, and the loudest false positives were the
 * sentences *teaching the closed-set rule itself* — "if it is not listed there,
 * it does not exist" names builders while denying nothing. A check that cries
 * wolf is a check somebody turns off.
 *
 * So this is narrow on purpose. It holds a curated list of **semantic
 * primitives**, each paired with the hand-built construction it replaced, and
 * each entry earned its place from a document that really did teach the wrong
 * thing. A pair fires only when the pinned pack actually declares the primitive
 * — on a line that predates it, the manual construction was correct.
 *
 * What it cannot check: whether a claim about *behaviour* is still true. "A row
 * cannot nest inside a layer-stack content layer" names no primitive, and
 * proving it needs a render. That belongs to `scripts/probe.mjs` and the
 * observations file.
 *
 * Frozen packs are skipped. `skills/versions/graphcompose-1.6/` describing a
 * 1.6 limitation is a correct record of that line.
 *
 * Exit: 0 no drift · 1 a live document teaches a superseded construction
 *       2 usage
 */

import fs from "node:fs";
import path from "node:path";

import { noAllowListHint, packSymbols } from "./lib/pack-surface.mjs";
import { installRoot } from "./lib/workspace.mjs";

const repoRoot = installRoot();

/**
 * Semantic primitives, and the hand-built shapes they replace.
 *
 * `primitive` is looked up in the pinned pack's generated allow-list, so a pair
 * is inert on a line that does not have it. `manual` are the constructions a
 * document would describe if it did not know the primitive existed; they are
 * specific rather than clever, because a loose pattern here is how this becomes
 * noise. `unless` lets a document mention the manual form for a legitimate
 * reason — the primitive named in the same breath is the tell.
 */
const PRIMITIVES = [
  {
    concept: "timeline",
    primitive: "addTimeline",
    manual: [
      /timelines?\b[^.]{0,80}\b(?:require|need|built|composed|assembled)\b[^.]{0,80}\bbullets?\b/i,
      /\bbullets?\b[^.]{0,40}\bplus\b[^.]{0,40}`?LineBuilder\.vertical/i,
      /\b(?:no|missing|lacks? an?)\b[^.]{0,30}\btimeline primitive\b/i,
    ],
    replacement: "`addTimeline(Consumer<TimelineBuilder>)` with `TimelineBuilder.entry(...)`",
    // Retired from docs/ on 2026-08-26; kept so a copy cannot come back.
    incident: "docs/engine-feedback-noir-corporate-cv.md item 5, true on 1.x and false on 2.2",
  },
  {
    concept: "page background band",
    primitive: "pageBackgrounds",
    manual: [
      // The document's own words. "Background surfaces", not "bands" — a
      // pattern written from memory of the concept missed the passage it was
      // written for.
      /\b(?:content|body) rows?\b[^.]{0,40}\bas background paint\b/i,
      /\b(?:background|top)\s+(?:bands?|surfaces?)\b[^.]{0,80}\b(?:content|body) rows?\b/i,
      /\b(?:no|lacks? an?)\b[^.]{0,40}\bpage-?level background\b/i,
    ],
    replacement: "`pageBackgrounds(List<PageBackgroundFill>)` with `PageBackgroundFill.fullPage/leftColumn/column`",
    incident: "docs/engine-feedback-noir-corporate-cv.md item 2, resolved by PageBackgroundFill",
  },
  {
    concept: "shape-owned content",
    primitive: "addCircle",
    manual: [
      /\b(?:sibling|adjacent)\s+paragraph\b[^.]{0,60}\bnegative margin\b/i,
      /\bnegative margin\b[^.]{0,60}\b(?:centre|center)\b[^.]{0,40}\b(?:circle|shape)\b/i,
    ],
    replacement: "a `ShapeContainer` anchor — `addCircle(..., c -> c.center(...))`",
    incident: "the CV-initials workaround the same document already called a flow defect",
  },
  {
    concept: "page header or footer",
    primitive: "header",
    manual: [
      /\b(?:headers?|footers?)\b[^.]{0,60}\b(?:drawn|composed|repeated)\b[^.]{0,60}\bas (?:ordinary )?body (?:content|flow)\b/i,
    ],
    replacement: "`DocumentSession.header(...)` / `footer(...)`",
    incident: "check-region-primitives reports the same defect after the fact; this catches the guidance",
  },
];

/**
 * Where a claim is held to the pinned API. Frozen packs are records, not rules.
 *
 * `scanRoot` is the repository by default and an override for tests. It is not
 * a convenience: the first version of this suite wrote fixtures into the real
 * `docs/`, and `contracts.test.mjs` walks `docs/` at the same time — it listed
 * a fixture, the fixture was cleaned up, and the read failed. An intermittent
 * failure in an unrelated file is a worse defect than the one being tested for.
 */
function liveDocuments(activePack, scanRoot) {
  const roots = [
    path.join(scanRoot, "skills", "workflows"),
    path.join(scanRoot, "skills", "versions", activePack),
    path.join(scanRoot, "docs"),
  ];
  const files = [];
  for (const root of roots) walk(root, files);
  return files.filter((file) => {
    const rel = path.relative(scanRoot, file).split(path.sep).join("/");
    if (!rel.endsWith(".md")) return false;
    // The generated allow-list is the arbiter, not a claim about the API.
    if (rel.endsWith("00-api-surface.md")) return false;
    // Plans, audits and retired material. Gitignored, and explicitly not guidance.
    if (rel.startsWith("docs/private/")) return false;
    return true;
  });
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

/**
 * How far after a manual construction the primitive still counts as named.
 *
 * A document that describes the hand-built form and then says "prefer
 * `addTimeline`" is teaching correctly, and the two are rarely on one line.
 */
const WINDOW = 8;

function parseArgs(argv) {
  const out = { version: null, json: false, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node scripts/check-knowledge-drift.mjs [--version <x.y>] [--json]\n\n" +
          "  --version <x.y>   pack to hold documents to (default: the newest on disk)\n" +
          "  --json            machine-readable result\n\n" +
          "exit: 0 no drift | 1 a superseded construction is still taught | 2 usage\n",
      );
      process.exit(0);
    } else if (a === "--json") out.json = true;
    else if (a === "--version") out.version = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[knowledge-drift] unknown argument: ${a}\n`);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const versionsDir = path.join(repoRoot, "skills", "versions");
const packs = fs
  .readdirSync(versionsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
  .map((e) => e.name)
  .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)));
const activePack = args.version ? `graphcompose-${args.version}` : packs[packs.length - 1];

// Whichever layout the pack is in. Reading only `00-api-surface.md` meant that
// importing a knowledge bundle — which brings a larger allow-list, split per
// surface — turned this check off with a message about a missing file.
const symbols = packSymbols(path.join(versionsDir, activePack));
if (!symbols) {
  process.stderr.write(`[knowledge-drift] ${noAllowListHint(activePack)}`);
  process.exit(2);
}

// A pair is inert until the pack actually has the primitive: before that, the
// manual construction was the correct advice and flagging it would be wrong.
const active = PRIMITIVES.filter((entry) => symbols.has(entry.primitive));
const dormant = PRIMITIVES.filter((entry) => !symbols.has(entry.primitive));

const findings = [];
const scanRoot = args.root ? path.resolve(args.root) : repoRoot;

for (const file of liveDocuments(activePack, scanRoot)) {
  const rel = path.relative(scanRoot, file).split(path.sep).join("/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const entry of active) {
      if (!entry.manual.some((pattern) => pattern.test(line))) continue;
      // Naming the primitive nearby is the tell that the passage is teaching
      // the contrast rather than the workaround.
      const context = lines.slice(index, index + 1 + WINDOW).join("\n");
      if (context.includes(entry.primitive)) continue;
      findings.push({
        file: rel,
        line: index + 1,
        concept: entry.concept,
        primitive: entry.primitive,
        replacement: entry.replacement,
        text: line.trim().slice(0, 160),
      });
    }
  });
}

if (args.json) {
  process.stdout.write(
    `${JSON.stringify(
      { pack: activePack, checked: active.map((e) => e.concept), dormant: dormant.map((e) => e.concept), findings },
      null,
      2,
    )}\n`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}

if (findings.length === 0) {
  console.log(
    `[knowledge-drift] no live document teaches a construction ${activePack} has replaced ` +
      `(${active.length} primitive(s) checked${dormant.length ? `, ${dormant.length} not in this pack` : ""})`,
  );
  process.exit(0);
}

console.error(`[knowledge-drift] ${findings.length} superseded construction(s) still taught:\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  (${finding.concept})`);
  console.error(`    ${finding.text}`);
  console.error(`    ${activePack} has ${finding.replacement}\n`);
}
console.error(
  "  A skill that teaches the hand-built form is an instruction to write it.\n" +
    "  Fix the passage, name the primitive beside it, or move it under a heading\n" +
    "  that says which version it was true for.",
);
process.exit(1);
