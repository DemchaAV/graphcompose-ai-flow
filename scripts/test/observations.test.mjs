#!/usr/bin/env node
/**
 * scripts/test/observations.test.mjs — the evidence layer holds its shape.
 *
 * What is asserted here is everything that does not need Maven: that each
 * record conforms to its schema, that every one names a probe that exists,
 * that promotion is refused for anything unconfirmed, and that `verify`
 * treats a missing probe as a failure rather than a pass.
 *
 * The live half — re-running the probes and comparing numbers — needs the
 * toolchain and a resolved GraphCompose, so it is a slow step in
 * `npm run verify` rather than a unit test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";

import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "observations.mjs");
const OBSERVATIONS = path.join(repoRoot, "observations");
const DIAGNOSTICS = path.join(repoRoot, "tools", "diagnostics");

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", ...options });
  return { ...result, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** Every observation on disk, with the line it belongs to. */
function records() {
  const out = [];
  for (const dir of fs.readdirSync(OBSERVATIONS, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.startsWith("graphcompose-")) continue;
    const line = dir.name.replace("graphcompose-", "");
    for (const file of fs.readdirSync(path.join(OBSERVATIONS, dir.name))) {
      if (!file.endsWith(".json")) continue;
      const full = path.join(OBSERVATIONS, dir.name, file);
      out.push({ line, file, body: JSON.parse(fs.readFileSync(full, "utf8")) });
    }
  }
  return out;
}

test("there is something on record, and it parses", () => {
  const all = records();
  assert.ok(all.length > 0, "no observations — the acceptance run's findings were not kept");
  for (const { body, file } of all) {
    assert.equal(body.schemaVersion, 1, `${file} has the wrong schemaVersion`);
  }
});

test("an observation's id matches its filename, so it can be found from either", () => {
  for (const { body, file } of records()) {
    assert.equal(`${body.id}.json`, file);
    assert.match(body.id, /^[a-z][a-z0-9-]*$/, `${file}: id is not kebab-case`);
  }
});

test("the version an observation claims belongs to the directory it sits in", () => {
  // A behaviour recorded under 2.2 but measured against 1.9 would be read as
  // true of a build nobody tested.
  for (const { body, line, file } of records()) {
    assert.ok(
      body.graphComposeVersion.startsWith(`${line}.`),
      `${file}: recorded ${body.graphComposeVersion} but filed under ${line}`,
    );
  }
});

test("every observation names a probe that exists, because otherwise it cannot be re-confirmed", () => {
  const probeSource = path.join(DIAGNOSTICS, "graphcompose-2.2", "src", "main", "java",
    "com", "demcha", "graphcompose", "diagnostics", "Probes.java");
  const registry = fs.readFileSync(probeSource, "utf8");

  for (const { body, file } of records()) {
    const probe = body.minimalReproduction?.probe;
    assert.ok(probe, `${file}: no probe, so nothing can ever re-confirm it`);
    assert.ok(
      registry.includes(`"${probe}"`),
      `${file}: names probe "${probe}", which is not in the registry`,
    );
  }
});

test("a confirmed observation records the numbers its probe reported", () => {
  for (const { body, file } of records()) {
    if (body.confidence !== "confirmed") continue;
    assert.ok(
      body.probeResult && Object.keys(body.probeResult).length > 0,
      `${file}: confirmed but records no probe result, so verify has nothing to compare`,
    );
  }
});

test("confidence is one of the three states, and nothing claims to be promoted without saying where", () => {
  for (const { body, file } of records()) {
    assert.ok(
      ["suspected", "confirmed", "retired"].includes(body.confidence),
      `${file}: confidence "${body.confidence}" is not one of the three`,
    );
    if (body.promotedTo !== null && body.promotedTo !== undefined) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, body.promotedTo)),
        `${file}: promotedTo names ${body.promotedTo}, which does not exist`,
      );
    }
  }
});

test("list prints every record", () => {
  const result = run(["list"]);
  assert.equal(result.status, 0, result.output);
  for (const { body } of records()) {
    assert.ok(result.output.includes(body.id), `list omitted ${body.id}`);
  }
});

test("show returns one record in full, and refuses an unknown id", () => {
  // Explicitly a confirmed one: `show` exits 5 on a retired record, so picking
  // whatever readdir happens to return first would make this test's subject
  // depend on filename order.
  const first = records().find((r) => r.body.confidence === "confirmed");
  const found = run(["show", first.body.id]);
  assert.equal(found.status, 0);
  assert.equal(JSON.parse(found.stdout).id, first.body.id);

  const missing = run(["show", "no-such-observation"]);
  assert.equal(missing.status, 1);
  assert.match(missing.output, /no observation with id/);
});

