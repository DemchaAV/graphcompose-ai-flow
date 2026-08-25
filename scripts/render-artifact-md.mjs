#!/usr/bin/env node
/**
 * scripts/render-artifact-md.mjs — the Markdown half of an artifact, generated.
 *
 *   node scripts/render-artifact-md.mjs <artifact.json> [--out <file>] [--stdout] [--check]
 *   node scripts/render-artifact-md.mjs --revision <dir> [--check]
 *
 * Three artifacts have always been written twice: `visual-analysis`,
 * `architecture-plan` and `visual-review`, each as canonical JSON and then
 * again as prose. The first real acceptance run put a number on it — 24
 * Markdown files, 112 KB, roughly 29k tokens across eight revisions, about an
 * eighth of the run's spend, restating JSON the agent had just written.
 *
 * Worse than the cost is that two documents drift. A reviewer reading the
 * Markdown and a gate reading the JSON can disagree about the same revision,
 * and nothing detects it.
 *
 * So the JSON is the artifact and this renders the reading copy. What the
 * schema carries, this prints; what it cannot derive — a table comparing three
 * revisions, a paragraph of causal reasoning — goes in the JSON's `notes`,
 * emitted verbatim, so there is still exactly one source.
 *
 * `--check` re-renders and compares instead of writing: exit 1 on drift, which
 * is how a hand-edited Markdown twin gets caught.
 *
 * Exit codes: 0 written or in sync, 1 drift or a malformed artifact, 2 usage.
 */

import fs from "node:fs";
import path from "node:path";

/** Artifact kinds, keyed by the file stem the workflow writes. */
const KINDS = ["visual-analysis", "architecture-plan", "visual-review"];

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/render-artifact-md.mjs <artifact.json> [--out <file>] [--stdout] [--check]\n" +
      "       node scripts/render-artifact-md.mjs --revision <dir> [--check]\n\n" +
      "  <artifact.json>    visual-analysis.json | architecture-plan.json | visual-review.json\n" +
      "  --revision <dir>   render every artifact present in a revision directory\n" +
      "  --out <file>       write somewhere other than the .md sibling\n" +
      "  --stdout           print instead of writing\n" +
      "  --check            compare against what is on disk; exit 1 on drift\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { input: null, revision: null, outFile: null, stdout: false, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--stdout") out.stdout = true;
    else if (a === "--check") out.check = true;
    else if (a === "--out") out.outFile = argv[++i];
    else if (a === "--revision") out.revision = argv[++i];
    else if (a.startsWith("--")) {
      process.stderr.write(`[render-artifact-md] unknown argument: ${a}\n`);
      usage(2);
    } else out.input = a;
  }
  if (!out.input && !out.revision) {
    process.stderr.write("[render-artifact-md] an artifact path or --revision is required\n");
    usage(2);
  }
  if (out.input && out.revision) {
    process.stderr.write("[render-artifact-md] pass an artifact path or --revision, not both\n");
    usage(2);
  }
  // --revision renders several artifacts; one --out for all of them wrote each
  // over the last and reported success for every one. Silent loss, so it is
  // refused rather than resolved to something clever.
  if (out.revision && out.outFile) {
    process.stderr.write(
      "[render-artifact-md] --out takes one destination, and --revision renders several. " +
        "Render one artifact at a time when you need --out.\n",
    );
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const targets = args.revision
  ? KINDS.map((kind) => path.join(args.revision, `${kind}.json`)).filter((p) => fs.existsSync(p))
  : [args.input];

if (targets.length === 0) {
  process.stdout.write(`[render-artifact-md] no artifacts to render in ${args.revision}\n`);
  process.exit(0);
}

let drifted = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) {
    process.stderr.write(`[render-artifact-md] no such file: ${target}\n`);
    process.exit(1);
  }
  const kind = kindOf(target);
  if (!kind) {
    process.stderr.write(
      `[render-artifact-md] ${path.basename(target)} is not one of ${KINDS.join(", ")}\n`,
    );
    process.exit(2);
  }

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (cause) {
    process.stderr.write(`[render-artifact-md] ${target} is not valid JSON: ${cause.message}\n`);
    process.exit(1);
  }

  const markdown = render(kind, artifact, target);
  const destination = args.outFile ?? target.replace(/\.json$/, ".md");

  if (args.stdout) {
    process.stdout.write(markdown);
    continue;
  }
  if (args.check) {
    const current = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : null;
    if (current === markdown) {
      console.log(`[render-artifact-md] in sync: ${path.basename(destination)}`);
    } else {
      drifted += 1;
      console.error(
        current === null
          ? `[render-artifact-md] missing: ${destination}`
          : `[render-artifact-md] drifted: ${destination} — regenerate it, do not edit it`,
      );
    }
    continue;
  }
  fs.writeFileSync(destination, markdown, "utf8");
  console.log(`[render-artifact-md] wrote ${destination}`);
}

