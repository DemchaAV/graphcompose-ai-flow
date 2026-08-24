#!/usr/bin/env node
/**
 * scripts/telemetry/providers/claude-code.mjs — token accounting from a Claude
 * Code transcript.
 *
 * The host writes a JSONL transcript and tells hooks where it is. Each
 * assistant line carries a `usage` block and a `requestId`.
 *
 * **Deduplication is not optional.** In a real session there were 1699
 * assistant lines carrying usage and 846 distinct request ids — one request
 * appears about twice. Summing the lines would have doubled every figure and
 * the error would have looked plausible, which is the worst kind.
 *
 * The transcript is also written asynchronously, so a read taken while a turn
 * is still being written misses its tail. Everything here is therefore "as far
 * as the transcript goes", and the Stop hook is what turns a cycle's figures
 * into final ones.
 */

import fs from "node:fs";

import { addUsage, emptyUsage } from "../core.mjs";

/**
 * Sum usage over a transcript, optionally windowed by time.
 *
 * @param {string} transcriptPath
 * @param {{ since?: string|null, until?: string|null, includeSidechains?: boolean }} [options]
 * @returns {{ usage: object, sidechainUsage: object, firstAt: string|null, lastAt: string|null }}
 */
export function readUsage(transcriptPath, options = {}) {
  const { since = null, until = null, includeSidechains = true } = options;
  const empty = {
    usage: emptyUsage(),
    sidechainUsage: emptyUsage(),
    firstAt: null,
    lastAt: null,
  };
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return empty;

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return empty;
  }

  const sinceMs = since ? Date.parse(since) : null;
  const untilMs = until ? Date.parse(until) : null;
  const seen = new Set();
  let main = emptyUsage();
  let sidechain = emptyUsage();
  let firstAt = null;
  let lastAt = null;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      // A partially written last line is normal while a turn is in flight.
      continue;
    }
    if (entry.type !== "assistant" || !entry.message?.usage) continue;

    const at = entry.timestamp ? Date.parse(entry.timestamp) : null;
    if (at !== null) {
      if (sinceMs !== null && at < sinceMs) continue;
      if (untilMs !== null && at > untilMs) continue;
      if (firstAt === null || at < Date.parse(firstAt)) firstAt = entry.timestamp;
      if (lastAt === null || at > Date.parse(lastAt)) lastAt = entry.timestamp;
    }

    // One request, one count — see the note above about 1699 vs 846.
    const key = entry.requestId ?? entry.uuid;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const usage = entry.message.usage;
    const one = {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      requests: 1,
    };

    if (entry.isSidechain) {
      sidechain = addUsage(sidechain, one);
      if (includeSidechains) main = addUsage(main, one);
    } else {
      main = addUsage(main, one);
    }
  }

  return { usage: main, sidechainUsage: sidechain, firstAt, lastAt };
}

/** The session's own start, for the third clock. */
export function sessionStart(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) return entry.timestamp;
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export const provider = {
  name: "claude-code",
  readUsage,
  sessionStart,
};
