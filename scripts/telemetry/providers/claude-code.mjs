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
 * **Parsing is separated from folding** for a reason that only shows up at
 * size. A report covers three windows (cycle, run, session) and an archive
 * covers one per cycle; parsing the file once per window meant a 37 MB
 * transcript was read three times for a report and N times for an archive.
 * `readEvents` reads and dedupes once, `foldEvents` answers any number of
 * windows from that.
 *
 * The transcript is also written asynchronously, so a read taken while a turn
 * is still being written misses its tail. Everything here is therefore "as far
 * as the transcript goes", and the Stop hook is what turns a cycle's figures
 * into final ones.
 */

import fs from "node:fs";

import { foldEvents } from "../core.mjs";

// Folding is the same arithmetic for every host, so it lives in core.mjs and is
// re-exported here: `provider.foldEvents` is part of the interface run-metrics
// calls, and a provider that only parsed would be half an interface.
export { foldEvents };

/**
 * Every usage-bearing message in a transcript, deduplicated, in file order.
 *
 * @param {string} transcriptPath
 * @returns {Array<{at: string|null, atMs: number|null, isSidechain: boolean, usage: object}>}
 */
export function readEvents(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return [];
  }

  const seen = new Set();
  const events = [];

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

    // One request, one count — see the note above about 1699 vs 846. Done here
    // rather than per window, so two windows over one file cannot each count
    // the same request.
    const key = entry.requestId ?? entry.uuid;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const usage = entry.message.usage;
    events.push({
      at: entry.timestamp ?? null,
      atMs: entry.timestamp ? Date.parse(entry.timestamp) : null,
      isSidechain: Boolean(entry.isSidechain),
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        requests: 1,
      },
    });
  }
  return events;
}

/**
 * Sum usage over a transcript, optionally windowed by time.
 *
 * The simple entry point, and correct for a single window. Callers needing
 * several windows over one transcript should use readEvents + foldEvents.
 *
 * @param {string} transcriptPath
 * @param {{ since?: string|null, until?: string|null, includeSidechains?: boolean }} [options]
 * @returns {{ usage: object, sidechainUsage: object, firstAt: string|null, lastAt: string|null }}
 */
export function readUsage(transcriptPath, options = {}) {
  return foldEvents(readEvents(transcriptPath), options);
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
  readEvents,
  foldEvents,
  readUsage,
  sessionStart,
};