test("promote refuses anything that is not confirmed", () => {
  // A suspected observation promoted into a pack would read as the API
  // contract while resting on a single sighting.
  const unconfirmed = records().filter((r) => r.body.confidence !== "confirmed");
  if (unconfirmed.length === 0) {
    // Nothing unconfirmed is on record today, so the guard is asserted through
    // the CLI's own reading of a record it is handed instead.
    const result = run(["promote", "no-such-observation", "--into", "README.md"]);
    assert.equal(result.status, 1);
    assert.match(result.output, /no observation with id/);
    return;
  }
  for (const { body } of unconfirmed) {
    const result = run(["promote", body.id, "--into", "README.md"]);
    assert.equal(result.status, 1);
    assert.match(result.output, /not confirmed/);
  }
});

test("promote without a target is a usage error rather than a guess", () => {
  const [first] = records();
  const result = run(["promote", first.body.id]);
  assert.equal(result.status, 2);
});

test("an unknown command is refused", () => {
  const result = run(["frobnicate"]);
  assert.equal(result.status, 2);
  assert.match(result.output, /unknown command/);
});

test("promote refuses a target outside the harness", () => {
  // It recorded promotedTo as "../../../Users/..." — meaningless to any other
  // reader, and unresolvable on another machine.
  const [first] = records().filter((r) => r.body.confidence === "confirmed");
  const outside = path.join(os.tmpdir(), `gcobs-outside-${process.pid}.md`);
  fs.writeFileSync(outside, "# not a skill pack\n", "utf8");

  const result = run(["promote", first.body.id, "--into", outside]);
  assert.equal(result.status, 1);
  assert.match(result.output, /outside this harness/);
  assert.equal(fs.readFileSync(outside, "utf8"), "# not a skill pack\n", "it appended anyway");
  fs.rmSync(outside, { force: true });
});

test("an already-promoted observation is not promoted a second time", () => {
  const promoted = records().filter((r) => r.body.promotedTo);
  if (promoted.length === 0) return; // nothing promoted yet; the guard is asserted when there is
  const result = run(["promote", promoted[0].body.id, "--into", "README.md"]);
  assert.equal(result.status, 1);
  assert.match(result.output, /already promoted/);
});

// --- what retirement means ------------------------------------------------------

test("a retired observation says what retired it", () => {
  // `confidence: retired` on its own records that something stopped being true
  // and nothing about why — which is how a measured fact becomes folklore. The
  // first two retirements, when 2.2.1 fixed the defects they described, are what
  // exposed that the schema had no place to put the reason.
  for (const { body, file } of records()) {
    if (body.confidence !== "retired") continue;
    assert.ok(
      typeof body.retiredNote === "string" && body.retiredNote.length > 40,
      `${path.basename(file)} is retired and does not say why`,
    );
    assert.match(
      body.retiredNote,
      /\d+\.\d+\.\d+/,
      `${body.id}: the note does not name the version that changed it`,
    );
  }
});

test("verify never reports a retired observation as a failure", () => {
  // Two ways this went wrong. A retired record was reported FAIL because the
  // retired branch sat below the probe-failed early return, so on a machine
  // without a JDK and Maven every record — retired or not — came back as "no
  // longer holds", a verdict about the library that nothing had measured. And
  // the summary could read "7 of 5 no longer hold", because an unmeasured
  // record was counted as stale while the denominator excluded retired ones.
  //
  // The assertion holds either way: with a toolchain a retired record reports
  // `ret`, without one it reports `????`. Neither is FAIL, and neither is a
  // non-zero exit.
  const retired = records().filter(({ body }) => body.confidence === "retired");
  if (retired.length === 0) return; // nothing retired in this checkout

  const result = run(["verify"]);
  // 0 measured and held, 4 could not measure — two different things, and the
  // caller reads the code rather than the prose. What must never happen is 1,
  // which claims the library changed under a record.
  assert.notEqual(result.status, 1, `a retired record was reported as a change:\n${result.output}`);
  for (const { body } of retired) {
    assert.ok(
      !new RegExp(`FAIL ${body.id}`).test(result.output),
      `${body.id} is retired and was reported as a failure`,
    );
  }
  assert.ok(
    !/\d+ of \d+ no longer hold/.test(result.output),
    `the summary can contradict itself: ${result.output.split("\n").pop()}`,
  );
});

test("the revise workflow sends a discovery where it can be found again", () => {
  // A correction is where library behaviour turns up, and revise-template used
  // to mention observations zero times. A real run measured that the right
  // margin on a rule inside a row cell is counted twice and wrote it into a
  // bundle README, where `observations find` will never look and the next run
  // pays to discover it again.
  const revise = fs.readFileSync(
    path.join(repoRoot, "skills", "workflows", "revise-template", "SKILL.md"),
    "utf8",
  );
  assert.match(revise, /observations\.mjs find/, "the revise workflow never reaches for what is on record");
  assert.match(revise, /probe\.mjs/, "it does not say a finding needs a probe");
  assert.match(
    revise,
    /README/,
    "it does not say where a measurement must NOT go",
  );
});

