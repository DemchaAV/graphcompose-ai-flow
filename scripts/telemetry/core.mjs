#!/usr/bin/env node
/**
 * scripts/telemetry/core.mjs — what a run cost, in the terms that make it
 * comparable to the next one.
 *
 * The first acceptance run produced one number: "about an hour, roughly 240k
 * tokens". That is enough to say the harness works and not nearly enough to
 * say whether a change made it better. It cannot answer which correction was
 * expensive, whether the loop or the analysis dominates, or what a cache-read
 * reduction is worth.
 *
 * Three clocks, because they answer different questions:
 *
 *   cycle    since the user last said something — what this correction cost
 *   run      since the workflow started — what producing this template cost
 *   session  the whole host session — what the sitting cost
 *
 * And five token figures rather than one total. A single number is dominated
 * by cache reads, which are cheap and enormous; reporting them together makes
 * a 6x cache reduction invisible next to a 5% output increase.
 *
 * Everything here is host-independent. Reading a host's token accounting is a
 * provider's job (see providers/), because only the host knows where its
 * transcript lives and what is in it.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Session state lives outside any workspace. A session can start before a
 * workspace exists, outlive one, or touch two — and writing it into the
 * harness install is the failure the workspace split exists to prevent.
 */
export const STATE_DIR = path.join(os.homedir(), ".graphcompose-flow", "telemetry");

/** Counters and archives belong to the project, so they travel with the work. */
export const PROJECT_TELEMETRY_DIR = "telemetry";

export function statePath(sessionId) {
  return path.join(STATE_DIR, `${sanitise(sessionId)}.json`);
}

/** Session ids come from the host; treat them as untrusted path input. */
function sanitise(id) {
  return String(id ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);
}

export function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Merge and persist. Telemetry never fails the work it measures, so a write
 * that cannot happen is swallowed rather than thrown — a read-only home
 * directory should not stop a template from being produced.
 */
export function writeState(sessionId, patch) {
  const current = readState(sessionId) ?? { sessionId, cycles: [] };
  const next = { ...current, ...patch, sessionId };
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(statePath(sessionId), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    /* telemetry is never load-bearing */
  }
  return next;
}

/**
 * Counters derived from the workspace rather than accumulated as work happens.
 *
 * Deriving means no tool has to remember to increment anything, and a counter
 * cannot drift from the artifacts it describes. It also means only what is
 * actually on disk gets reported: there is no "build failures" figure here,
 * because nothing records one in a form that could be counted honestly.
 */
export function projectCounters(projectDir) {
  const revisionsDir = path.join(projectDir, "revisions");
  if (!fs.existsSync(revisionsDir)) {
    return { revisions: 0, renders: 0, visualReviews: 0 };
  }
  const revisions = fs
    .readdirSync(revisionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(revisionsDir, e.name));

  let renders = 0;
  let visualReviews = 0;
  for (const dir of revisions) {
    if (fs.existsSync(path.join(dir, "output.pdf"))) renders += 1;
    if (fs.existsSync(path.join(dir, "visual-review.json"))) visualReviews += 1;
  }
  return { revisions: revisions.length, renders, visualReviews };
}

/** Newest revision id in a project, for "revision-007 -> revision-008" lines. */
export function latestRevision(projectDir) {
  const revisionsDir = path.join(projectDir, "revisions");
  if (!fs.existsSync(revisionsDir)) return null;
  const ids = fs
    .readdirSync(revisionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^revision-\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

export function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    requests: 0,
  };
}

export function addUsage(a, b) {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    requests: a.requests + b.requests,
  };
}

/**
 * Everything the model read or wrote. Reported alongside the parts, never
 * instead of them: cache reads dominate this figure by an order of magnitude,
 * so on its own it hides every change worth seeing.
 */
export function processedTokens(usage) {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const seconds = Math.round(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatTokens(n) {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Milliseconds between two ISO timestamps, or null if either is missing. */
export function elapsed(fromIso, toIso = new Date().toISOString()) {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return Number.isFinite(from) && Number.isFinite(to) ? to - from : null;
}

/**
 * The compact block a workflow prints at a handoff. Deliberately plain text:
 * it is read in a terminal, next to the verdict it belongs with.
 */
export function formatReport(report) {
  const lines = [];
  const { cycle, run, session, counters, status } = report;

  lines.push("Run metrics");
  if (cycle?.startedAt) lines.push(`  This cycle:     ${formatDuration(elapsed(cycle.startedAt))}`);
  if (run?.startedAt) lines.push(`  Harness run:    ${formatDuration(elapsed(run.startedAt))}`);
  if (session?.startedAt) lines.push(`  Session:        ${formatDuration(elapsed(session.startedAt))}`);

  const blocks = [
    ["Tokens this cycle", cycle?.usage],
    ["Harness run total", run?.usage],
  ];
  for (const [title, usage] of blocks) {
    if (!usage) continue;
    lines.push("", `${title}:`);
    lines.push(`  input        ${formatTokens(usage.inputTokens)}`);
    lines.push(`  output       ${formatTokens(usage.outputTokens)}`);
    lines.push(`  cache read   ${formatTokens(usage.cacheReadTokens)}`);
    lines.push(`  cache write  ${formatTokens(usage.cacheWriteTokens)}`);
    lines.push(`  processed    ${formatTokens(processedTokens(usage))}`);
  }

  if (counters) {
    const parts = [
      `Revisions: ${counters.revisions}`,
      `Renders: ${counters.renders}`,
      `Visual reviews: ${counters.visualReviews}`,
    ];
    lines.push("", parts.join(" · "));
  }
  if (status) lines.push("", `Status: ${status}`);

  return lines.join("\n");
}
