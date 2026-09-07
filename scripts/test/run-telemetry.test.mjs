#!/usr/bin/env node
/**
 * scripts/test/run-telemetry.test.mjs — the pipeline's wall clock and outcomes.
 *
 * Three properties this has to keep, in order of how much damage breaking them
 * does:
 *
 *   1. execution does not depend on it — a telemetry failure is a warning, and
 *      the caller carries on;
 *   2. the summary exists without anything having closed the run, because in
 *      eight corpus projects nothing ever called `run-metrics finish`;
 *   3. the trace is silent unless asked for, since it is the part that grows
 *      without bound.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { currentRun, readSummary, recordPhase, startRun, timePhase, trace, tracing } from "../lib/run-telemetry.mjs";

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

function project(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gctel-${label}-`));
  temps.push(dir);
  return dir;
}

/** `GRAPHCOMPOSE_TRACE` is process-wide, so each case sets and restores it. */
function withTrace(value, body) {
  const before = process.env.GRAPHCOMPOSE_TRACE;
  if (value === null) delete process.env.GRAPHCOMPOSE_TRACE;
  else process.env.GRAPHCOMPOSE_TRACE = value;
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env.GRAPHCOMPOSE_TRACE;
    else process.env.GRAPHCOMPOSE_TRACE = before;
  }
}

const traceFile = (dir) => {
  const runs = path.join(dir, "telemetry", "runs");
  if (!fs.existsSync(runs)) return null;
  const [run] = fs.readdirSync(runs);
  return run ? path.join(runs, run, "trace.jsonl") : null;
};

// ------------------------------------------------------------ normal mode ---

test("a summary exists without anything closing the run", () => {
  // The property that matters: `run-metrics finish` has been called zero times
  // across eight corpus projects, so a summary written at the end is a summary
  // that does not exist.
  const dir = project("summary");
  withTrace(null, () => recordPhase(dir, { name: "discovery.geometry", durationMs: 8421, result: "PASS" }));

  const summary = readSummary(dir);
  assert.ok(summary, "no summary was written");
  assert.equal(summary.phases.length, 1);
  assert.equal(summary.phases[0].name, "discovery.geometry");
  assert.equal(summary.phases[0].durationMs, 8421);
  assert.equal(summary.status, "PASS");
});

test("attempts and retries count themselves, and durations add up", () => {
  const dir = project("attempts");
  withTrace(null, () => {
    recordPhase(dir, { name: "visual-analysis", durationMs: 100, result: "FAIL", validation: "FAIL" });
    recordPhase(dir, { name: "visual-analysis", durationMs: 150, result: "FAIL", validation: "FAIL" });
    recordPhase(dir, { name: "visual-analysis", durationMs: 200, result: "PASS", validation: "PASS" });
  });

  const [phase] = readSummary(dir).phases;
  assert.equal(phase.attempts, 3);
  assert.equal(phase.retries, 2, "retries are attempts after the first");
  assert.equal(phase.validationFailures, 2);
  assert.equal(phase.durationMs, 450, "a phase's time is all of its attempts");
  assert.equal(phase.result, "PASS", "the last attempt decides the phase");
});

test("totals are the metrics the request asked for, without an analytics tool", () => {
  const dir = project("totals");
  withTrace(null, () => {
    recordPhase(dir, { name: "a", durationMs: 10, result: "PASS", artifact: "a.json", artifactStatus: "generated" });
    recordPhase(dir, { name: "b", durationMs: 20, result: "PASS", artifact: "b.json", artifactStatus: "reused" });
    recordPhase(dir, { name: "b", durationMs: 20, result: "PASS", artifact: "b.json", artifactStatus: "reused" });
  });

  const { totals, phases } = readSummary(dir);
  assert.equal(totals.attempts, 3);
  assert.equal(totals.retries, 1);
  assert.equal(totals.artifactsGenerated, 1);
  assert.equal(totals.artifactsReused, 1);
  // duration_per_phase, attempts_per_phase, retries_per_phase are the rows
  // themselves; overall_run_duration is on the summary.
  assert.deepEqual(phases.map((p) => [p.name, p.durationMs, p.attempts]), [["a", 10, 1], ["b", 40, 2]]);
});

test("normal mode writes no trace at all", () => {
  const dir = project("no-trace");
  withTrace(null, () => {
    recordPhase(dir, { name: "authoring", durationMs: 22110, result: "PASS" });
    trace(dir, { type: "retry", reason: "should not be written" });
  });

  assert.equal(tracing(), false);
  const file = traceFile(dir);
  assert.ok(!file || !fs.existsSync(file), "a trace was written with tracing off");
  assert.ok(readSummary(dir), "the summary is still written");
});

test("a phase failing is recorded as one, and the run says so", () => {
  const dir = project("failed");
  withTrace(null, () => recordPhase(dir, { name: "authoring", durationMs: 5, result: "FAIL" }));
  assert.equal(readSummary(dir).status, "FAIL");
});

// ------------------------------------------------------------- debug mode ---

