/**
 * scripts/lib/attempts.mjs — every render of a revision, on the record.
 *
 * ## Why
 *
 * The loop's bounds count revisions, and a revision was supposed to be one
 * pass: edit one thing, render once, review, ask. The corpus says otherwise.
 * Sixteen real projects produced 50 revisions and 358 `render-and-diff` runs —
 * seven renders per revision — and the reviews said so in prose ("eight render
 * passes", "ten renders for the font sweep") where nothing could read it. So
 * `iterate-status` saw one iteration where there had been ten, the same-cause
 * bound never fired on a sweep, and "the last two passes moved under 0.25%"
 * was computed over two points out of twenty.
 *
 * A render is not forbidden from repeating — a sweep over five type sizes is a
 * legitimate way to settle one — but every render is a measurement that cost a
 * build, and a measurement nobody wrote down is paid for twice. This module
 * writes it down: `attempts.json` in the revision, one entry per
 * `render-and-diff` run, with the page figure, the worst regions, the causes
 * the evidence assigned, and a fingerprint of the sources that produced it.
 *
 * The fingerprint is what turns the list into evidence. Two attempts with one
 * fingerprint are the same sources measured twice (a re-run, not a try); two
 * fingerprints with one page figure are a change that bought nothing.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-write.mjs";

export const ATTEMPTS_FILE = "attempts.json";

/** What a render's outcome depends on: the template and its data. */
const SOURCE_FILE = /\.java$|-data(\.[a-z0-9-]+)?\.json$|^asset-request\.json$/i;
const NOT_SOURCE = /test/i;

/**
 * A short hash over every source file in the revision (name + content), so a
 * change anywhere in what the render reads changes the fingerprint.
 *
 * @param {string} revisionDir
 * @returns {{ fingerprint: string|null, files: string[] }}
 */
export function sourceFingerprint(revisionDir) {
  let names;
  try {
    names = fs.readdirSync(revisionDir).filter((n) => SOURCE_FILE.test(n) && !NOT_SOURCE.test(n));
  } catch {
    return { fingerprint: null, files: [] };
  }
  names.sort();
  if (names.length === 0) return { fingerprint: null, files: [] };
  const hash = crypto.createHash("sha1");
  for (const name of names) {
    hash.update(name);
    hash.update("\0");
    try {
      hash.update(fs.readFileSync(path.join(revisionDir, name)));
    } catch {
      hash.update("<unreadable>");
    }
    hash.update("\0");
  }
  return { fingerprint: hash.digest("hex").slice(0, 12), files: names };
}

/**
 * @param {string} revisionDir
 * @returns {Array<object>} oldest first; empty when nothing is on record
 */
export function readAttempts(revisionDir) {
  try {
    const body = JSON.parse(fs.readFileSync(path.join(revisionDir, ATTEMPTS_FILE), "utf8"));
    return Array.isArray(body?.attempts) ? body.attempts : [];
  } catch {
    return [];
  }
}

/**
 * Append one attempt and return the record as written, with the comparison to
 * the previous attempt already made.
 *
 * @param {string} revisionDir
 * @param {object} attempt
 * @param {number|null} attempt.mismatchPx
 * @param {number|null} attempt.percent
 * @param {string|null} attempt.against "reference" | "parent"
 * @param {boolean} attempt.rendered false for a re-measure (--skip-render)
 * @param {Array<{id:string, concentration:number|null, percentOfRegion:number}>} [attempt.worstRegions]
 * @param {Array<{region:string, cause:string|null}>} [attempt.causes]
 * @param {string|null} [attempt.focus] what this attempt was trying to fix, when known
 * @returns {object} the entry written
 */
export function recordAttempt(revisionDir, attempt) {
  const previous = readAttempts(revisionDir);
  const last = previous.length > 0 ? previous[previous.length - 1] : null;
  const { fingerprint, files } = sourceFingerprint(revisionDir);

  const entry = {
    n: previous.length + 1,
    at: new Date().toISOString(),
    rendered: attempt.rendered !== false,
    against: attempt.against ?? null,
    mismatchPx: numberOrNull(attempt.mismatchPx),
    percent: numberOrNull(attempt.percent),
    sources: { fingerprint, files },
    // Same sources as the attempt before: a re-run, not a try.
    sameSourcesAsPrevious: Boolean(last && fingerprint && last.sources?.fingerprint === fingerprint),
    moved:
      last && numberOrNull(attempt.percent) !== null && numberOrNull(last.percent) !== null
        ? round(attempt.percent - last.percent, 3)
        : null,
    worstRegions: (attempt.worstRegions ?? []).slice(0, 3).map((r) => ({
      id: r.id,
      concentration: r.concentration ?? null,
      percentOfRegion: r.percentOfRegion ?? null,
    })),
    causes: (attempt.causes ?? []).map((c) => ({ region: c.region ?? null, cause: c.cause ?? null })),
    focus: attempt.focus ?? null,
  };

  const body = {
    schemaVersion: 1,
    $comment:
      "One entry per render-and-diff run on this revision, written by the harness. " +
      "Read by iterate-status; never edit by hand.",
    attempts: [...previous, entry],
  };
  writeJsonAtomic(path.join(revisionDir, ATTEMPTS_FILE), body);
  return entry;
}

/**
 * The attempts of one revision, summarised for a report line.
 *
 * @param {Array<object>} attempts
 * @param {number} [materialPercent] movement under which a try bought nothing
 */
export function describeAttempts(attempts, materialPercent = 0.25) {
  const rendered = attempts.filter((a) => a.rendered !== false);
  const distinct = new Set(rendered.map((a) => a.sources?.fingerprint).filter(Boolean)).size;
  const reruns = rendered.filter((a) => a.sameSourcesAsPrevious).length;
  const measured = rendered.filter((a) => typeof a.percent === "number");
  const first = measured[0]?.percent ?? null;
  const lastPercent = measured.length > 0 ? measured[measured.length - 1].percent : null;
  const recent = rendered.filter((a) => a.moved !== null).slice(-2);
  const stalled =
    recent.length === 2 && recent.every((a) => Math.abs(a.moved) < materialPercent);
  return {
    renders: rendered.length,
    distinctSources: distinct,
    reruns,
    first,
    last: lastPercent,
    netMoved: first !== null && lastPercent !== null ? round(lastPercent - first, 3) : null,
    stalled,
    trail: measured.map((a) => a.percent),
  };
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
