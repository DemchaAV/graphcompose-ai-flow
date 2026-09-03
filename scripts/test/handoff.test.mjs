#!/usr/bin/env node
/**
 * scripts/test/handoff.test.mjs — authoring starts from disk, not from the
 * discovery conversation.
 *
 * ## What the handoff has to be worth
 *
 * A create run's discovery and authoring were one context. Measured on two
 * recorded runs: 192-266k tokens at the boundary, never released, re-read by
 * every one of the 218-382 requests that followed — 84% and 96% of the run's
 * cache-read. Almost none of it was information authoring needed, because
 * discovery had already distilled itself into four files.
 *
 * So the handoff must be *sufficient*: a reader holding only `handoff.json` and
 * the files it names must be able to author. Every case here is about that
 * sufficiency and about the two ways it can lie — claiming a validation that
 * did not happen, and naming an artifact that has since changed.
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { hashFile, verifyHandoff } from "../lib/handoff.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "handoff.mjs");

const temps = [];
process.on("exit", () => {
  for (const dir of temps) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gchandoff-${label}-`));
  temps.push(dir);
  return dir;
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const GEOMETRY = {
  schemaVersion: 1,
  page: {
    format: "A4",
    orientation: "portrait",
    referencePx: { width: 1054, height: 1492 },
    aspect: 1.41556,
    sizePt: { width: 595.276, height: 841.89 },
    sizeSource: "measured-standard",
    pageCount: 1,
  },
  regions: [
    { id: "page-background", label: "Page chrome", page: 1, role: "background", bounds: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  flow: { kind: "fixed", overflowExpectation: "The page is the artifact." },
};
const REQUEST = { icons: [], fonts: [{ role: "body", family: "Helvetica", source: "standard14" }] };
const FONT = {
  role: "body",
  family: "Helvetica",
  fontName: "HELVETICA",
  source: "standard14",
  status: "ok",
  registration: "standard14",
};
const manifestFor = (icons = {}) => ({
  schemaVersion: "1.0.0",
  generatedAt: "2026-09-01T00:00:00.000Z",
  revisionDir: ".",
  icons,
  fonts: { body: FONT },
});
const MANIFEST = manifestFor();
const PLAN = {
  schemaVersion: 1,
  targetGraphComposeVersion: "2.3.0",
  templateSurface: { lane: "V2 layered", documentKind: "cv" },
  componentMapping: [{ region: "page-background", renderMethod: "renderPageChrome", notes: "flat fill" }],
};
const DATA = { name: "A Person", title: "Engineer" };

/** A workspace with one project, one revision, filled to order. */
function workspace(label, { geometry = GEOMETRY, data = DATA, request = REQUEST, plan = PLAN, manifest = MANIFEST } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    id: "demo",
    displayName: "demo",
    docKind: "cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    currentDraftRevisionId: "revision-001",
    currentApprovedRevisionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    schemaVersion: 1,
  });
  writeJson(path.join(revision, "revision.json"), {
    id: "revision-001",
    parentRevisionId: null,
    status: "DRAFT",
    userRequest: "make a cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    createdAt: "2026-09-01T00:00:00.000Z",
    artifacts: { userRequest: "user-request.md" },
    schemaVersion: 1,
  });
  if (geometry !== null) writeJson(path.join(revision, "visual-analysis.json"), geometry);
  if (data !== null) writeJson(path.join(revision, "cv-data.json"), data);
  if (request !== null) writeJson(path.join(revision, "asset-request.json"), request);
  if (plan !== null) writeJson(path.join(revision, "architecture-plan.json"), plan);
  if (manifest !== null) writeJson(path.join(revision, "assets-manifest.json"), manifest);
  return { root, revision };
}

