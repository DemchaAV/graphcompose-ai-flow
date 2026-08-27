#!/usr/bin/env node
/**
 * scripts/telemetry/providers/gemini.mjs — token accounting from a Gemini CLI
 * transcript.
 *
 * Gemini writes one JSON document per session — `{sessionId, startTime,
 * messages: [...]}` — and hands hooks its path, the same way Claude Code hands
 * over its JSONL. Each model message carries a `tokens` block:
 *
 *   { input, output, cached, thoughts, tool, total }
 *
 * Three things about that block decide the mapping, and getting any of them
 * wrong produces a plausible number that is wrong:
 *
 * **`cached` is part of `input`, not additional to it.** Gemini reports the
 * cached share of the prompt; Anthropic reports cache reads as a separate
 * figure. Copying `input` and `cached` across as-is would count the cached
 * tokens twice in the processed total, so the uncached remainder is what lands
 * in `inputTokens`. The parts then still sum to Gemini's own `total`.
 *
 * **Thinking is billed as output.** `thoughts` is excluded from `output` here
 * and included in Claude's `output_tokens`, so it is added — otherwise a
 * reasoning-heavy Gemini run looks cheaper than an identical Claude one.
 *
 * **There is no cache-write figure.** Gemini's implicit caching does not report
 * one, so `cacheWriteTokens` is zero rather than an estimate.
 *
 * The whole document is parsed at once — it is a single JSON value, so there is
 * no partial-line case to defend against, only a file being rewritten while it
 * is read, which fails the parse and yields no events rather than half of them.
 */

import fs from "node:fs";

import { emptyUsage, foldEvents } from "../core.mjs";

export { foldEvents };

/**
 * Every usage-bearing message in a transcript, in file order.
 *
 * Deduplication is not needed here as it is for Claude: Gemini writes one
 * message object per model response, not one line per streamed chunk.
 *
 * @param {string} transcriptPath
 * @returns {Array<{at: string|null, atMs: number|null, isSidechain: boolean, usage: object}>}
 */
export function readEvents(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];

  let document;
  try {
    document = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
  } catch {
    // Being rewritten as we read, or not a transcript at all.
    return [];
  }

  const messages = Array.isArray(document?.messages) ? document.messages : [];
  const events = [];

  for (const message of messages) {
    const tokens = message?.tokens;
    if (!tokens || typeof tokens !== "object") continue;

    const input = Number(tokens.input ?? 0);
    const cached = Number(tokens.cached ?? 0);
    const output = Number(tokens.output ?? 0);
    const thoughts = Number(tokens.thoughts ?? 0);
    const at = message.timestamp ?? null;

    events.push({
      at,
      atMs: at ? Date.parse(at) : null,
      // Gemini's sub-agents do not record their usage against the session
      // transcript, so nothing here is a sidechain. When they do, this is the
      // field to set rather than a second code path.
      isSidechain: false,
      usage: {
        inputTokens: Math.max(0, input - cached),
        outputTokens: output + thoughts,
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
        requests: 1,
      },
    });
  }
  return events;
}

/**
 * Sum usage over a transcript, optionally windowed by time.
 *
 * @param {string} transcriptPath
 * @param {{ since?: string|null, until?: string|null, includeSidechains?: boolean }} [options]
 */
export function readUsage(transcriptPath, options = {}) {
  return foldEvents(readEvents(transcriptPath), options);
}

/** The session's own start, for the third clock. */
export function sessionStart(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    const document = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
    if (document?.startTime) return document.startTime;
    const first = Array.isArray(document?.messages) ? document.messages[0] : null;
    return first?.timestamp ?? null;
  } catch {
    return null;
  }
}

/** An empty window, for callers that need the shape without a transcript. */
export function empty() {
  return { usage: emptyUsage(), sidechainUsage: emptyUsage(), firstAt: null, lastAt: null };
}

export const provider = {
  name: "gemini",
  readEvents,
  foldEvents,
  readUsage,
  sessionStart,
};
