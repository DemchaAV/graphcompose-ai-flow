#!/usr/bin/env node
/**
 * scripts/telemetry/checkpoint.mjs — what a hook records, independent of which
 * host fired it.
 *
 * Every host with hooks fires the same five moments under different names:
 * a session starts, the user says something, the turn ends, a subagent ends,
 * the session ends. What is *recorded* at those moments is identical, so it is
 * written once here and the host entry points (`claude-hook.mjs`,
 * `gemini-hook.mjs`) do nothing but translate names.
 *
 * Two rules the callers must never break.
 *
 * **They always exit 0.** A hook that fails blocks the work it was measuring,
 * and telemetry is never worth that. Every failure path here is swallowed
 * deliberately.
 *
 * **They are fast.** One JSON object parsed from stdin, one small file
 * written. Reading the transcript — 34 MB in a long session — is
 * `run-metrics`' job, on demand, not on every prompt.
 *
 * The turn-end checkpoint matters for accuracy: a report printed before the
 * final response cannot include that response, because the transcript is
 * written asynchronously. It records the cycle's closing timestamp, so the
 * *next* turn sees an exact figure for the previous one.
 */

import { readState, writeState } from "./core.mjs";

const MAX_INPUT = 1_000_000;

/** The five moments, in the vocabulary the state file is written in. */
export const CHECKPOINTS = ["SessionStart", "UserPromptSubmit", "Stop", "SubagentStop", "SessionEnd"];

/** One JSON object from stdin, or null if there was not one. */
export async function readEvent(stream = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT) break;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Record one checkpoint.
 *
 * @param {object|null} event the host's hook payload
 * @param {{ host: string, kind?: string|null }} options `kind` is the
 *   checkpoint in the vocabulary above; hosts whose event names already match
 *   may omit it. An unknown or absent kind records nothing, which is how a host
 *   registering an event this file does not model stays harmless.
 */
export function record(event, { host, kind = event?.hook_event_name } = {}) {
  if (!event) return;
  const sessionId = event.session_id;
  if (!sessionId) return;

  const now = new Date().toISOString();
  const state = readState(sessionId) ?? { sessionId, cycles: [] };

  const common = {
    // Which host wrote this decides how the transcript is parsed later. It is
    // recorded per checkpoint rather than once at SessionStart, because a state
    // file can outlive the start it was created by.
    host,
    transcriptPath: event.transcript_path ?? state.transcriptPath ?? null,
    cwd: event.cwd ?? state.cwd ?? null,
  };

  switch (kind) {
    case "SessionStart": {
      writeState(sessionId, {
        ...common,
        // `resume` and `compact` re-enter an existing session; the original
        // start is what the session clock should keep measuring.
        sessionStartedAt: state.sessionStartedAt ?? now,
        cycles: state.cycles ?? [],
      });
      break;
    }

    case "UserPromptSubmit": {
      // Each thing the user says opens a cycle. This is the measurement that
      // makes "what did that correction cost" answerable at all.
      const cycles = [...(state.cycles ?? [])];
      const open = cycles[cycles.length - 1];
      if (open && !open.finishedAt) open.finishedAt = now;
      cycles.push({
        promptId: event.prompt_id ?? null,
        prompt: typeof event.prompt === "string" ? event.prompt.slice(0, 300) : null,
        startedAt: now,
        finishedAt: null,
      });
      writeState(sessionId, { ...common, cycles, currentCycleStartedAt: now });
      break;
    }

    case "Stop": {
      const cycles = [...(state.cycles ?? [])];
      const open = cycles[cycles.length - 1];
      if (open) open.finishedAt = now;
      writeState(sessionId, { ...common, cycles, lastStopAt: now });
      break;
    }

    case "SubagentStop": {
      // Subagents write their own transcripts; keeping the paths means their
      // usage can be attributed rather than silently missing.
      const transcripts = new Set(state.subagentTranscripts ?? []);
      if (event.agent_transcript_path) transcripts.add(event.agent_transcript_path);
      writeState(sessionId, {
        ...common,
        subagentTranscripts: [...transcripts],
        subagents: (state.subagents ?? 0) + 1,
      });
      break;
    }

    case "SessionEnd": {
      const cycles = [...(state.cycles ?? [])];
      const open = cycles[cycles.length - 1];
      if (open && !open.finishedAt) open.finishedAt = now;
      writeState(sessionId, { ...common, cycles, sessionEndedAt: now });
      break;
    }

    default:
      break;
  }
}

/**
 * Read stdin, record, and exit 0 whatever happened.
 *
 * @param {{ host: string, kinds?: Record<string, string> }} options `kinds`
 *   translates the host's event names into checkpoints; omit it when they
 *   already match.
 * @param {() => void} [onDone] anything the host needs written to stdout
 *   before exit — Gemini, for instance, parses stdout as JSON.
 */
export async function main({ host, kinds = null }, onDone = null) {
  try {
    const event = await readEvent();
    record(event, { host, kind: kinds ? kinds[event?.hook_event_name] ?? null : event?.hook_event_name });
  } catch {
    // Nothing this file can do is worth failing a turn for.
  }
  try {
    onDone?.();
  } catch {
    /* best effort */
  }
  process.exit(0);
}