function run(command, root, extra = []) {
  const r = spawnSync(process.execPath, [CLI, command, "--project", "demo", "--root", root, "--json", ...extra], {
    encoding: "utf8",
  });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    /* an error path */
  }
  return { status: r.status, parsed, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// -------------------------------------------------------------- what it holds ---

test("a clear barrier produces a handoff of paths and hashes", () => {
  const { root, revision } = workspace("clear");
  const { status, parsed, out } = run("write", root);

  assert.equal(status, 0, out);
  assert.equal(parsed.validated, true);
  assert.equal(parsed.nextPhase, "authoring");
  assert.equal(parsed.project, "demo");
  assert.equal(parsed.revision, "revision-001");
  assert.deepEqual(Object.keys(parsed.artifacts).sort(), [
    "architecturePlan",
    "assetManifest",
    "assetRequest",
    "data",
    "visualAnalysis",
  ]);
  assert.equal(parsed.artifacts.data, "cv-data.json", "the data file is named for the document kind");
  for (const [key, hash] of Object.entries(parsed.hashes)) {
    assert.match(hash, /^sha256:[0-9a-f]{64}$/, `${key} has no usable hash`);
  }
  assert.ok(fs.existsSync(path.join(revision, "handoff.json")));
});

test("the handoff carries paths, never artifact contents", () => {
  // Copying an artifact in here would put the same document in context twice
  // and give the run a second thing that can disagree with the first.
  const { root } = workspace("paths-only");
  const { parsed } = run("write", root);
  const text = JSON.stringify(parsed);

  assert.ok(!text.includes("page-background"), "a region id from visual-analysis.json leaked into the handoff");
  assert.ok(!text.includes("renderBackground"), "a method name from architecture-plan.json leaked into the handoff");
  assert.ok(!text.includes("A Person"), "content from the data file leaked into the handoff");
  assert.ok(text.length < 2500, `the handoff is ${text.length} bytes — it is meant to be a page, not a copy`);
});

test("paths are relative to the revision, so a workspace can move", () => {
  const { root } = workspace("relative");
  const { parsed } = run("write", root);
  for (const [key, rel] of Object.entries(parsed.artifacts)) {
    if (rel === null) continue;
    assert.ok(!path.isAbsolute(rel), `${key} is recorded as an absolute path`);
    assert.ok(!rel.includes(":"), `${key} carries a drive letter`);
  }
});

// ------------------------------------------------------------- what it refuses ---

test("a red barrier writes no handoff at all", () => {
  // Not "a handoff that says not validated": a next phase reading one would
  // have to decide what to do about it, and that decision is the barrier's.
  const { root, revision } = workspace("no-plan", { plan: null });
  const { status, out } = run("write", root);

  assert.equal(status, 1);
  assert.match(out, /architecture-plan\.json/);
  assert.match(out, /check-analysis\.mjs/, "the refusal does not name the command that answers");
  assert.ok(!fs.existsSync(path.join(revision, "handoff.json")), "a handoff was written on a red barrier");
});

test("an unresolved asset holds the handoff, as it holds the barrier", () => {
  // The disagreement no schema can see: both files valid, one token unresolved.
  const { root, revision } = workspace("unresolved", {
    request: { icons: [{ token: "mail", set: "lucide", name: "mail" }], fonts: [] },
    manifest: manifestFor(),
  });
  const { status, out } = run("write", root);

  assert.equal(status, 1);
  assert.match(out, /mail/);
  assert.ok(!fs.existsSync(path.join(revision, "handoff.json")));
});

test("a red barrier leaves an earlier handoff untouched", () => {
  const { root, revision } = workspace("keep-previous");
  assert.equal(run("write", root).status, 0);
  const first = fs.readFileSync(path.join(revision, "handoff.json"), "utf8");

  fs.rmSync(path.join(revision, "architecture-plan.json"));
  assert.equal(run("write", root).status, 1);

  assert.equal(fs.readFileSync(path.join(revision, "handoff.json"), "utf8"), first, "the previous handoff was clobbered");
});

// ------------------------------------------------------------------- staleness ---

test("verify is clear while the artifacts still hash to what the barrier passed", () => {
  const { root } = workspace("fresh");
  assert.equal(run("write", root).status, 0);

  const { status, parsed } = run("verify", root);
  assert.equal(status, 0);
  assert.equal(parsed.fresh, true);
  assert.deepEqual(parsed.problems, []);
});

test("an artifact edited after the handoff is reported as stale, by name", () => {
  // The failure this exists to make loud: authoring resumes from a handoff
  // that describes a plan somebody has since changed.
  const { root, revision } = workspace("edited");
  assert.equal(run("write", root).status, 0);

  writeJson(path.join(revision, "architecture-plan.json"), {
    ...PLAN,
    componentMapping: [...PLAN.componentMapping, { region: "x", renderMethod: "renderX" }],
  });

  const { status, parsed } = run("verify", root);
  assert.equal(status, 1);
  assert.equal(parsed.fresh, false);
  assert.equal(parsed.problems.length, 1);
  assert.match(parsed.problems[0], /architecturePlan.*changed/);
});

test("an artifact deleted after the handoff is reported as gone", () => {
  const { root, revision } = workspace("deleted");
  assert.equal(run("write", root).status, 0);
  fs.rmSync(path.join(revision, "cv-data.json"));

  const { status, parsed } = run("verify", root);
  assert.equal(status, 1);
  assert.match(parsed.problems[0], /data.*gone/);
});

test("a missing handoff fails clearly, naming how to write one", () => {
  const { root } = workspace("absent");
  const { status, out } = run("verify", root);
  assert.equal(status, 1);
  assert.match(out, /has not been written|handoff\.mjs write/);
});

test("a handoff from a future schema version is not silently believed", () => {
  const verdict = verifyHandoff({ schemaVersion: 99, validated: true, artifacts: {}, hashes: {} }, { revisionDir: "." });
  assert.equal(verdict.fresh, false);
  assert.match(verdict.problems[0], /schemaVersion/);
});

test("a handoff that does not claim validation is not treated as one that does", () => {
  const verdict = verifyHandoff({ schemaVersion: 1, validated: false, artifacts: {}, hashes: {} }, { revisionDir: "." });
  assert.equal(verdict.fresh, false);
  assert.match(verdict.problems.join(" "), /validated/);
});

// --------------------------------------------------------------- sufficiency ---

test("everything authoring reads is reachable from the handoff alone", () => {
  // The property that makes a fresh authoring context possible: a reader with
  // no memory of discovery, holding only this file, can open every input.
  const { root, revision } = workspace("sufficient");
  assert.equal(run("write", root).status, 0);

  const handoff = JSON.parse(fs.readFileSync(path.join(revision, "handoff.json"), "utf8"));
  const resolved = {};
  for (const [key, rel] of Object.entries(handoff.artifacts)) {
    if (rel === null) continue;
    const file = path.resolve(revision, handoff.artifactRoot, rel);
    assert.ok(fs.existsSync(file), `${key} -> ${rel} does not resolve from the handoff`);
    assert.equal(hashFile(file), handoff.hashes[key], `${key} does not match its recorded hash`);
    resolved[key] = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  // The four inputs create-3 names, all present without reading a transcript.
  assert.ok(resolved.visualAnalysis.regions.length > 0);
  assert.ok(resolved.architecturePlan.componentMapping.length > 0);
  assert.ok(resolved.assetManifest.fonts.body);
  assert.ok(resolved.data.name);
});

test("show prints the recorded handoff without re-running the barrier", () => {
  const { root, revision } = workspace("show");
  assert.equal(run("write", root).status, 0);
  // Break the barrier; `show` reports what was recorded, which is the point of
  // recording it.
  fs.rmSync(path.join(revision, "architecture-plan.json"));

  const { status, parsed } = run("show", root);
  assert.equal(status, 0);
  assert.equal(parsed.validated, true);
  assert.equal(parsed.artifacts.architecturePlan, "architecture-plan.json");
});

// ------------------------------------------------------- the boundary itself

/**
 * Written is not taken.
 *
 * Three real runs wrote a correct, verifiable handoff and then authored in the
 * coordinator anyway. Every report said "handoff written" and every one was
 * true; none said the boundary had not been crossed, because nothing
 * distinguished the two. These cases exist so that confusion cannot return.
 */
test("a written handoff reports the boundary as NOT taken", () => {
  const { root } = workspace("boundary-written");
  assert.equal(run("write", root).status, 0);

  const { status, parsed } = run("status", root);
  assert.equal(parsed.written, true);
  assert.equal(parsed.requested, false);
  assert.equal(parsed.taken, false, "a written handoff was reported as a crossed boundary");
  assert.equal(status, 0, "not requested and not taken is not a defect — it is a host without subagents");
});

test("requested but never claimed is a defect a smoke test can branch on", () => {
  const { root } = workspace("boundary-requested");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("request", root, ["--mechanism", "Agent"]).status, 0);

  const { status, parsed } = run("status", root);
  assert.equal(parsed.requested, true);
  assert.equal(parsed.mechanism, "Agent");
  assert.equal(parsed.taken, false);
  assert.equal(status, 1, "a boundary that was requested and never crossed must fail loudly");
});

test("a claim is what makes the boundary taken, and it is attributable", () => {
  const { root } = workspace("boundary-claimed");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("request", root, ["--mechanism", "Agent"]).status, 0);
  assert.equal(run("claim", root, ["--by", "author-agent"]).status, 0);

  const { status, parsed } = run("status", root);
  assert.equal(parsed.taken, true);
  assert.equal(parsed.claimedBy, "author-agent");
  assert.match(parsed.claimedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(status, 0);
});

test("an unattributed claim is refused, because it is not evidence", () => {
  const { root } = workspace("boundary-anon");
  assert.equal(run("write", root).status, 0);
  const { status, out } = run("claim", root);
  assert.equal(status, 2);
  assert.match(out, /not evidence/);
});

test("a stale handoff cannot be claimed", () => {
  // The authoring context claims before it edits anything, so a claim landing
  // on drifted artifacts means it is about to author against a plan that moved.
  const { root, revision } = workspace("boundary-stale");
  assert.equal(run("write", root).status, 0);
  writeJson(path.join(revision, "architecture-plan.json"), {
    ...PLAN,
    componentMapping: [...PLAN.componentMapping, { region: "x", renderMethod: "renderX" }],
  });

  const { status, out } = run("claim", root, ["--by", "late-agent"]);
  assert.equal(status, 1);
  assert.match(out, /stale|changed/);

  const after = run("status", root);
  assert.equal(after.parsed.taken, false, "a refused claim must not mark the boundary taken");
});

test("claiming prints the artifact paths and says the conversation is not needed", () => {
  const { root } = workspace("boundary-inputs");
  assert.equal(run("write", root).status, 0);
  const { out } = run("claim", root, ["--by", "author-agent"]);
  for (const name of ["visual-analysis.json", "cv-data.json", "asset-request.json", "assets-manifest.json", "architecture-plan.json"]) {
    assert.ok(out.includes(name), `${name} was not handed to the authoring context`);
  }
});

test("request and claim are written by different processes and do not erase each other", () => {
  const { root, revision } = workspace("boundary-merge");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("request", root, ["--mechanism", "Agent"]).status, 0);
  assert.equal(run("claim", root, ["--by", "author-agent"]).status, 0);

  const doc = JSON.parse(fs.readFileSync(path.join(revision, "handoff.json"), "utf8"));
  assert.equal(doc.boundary.mechanism, "Agent", "claim erased what request recorded");
  assert.ok(doc.boundary.requestedAt, "claim erased when the request was made");
  // The claim itself now lives in the append-only history rather than as a
  // flag, so that a later `write` cannot quietly drop it.
  assert.equal(doc.boundary.crossings.length, 1);
  assert.equal(doc.boundary.crossings[0].claimedBy, "author-agent");
  // And the handoff itself survived the patch.
  assert.equal(doc.validated, true);
  assert.equal(doc.artifacts.data, "cv-data.json");
});

