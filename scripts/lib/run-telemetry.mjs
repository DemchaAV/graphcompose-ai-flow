/**
 * scripts/lib/run-telemetry.mjs — how the pipeline spent its time, phase by phase.
 *
 * ## What was already here, and why this is not a second system
 *
 * `scripts/telemetry/` prices a run in tokens: three clocks, five token
 * figures, a phase split derived from `handoff.json` and the marker tools in
 * `config/pipeline.json`. It answers "what did this cost". It cannot answer
 * "where did the workflow stall, how often did it retry, which phase is
 * unstable" — those are wall-clock and outcome questions, and no transcript
 * carries them.
 *
 * So this adds the second axis and borrows that module's two load-bearing
 * rules rather than restating them differently:
 *
 *   - **Never failing.** Every function here swallows its own errors. A run
 *     that stopped because a measurement could not be written would be worse
 *     than one with no measurements.
 *   - **Derive, do not accumulate, where the workspace already knows.**
 *     `attempts.json` records every render of a revision with its sources and
 *     its figure; `revision.json` records the chain. Those are not copied
 *     here — the summary points at them and the loop phase is counted from
 *     them, so a counter cannot drift from the artifacts it describes.
 *
 * What is recorded rather than derived is the part nothing else knows: when a
 * phase began and ended, whether its validation passed, and whether the
 * artifact it produced was written or was already there.
 *
 * ## The summary is kept current, not written at the end
 *
 * `run-metrics finish` archives a run, and in eight recorded corpus projects
 * it has been called **zero** times — the model calls `start` because the
 * setup contract says to, and the run ends when the user stops asking. A
 * summary that depends on a closing call is a summary that does not exist.
 *
 * So it is rewritten after every phase. An abandoned run has a summary up to
 * the point it was abandoned, which is the run you most want to look at.
 *
 * ## Tracing is opt-in, through the switch this repository already uses
 *
 * `GRAPHCOMPOSE_TRACE=on`, in the shape of `GRAPHCOMPOSE_GUARD=off`. Not
 * `--debug`: that flag is taken, by `pass.mjs` and `preview-live.mjs`, for a
 * render with guide lines, and one word meaning two things across a CLI is how
 * a diagnostic gets switched on by somebody who wanted a picture.
 *
 * Layout, under the project's own telemetry directory:
 *
 *     projects/<id>/telemetry/runs/<runId>/summary.json    always
 *     projects/<id>/telemetry/runs/<runId>/trace.jsonl     GRAPHCOMPOSE_TRACE only
 *
 * Prompts and responses are never written here at any level. They are large,
 * they are already in the host's transcript, and the token module reads them
 * there.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { withFileLock, writeJsonAtomic } from "./atomic-write.mjs";

/** Where a project's telemetry lives, beside the token module's own archives. */
const TELEMETRY_DIR = "telemetry";
const RUNS_DIR = "runs";

/** The env switch, in the shape `GRAPHCOMPOSE_GUARD` already established. */
export function tracing() {
  const value = process.env.GRAPHCOMPOSE_TRACE;
  return typeof value === "string" && value !== "" && value !== "off" && value !== "0";
}

/** Every write goes through here, so "never load-bearing" is one decision. */
function safely(action, fallback = null) {
  try {
    return action();
  } catch (err) {
    // Visible only when someone asked to see the machinery, and never on
    // stdout: a diagnostic that corrupts a --json payload has broken the
    // thing it was measuring.
    if (tracing()) process.stderr.write(`[telemetry] ${err.message}\n`);
    return fallback;
  }
}

function runsRoot(projectDir) {
  return path.join(projectDir, TELEMETRY_DIR, RUNS_DIR);
}

/**
 * The run every phase in this workspace belongs to.
 *
 * Phases are separate processes — `check-analysis`, `write-artifact` and
 * `pass` are each their own CLI — so the id cannot live in memory. It lives in
 * a pointer file, created by whichever phase runs first and read by the rest.
 */
