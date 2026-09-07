#!/usr/bin/env node
/**
 * scripts/test/atomic-artifact.test.mjs — a canonical artifact is either the
 * old one or the new one, and never half of either.
 *
 * ## What this is about, and what it is not
 *
 * `check-analysis` joins the fan-out on artifacts that *validate*. That is the
 * semantic join and it is not replaced here. What it cannot see is the file
 * itself: a plain write truncates the canonical path and then fills it, so a
 * reader arriving inside that window reads half a JSON document. The failure
 * then presents as "invalid JSON", which reads like a bad artifact rather than
 * a race — and the fix for a bad artifact is to re-run the worker, which
 * appears to work and fixes nothing.
 *
 * So every case here is about the *file*: a reader mid-write, a rejected
 * candidate, a temp file left behind, and Windows' own replacement rules.
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { AtomicReplaceError, replaceFileAtomic, stageAndCommit, withFileLock } from "../lib/atomic-write.mjs";
import { canonicalArtifactName, parseStaged } from "../write-artifact.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "write-artifact.mjs");

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcatomic-${label}-`));
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

/** A workspace with one project and one revision. */
function workspace(label) {
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
  fs.mkdirSync(revision, { recursive: true });
  return { root, revision, project };
}

function writeArtifact(root, artifact, content, { revision = "revision-001" } = {}) {
  const from = path.join(tempDir("draft"), "draft.json");
  fs.writeFileSync(from, content, "utf8");
  const run = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", revision, "--root", root, "--artifact", artifact, "--from", from, "--json"],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    /* an error path */
  }
  return { status: run.status, parsed, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

// ------------------------------------------------------------- the primitive ---

test("the canonical path is never the file being written into", () => {
  // The invariant, asserted deterministically rather than by racing a reader
  // against a writer — a race the writer wins on a fast machine, which would
  // leave this test passing because it never exercised the window.
  //
  // A file that is filled in place keeps its identity: same inode, contents
  // changing under any reader holding it. A file that is staged elsewhere and
  // renamed into position is a *different* file object, so a reader either has
  // the old one, whole, or opens the new one, whole. The inode is that
  // distinction, and Windows reports it (the NTFS file index).
  const dir = tempDir("identity");
  const file = path.join(dir, "visual-analysis.json");

  fs.writeFileSync(file, `${JSON.stringify({ generation: 0 })}\n`, "utf8");
  const before = fs.statSync(file).ino;

  fs.writeFileSync(file, `${JSON.stringify({ generation: 1 })}\n`, "utf8");
  assert.equal(fs.statSync(file).ino, before, "control: a plain write fills the same file in place");

  replaceFileAtomic(file, `${JSON.stringify({ generation: 2 })}\n`);
  assert.notEqual(
    fs.statSync(file).ino,
    before,
    "the artifact was written into the canonical file rather than renamed onto it",
  );
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).generation, 2);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

/**
 * A child process that replaces `file` `generations` times with a payload of
 * `sizeBytes`. `--input-type=module` because the script imports the ESM writer
 * and `node -e` is otherwise CommonJS — without it the child dies on a syntax
 * error, writes nothing, and a test asserting "no partial reads" passes for an
 * experiment that never happened.
 */
function spawnWriter(file, { generations = 6, sizeBytes = 64 * 1024 } = {}) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {replaceFileAtomic} from ${JSON.stringify(pathToFileURL(path.join(repoRoot, "scripts", "lib", "atomic-write.mjs")).href)};
       const f=process.argv[1];const filler="x".repeat(${sizeBytes});
       for(let i=1;i<=${generations};i++) replaceFileAtomic(f, JSON.stringify({generation:i,filler})+"\\n");`,
      file,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve({ code, stderr })));
  return { child, exited };
}

test("a reader polling beside the writer only ever sees whole artifacts", async () => {
  // The invariant from the reader's side, with a writer that is genuinely a
  // second process — which is what the fan-out is. A same-thread poll cannot
  // observe a synchronous write at all, so the writer goes in a child and this
  // process reads, the way the coordinator does when it runs the barrier.
  const dir = tempDir("concurrent");
  const file = path.join(dir, "visual-analysis.json");
  fs.writeFileSync(file, `${JSON.stringify({ generation: 0 })}\n`, "utf8");

  const { exited } = spawnWriter(file);
  const seen = [];
  let running = true;
  exited.then(() => {
    running = false;
  });
  while (running) {
    try {
      seen.push(JSON.parse(fs.readFileSync(file, "utf8")).generation);
    } catch {
      seen.push("PARTIAL");
    }
    // A gap, because that is what a reader does: `check-analysis` is a
    // short-lived process that reads five files once and exits. A reader that
    // never lets go is the next test, and it is a different question — one
    // with a different right answer.
    await new Promise((r) => setTimeout(r, 20));
  }
  const { code, stderr } = await exited;

  // The safety property, asserted whatever the writer managed: no reader ever
  // holds half an artifact.
  const partial = seen.filter((s) => s === "PARTIAL");
  assert.deepEqual(partial, [], `a concurrent reader saw ${partial.length} partial artifact(s) of ${seen.length} reads`);
  assert.ok(seen.length > 0, "the reader never got to look");
  assert.ok(
    seen.every((s) => Number.isInteger(s) && s >= 0 && s <= 6),
    "a reader saw a generation nobody wrote",
  );

  // Liveness is a separate question, and on Windows it is not guaranteed under
  // contention: a rename is refused while the reader has the file open, and a
  // reader can hold it across every retry. Both outcomes are correct, and the
  // test says which happened rather than requiring the winnable one.
  if (code === 0) {
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).generation, 6, "the writer exited clean without finishing");
    assert.ok(seen.some((s) => s > 0), "the reader never observed a single one of the writer's generations");
  } else {
    assert.match(stderr, /AtomicReplaceError/, `the writer failed for some other reason:\n${stderr}`);
    assert.match(stderr, /untouched/, "the refusal does not say the previous artifact survived");
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), [], "a refused write left a temp file");
  }
});

test("a reader that never lets go gets a refusal, never a truncated artifact", async () => {
  // Windows refuses `rename` over a file another process currently has open —
  // EPERM — and a reader looping over a large artifact can hold it for longer
  // than any sane retry ladder. That case has exactly one safe answer, and this
  // asserts it: the write fails loudly and the previous complete artifact is
  // still there. An in-place fallback would "succeed" by opening the very
  // truncation window the rename exists to close, with a reader provably
  // present to fall into it.
  const dir = tempDir("locked");
  const file = path.join(dir, "visual-analysis.json");
  const original = `${JSON.stringify({ generation: 0, filler: "o".repeat(4 * 1024 * 1024) })}\n`;
  fs.writeFileSync(file, original, "utf8");

  const hog = spawn(
    process.execPath,
    ["-e", `const fs=require("fs");const u=Date.now()+6000;while(Date.now()<u){try{fs.readFileSync(process.argv[1])}catch{}}`, file],
    { stdio: "ignore" },
  );
  const hogDone = new Promise((resolve) => hog.once("exit", resolve));
  await new Promise((r) => setTimeout(r, 150));

  let refused = null;
  try {
    replaceFileAtomic(file, `${JSON.stringify({ generation: 1 })}\n`);
  } catch (err) {
    refused = err;
  }
  hog.kill();
  await hogDone;

  if (refused) {
    assert.ok(refused instanceof AtomicReplaceError, `an unexpected error escaped: ${refused}`);
    assert.match(refused.message, /untouched/, "the refusal does not say the previous file survived");
    assert.equal(fs.readFileSync(file, "utf8"), original, "the canonical artifact was damaged by a refused write");
  } else {
    // The ladder outlasted the reader, which is the outcome the ladder is for.
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).generation, 1);
  }
  // Either way — refused or eventually renamed — nothing is left behind.
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("a failed write leaves no temp file beside the artifact", () => {
  const dir = tempDir("cleanup");
  const file = path.join(dir, "asset-request.json");
  fs.writeFileSync(file, `${JSON.stringify({ keep: true })}\n`, "utf8");

  const result = stageAndCommit(file, `${JSON.stringify({ keep: false })}\n`, () => ({
    ok: false,
    detail: "rejected on purpose",
  }));

  assert.equal(result.ok, false);
  assert.match(result.detail, /rejected on purpose/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { keep: true }, "the canonical file was replaced anyway");
  const strays = fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(strays, [], "a temp file survived a rejected write");
});

test("a validator that throws is a rejection, not a crash", () => {
  const dir = tempDir("throws");
  const file = path.join(dir, "architecture-plan.json");
  fs.writeFileSync(file, `${JSON.stringify({ keep: true })}\n`, "utf8");

  const result = stageAndCommit(file, "{}\n", () => {
    throw new Error("ajv exploded");
  });

  assert.equal(result.ok, false);
  assert.match(result.detail, /ajv exploded/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { keep: true });
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("replaceFileAtomic reports whether it created or replaced", () => {
  const dir = tempDir("created");
  const file = path.join(dir, "handoff.json");
  assert.equal(replaceFileAtomic(file, "{}\n").replaced, false, "a first write is a create");
  assert.equal(replaceFileAtomic(file, "{}\n").replaced, true, "a second write is a replace");
});

test("a target that cannot be replaced throws rather than being written in place", () => {
  // The Windows case, forced everywhere: the target is a directory, so the
  // rename can never succeed. An in-place fallback here would be exactly the
  // truncation the atomic write exists to prevent, so this must throw.
  const dir = tempDir("undirectable");
  const file = path.join(dir, "visual-analysis.json");
  fs.mkdirSync(file);

  assert.throws(
    () => replaceFileAtomic(file, "{}\n", { retries: [] }),
    (err) => err instanceof AtomicReplaceError && /untouched/.test(err.message),
  );
  assert.ok(fs.statSync(file).isDirectory(), "the target was clobbered");
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), [], "the temp file was left behind");
});

// ----------------------------------------------------------------- parsing ---

test("half a JSON document is rejected before any schema runs", () => {
  const whole = JSON.stringify(GEOMETRY);
  const half = whole.slice(0, Math.floor(whole.length / 2));
  const verdict = parseStaged(half);
  assert.equal(verdict.ok, false);
  assert.match(verdict.detail, /not valid JSON/);
});

test("an empty object is not an artifact", () => {
  assert.equal(parseStaged("{}").ok, false, "a file a worker opened and did not fill");
  assert.equal(parseStaged("[]").ok, false, "an array is not a document");
  assert.equal(parseStaged('"text"').ok, false, "a string is not a document");
  assert.equal(parseStaged(JSON.stringify({ a: 1 })).ok, true);
});

test("any *-data.json names the content worker's artifact", () => {
  assert.equal(canonicalArtifactName("cv-data.json"), "<doc-kind>-data.json");
  assert.equal(canonicalArtifactName("invoice-data.json"), "<doc-kind>-data.json");
  assert.equal(canonicalArtifactName("visual-analysis.json"), "visual-analysis.json");
  assert.equal(canonicalArtifactName("something-else.json"), null);
});

// --------------------------------------------------------------------- CLI ---

test("a valid candidate becomes the canonical artifact", () => {
  const { root, revision } = workspace("commit");
  const { status, parsed, out } = writeArtifact(root, "visual-analysis.json", `${JSON.stringify(GEOMETRY)}\n`);

  assert.equal(status, 0, out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.replaced, false, "a first write is a create");
  const written = JSON.parse(fs.readFileSync(path.join(revision, "visual-analysis.json"), "utf8"));
  assert.equal(written.regions.length, 1);
});

test("an invalid candidate never replaces the canonical artifact", () => {
  const { root, revision } = workspace("reject");
  assert.equal(writeArtifact(root, "visual-analysis.json", `${JSON.stringify(GEOMETRY)}\n`).status, 0);

  // Schema-invalid: shaped like an analysis, with the regions every later stage
  // addresses by id removed.
  const broken = writeArtifact(root, "visual-analysis.json", `${JSON.stringify({ schemaVersion: 1 })}\n`);
  assert.equal(broken.status, 1, "an artifact that fails its schema was committed");
  assert.match(broken.parsed.detail, /visual-analysis\.schema\.json|schema validator/);

  const still = JSON.parse(fs.readFileSync(path.join(revision, "visual-analysis.json"), "utf8"));
  assert.equal(still.regions.length, 1, "the previous complete artifact was lost");
  assert.deepEqual(
    fs.readdirSync(revision).filter((f) => f.endsWith(".tmp")),
    [],
    "a rejected write left a temp file in the revision",
  );
});

test("truncated JSON is refused with the reason, and the canonical file survives", () => {
  const { root, revision } = workspace("truncated");
  assert.equal(writeArtifact(root, "asset-request.json", `${JSON.stringify({ icons: [], fonts: [] })}\n`).status, 0);

  const whole = JSON.stringify({ icons: [{ token: "mail", set: "lucide", name: "mail" }], fonts: [] });
  const { status, parsed } = writeArtifact(root, "asset-request.json", whole.slice(0, whole.length - 12));

  assert.equal(status, 1);
  assert.match(parsed.detail, /not valid JSON/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(revision, "asset-request.json"), "utf8")), {
    icons: [],
    fonts: [],
  });
});

test("the data artifact is written under the project's own file name", () => {
  // Not `doc-data.json`: the render runtime reads `<docKind>-data.json`, and a
  // writer that invented a name would leave the renderer reading nothing.
  const { root, revision } = workspace("data-name");
  const { status, out } = writeArtifact(root, "<doc-kind>-data.json", `${JSON.stringify({ name: "A Person" })}\n`);

  assert.equal(status, 0, out);
  assert.ok(fs.existsSync(path.join(revision, "cv-data.json")), "the data file was not named for the document kind");
});

test("an unknown artifact name is a usage error, not a write", () => {
  const { root, revision } = workspace("unknown");
  const { status } = writeArtifact(root, "notes.json", "{}\n");
  assert.equal(status, 2);
  assert.deepEqual(fs.readdirSync(revision), [], "something was written for an artifact this tool does not own");
});

// ------------------------------------------------ read, modify, write back ---
//
// An atomic rename makes a write all-or-nothing and says nothing about two
// writers who both READ first. `typography.mjs` records one role at a time by
// reading the document, filtering that role out and writing the whole thing
// back, so two invocations against one revision each wrote a document missing
// the other's entry — and the barrier then held on "claims to be measured and
// no match was recorded for it", against a measurement that had been made.

const LOCK_WRITER = `
import fs from "node:fs";
import { withFileLock, writeJsonAtomic } from "${pathToFileURL(path.join(repoRoot, "scripts", "lib", "atomic-write.mjs")).href}";
const [file, role] = process.argv.slice(2);
withFileLock(file, () => {
  let doc = { matches: [] };
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* first writer */
  }
  // The window the lock has to cover: everything between the read and the write.
  const held = doc.matches.filter((m) => m.role !== role);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
  writeJsonAtomic(file, { matches: [...held, { role }] });
});
`;

test("THE LOST UPDATE: concurrent recorders keep each other's entries", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gclock-"));
  const script = path.join(dir, "writer.mjs");
  fs.writeFileSync(script, LOCK_WRITER, "utf8");
  const file = path.join(dir, "typography-match.json");

  const roles = ["headings", "body", "contacts", "captions"];
  await Promise.all(
    roles.map(
      (role) =>
        new Promise((resolve) => {
          spawn(process.execPath, [script, file, role], { stdio: "ignore" }).on("exit", resolve);
        }),
    ),
  );

  const recorded = JSON.parse(fs.readFileSync(file, "utf8")).matches.map((m) => m.role);
  assert.deepEqual([...recorded].sort(), [...roles].sort(), "every role that was measured is on disk");
});

test("a lock nobody released does not stop the workspace forever", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gcstale-"));
  const file = path.join(dir, "record.json");
  const lock = `${file}.lock`;
  fs.mkdirSync(lock);
  // A process killed mid-write leaves this behind. Older than the staleness
  // window, it is taken rather than waited on.
  const old = new Date(Date.now() - 120_000);
  fs.utimesSync(lock, old, old);

  const started = Date.now();
  assert.equal(withFileLock(file, () => "written"), "written");
  assert.ok(Date.now() - started < 4_000, "it did not sit out the retry ladder");
  assert.equal(fs.existsSync(lock), false, "and it released what it took");
});