// --------------------------------------------------- crossings survive rewrites

/**
 * A real run crossed the boundary at 23:11 and rewrote the handoff at 23:42;
 * the rewrite erased the block, and `status` then reported TAKEN: NO on a run
 * where a second context demonstrably authored the template. The proof tooling
 * produced the same false negative. These cases are that bug.
 */
test("a crossing survives a later handoff rewrite", () => {
  const { root } = workspace("cross-survives");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("claim", root, ["--by", "author"]).status, 0);
  assert.equal(run("write", root).status, 0, "the rewrite itself must still succeed");

  const { parsed } = run("status", root);
  assert.equal(parsed.everCrossed, true, "the rewrite erased the crossing");
  assert.equal(parsed.crossings.length, 1);
  assert.equal(parsed.latestCrossing.claimedBy, "author");
});

test("a rewrite that changes an artifact ends the generation but keeps the record", () => {
  const { root, revision } = workspace("cross-generation");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("claim", root, ["--by", "author"]).status, 0);
  assert.equal(run("status", root).parsed.taken, true);

  writeJson(path.join(revision, "architecture-plan.json"), {
    ...PLAN,
    componentMapping: [...PLAN.componentMapping, { region: "x", renderMethod: "renderX" }],
  });
  assert.equal(run("write", root).status, 0);

  const { parsed } = run("status", root);
  assert.equal(parsed.taken, false, "a claim on superseded artifacts is not current");
  assert.equal(parsed.everCrossed, true, "but it still happened, and saying otherwise is the bug");
  assert.equal(parsed.latestCrossing.claimedBy, "author");

  // And the human-readable line must say so too — the false negative that
  // started this was read off the printed status, not the JSON.
  const human = spawnSync(process.execPath, [CLI, "status", "--project", "demo", "--root", root], { encoding: "utf8" });
  assert.match(human.stdout, /was CROSSED/);
  assert.match(human.stdout, /rewritten since/);
});