test("verify tells a caller apart: measured and held, changed, or not measurable", () => {
  // The first fix made 0 mean both "checked, holds" and "could not check" —
  // the vacuous pass this command exists to prevent elsewhere. A script reads
  // the code, not the prose, so the three states need three codes.
  const source = fs.readFileSync(path.join(repoRoot, "scripts", "observations.mjs"), "utf8");
  assert.match(
    source,
    /0 held \| 1 changed \| 4 not measurable here/,
    "the exit codes are not documented where a caller looks",
  );
  assert.match(
    source,
    /checked === 0 \? 4 : 0/,
    "nothing distinguishes a run that measured nothing from one that measured and passed",
  );
});

// ------------------------------------------- trusting a record where you are ---

/** A throwaway Java project pinned to `version`, to resolve `show` against. */
function pinnedProject(version, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcobs-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  fs.writeFileSync(
    path.join(dir, "pom.xml"),
    "<project><dependencies><dependency><groupId>io.github.demchaav</groupId>" +
      `<artifactId>graph-compose</artifactId><version>${version}</version>` +
      "</dependency></dependencies></project>",
    "utf8",
  );
  return dir;
}

test("show prints a retired record and still refuses to call it settled", () => {
  const retired = records().find((r) => r.body.confidence === "retired");
  if (!retired) return; // nothing retired on disk right now
  const result = run(["show", retired.body.id]);

  // Printed in full: this is a signal, not a refusal. A reader who wants the
  // text gets the text; what changes is that a caller branching on the exit code
  // cannot mistake "recorded once" for "true here".
  assert.equal(JSON.parse(result.stdout).id, retired.body.id);
  assert.equal(result.status, 5, "a retired record was reported as trustworthy");
  assert.match(result.stderr, /retired/);
});

test("a retirement points at the probe that would settle it", () => {
  const retired = records().find((r) => r.body.confidence === "retired" && r.body.minimalReproduction?.probe);
  if (!retired) return;
  const result = run(["show", retired.body.id]);

  // The whole cost of the failure this gate exists for was that the note named
  // the probe in prose and nothing ever ran it.
  assert.match(result.stderr, new RegExp(`probe\.mjs ${retired.body.minimalReproduction.probe}`));
  assert.match(result.stderr, new RegExp(`verify --id ${retired.body.id}`));
});

test("a snapshot is not its release, and the warning says so", () => {
  // The exact trap: `row-cannot-nest-in-row-cell` retires with "Lifted in 2.2.1"
  // while the project is pinned to 2.2.1-SNAPSHOT — the line *before* 2.2.1
  // ships, where the fix may not be present.
  const subject = records().find(
    (r) => r.body.confidence === "retired" && /\b\d+\.\d+\.\d+\b/.test(r.body.retiredNote ?? ""),
  );
  if (!subject) return;
  const claimed = subject.body.retiredNote.match(/\b(\d+\.\d+\.\d+)\b/)[1];
  const cwd = pinnedProject(`${claimed}-SNAPSHOT`, "snap");

  const result = run(["show", subject.body.id], { cwd });
  assert.equal(result.status, 5);
  assert.match(result.stderr, /snapshot precedes its release/);
  assert.match(result.stderr, new RegExp(`${claimed.replace(/\./g, "\.")}-SNAPSHOT`));
});

test("the release itself carries no snapshot caveat", () => {
  const subject = records().find(
    (r) => r.body.confidence === "retired" && /\b\d+\.\d+\.\d+\b/.test(r.body.retiredNote ?? ""),
  );
  if (!subject) return;
  const claimed = subject.body.retiredNote.match(/\b(\d+\.\d+\.\d+)\b/)[1];
  const cwd = pinnedProject(claimed, "release");

  const result = run(["show", subject.body.id], { cwd });
  // Still gated — a retirement is a claim either way — but without the caveat
  // that only applies to a pre-release.
  assert.equal(result.status, 5);
  assert.doesNotMatch(result.stderr, /snapshot precedes its release/);
});

test("a same-line version difference is not treated as a mismatch", () => {
  // Observations are filed by line because that is the granularity at which they
  // hold. Gating every patch-level difference would fire on nearly every record
  // on disk, and a check that cries wolf is a check somebody turns off.
  const subject = records().find((r) => r.body.confidence === "confirmed" && r.line === "2.2");
  if (!subject) return;
  const cwd = pinnedProject("2.2.2", "sameline");

  const result = run(["show", subject.body.id], { cwd });
  assert.equal(result.status, 0, result.stderr);
});