test("the trace appears only when asked for, and carries the phase events", () => {
  const dir = project("trace");
  withTrace("on", () => {
    recordPhase(dir, {
      name: "discovery.geometry",
      durationMs: 8421,
      result: "PASS",
      validation: "PASS",
      artifact: "visual-analysis.json",
      artifactStatus: "generated",
      agent: "geometry",
    });
  });

  const file = traceFile(dir);
  assert.ok(file && fs.existsSync(file), "no trace was written");
  const [event] = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(event.type, "phase_completed");
  assert.equal(event.phase, "discovery.geometry");
  assert.equal(event.agent, "geometry");
  assert.equal(event.validation, "PASS", "the validator's answer is in the trace");
  assert.equal(event.artifactStatus, "generated");
  assert.equal(event.model, null, "never guessed — null when the host does not state it");
});

test("a retry keeps its reason, which is the thing a summary cannot hold", () => {
  const dir = project("retry-reason");
  withTrace("on", () => {
    recordPhase(dir, { name: "visual-analysis", durationMs: 10, result: "FAIL", validation: "FAIL", reason: "typography mismatch" });
    recordPhase(dir, { name: "visual-analysis", durationMs: 10, result: "PASS", validation: "PASS" });
  });

  const events = fs.readFileSync(traceFile(dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(events.length, 2);
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].reason, "typography mismatch");
  assert.equal(events[1].attempt, 2, "the trace numbers the attempts too");
});

test("the trace takes events of any shape, appended one line each", () => {
  // JSONL because discovery runs three workers at once: three processes
  // appending whole lines is safe where three rewriting one document is not.
  const dir = project("jsonl");
  withTrace("1", () => {
    trace(dir, { type: "agent_spawned", agent: "content" });
    trace(dir, { type: "validation_failed", check: "icons described", detail: "5 of 33" });
  });

  const events = fs.readFileSync(traceFile(dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(events.map((e) => e.type), ["agent_spawned", "validation_failed"]);
  for (const event of events) assert.match(event.at, /^\d{4}-\d\d-\d\dT/, "every line is stamped");
});

test("the switch is off for the values that mean off", () => {
  for (const value of [null, "", "off", "0"]) {
    assert.equal(withTrace(value, tracing), false, `${JSON.stringify(value)} enabled tracing`);
  }
  for (const value of ["on", "1", "true"]) {
    assert.equal(withTrace(value, tracing), true, `${JSON.stringify(value)} did not enable tracing`);
  }
});

// ------------------------------------------------------ failure tolerance ---

test("THE RULE: a telemetry failure does not reach the caller", () => {
  // The directory cannot be created because a file already occupies its path.
  // Every entry point has to swallow that: a workflow that stopped because a
  // measurement failed would be worse than one with no measurements.
  const dir = project("unwritable");
  fs.writeFileSync(path.join(dir, "telemetry"), "not a directory");

  assert.doesNotThrow(() => recordPhase(dir, { name: "authoring", durationMs: 1, result: "PASS" }));
  assert.doesNotThrow(() => trace(dir, { type: "anything" }));
  assert.doesNotThrow(() => currentRun(dir));
  assert.doesNotThrow(() => startRun(dir));
  assert.equal(readSummary(dir), null, "and it reports nothing rather than inventing a run");
});

test("a caller's own work is returned even when the phase cannot be recorded", async () => {
  const dir = project("unwritable-timed");
  fs.writeFileSync(path.join(dir, "telemetry"), "not a directory");

  const value = await timePhase(dir, "authoring", {}, async () => "the document");
  assert.equal(value, "the document");
});

test("a body that throws is still recorded as a failed phase, and still throws", async () => {
  // The failing pass is the one most worth having a record of.
  const dir = project("throwing");
  await assert.rejects(
    () => withTrace(null, () => timePhase(dir, "loop.render", {}, async () => {
      throw new Error("compile error");
    })),
    /compile error/,
  );

  const [phase] = readSummary(dir).phases;
  assert.equal(phase.name, "loop.render");
  assert.equal(phase.result, "FAIL");
});

// ------------------------------------------------------------ the run itself ---

test("separate processes join one run, because phases are separate CLIs", () => {
  // `check-analysis`, `write-artifact` and `pass` are three processes; the id
  // cannot live in memory, so it lives in a pointer file.
  const dir = project("shared-run");
  const first = currentRun(dir);
  const second = currentRun(dir);

  assert.equal(first.runId, second.runId);
  assert.ok(fs.existsSync(path.join(dir, "telemetry", "current-run.json")));
});

test("starting a run is the one thing that resets the clock", () => {
  const dir = project("restart");
  const first = currentRun(dir);
  withTrace(null, () => recordPhase(dir, { name: "a", durationMs: 1, result: "PASS" }));

  const second = startRun(dir);
  assert.notEqual(second.runId, first.runId);
  // A run with no phases yet has no summary — the file appears with the first
  // one, so an opened-and-abandoned run leaves nothing to read wrongly.
  assert.equal(readSummary(dir), null, "the new run starts empty");
  assert.equal(readSummary(dir, first.runId).phases.length, 1, "and the old one is still readable");
});