test("two writes before any crossing invent none", () => {
  const { root } = workspace("cross-none");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("write", root).status, 0);

  const { parsed } = run("status", root);
  assert.equal(parsed.crossings.length, 0);
  assert.equal(parsed.everCrossed, false);
  assert.equal(parsed.taken, false);
});

test("claiming twice on one generation records one crossing, not two", () => {
  const { root } = workspace("cross-idempotent");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("claim", root, ["--by", "author"]).status, 0);
  assert.equal(run("claim", root, ["--by", "author"]).status, 0);

  assert.equal(run("status", root).parsed.crossings.length, 1, "a re-run inflated the history");
});

test("repeated status reads are stable", () => {
  const { root } = workspace("cross-stable");
  assert.equal(run("write", root).status, 0);
  assert.equal(run("claim", root, ["--by", "author"]).status, 0);

  const a = run("status", root).parsed;
  const b = run("status", root).parsed;
  const c = run("status", root).parsed;
  assert.deepEqual(a, b);
  assert.deepEqual(b, c, "reading the state changed it");
});

test("the handoff generation is the artifacts, not the timestamp", () => {
  // Two writes a second apart with identical artifacts are one state. If the
  // fingerprint moved with `validatedAt`, every rewrite would orphan the claim
  // it had just recorded.
  const { root } = workspace("cross-fingerprint");
  assert.equal(run("write", root).status, 0);
  const first = run("status", root).parsed.handoffHash;
  assert.equal(run("write", root).status, 0);
  assert.equal(run("status", root).parsed.handoffHash, first);
});
