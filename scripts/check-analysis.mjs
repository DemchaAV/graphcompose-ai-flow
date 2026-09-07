#!/usr/bin/env node
/**
 * scripts/check-analysis.mjs — are the discovery artifacts done?
 *
 *   node scripts/check-analysis.mjs --project <id> [--revision <id>] [--for plan|authoring]
 *                                   [--only <artifact>] [--root <workspace>] [--json]
 *
 * Create phase 2 fans out: geometry writes `visual-analysis.json`, content
 * writes `<doc-kind>-data.json`, assets write `asset-request.json`. They do not
 * read each other, so on a host with subagents they run at once. This is the
 * command that says the fan-out has rejoined.
 *
 * ## Why "exists" was never good enough
 *
 * A file exists the moment a writer opens it. Joining on existence means the
 * next stage can read a half-written artifact, believe it, and plan around a
 * document it has only partly seen — and nothing downstream would report that,
 * because a plan built on incomplete discovery still renders. It renders the
 * wrong thing.
 *
 * So the barrier is *validates*: `visual-analysis.json` and `asset-request.json`
 * against their schemas, the data file against parsing and its own spec. An
 * artifact that fails is re-run, not patched around.
 *
 * ## Three ways to ask
 *
 * `--for plan` (the default) is the three discovery artifacts: may the
 * architecture plan start.
 *
 * `--for authoring` adds what authoring itself reads — the plan, and the assets
 * manifest — plus the one disagreement no schema can see: something the request
 * asked for and the manifest does not carry. Both files can be perfectly shaped
 * and still leave a token unresolved, and the template then has no record to
 * read for it, so the icon is missing from a render nobody flagged.
 *
 * `--only <artifact>` asks about one file on its own. It exists for one
 * sentence in the workflow — "start the resolver the moment the request
 * validates" — which had no command behind it: the plan barrier answers for all
 * three artifacts together, so an agent following the sentence either waited
 * for the geometry and the content beside the request, re-serialising the very
 * thing that measured 26 minutes of the median time-to-first-render, or started
 * the resolver on a request nothing had checked.
 *
 * The manifest belongs to the authoring barrier and not the plan barrier on
 * purpose. Asset resolution reads only `asset-request.json`; it feeds neither
 * the plan nor the geometry, so it runs beside them.
 *
 * ## What "resolved" means for a font
 *
 * The resolver writes a record under every role it was asked for; a face it
 * cannot place is not absent, it is `status: "manual_drop_required"`. Two
 * different things wear that status. With `registration: "file-resource"` it is
 * a Google face the author drops as TTFs and registers in Java — the record
 * says how, authoring proceeds, and the barrier reports it. With
 * `registration: null` the request named a family its source does not carry,
 * the request is what needs fixing, and the barrier holds. The first version of
 * this check read key presence only, which the resolver never leaves empty, so
 * it could not fire — and the real unresolved state then failed the manifest
 * schema with advice ("re-run what failed") that re-produced the same manifest.
 *
 * ## Inline data
 *
 * `render.dataFileName: null` in `template-project.json` is a defined state: the
 * Java carries the data and there is nothing on disk to check. It is reported as
 * complete, not as "not written yet" — which is what it read as before, and a
 * project in that state could never clear the barrier.
 *
 * This is deliberately not a render gate and not a review gate; `render-and-diff`
 * runs the authoring barrier itself before a first render, so skipping it here
 * only moves the same answer to after the Java is written.
 *
 * Exit: 0 clear · 1 something it needs is not · 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { installRoot, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { findDataFile } from "./lib/data-spec.mjs";
import { loadPipelineConfig } from "./lib/pipeline-config.mjs";
import { loadFailure, ready, schemaValidator } from "./lib/schema-validator.mjs";
import { compareFingerprint, computeFingerprint } from "./lib/reference-fingerprint.mjs";
import { describeColour, probeFill } from "./lib/fill-probe.mjs";
import { referencePageFile } from "./lib/page-pairs.mjs";
import { auditPalette } from "./lib/palette-claims.mjs";
import { auditTypography } from "./lib/typography-roles.mjs";
import { recordPhase, trace } from "./lib/run-telemetry.mjs";

const repoRoot = installRoot();

const DATA = "<doc-kind>-data.json";
const ARTIFACTS = ["visual-analysis.json", DATA, "asset-request.json", "architecture-plan.json", "assets-manifest.json"];
const PLAN_BARRIER = ["visual-analysis.json", DATA, "asset-request.json"];
const AUTHORING_BARRIER = [...PLAN_BARRIER, "architecture-plan.json", "assets-manifest.json"];

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-analysis.mjs --project <id> [--revision <id>] [--for plan|authoring]\n" +
      "                                      [--only <artifact>] [--root <workspace>] [--json]\n" +
      "       node scripts/check-analysis.mjs --contract <worker> [--json]\n\n" +
      "  --project <id>        the project\n" +
      "  --revision <id>       the revision (default: the project's current draft)\n" +
      "  --for plan|authoring  which barrier to check (default: plan)\n" +
      `  --only <artifact>     one artifact on its own: ${ARTIFACTS.join(" | ")}\n` +
      "  --contract <worker>   print a discovery worker's input contract (geometry | content | assets)\n" +
      "                        — what it reads, what it may query, what it owns, when it is done\n" +
      "  --root <workspace>    workspace override\n" +
      "  --json                machine-readable\n\n" +
      "exit: 0 clear | 1 an artifact is missing or invalid | 2 usage\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
const args = { project: null, revision: null, root: null, json: false, for: "plan", only: null, contract: null };
/** The word after a flag, or a usage error when the flag was the last one. */
function valueOf(flag, i) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    process.stderr.write(`[analysis] ${flag} needs a value\n`);
    usage(2);
  }
  return value;
}
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = valueOf(a, i++);
  else if (a === "--revision" || a === "-r") args.revision = valueOf(a, i++);
  else if (a === "--root") args.root = valueOf(a, i++);
  else if (a === "--for") args.for = valueOf(a, i++);
  else if (a === "--only") args.only = valueOf(a, i++);
  else if (a === "--contract") args.contract = valueOf(a, i++);
  else {
    process.stderr.write(`[analysis] unknown argument: ${a}\n`);
    usage(2);
  }
}