process.exit(drifted === 0 ? 0 : 1);

// --------------------------------------------------------------- rendering ---

function kindOf(file) {
  const stem = path.basename(file).replace(/\.json$/, "");
  return KINDS.includes(stem) ? stem : null;
}

function render(kind, artifact, sourcePath) {
  const source = path.basename(sourcePath);
  let body;
  try {
    body =
      kind === "visual-analysis"
        ? renderVisualAnalysis(artifact)
        : kind === "architecture-plan"
          ? renderArchitecturePlan(artifact)
          : renderVisualReview(artifact);
  } catch (cause) {
    // This renderer assumes the shape the schema describes. When it does not
    // get it, a raw TypeError three frames down says nothing about the cause —
    // an acceptance run met exactly that, with `colors` written as an object
    // where the schema says array, and spent the next minute in the wrong file.
    throw new Error(
      `${source} does not have the shape its schema describes (${cause.message}).\n` +
        `  Check it first: node .github/scripts/validate-schemas.mjs <revision-dir>`,
    );
  }

  const lines = [
    ...body,
    ...renderNotes(artifact),
    "",
    "---",
    "",
    `Generated from \`${source}\` by \`scripts/render-artifact-md.mjs\`. Edit the JSON,`,
    "not this file — `--check` fails the build when the two disagree.",
    "",
  ];
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimStart()}`;
}

/** Prose the schema cannot derive, emitted verbatim. */
function renderNotes(artifact) {
  const notes = artifact.notes;
  if (!notes) return [];
  const blocks = Array.isArray(notes) ? notes : [notes];
  const kept = blocks.filter((b) => typeof b === "string" && b.trim() !== "");
  if (kept.length === 0) return [];
  return ["", "## Notes", "", ...kept.map((b) => b.trim()), ""];
}

function renderVisualAnalysis(a) {
  const out = ["# Visual analysis", ""];
  const page = a.page ?? {};
  out.push(
    `**Page.** ${[page.format, page.orientation, page.pageCount ? `${page.pageCount} page(s)` : null]
      .filter(Boolean)
      .join(" · ") || "not recorded"}`,
  );
  if (page.margins) out.push("", `Margins: ${inline(page.margins)}`);
  if (page.background) out.push("", `Background: ${inline(page.background)}`);

  // The fixed-vs-flowing call leads: it decides pagination, chrome mapping and
  // whether the example data must overflow — a reader needs it before regions.
  const flow = a.flow;
  if (flow?.kind) {
    const parts = [`**Flow: ${flow.kind}.**`];
    if (flow.drivenBy) parts.push(`Grows with data: \`${flow.drivenBy}\`.`);
    if (flow.overflowExpectation) parts.push(flow.overflowExpectation);
    out.push("", parts.join(" "));

    // The enumeration decision belongs in the reading copy for the same reason
    // the flow decision does: a reviewer who cannot see a decision cannot
    // disagree with it, and "should a missing page be detectable" is exactly
    // the kind of call that goes unexamined when it is only in the JSON.
    const numbering = flow.pageEnumeration;
    if (numbering) {
      const line = numbering.required
        ? [
            `**Page enumeration: required.**`,
            numbering.format ? `\`${numbering.format}\`` : null,
            numbering.location ? `in the ${numbering.location}` : null,
            numbering.repeat ? `(${numbering.repeat})` : null,
            numbering.reason ? `— ${numbering.reason}` : null,
          ]
        : [
            `**Page enumeration: not required.**`,
            numbering.reason ? `— ${numbering.reason}` : null,
          ];
      out.push("", line.filter(Boolean).join(" "));
    }
  }

  out.push(...section("Regions", table(
    ["id", "role", "label", "page", "contains", "proportions"],
    (a.regions ?? []).map((r) => [
      code(r.id),
      r.role && r.role !== "content" ? `**${r.role}**` : code(r.role),
      r.label,
      r.page,
      list(r.contains),
      inline(r.proportions),
    ]),
  )));

  if (a.layoutProportions) {
    out.push(...section("Layout proportions", keyValues(a.layoutProportions)));
  }

  out.push(...section("Anchors", table(
    ["element", "related to", "relationship", "region"],
    (a.anchors ?? []).map((x) => [x.element, x.relatedTo, x.relationship, code(x.region)]),
  )));

  out.push(...section("Shape ownership", table(
    ["container", "owned content", "relationship"],
    (a.shapeOwnership ?? []).map((x) => [x.container, list(x.ownedContent), x.relationship]),
  )));

  if (a.typography) out.push(...section("Typography", keyValues(a.typography)));

  out.push(...section("Colors", table(
    ["role", "value", "used in"],
    (a.colors ?? []).map((c) => [c.role, code(c.value), list(c.usedIn)]),
  )));

  if (a.assets) out.push(...section("Assets", keyValues(a.assets)));
  if (a.spacing) out.push(...section("Spacing", keyValues(a.spacing)));

  // Last, and never omitted when present: an unread part of the reference is
  // the thing a reviewer most needs to see.
  out.push(...section("Unclear parts", table(
    ["item", "reason", "assumption made"],
    (a.unclearParts ?? []).map((u) => [u.item, u.reason, u.proposedAssumption]),
  )));

  return out;
}

