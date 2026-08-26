#!/usr/bin/env node
/**
 * scripts/test/telemetry.test.mjs — the numbers are right, and measuring
 * never costs the work.
 *
 * Two things here are load-bearing.
 *
 * **Deduplication.** A Claude transcript writes one request across several
 * assistant lines: a real session held 1699 lines carrying usage and 846
 * distinct request ids. Summing lines would double every figure, and a
 * doubled figure looks plausible, which is why it needs a test rather than a
 * comment.
 *
 * **Never failing.** A hook that throws blocks the turn it was measuring.
 * Every malformed input below must still exit 0.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  addUsage,
  elapsed,
  emptyUsage,
  formatDuration,
  formatReport,
  formatTokens,
  processedTokens,
  projectCounters,
  latestRevision,
} from "../telemetry/core.mjs";
import { readUsage } from "../telemetry/providers/claude-code.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(repoRoot, "scripts", "telemetry", "claude-hook.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gctel-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** A transcript in the shape the host writes. */
function transcript(lines, label = "t") {
  const file = path.join(tempDir(label), "transcript.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"), "utf8");
  return file;
}

function assistant(requestId, at, usage, extra = {}) {
  return {
    type: "assistant",
    requestId,
    timestamp: at,
    ...extra,
    message: {
      usage: {
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheWrite ?? 0,
      },
    },
  };
}

test("one request counted once, however many lines carry it", () => {
  const file = transcript([
    assistant("req-1", "2026-08-24T10:00:00Z", { input: 5, output: 100, cacheRead: 1000 }),
    assistant("req-1", "2026-08-24T10:00:01Z", { input: 5, output: 100, cacheRead: 1000 }),
    assistant("req-2", "2026-08-24T10:00:02Z", { input: 3, output: 50 }),
  ]);

  const { usage } = readUsage(file);
  assert.equal(usage.requests, 2, "a repeated requestId was counted twice");
  assert.equal(usage.outputTokens, 150);
  assert.equal(usage.cacheReadTokens, 1000);
});

test("a time window selects the cycle, which is what makes a correction's cost answerable", () => {
  const file = transcript([
    assistant("a", "2026-08-24T10:00:00Z", { output: 100 }),
    assistant("b", "2026-08-24T11:00:00Z", { output: 200 }),
    assistant("c", "2026-08-24T12:00:00Z", { output: 400 }),
  ]);

  const windowed = readUsage(file, { since: "2026-08-24T10:30:00Z", until: "2026-08-24T11:30:00Z" });
  assert.equal(windowed.usage.outputTokens, 200);
  assert.equal(windowed.usage.requests, 1);

  const all = readUsage(file);
  assert.equal(all.usage.outputTokens, 700);
});

test("subagent usage is attributed separately as well as counted", () => {
  const file = transcript([
    assistant("main", "2026-08-24T10:00:00Z", { output: 100 }),
    assistant("sub", "2026-08-24T10:00:01Z", { output: 900 }, { isSidechain: true }),
  ]);

  const { usage, sidechainUsage } = readUsage(file);
  assert.equal(usage.outputTokens, 1000, "sidechain work vanished from the total");
  assert.equal(sidechainUsage.outputTokens, 900);
});