// --contract answers a question about the pipeline, not about a project, so it
// runs before the workspace is resolved and needs no --project. It exists so the
// three worker prompts quote one declaration instead of each carrying a page of
// prose: a recorded run's content worker read 4.7k tokens of GraphCompose
// authoring rules to pull strings out of a picture, because its prompt was
// written by hand from the same paragraph the geometry worker's was.
if (args.contract !== null) {
  printWorkerContract(args.contract, args.json);
  process.exit(0);
}

if (!args.project) usage(2);
if (args.for !== "plan" && args.for !== "authoring") {
  process.stderr.write(`[analysis] --for takes plan or authoring, not "${args.for}"\n`);
  usage(2);
}
if (args.only !== null) {
  // Any `*-data.json` names the data artifact: the real file is `cv-data.json`,
  // and a caller should not have to know the placeholder to ask about it.
  if (/-data\.json$/.test(args.only)) args.only = DATA;
  if (!ARTIFACTS.includes(args.only)) {
    process.stderr.write(`[analysis] --only takes one of ${ARTIFACTS.join(", ")}, not "${args.only}"\n`);
    usage(2);
  }
}

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
let projectDir;
try {
  projectDir = requireProjectDir(workspace, args.project);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

let project;
try {
  project = readJson(path.join(projectDir, "template-project.json"));
} catch (err) {
  // The environment path, like a missing draft or revision: a broken project
  // file is not an artifact that is not done, and reporting it as exit 1 with a
  // stack trace told the skill page's reader to "re-run what it names" — it
  // named nothing.
  process.stderr.write(`[analysis] ${args.project}/template-project.json is not readable — ${err.message}\n`);
  process.exit(2);
}
const revisionId = args.revision ?? project.currentDraftRevisionId;
if (!revisionId) {
  process.stderr.write(`[analysis] ${args.project} has no draft revision, and none was named\n`);
  process.exit(2);
}
const revisionDir = path.join(projectDir, "revisions", revisionId);
const barrierStartedAt = Date.now();
if (!fs.existsSync(revisionDir)) {
  process.stderr.write(`[analysis] no such revision: ${revisionDir}\n`);
  process.exit(2);
}

// Reported, never swallowed. A validator that degraded to "the file is there"
// would answer this command's one question wrongly, in the direction that lets
// a later stage proceed. The reason is kept because "not installed" and
// "installed but broken" are fixed by different commands.
const validatorProblem = (await ready()) ? null : loadFailure();

/** Parsed documents of the artifacts that validated, for the cross-check. */
const docs = {};

function readArtifact(file) {
  if (!fs.existsSync(file)) return { ok: false, detail: "not written yet" };
  try {
    return { ok: true, doc: readJson(file) };
  } catch (err) {
    return { ok: false, detail: `not valid JSON — ${err.message}` };
  }
}

function bySchema(name, schemaName) {
  const read = readArtifact(path.join(revisionDir, name));
  if (!read.ok) return { name, ok: false, detail: read.detail };
  const schemaFile = path.join(repoRoot, "schemas", schemaName);
  if (!fs.existsSync(schemaFile)) return { name, ok: false, detail: `no schema at schemas/${schemaName}` };
  const validate = schemaValidator(schemaFile);
  if (!validate) return { name, ok: false, detail: validatorProblem };
  const result = validate(read.doc);
  if (!result.valid) return { name, ok: false, detail: `fails ${schemaName}: ${result.errors.slice(0, 200)}` };
  docs[name] = read.doc;
  return { name, ok: true, detail: "validates" };
}

/**
 * The analysis validates AND describes this project's reference.
 *
 * Validating was never enough on its own: it says the document is well-shaped,
 * not that anybody looked at the image sitting in `reference/`. A run once
 * copied another project's whole revision folder in, landing a byte-identical
 * analysis, and this barrier passed it — discovery had not executed, and four
 * revisions were then spent correcting a template built from it. The
 * provenance block is stamped by write-artifact.mjs from disk and recomputed
 * here, so an artifact that came from somewhere else no longer matches where
 * it now sits. See lib/reference-fingerprint.mjs for why the project is bound
 * as well as the image.
 */
function visualAnalysis() {
  const checked = bySchema("visual-analysis.json", "visual-analysis.schema.json");
  if (!checked.ok) return checked;

  const actual = computeFingerprint({ projectDir, projectId: path.basename(projectDir) });
  const verdict = compareFingerprint(docs["visual-analysis.json"]?.provenance, actual);
  if (verdict.kind === "no-reference") {
    return { ...checked, detail: "validates (no reference on disk to fingerprint)" };
  }
  if (!verdict.ok) {
    return { name: "visual-analysis.json", ok: false, detail: verdict.reason };
  }
  return { ...checked, detail: "validates, and describes this project's reference" };
}

function dataArtifact() {
  if (project.render?.dataFileName === null) {
    return { name: DATA, ok: true, detail: "inline — the Java carries the data (render.dataFileName is null)" };
  }
  const file = findDataFile(projectDir, revisionDir);
  if (!file) return { name: DATA, ok: false, detail: "not written yet" };
  const name = path.basename(file);
  const read = readArtifact(file);
  if (!read.ok) return { name, ok: false, detail: read.detail };
  // No schema: the shape is the document's, and it differs per kind. What can
  // be said without one is that it is a document — a string's indices counted
  // as "fields" once, and a placeholder cleared the gate — and that it carries
  // something: an empty object is a file the content subagent opened and did
  // not fill.
  const doc = read.doc;
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    const what = doc === null ? "null" : Array.isArray(doc) ? "an array" : `a ${typeof doc}`;
    return { name, ok: false, detail: `not a document — the file holds ${what}, and a spec reads fields` };
  }
  const keys = Object.keys(doc);
  if (keys.length === 0) return { name, ok: false, detail: "parsed, but empty" };
  return { name, ok: true, detail: `${keys.length} top-level field(s)` };
}