function renderArchitecturePlan(a) {
  const surface = a.templateSurface ?? {};
  const out = [
    "# Architecture plan",
    "",
    `**GraphCompose ${a.targetGraphComposeVersion ?? "?"}**` +
      (surface.lane ? ` · lane \`${surface.lane}\`` : "") +
      (surface.documentKind ? ` · ${surface.documentKind}` : ""),
  ];
  if (surface.upstreamCheatsheet) out.push("", `Cheatsheet: ${surface.upstreamCheatsheet}`);
  if (a.selectedSkills?.length) {
    out.push("", `Skills loaded: ${a.selectedSkills.map(code).join(", ")}`);
  }

  // The spine of the plan: region -> named render method -> primitives.
  out.push(...section("Component mapping", table(
    ["region", "render method", "primitives", "notes"],
    (a.componentMapping ?? []).map((m) => [
      code(m.region),
      code(m.renderMethod),
      list(m.primitives),
      m.notes,
    ]),
  )));

  out.push(...section("Base constants", table(
    ["name", "value", "derivation"],
    (a.baseConstants ?? []).map((c) => [code(c.name), c.value, c.derivation]),
  )));

  out.push(...section("Theme tokens", table(
    ["token", "value", "role"],
    (a.themeTokens ?? []).map((t) => [code(t.token), code(t.value), t.role]),
  )));

  out.push(...section("Layer split", table(
    ["layer", "content", "status"],
    (a.layerSplit ?? []).map((l) => [l.layer, list(l.content), l.status]),
  )));

  out.push(...section("Widget reuse audit", table(
    ["need", "existing widget", "verdict", "justification"],
    (a.widgetReuseAudit ?? []).map((w) => [w.need, code(w.existingWidget), w.verdict, w.justification]),
  )));

  if (a.dataModel) out.push(...section("Data model", keyValues(a.dataModel)));
  if (a.visualRisks?.length) out.push(...section("Visual risks", bullets(a.visualRisks)));

  out.push(...section("Known limitations", table(
    ["limitation", "beta surface", "verified against", "migration risk"],
    (a.knownLimitations ?? []).map((k) => [
      k.limitation,
      k.betaSurface,
      k.verifiedAgainstVersion,
      k.migrationRisk,
    ]),
  )));

  return out;
}

