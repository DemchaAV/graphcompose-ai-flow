#!/usr/bin/env node
/**
 * scripts/telemetry/gemini-hook.mjs — the checkpoint writer, for Gemini CLI.
 *
 * Registered in the extension's `hooks/hooks.json`. Gemini fires the same
 * moments Claude does under two different names — `BeforeAgent` where Claude
 * fires `UserPromptSubmit`, `AfterAgent` where Claude fires `Stop` — and gives
 * hooks the same `session_id`, `transcript_path` and `cwd`. So this file is a
 * name table over `checkpoint.mjs`, and nothing else.
 *
 * `SubagentStop` has no counterpart: Gemini's sub-agents are a preview feature
 * and fire no lifecycle hook, so a session's sub-agent usage is simply not
 * attributed rather than guessed at.
 *
 * One Gemini rule shapes the exit: **stdout is parsed as JSON**, and any other
 * text on it is treated as a message to show the user. A checkpoint has
 * nothing to say, so it writes one inert object and says so.
 */

import { main } from "./checkpoint.mjs";

/** Gemini's lifecycle events, in the vocabulary the state file uses. */
const KINDS = {
  SessionStart: "SessionStart",
  BeforeAgent: "UserPromptSubmit",
  AfterAgent: "Stop",
  SessionEnd: "SessionEnd",
};

await main({ host: "gemini", kinds: KINDS }, () => {
  process.stdout.write(JSON.stringify({ suppressOutput: true }));
});