/**
 * Everything the request asked for has a usable record in the manifest.
 *
 * Runs only on a request and a manifest that both validated, so the shapes are
 * the schemas' — the first version ran on anything that parsed and threw a bare
 * TypeError on a request whose `icons` was an object, before the line that
 * would have explained it was written.
 */
/**
 * A region the analysis itself calls a panel is described as a container.
 *
 * `role: panel` means the region IS a shape — it has a fill, usually a radius,
 * and it sits behind other content. That is exactly what `shapeOwnership`
 * records, and a run described three containers while leaving the one the
 * reader complained about twice — the dark monogram block, `role: panel`, with
 * a curved corner and the sidebar running underneath it — out of the list
 * entirely. Nothing measured its radius, so a corner stuck out; nothing
 * recorded that it lies OVER the sidebar, so the sidebar stopped where it
 * began.
 *
 * `background` is exempt: it is the page's own ground, not a shape drawn on it.
 */
function panelsDescribed(analysis) {
  const name = "panels described";
  const panels = (analysis.regions ?? []).filter((r) => r?.role === "panel");
  if (panels.length === 0) return { name, ok: true, detail: "no panel regions" };

  const covered = new Set((analysis.shapeOwnership ?? []).map((s) => s?.region).filter(Boolean));
  const held = panels.map((p) => p.id).filter((id) => !covered.has(id));

  return held.length === 0
    ? { name, ok: true, detail: `${panels.length} panel region(s) described as containers` }
    : {
        name,
        ok: false,
        detail:
          `region(s) ${held.join(", ")} have role "panel" and no shapeOwnership entry. A panel IS a ` +
          "shape — it has a fill, usually a corner radius, and content sits on it — so leaving it " +
          "undescribed means nothing measures its radius or records what it lies over",
      };
}