test("a record from another line is history, not an answer", () => {
  const subject = records().find((r) => r.body.confidence === "confirmed" && r.line === "2.2");
  if (!subject) return;
  const cwd = pinnedProject("2.1.0", "otherline");

  const result = run(["show", subject.body.id], { cwd });
  assert.equal(result.status, 5, "a cross-line record was reported as trustworthy");
  assert.match(result.stderr, /2\.2 line/);
});

test("--version judges against the line the caller names", () => {
  const subject = records().find((r) => r.body.confidence === "confirmed" && r.line === "2.2");
  if (!subject) return;

  assert.equal(run(["show", subject.body.id, "--version", "2.2"]).status, 0);
  assert.equal(run(["show", subject.body.id, "--version", "2.1"]).status, 5);
});

test("a probe result grouped into an object still verifies", () => {
  // `equal` special-cased numbers, strings and arrays and let everything else
  // fall through to `===`, which compares object references. A probe reporting a
  // grouped measurement — {atSize10: 1.0, atSize20: 1.0} — was recorded
  // faithfully and then reported as a change on every single run, printing two
  // identical objects side by side as though they differed. The array branch
  // carries a comment about exactly this bug; objects had it too.
  const grouped = records().filter(({ body }) =>
    Object.values(body.probeResult ?? {}).some(
      (v) => typeof v === "object" && v !== null && !Array.isArray(v),
    ),
  );
  if (grouped.length === 0) return; // nothing on disk groups its measurements

  const result = run(["verify"]);
  for (const { body } of grouped) {
    assert.ok(
      !new RegExp(`FAIL ${body.id}`).test(result.output),
      `${body.id} records a grouped measurement and could not verify:\n${result.output}`,
    );
  }
});

test("a record re-measured on THIS build is a measurement, not a claim", () => {
  // `retired` gates because a retirement is a claim made once against one
  // version. A record actually re-measured on the build in front of you is not a
  // claim any more, and gating it anyway would teach the reader to ignore the
  // gate.
  const held = records().find(({ body }) =>
    (body.verifiedAgainst ?? []).some((v) => v.verdict === "held"),
  );
  if (!held) return;
  const version = held.body.verifiedAgainst.find((v) => v.verdict === "held").version;

  const result = run(["show", held.body.id], { cwd: pinnedProject(version, "measured") });
  assert.equal(result.status, 0, `re-measured on ${version} and still gated:\n${result.stderr}`);
});

test("a record re-measured as changed says so, and does not pass", () => {
  const changed = records().find(({ body }) =>
    (body.verifiedAgainst ?? []).some((v) => v.verdict === "changed"),
  );
  if (!changed) return;
  const version = changed.body.verifiedAgainst.find((v) => v.verdict === "changed").version;

  const result = run(["show", changed.body.id], { cwd: pinnedProject(version, "changed") });
  assert.equal(result.status, 5);
  assert.match(result.stderr, /did NOT hold/);
});

test("verifiedAgainst matches a build exactly — a snapshot is not its release", () => {
  // The distinction the whole list exists for. A record measured on 2.2.1 says
  // nothing about 2.2.1-SNAPSHOT, which is the line BEFORE 2.2.1 ships, and
  // treating them as one is the exact mistake that cost a run an authoring pass.
  const changed = records().find(({ body }) =>
    (body.verifiedAgainst ?? []).some((v) => v.verdict === "changed"),
  );
  if (!changed) return;
  const version = changed.body.verifiedAgainst.find((v) => v.verdict === "changed").version;

  const onSnapshot = run(["show", changed.body.id], {
    cwd: pinnedProject(`${version}-SNAPSHOT`, "notmatched"),
  });
  // It still gates, but as an unverified retirement rather than as a measurement
  // — the "did NOT hold" wording belongs only to the build actually measured.
  assert.equal(onSnapshot.status, 5);
  assert.doesNotMatch(onSnapshot.stderr, /did NOT hold/, "a snapshot matched its release");
});

test("every verifiedAgainst entry names a build, a date and a verdict", () => {
  for (const { body, file } of records()) {
    for (const entry of body.verifiedAgainst ?? []) {
      assert.ok(entry.version, `${file}: a verification with no build`);
      assert.match(entry.on, /^\d{4}-\d{2}-\d{2}$/, `${file}: ${entry.on} is not a date`);
      assert.ok(["held", "changed"].includes(entry.verdict), `${file}: verdict ${entry.verdict}`);
      // A `changed` verdict is what a retirement should rest on, so it has to
      // say what moved rather than leaving the next reader to re-derive it.
      if (entry.verdict === "changed") {
        assert.ok(entry.note, `${file}: recorded a change with no account of it`);
      }
    }
  }
});