test("a half-written last line is normal and must not throw", () => {
  const dir = tempDir("partial");
  const file = path.join(dir, "transcript.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify(assistant("a", "2026-08-24T10:00:00Z", { output: 10 }))}\n{"type":"assis`,
    "utf8",
  );

  const { usage } = readUsage(file);
  assert.equal(usage.outputTokens, 10);
});

test("a missing transcript reports nothing rather than failing", () => {
  const { usage } = readUsage(path.join(tempDir("gone"), "nope.jsonl"));
  assert.deepEqual(usage, emptyUsage());
});

test("counters are derived from the project, so they cannot drift from it", () => {
  const project = tempDir("counters");
  for (const [id, files] of [
    ["revision-001", ["revision.json", "output.pdf", "visual-review.json"]],
    ["revision-002", ["revision.json", "output.pdf"]],
    ["revision-003", ["revision.json"]],
  ]) {
    const dir = path.join(project, "revisions", id);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), "{}", "utf8");
  }

  assert.deepEqual(projectCounters(project), {
    revisions: 3,
    renders: 2,
    visualReviews: 1,
    failedRevisions: 0,
  });
  assert.equal(latestRevision(project), "revision-003");
});

test("a FAILED revision is the one build-failure figure that can be counted honestly", () => {
  // Not a log line someone hoped for: a status the revision manager set when a
  // compile or render broke.
  const project = tempDir("failed");
  for (const [id, status] of [["revision-001", "APPROVED"], ["revision-002", "FAILED"]]) {
    const dir = path.join(project, "revisions", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "revision.json"), JSON.stringify({ id, status }), "utf8");
  }
  assert.equal(projectCounters(project).failedRevisions, 1);
});

test("counters on a project with no revisions are zero, not an error", () => {
  // Every field, including `failedRevisions`. This case used to omit it while
  // the populated branch returned it, so a caller summing across projects got
  // NaN the moment one project had no revisions yet — which is the ordinary
  // state of a project someone just created.
  assert.deepEqual(projectCounters(tempDir("empty")), {
    revisions: 0,
    renders: 0,
    visualReviews: 0,
    failedRevisions: 0,
  });
});

test("processed tokens include cache, which is why they are never reported alone", () => {
  const usage = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5000, cacheWriteTokens: 100, requests: 1 };
  assert.equal(processedTokens(usage), 5130);

  const report = formatReport({ run: { startedAt: new Date().toISOString(), usage } });
  // Every part is shown; a reader can see that the total is cache.
  for (const label of ["input", "output", "cache read", "cache write", "processed"]) {
    assert.ok(report.includes(label), `the report omitted ${label}`);
  }
});

test("durations and token counts read as quantities, not digits", () => {
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatDuration(6 * 60_000 + 18_000), "6m 18s");
  assert.equal(formatDuration(3600_000 + 9 * 60_000), "1h 09m");
  assert.equal(formatDuration(-1), "-");

  assert.equal(formatTokens(842), "842");
  assert.equal(formatTokens(21_400), "21.4k");
  assert.equal(formatTokens(2_700_000), "2.7M");
});

test("addUsage sums every field", () => {
  const a = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, requests: 1 };
  assert.deepEqual(addUsage(a, a), {
    inputTokens: 2, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 8, requests: 2,
  });
});

test("elapsed returns null rather than a made-up duration", () => {
  assert.equal(elapsed(null), null);
  assert.equal(elapsed("2026-08-24T10:00:00Z", "2026-08-24T10:01:00Z"), 60_000);
});

// --------------------------------------------------------------------- hook ---

function hook(payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
  });
}

test("the hook exits 0 on garbage, on empty input, and on an event it does not know", () => {
  // A non-zero exit here would block the turn being measured.
  for (const payload of ["", "not json at all", "{}", JSON.stringify({ session_id: "s", hook_event_name: "Unknown" })]) {
    const result = hook(payload);
    assert.equal(result.status, 0, `exited ${result.status} for: ${payload.slice(0, 30)}`);
  }
});

test("the hook records a session and opens a cycle per prompt", () => {
  const home = tempDir("home");
  const sessionId = `test-${process.pid}`;
  const env = { ...process.env, USERPROFILE: home, HOME: home };

  const run = (payload) =>
    spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: "utf8", env });

  run({ session_id: sessionId, transcript_path: "/none", hook_event_name: "SessionStart" });
  run({ session_id: sessionId, prompt: "first thing", prompt_id: "p1", hook_event_name: "UserPromptSubmit" });
  run({ session_id: sessionId, hook_event_name: "Stop" });
  run({ session_id: sessionId, prompt: "timeline is wrong", prompt_id: "p2", hook_event_name: "UserPromptSubmit" });

  const state = JSON.parse(
    fs.readFileSync(path.join(home, ".graphcompose-flow", "telemetry", `${sessionId}.json`), "utf8"),
  );
  assert.equal(state.cycles.length, 2);
  assert.equal(state.cycles[0].prompt, "first thing");
  assert.ok(state.cycles[0].finishedAt, "the first cycle was never closed");
  assert.equal(state.cycles[1].prompt, "timeline is wrong");
  assert.equal(state.cycles[1].finishedAt, null, "the open cycle was closed early");
});

test("a session id cannot escape the state directory", () => {
  const home = tempDir("escape");
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: "../../escaped", hook_event_name: "SessionStart" }),
    encoding: "utf8",
    env,
  });

  // The invariant is containment, not the absence of dots: "..\/..\/escaped"
  // becoming ".._.._escaped.json" is a correct sanitisation, because a dot is
  // a legal filename character and no separator survived.
  const dir = path.join(home, ".graphcompose-flow", "telemetry");
  const written = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  assert.equal(written.length, 1, `expected one state file, got: ${written.join(", ")}`);
  for (const file of written) {
    const resolved = path.resolve(dir, file);
    assert.ok(
      resolved.startsWith(path.resolve(dir) + path.sep),
      `${file} resolved outside the state directory: ${resolved}`,
    );
  }
  assert.ok(!fs.existsSync(path.join(home, "escaped.json")));
});

// ------------------------------------------------------------ the CLI itself

/**
 * A sandboxed session with a transcript, driven through the real CLI.
 *
 * The unit tests above cover core.mjs and the provider, and a crash still
 * shipped: moving the event cache during a refactor put a `const` below its
 * first use, so every `report` with a transcript died on a temporal dead zone.
 * Nothing caught it because nothing ran the CLI.
 */
function session(label, cycles = []) {
  const home = tempDir(`cli-${label}`);
  const transcript = transcript_(label, cycles);
  const stateDir = path.join(home, ".graphcompose-flow", "telemetry");
  fs.mkdirSync(stateDir, { recursive: true });
  const sessionId = `cli-${label}`;
  fs.writeFileSync(
    path.join(stateDir, `${sessionId}.json`),
    JSON.stringify({
      sessionId,
      transcriptPath: transcript,
      sessionStartedAt: "2026-08-24T10:00:00Z",
      cycles: cycles.map((c) => ({ prompt: c.prompt, startedAt: c.at, finishedAt: c.until ?? null })),
    }),
  );
  return { home, sessionId, env: { ...process.env, USERPROFILE: home, HOME: home } };
}

function transcript_(label, cycles) {
  const lines = cycles.map((c, i) =>
    assistant(`req-${label}-${i}`, c.at, { output: c.output ?? 100, cacheRead: c.cacheRead ?? 1000 }),
  );
  return transcript(lines, `cli-t-${label}`);
}

function cli(args, env) {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "telemetry", "run-metrics.mjs"), ...args],
    { encoding: "utf8", env },
  );
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

test("report runs, and prints the figures rather than a stack trace", () => {
  const s = session("report", [
    { prompt: "make it", at: "2026-08-24T10:01:00Z", until: "2026-08-24T10:05:00Z", output: 500 },
  ]);
  const result = cli(["report", "--session", s.sessionId], s.env);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Run metrics/);
  assert.match(result.output, /Tokens this cycle/);
  assert.ok(!result.output.includes("ReferenceError"), result.output);
  assert.ok(!result.output.includes("at "), `a stack trace leaked:\n${result.output}`);
});

test("the run clock appears even when start was never called", () => {
  // The first real run had four sessions on disk and not one runStartedAt: the
  // skills said to report but never said to start, so the block vanished.
  const s = session("inferred", [
    { prompt: "first", at: "2026-08-24T10:01:00Z", until: "2026-08-24T10:20:00Z" },
    { prompt: "a correction", at: "2026-08-24T10:30:00Z" },
  ]);
  const result = cli(["report", "--session", s.sessionId], s.env);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Harness run:/);
});

test("cycles reports each cycle separately, which is what makes a correction's cost visible", () => {
  const s = session("cycles", [
    { prompt: "build the thing", at: "2026-08-24T10:00:00Z", until: "2026-08-24T11:00:00Z", output: 900 },
    { prompt: "the timeline is wrong", at: "2026-08-24T11:10:00Z", until: "2026-08-24T11:20:00Z", output: 100 },
  ]);
  const result = cli(["cycles", "--session", s.sessionId, "--json"], s.env);

  assert.equal(result.status, 0, result.output);
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].prompt, "the timeline is wrong");
  assert.ok(parsed[0].usage.outputTokens > parsed[1].usage.outputTokens, "the cycles were not separated");
});

test("an unknown session says so and exits 0, because telemetry never fails the work", () => {
  const s = session("unknown");
  const result = cli(["report", "--session", "no-such-session"], s.env);
  assert.equal(result.status, 0);
  assert.match(result.output, /no state for session/);
});