/**
 * Fill claims agree with the reference's own pixels.
 *
 * The one field a run got wrong after getting shape, radius, sizing and repeats
 * right — and it was the first thing a reader noticed. Nobody has to answer it
 * from the image: sample inside the container and just outside it, and if the
 * colour is the same there is no fill. See lib/fill-probe.mjs.
 *
 * Only the claim is checked, never invented: a container too small to sample,
 * or a project with no reference, is reported as unmeasured rather than judged.
 */
function fillClaimsMeasured(analysis, referenceDir) {
  const name = "fill claims measured";
  const containers = (analysis.shapeOwnership ?? []).filter((s) => s?.bounds && s?.fill);
  if (containers.length === 0) return { name, ok: true, detail: "no containers with bounds to check" };
  if (!fs.existsSync(referencePageFile(referenceDir, 1))) {
    return { name, ok: true, detail: "no reference on disk to sample" };
  }

  // Which page each container sits on. `shapeOwnership` carries no page of its
  // own — it names a region, and the region carries one. This used to sample
  // every container against page 1, so a card correctly measured as filled on
  // page 2 was probed against blank ground on page 1 and the barrier refused a
  // correct analysis; the mirror case passed a wrong one. A container naming no
  // region is page 1, which is what a single-page document has.
  const pageOfRegion = new Map(
    (analysis.regions ?? []).filter((r) => r?.id).map((r) => [r.id, Number(r.page) || 1]),
  );
  const pageOf = (c) => pageOfRegion.get(c.region) ?? 1;

  const rasters = new Map();
  const unreadable = [];
  function rasterFor(page) {
    if (rasters.has(page)) return rasters.get(page);
    const file = referencePageFile(referenceDir, page);
    let raster = null;
    if (!fs.existsSync(file)) {
      unreadable.push(`page ${page} (${path.basename(file)} is not on disk)`);
    } else {
      try {
        const require = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"));
        const { PNG } = require("pngjs");
        raster = PNG.sync.read(fs.readFileSync(file));
      } catch (err) {
        // A probe that cannot run is not a probe that passed, but it is also
        // not the analysis's fault — say which it is.
        unreadable.push(`page ${page} (${err.message})`);
      }
    }
    rasters.set(page, raster);
    return raster;
  }

  const held = [];
  let checked = 0;
  for (const c of containers) {
    const raster = rasterFor(pageOf(c));
    if (!raster) continue;
    const probe = probeFill(raster, c.bounds);
    if (!probe.measurable) continue;
    checked += 1;
    if (probe.filled === c.fill.present) continue;
    const where = pageOf(c) === 1 ? "the reference" : `page ${pageOf(c)} of the reference`;
    held.push(
      c.fill.present
        ? `"${c.container}" claims a fill, and ${where} shows ${describeColour(probe.inside)} inside it ` +
          `and ${describeColour(probe.outside)} beside it — the same ground, so it paints nothing`
        : `"${c.container}" claims no fill, and ${where} shows ${describeColour(probe.inside)} inside it ` +
          `against ${describeColour(probe.outside)} beside it — it does paint`,
    );
  }

  // Pages that could not be read are named rather than silently treated as
  // agreement: "12 of 15 checked" is a different fact from "15 agree".
  const gap = unreadable.length > 0 ? ` — not sampled: ${unreadable.join(", ")}` : "";
  if (checked === 0) return { name, ok: true, detail: `containers too small to sample${gap}` };
  return held.length === 0
    ? { name, ok: true, detail: `${checked} container fill(s) agree with the reference${gap}` }
    : { name, ok: false, detail: held.join("; ") };
}

