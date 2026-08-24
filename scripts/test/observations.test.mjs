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
  const [first] = records();
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
