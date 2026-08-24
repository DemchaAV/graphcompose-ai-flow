#!/usr/bin/env node
/**
 * scripts/test/api-query.test.mjs — the allow-list answers questions, and the
 * negative answer is trustworthy.
 *
 * The first invariant is that a symbol absent from `00-api-surface.md` does
 * not exist. A query tool is only worth having if its "no" can be relied on,
 * so the assertions here are mostly about not silently dropping things: the
 * parsed totals must equal the totals the generated document states about
 * itself, and a known-absent method must come back absent with exit 3.
 *
 * The failure this prevents is one I caused earlier in the same session that
 * built this: writing `TimelineMarker.dot()` and `TimelineBuilder.add(...)`,
 * neither of which exists, and finding out from the compiler.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "api-query.mjs");
const SURFACE = path.join(repoRoot, "skills", "versions", "graphcompose-2.2", "00-api-surface.md");

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    // Say why. A truncated --dump used to surface as "cannot read properties
    // of null", which describes the symptom three steps downstream of the
    // cause and cost a CI round-trip to identify.
    parseError = `${cause.message} (stdout was ${result.stdout?.length ?? 0} bytes, ` +
      `ending ${JSON.stringify(result.stdout?.slice(-40) ?? "")})`;
  }
  return {
    status: result.status,
    parsed,
    parseError,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

test("the parse accounts for every symbol the document says it has", () => {
  // The generated page states its own totals. Matching them is the only cheap
  // proof that nothing was dropped by a regex or counted twice.
  const text = fs.readFileSync(SURFACE, "utf8");
  const stated = text.match(/Types:\s*(\d+)\s*·\s*methods:\s*(\d+)\s*·\s*constants:\s*(\d+)/);
  assert.ok(stated, "the allow-list no longer states its own totals");

  const { parsed, parseError } = run(["--dump"]);
  assert.equal(parseError, null, `--dump did not produce parseable JSON: ${parseError}`);
  assert.equal(parsed.typeCount, Number(stated[1]));
  assert.equal(parsed.methodCount, Number(stated[2]));
  assert.equal(parsed.constantCount, Number(stated[3]));
});

test("--exists finds a real method and returns its overloads", () => {
  const { status, parsed } = run(["--exists", "TimelineMarker.dot"]);
  assert.equal(status, 0);
  assert.equal(parsed.found, true);
  assert.equal(parsed.type.name, "TimelineMarker");
  assert.ok(
    parsed.overloads.some((s) => s.includes("dot(double size, DocumentColor color)")),
    `the real signature is missing: ${JSON.stringify(parsed.overloads)}`,
  );
});

test("--exists says no, with exit 3, for a method that does not exist", () => {
  // TimelineBuilder has `entry`, not `add`. This is the call that cost a
  // compile failure before the tool existed.
  const { status, parsed } = run(["--exists", "TimelineBuilder.add"]);
  assert.equal(status, 3, "a caller could not branch on the absence");
  assert.equal(parsed.found, false);
  assert.equal(parsed.type.name, "TimelineBuilder", "the type itself should still be reported");
  assert.deepEqual(parsed.overloads, []);
});

test("an unknown type says so rather than returning an empty success", () => {
  const { status, parsed } = run(["--exists", "NoSuchBuilder.method"]);
  assert.equal(status, 3);
  assert.equal(parsed.found, false);
  assert.match(parsed.note, /does not exist for this version/);
});

test("--type returns a type's methods and constants together", () => {
  const { status, parsed } = run(["--type", "TimelineBuilder"]);
  assert.equal(status, 0);
  assert.equal(parsed.type.kind, "class");
  assert.ok(parsed.methods.some((s) => s.includes("entry(")), "entry() is missing");
  assert.ok(Array.isArray(parsed.constants));
});

test("--type with --method narrows to the overloads of one name", () => {
  const { parsed } = run(["--type", "TimelineMarker", "--method", "dot"]);
  assert.ok(parsed.methods.length >= 1);
  assert.ok(parsed.methods.every((s) => s.includes("dot(")), "unrelated methods leaked in");
});

test("an enum's constants are parsed, not mistaken for methods", () => {
  const { parsed } = run(["--type", "LayerAlign"]);
  assert.ok(parsed.constants.includes("CENTER_LEFT"), `constants: ${parsed.constants.join(", ")}`);
  assert.ok(
    !parsed.methods.some((s) => s.startsWith("constants:")),
    "a constants line was parsed as a method",
  );
});

test("--constant finds which type declares it", () => {
  const { status, parsed } = run(["--constant", "CENTER_LEFT"]);
  assert.equal(status, 0);
  assert.ok(parsed.declaredBy.some((d) => d.type === "LayerAlign"));
});

test("--search spans types, methods and constants", () => {
  const { status, parsed } = run(["--search", "timeline"]);
  assert.equal(status, 0);
  assert.ok(parsed.types.some((t) => t.name === "TimelineBuilder"));
  assert.ok(parsed.total.methods > 0);
});

test("a misspelled type suggests near matches instead of just failing", () => {
  const { status, parsed } = run(["--type", "Timeline"]);
  assert.equal(status, 3);
  assert.ok(parsed.didYouMean.includes("TimelineBuilder"), `got: ${parsed.didYouMean}`);
});

test("every answer names the version it speaks for", () => {
  // An answer from the wrong line is worse than no answer: it compiles into a
  // call the pinned version does not have.
  const { parsed } = run(["--type", "TimelineBuilder"]);
  assert.equal(parsed.graphComposeLine, "2.2");
  assert.equal(parsed.verifiedAgainst, "2.2.0");
  assert.match(parsed.source, /graphcompose-2\.2/);
});

test("a line with no pack is refused rather than answered from another", () => {
  const result = spawnSync(process.execPath, [CLI, "--version", "9.9", "--type", "X"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /no allow-list/);
});

test("asking nothing is a usage error", () => {
  const result = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(result.status, 2);
});