/**
 * The palette's prose and the measured containers say the same thing.
 *
 * One analysis carried both of these, and validated:
 *
 *     shapeOwnership.competency-pill.fill = { present: false }
 *     colors[page-bg].usedIn = "main content area background, competency boxes fill"
 *
 * The structured field was right; the prose was wrong; the template came back
 * with `fillColor(DocumentColor.WHITE)` on that container. The model did not
 * change its mind mid-run — the contradiction was there from the first write,
 * and nothing read the two fields together.
 *
 * This needs no reference, unlike the two probes it sits beside: it is the
 * artifact disagreeing with itself, which is decidable from the artifact.
 */
function paletteAgreesWithContainers(analysis) {
  const name = "palette agrees with containers";
  const audit = auditPalette({ colors: analysis.colors, shapeOwnership: analysis.shapeOwnership });
  if (audit.checked === 0) return { name, ok: true, detail: "no unfilled container a colour could name" };
  return audit.held.length === 0
    ? { name, ok: true, detail: `${audit.checked} unfilled container(s) the palette does not contradict` }
    : { name, ok: false, detail: audit.held.join("; ") };
}

/**
 * The face each type role uses is a measurement, or it says it is not.
 *
 * Three runs on one reference put every region at CRITICAL with a spread of
 * 13–22%, and the largest single cause was the same in all three: the
 * reference sets its section headings in a bold grotesque and all three set
 * them in a serif. The schema could not have stopped any of them — `typography`
 * was seven free strings with nothing required, and the field authoring reads,
 * `likelyFontFamily`, held sentences like "Poppins for body and a classic
 * serif such as Spectral or Tinos for display text".
 *
 * The measurement existed the whole time. `scripts/typography.mjs match` ranks
 * families against a crop of the reference and none of the three runs called
 * it, because the loop reference offers it and no barrier asks for it.
 *
 * So this asks. Not for a particular family — that is the reference's business
 * — but for each role to say whether a recorded match backs it, and for an
 * assumption to give a reason a reader can weigh later.
 *
 * A missing `typography-match.json` is not an error by itself: a page whose
 * roles are all honestly marked `assumed` clears this. What it cannot do is
 * claim `measured` with nothing recorded, which is the guess-dressed-as-a-fact
 * the old schema made unavoidable.
 *
 * Gated on the reference the same way `fillClaimsMeasured` is, and for the same
 * reason rather than for convenience: a face is matched against a crop of the
 * reference, so with no reference on disk there is nothing to have measured and
 * demanding the roles anyway would be asking for a form, not a fact.
 */
function typographyMeasured(analysis, revisionDir, referenceFile) {
  const name = "typography measured";
  if (!fs.existsSync(referenceFile)) {
    return { name, ok: true, detail: "no reference on disk — nothing to match a face against" };
  }
  const file = path.join(revisionDir, "typography-match.json");

  let matches = [];
  let sizes = [];
  if (fs.existsSync(file)) {
    try {
      const doc = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(doc?.matches)) matches = doc.matches;
      if (Array.isArray(doc?.sizes)) sizes = doc.sizes;
    } catch (err) {
      // A recorded measurement that cannot be read is worse than none: it looks
      // like evidence from the outside, so say plainly that it is not.
      return { name, ok: false, detail: `typography-match.json does not parse — ${err.message}` };
    }
  }

  const audit = auditTypography({ typography: analysis.typography, matches, sizes });
  return audit.held.length === 0
    ? {
        name,
        ok: true,
        detail: `${audit.declared} role(s): ${audit.measured} measured, ${audit.assumed} assumed`,
      }
    : { name, ok: false, detail: audit.held.join("; ") };
}