export function currentRun(projectDir, { create = true } = {}) {
  return safely(() => {
    const pointer = path.join(projectDir, TELEMETRY_DIR, "current-run.json");
    if (fs.existsSync(pointer)) {
      const held = JSON.parse(fs.readFileSync(pointer, "utf8"));
      if (held?.runId) return held;
    }
    if (!create) return null;
    const run = { runId: crypto.randomUUID().slice(0, 12), startedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(pointer), { recursive: true });
    try {
      // Exclusive: three workers starting together all found no pointer and
      // all minted one, so the run's phases split across three directories and
      // every summary was a third of a run. `wx` lets exactly one win, and the
      // losers read what the winner wrote.
      fs.writeFileSync(pointer, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      return run;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const held = JSON.parse(fs.readFileSync(pointer, "utf8"));
      return held?.runId ? held : run;
    }
  });
}

/** Start a fresh run, so a new template does not extend the previous one's clock. */
export function startRun(projectDir) {
  return safely(() => {
    const pointer = path.join(projectDir, TELEMETRY_DIR, "current-run.json");
    fs.mkdirSync(path.dirname(pointer), { recursive: true });
    const run = { runId: crypto.randomUUID().slice(0, 12), startedAt: new Date().toISOString() };
    fs.writeFileSync(pointer, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    return run;
  });
}

function summaryFile(projectDir, runId) {
  return path.join(runsRoot(projectDir), runId, "summary.json");
}

function traceFile(projectDir, runId) {
  return path.join(runsRoot(projectDir), runId, "trace.jsonl");
}

/** The summary as it stands, or a fresh one. Never throws, never returns null. */
function loadSummary(projectDir, run) {
  const empty = {
    runId: run.runId,
    startedAt: run.startedAt,
    status: "RUNNING",
    durationMs: 0,
    phases: [],
    totals: { attempts: 0, retries: 0, validationFailures: 0, artifactsGenerated: 0, artifactsReused: 0 },
  };
  return (
    safely(() => {
      const file = summaryFile(projectDir, run.runId);
      if (!fs.existsSync(file)) return empty;
      const held = JSON.parse(fs.readFileSync(file, "utf8"));
      return held?.runId === run.runId ? held : empty;
    }) ?? empty
  );
}

function writeSummary(projectDir, summary) {
  safely(() => writeJsonAtomic(summaryFile(projectDir, summary.runId), summary));
}

/**
 * Append one event to the trace. A no-op unless `GRAPHCOMPOSE_TRACE` is set.
 *
 * JSONL because it is append-only under concurrency: discovery runs three
 * workers at once, and three processes appending whole lines to one file is
 * safe in a way three processes rewriting one JSON document is not.
 */
export function trace(projectDir, event) {
  if (!tracing()) return;
  safely(() => {
    const run = currentRun(projectDir);
    if (!run) return;
    const file = traceFile(projectDir, run.runId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
  });
}

/**
 * Record one completed phase.
 *
 * Called with what the phase already knows — nothing here inspects the
 * workspace, so a caller cannot be slowed down by the measurement. A phase
 * recorded twice under one name is a second *attempt* at it, which is where
 * `attempts` and `retries` come from: nobody counts, the record does.
 *
 * @param {string} projectDir
 * @param {object} phase
 * @param {string} phase.name        e.g. "discovery.geometry", "authoring", "loop.render"
 * @param {number} phase.durationMs
 * @param {string} [phase.result]    PASS | FAIL
 * @param {string} [phase.validation] PASS | FAIL — the validator's own answer
 * @param {string} [phase.artifact]  the file the phase produced
 * @param {string} [phase.artifactStatus] generated | replaced | reused | rejected
 * @param {string} [phase.agent]     the worker, where one is named
 * @param {string} [phase.model]     only when the host states it; never guessed
 * @param {string} [phase.reason]    why it failed, for the trace
 */
export function recordPhase(projectDir, phase) {
  return safely(() => {
    const run = currentRun(projectDir);
    if (!run) return null;
    // Under a lock, because the whole operation is a read-modify-write and
    // discovery runs three of them at once. Without it a worker reading while
    // another was mid-write got half a document, `safely` swallowed the parse
    // error, and the empty template it fell back to was written over the other
    // two workers' phases — measured at a lost phase in fourteen of
    // twenty-five rounds with six writers.
    return withFileLock(summaryFile(projectDir, run.runId), () => recordUnderLock(projectDir, run, phase));
  });
}

function recordUnderLock(projectDir, run, phase) {
  {
    const summary = loadSummary(projectDir, run);
    const existing = summary.phases.find((p) => p.name === phase.name);
    const entry = existing ?? {
      name: phase.name,
      firstAt: new Date().toISOString(),
      durationMs: 0,
      attempts: 0,
      retries: 0,
      validationFailures: 0,
      result: null,
    };

    entry.attempts += 1;
    entry.retries = entry.attempts - 1;
    entry.durationMs += Number(phase.durationMs) || 0;
    entry.lastAt = new Date().toISOString();
    entry.result = phase.result ?? entry.result;
    if (phase.validation) {
      entry.validation = phase.validation;
      if (phase.validation === "FAIL") entry.validationFailures += 1;
    }
    for (const key of ["agent", "model", "artifact", "artifactStatus"]) {
      if (phase[key] !== undefined && phase[key] !== null) entry[key] = phase[key];
    }
    if (!existing) summary.phases.push(entry);

    summary.durationMs = Date.now() - Date.parse(run.startedAt);
    summary.totals = summary.phases.reduce(
      (acc, p) => ({
        attempts: acc.attempts + p.attempts,
        retries: acc.retries + p.retries,
        validationFailures: acc.validationFailures + (p.validationFailures ?? 0),
        // A rewrite is still an artifact this run produced, and
        // write-artifact distinguishes the two: "replaced" told the trace
        // something true and fell out of both counters, so a run that
        // re-committed after a barrier rejection under-reported itself.
        artifactsGenerated:
          acc.artifactsGenerated + (p.artifactStatus === "generated" || p.artifactStatus === "replaced" ? 1 : 0),
        artifactsReused: acc.artifactsReused + (p.artifactStatus === "reused" ? 1 : 0),
      }),
      { attempts: 0, retries: 0, validationFailures: 0, artifactsGenerated: 0, artifactsReused: 0 },
    );
    summary.status = summary.phases.some((p) => p.result === "FAIL") ? "FAIL" : "PASS";
    writeSummary(projectDir, summary);

    trace(projectDir, {
      type: "phase_completed",
      phase: phase.name,
      agent: phase.agent ?? null,
      model: phase.model ?? null,
      durationMs: Number(phase.durationMs) || 0,
      attempt: entry.attempts,
      retries: entry.retries,
      validation: phase.validation ?? null,
      artifact: phase.artifact ?? null,
      artifactStatus: phase.artifactStatus ?? null,
      result: phase.result ?? null,
      reason: phase.reason ?? null,
    });

    return entry;
  }
}

/**
 * Time a phase and record it, so a caller writes no clock arithmetic.
 *
 * The `finally` is the point: a phase that throws is still a phase that took
 * time and failed, and that is exactly the one worth having a record of.
 */
export async function timePhase(projectDir, name, meta, body) {
  const started = Date.now();
  try {
    const value = await body();
    recordPhase(projectDir, { ...meta, name, durationMs: Date.now() - started, result: meta.result ?? "PASS" });
    return value;
  } catch (err) {
    recordPhase(projectDir, {
      ...meta,
      name,
      durationMs: Date.now() - started,
      result: "FAIL",
      reason: err?.message ?? String(err),
    });
    throw err;
  }
}

/** The summary as it stands, for a reader. Null when the run has none. */
export function readSummary(projectDir, runId = null) {
  return safely(() => {
    const run = runId ? { runId } : currentRun(projectDir, { create: false });
    if (!run?.runId) return null;
    const file = summaryFile(projectDir, run.runId);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  });
}