function renderVisualReview(a) {
  const out = ["# Visual review", ""];

  // The verdict drives the loop, so it leads and is never buried in a table.
  const headline = [`**Verdict: ${a.verdict ?? "?"}.**`];
  if (a.recommendation) headline.push(`Recommendation: ${a.recommendation}.`);
  if (Number.isFinite(a.iteration)) headline.push(`Iteration ${a.iteration}.`);
  if (a.comparedAgainst) headline.push(`Compared against the ${a.comparedAgainst}.`);
  out.push(headline.join(" "));

  if (a.summary) out.push("", a.summary);

  const gate = a.gate;
  if (gate) {
    const verdict = gate.passed === true ? "passed" : gate.passed === false ? "FAILED" : "not run";
    out.push("", `**Gate.** \`${gate.kind ?? "?"}\` ${verdict}.`);
    // The metric is quoted rather than paraphrased — that is the contract.
    if (gate.metric !== undefined) out.push("", `Metric: \`${inline(gate.metric)}\``);
    if (gate.pages) out.push("", `Pages: ${inline(gate.pages)}`);
    if (gate.regions) out.push("", `Regions: ${inline(gate.regions)}`);
  }

  // `score` is the old name for the same number; both are read so a revision
  // written before the rename still renders.
  const similarity = Number.isFinite(a.pixelSimilaritySignal) ? a.pixelSimilaritySignal : a.score;
  if (Number.isFinite(similarity)) {
    out.push(
      "",
      `Pixel similarity signal: ${similarity}. A signal, not a gate — it over-weights` +
        " anti-aliasing and under-weights structural error, and can fall while the" +
        " document visibly improves.",
    );
  }

  // The user's own words, before the measured list. If a person named
  // something, that is the first thing a reader of this page should see.
  const reported = a.humanReportedMismatch;
  if (reported?.id) {
    const state = reported.addressed === true ? "addressed" : "outstanding";
    out.push("", `**Reported by the user** (${state}): \`${reported.id}\``);
    if (reported.quote) out.push("", `> ${reported.quote}`);
  }

  // `mismatches` is required by the schema, so an empty list is a claim —
  // "compared, and found none" — not an absent field. It always prints.
  const mismatches = a.mismatches ?? [];
  if (mismatches.length === 0) {
    out.push("", "## Mismatches (0)", "", "None recorded against this render.");
  }
  out.push(...section(`Mismatches (${mismatches.length})`, table(
    ["id", "severity", "cause", "region", "component", "reason", "action"],
    mismatches.map((m) => [
      code(m.id)
        + (m.id === a.largestMismatch ? " **← largest**" : "")
        + (m.source === "human" ? " **← reported**" : ""),
      m.severity,
      code(m.rootCause),
      code(m.region),
      code(m.component),
      m.reason,
      m.action,
    ]),
  )));

  const withEvidence = mismatches.filter((m) => m.evidence?.length);
  if (withEvidence.length > 0) {
    out.push(...section("Evidence", bullets(
      withEvidence.map((m) => `\`${m.id}\` — ${m.evidence.map(code).join(", ")}`),
    )));
  }

  if (a.failureCategory) {
    out.push("", `**Failure category:** \`${a.failureCategory}\``);
    if (a.blockedDetail) out.push("", a.blockedDetail);
  }

  return out;
}

// ----------------------------------------------------------------- helpers ---

function section(title, body) {
  if (!body || body.length === 0) return [];
  return ["", `## ${title}`, "", ...body];
}

/** A Markdown table, or nothing when there are no rows to show. */
function table(headers, rows) {
  const present = rows.filter((r) => r.some((cell) => cell !== undefined && cell !== null && cell !== ""));
  if (present.length === 0) return [];
  // Drop columns nothing fills, so a sparse artifact does not render a grid of
  // empty cells that reads as missing data rather than absent fields.
  const keep = headers.map((_, i) => present.some((r) => cell(r[i]) !== ""));
  const head = headers.filter((_, i) => keep[i]);
  return [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...present.map((r) => `| ${r.filter((_, i) => keep[i]).map(cell).join(" | ")} |`),
  ];
}

function bullets(items) {
  return (items ?? []).filter(Boolean).map((i) => `- ${typeof i === "string" ? i : inline(i)}`);
}

function keyValues(object) {
  const entries = Object.entries(object ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return [];
  return entries.map(([k, v]) => `- **${k}**: ${inline(v)}`);
}

/** One table cell: escaped, single-line, never breaking the grid. */
function cell(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function code(value) {
  return value === undefined || value === null || value === "" ? "" : `\`${value}\``;
}

function list(value) {
  if (!Array.isArray(value)) return inline(value);
  return value.map((v) => (typeof v === "string" ? `\`${v}\`` : inline(v))).join(", ");
}

/** A nested value as one readable line, without dumping raw JSON braces. */
function inline(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(inline).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k} ${inline(v)}`)
      .join(", ");
  }
  return String(value);
}