/**
 * A document with icons has said something about their geometry.
 *
 * `icons` is optional at the root, and a terse model omits what is optional:
 * one run resolved 33 icons through the asset request and wrote `icons: []`,
 * exactly as an earlier one had omitted `spacing` and `typography` entirely.
 * The result is icons emitted as inline glyphs at text size, because nothing
 * recorded that they were half again the cap height and centred.
 *
 * The check is a contradiction between two artifacts, not a quota: a request
 * that names icons and an analysis that describes none cannot both be right.
 * How many entries is a judgement — an icon that really is an inline glyph at
 * text size needs `inline: true` and nothing else — so this asks for one, and
 * the contract asks for each one whose size or placement is independent.
 *
 * An id that matches no requested token is flagged too: it is either a typo,
 * in which case the plan's `icons` claim will point at nothing, or an icon
 * nobody resolved an asset for.
 */
function iconsDescribed(analysis, request) {
  const name = "icons described";
  const requested = (request.icons ?? []).map((i) => i?.token).filter(Boolean);
  const described = analysis.icons ?? [];

  if (requested.length === 0) {
    return { name, ok: true, detail: "no icons requested" };
  }
  if (described.length === 0) {
    return {
      name,
      ok: false,
      detail:
        `asset-request.json names ${requested.length} icon(s) and visual-analysis.json describes ` +
        "none. An icon with no sizeRelativeToText, verticalAlign or inline is emitted as a glyph " +
        "at text size — record the ones whose size or placement is independent of the text",
    };
  }
  const unknown = described.map((i) => i?.id).filter((id) => id && !requested.includes(id));
  return unknown.length === 0
    ? { name, ok: true, detail: `${described.length} of ${requested.length} requested icon(s) described` }
    : {
        name,
        ok: false,
        detail:
          `icon(s) ${unknown.join(", ")} are described but not in asset-request.json — an id that ` +
          "matches no token is a typo or an icon nobody resolved an asset for",
      };
}

/**
 * Every measured container and icon is built by exactly one render method.
 *
 * Measuring a container is half the job. The other half is that some method is
 * on the hook for drawing it to those measurements, and until the plan says
 * which, the analysis is a document nobody is obliged to read — which is what
 * happened when the geometry reached the plan as prose in `notes` and the
 * author invented a radius.
 *
 * Two failures, opposite fixes. Unclaimed means the plan forgot a container the
 * reference has, and the plan is what needs another line. Claimed twice means
 * two methods both think they draw it, and one of them will be overwritten by
 * the other at a size nobody chose.
 */
function measuredGeometryMapped(analysis, plan) {
  const name = "geometry -> render methods";
  const mapping = Array.isArray(plan.componentMapping) ? plan.componentMapping : [];
  const held = [];

  for (const [kind, entries, field] of [
    ["container", analysis.shapeOwnership ?? [], "containers"],
    ["icon", analysis.icons ?? [], "icons"],
  ]) {
    for (const entry of entries) {
      const id = kind === "container" ? entry?.container : entry?.id;
      if (!id) continue;
      const claimants = mapping
        .filter((m) => (m?.[field] ?? []).includes(id))
        .map((m) => m.renderMethod);
      if (claimants.length === 0) {
        held.push(`${kind} "${id}" is measured and no render method claims it (add it to a componentMapping entry's ${field})`);
      } else if (claimants.length > 1) {
        held.push(`${kind} "${id}" is claimed by ${claimants.join(" and ")} — exactly one method owns a container`);
      }
    }
  }

  const counted =
    `${(analysis.shapeOwnership ?? []).length} container(s), ${(analysis.icons ?? []).length} icon(s)`;
  return held.length === 0
    ? { name, ok: true, detail: `${counted} each built by one render method` }
    : { name, ok: false, detail: held.join("; ") };
}

