#!/usr/bin/env node
/**
 * scripts/telemetry/claude-hook.mjs — the checkpoint writer.
 *
 * Registered for SessionStart, UserPromptSubmit, SubagentStop, Stop and
 * SessionEnd. It decides nothing and calls no model: it records when things
 * happened and where the transcript is, so `run-metrics` can answer questions
 * later.
 *
 * Two rules it must never break.
 *
 * **It always exits 0.** A hook that fails blocks the work it was measuring,
 * and telemetry is never worth that. Every failure path here is swallowed
 * deliberately.
 *
 * **It is fast.** It parses one JSON object from stdin and writes one small
 * file. Reading the transcript — which is 34 MB in a long session — is
 * `run-metrics`' job, on demand, not on every prompt.
 *
 * The Stop hook matters for accuracy: a report printed before the final
 * response cannot include that response, because the transcript is written
 * asynchronously. Stop records the cycle's closing timestamp, so the *next*
 * turn sees an exact figure for the previous one.
 */

import { readState, writeState } from "../telemetry/core.mjs";

const MAX_INPUT = 1_000_000;

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  const sessionId = event.session_id;
  if (!sessionId) return;

  const now = new Date().toISOString();
  const kind = event.hook_event_name;
  const state = readState(sessionId) ?? { sessionId, cycles: [] };

  const common = {
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

// Nothing this file can do is worth failing a turn for.
main().catch(() => {}).finally(() => process.exit(0));