function requestedAssetsResolved(request, manifest) {
  const held = [];
  const manual = [];
  for (const icon of request.icons ?? []) {
    if (!icon?.token) continue;
    if (!manifest.icons?.[icon.token]) held.push(`icon ${icon.token}: no record`);
  }
  for (const font of request.fonts ?? []) {
    const role = font?.role;
    if (!role) continue;
    const record = manifest.fonts?.[role];
    if (!record) {
      held.push(`font ${role}: no record`);
    } else if (record.status === "ok") {
      // resolved
    } else if (record.status === "manual_drop_required" && record.registration === "file-resource") {
      manual.push(`${role} (${record.family}): ${record.notes ?? "drop the TTFs into assets/fonts/ and register via FontFamilyDefinition.files(...)"}`);
    } else {
      held.push(`font ${role}: ${record.status}${record.notes ? ` — ${record.notes}` : ""}`);
    }
  }
  const asked =
    (request.icons ?? []).filter((i) => i?.token).length + (request.fonts ?? []).filter((f) => f?.role).length;
  return {
    name: "requested assets resolved",
    ok: held.length === 0,
    detail:
      held.length > 0
        ? `${held.length} of ${asked} not resolved: ${held.join("; ")}`
        : `${asked} of ${asked} icon token(s) and font role(s)` +
          (manual.length > 0 ? ` — manual drop for ${manual.length}: ${manual.join("; ")}` : ""),
  };
}

/**
 * One worker's input contract, printed from config/pipeline.json.
 *
 * Prose in a prompt is a copy; this is the declaration. The completion
 * condition is a command rather than a sentence, so "done" is something the
 * worker can run rather than something it judges.
 */
function printWorkerContract(name, asJson) {
  let workers;
  try {
    workers = loadPipelineConfig({ repoRoot }).discovery?.workers ?? null;
  } catch (err) {
    process.stderr.write(`[analysis] ${err.message}\n`);
    process.exit(2);
  }
  if (!workers) {
    process.stderr.write("[analysis] config/pipeline.json declares no discovery.workers\n");
    process.exit(2);
  }
  const worker = workers[name];
  if (!worker) {
    const known = Object.keys(workers).filter((k) => !k.startsWith("$"));
    process.stderr.write(`[analysis] --contract takes one of ${known.join(", ")}, not "${name}"\n`);
    process.exit(2);
  }
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ worker: name, ...worker }, null, 2)}\n`);
    return;
  }
  const lines = [
    `contract  ${name} — ${worker.summary}`,
    "",
    `  owns          ${worker.artifact}   (no other worker writes it)`,
    `  reads         ${(worker.reads ?? []).join("\n                ")}`,
  ];
  if (worker.mayQuery?.length) lines.push(`  may query     ${worker.mayQuery.join("\n                ")}`);
  // The negative half of the contract, and the one with a measurement behind
  // it: the authoring context released 167.4k at the boundary and re-read most
  // of it back as whole skill pages within its first ten calls.
  if (worker.mustNotLoadByDefault?.length) {
    lines.push(`  do NOT load   ${worker.mustNotLoadByDefault.join("\n                ")}`);
    lines.push("                — not banned, but not by default: ask a narrow tool first");
  }
  // --project belongs right after the script, not appended at the end: a
  // contract is pasted into a prompt and read as a command to run, and one that
  // reads oddly gets retyped, which is how a copy starts.
  // Some contracts already name --project in their completion command; adding
  // a second one produces a line that reads like a typo and gets retyped.
  const [doneScript, ...doneRest] = worker.doneWhen.split(/\s+/);
  const doneFlags = doneRest.includes("--project") ? doneRest : ["--project <id>", ...doneRest];
  lines.push(
    worker.writesVia.startsWith("scripts/")
      ? `  writes via    node ${worker.writesVia} --project <id> --artifact ${worker.artifact} --from <file>`
      : `  writes        ${worker.artifact}  (${worker.writesVia})`,
    `  done when     node ${[doneScript, ...doneFlags].join(" ")}  exits 0`,
  );
  if (worker.escalation) {
    const [escScript, ...escFlags] = worker.escalation.split(/\s+/);
    lines.push(
      `  escalate      node ${[escScript, ...escFlags].join(" ")}`,
      "                — when a narrow tool genuinely cannot answer. Deliberate and recorded,",
      "                  which is the difference between a considered read and a habit.",
    );
  }
  lines.push(
    "",
    worker.afterBoundary
      ? "  You are on the far side of the context boundary. The handoff is your whole\n" +
        "  input — there is no conversation behind you to consult, and nothing in the\n" +
        "  discovery transcript that these five files do not already say."
      : "  Read nothing else. Reply with one line; the parent reads the artifact from disk.",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

const CHECKS = {
  "visual-analysis.json": () => visualAnalysis(),
  [DATA]: dataArtifact,
  "asset-request.json": () => bySchema("asset-request.json", "asset-request.schema.json"),
  "architecture-plan.json": () => bySchema("architecture-plan.json", "architecture-plan.schema.json"),
  "assets-manifest.json": () => bySchema("assets-manifest.json", "assets-manifest.schema.json"),
};

let artifacts;
if (args.only) {
  artifacts = [CHECKS[args.only]()];
} else {
  artifacts = (args.for === "authoring" ? AUTHORING_BARRIER : PLAN_BARRIER).map((name) => CHECKS[name]());
  // Both halves are in the plan barrier, so this fires at the earliest point it
  // can — before the architecture plan is written around icons nobody measured.
  if (docs["visual-analysis.json"] && docs["asset-request.json"]) {
    artifacts.push(iconsDescribed(docs["visual-analysis.json"], docs["asset-request.json"]));
  }
  // Both read the analysis alone, so they fire at the plan barrier — before an
  // architecture plan is built around a panel nobody measured or a fill the
  // reference contradicts.
  if (docs["visual-analysis.json"]) {
    artifacts.push(panelsDescribed(docs["visual-analysis.json"]));
    artifacts.push(
      fillClaimsMeasured(docs["visual-analysis.json"], path.join(projectDir, "reference")),
    );
    // No reference needed: this one is the artifact disagreeing with itself.
    artifacts.push(paletteAgreesWithContainers(docs["visual-analysis.json"]));
    // Here and not at the authoring barrier: the face belongs in the asset
    // request, which is written in this same phase, and a family chosen after
    // the fonts are resolved is a family resolved twice.
    artifacts.push(
      typographyMeasured(
        docs["visual-analysis.json"],
        revisionDir,
        path.join(projectDir, "reference", "reference.png"),
      ),
    );
  }
  // The authoring barrier is the plan barrier plus what authoring itself reads.
  // Asset resolution runs concurrently with the plan — it feeds neither — so the
  // manifest is required here and deliberately not one line earlier.
  if (args.for === "authoring" && docs["asset-request.json"] && docs["assets-manifest.json"]) {
    artifacts.push(requestedAssetsResolved(docs["asset-request.json"], docs["assets-manifest.json"]));
  }
  // The second disagreement no schema can see: geometry that was measured and
  // then routed nowhere. Both files validate — the analysis carries a radius, a
  // fill and a width; the plan carries regions and methods — and nothing ties
  // one to the other, so the numbers stop at the artifact that holds them.
  if (args.for === "authoring" && docs["visual-analysis.json"] && docs["architecture-plan.json"]) {
    artifacts.push(measuredGeometryMapped(docs["visual-analysis.json"], docs["architecture-plan.json"]));
  }
}

const complete = artifacts.every((a) => a.ok);

// The barrier is the pipeline's validator, so it is the phase whose result is
// a validation result. Each failing check goes to the trace by name — a
// summary that says "the plan barrier failed twice" is worth much less than
// one that says which check it was, and only the trace can afford the detail.
recordPhase(projectDir, {
  name: args.only ? `discovery.check.${args.only}` : `barrier.${args.for}`,
  durationMs: Date.now() - barrierStartedAt,
  result: complete ? "PASS" : "FAIL",
  validation: complete ? "PASS" : "FAIL",
});
for (const a of artifacts.filter((x) => !x.ok)) {
  trace(projectDir, { type: "validation_failed", phase: args.only ? `discovery.check.${args.only}` : `barrier.${args.for}`, check: a.name, detail: a.detail });
}
const result = {
  project: args.project,
  revision: revisionId,
  barrier: args.only ? null : args.for,
  ...(args.only ? { only: args.only } : {}),
  complete,
  artifacts,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const heading = args.only ? `only ${args.only}` : `barrier: ${args.for}`;
  const lines = [`analysis  ${args.project} / ${revisionId}  (${heading})`];
  for (const a of artifacts) lines.push(`  ${a.ok ? "ok  " : "WAIT"}  ${a.name.padEnd(30)} ${a.detail}`);
  if (!complete) {
    lines.push("\n  not clear; re-run what failed rather than working around it");
  } else if (args.only) {
    lines.push(`\n  ${args.only} is complete`);
  } else if (args.for === "authoring") {
    lines.push("\n  everything authoring reads is complete — the template may be written");
  } else {
    lines.push("\n  discovery is complete — the architecture plan may start");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
process.exitCode = complete ? 0 : 1;
