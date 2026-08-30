/**
 * scripts/lib/limitations.mjs — what this project has decided it will not fix.
 *
 * ## Why
 *
 * The loop's same-cause bound fired, in the corpus, on one cause above all
 * others: a typeface the bundled families cannot reproduce. revolut-proposal
 * 4/3, shopify-invoice 4/3, the architecture poster 3/3, six more projects at
 * 2/3 — and every review's recorded action was "None available on this line".
 * The bound did its job of stopping the loop; what it stopped was a loop
 * spending its passes on a thing the harness had already declared unfixable,
 * while the defects a person later found — a page number too low, an empty
 * row on the overflow page — waited behind it.
 *
 * A limitation accepted once is a fact about the project, not a mismatch to
 * re-litigate every pass. This file records those facts:
 *
 *     <project>/accepted-limitations.json
 *
 * Each entry names the mismatch ids and/or the (region, cause) pairs it
 * covers, who decided (the user, or the harness on a measurement), and why.
 * `iterate-status` then routes around them — an accepted id is never the
 * focus, never counts toward the same-cause bound, and never blocks READY —
 * and the review may list them as ACCEPTED_LIMITATION without a person having
 * to re-type the reason.
 *
 * The harness may PROPOSE one (`decidedBy: "harness"`) when a measurement
 * settles it — `typography.mjs match` finding no bundled family within reach.
 * It may not decide one about geometry: nothing measures "this cannot be laid
 * out", and a limitation that could have been a fix is the failure this file
 * must not make easier.
 */

import fs from "node:fs";
import path from "node:path";

export const LIMITATIONS_FILE = "accepted-limitations.json";
export const MIN_REASON = 30;

/** Causes the harness itself may accept on a measurement. */
export const HARNESS_ACCEPTABLE_CAUSES = Object.freeze(["TYPOGRAPHY", "ASSET"]);

export class LimitationError extends Error {
  constructor(message) {
    super(`[limitations] ${message}`);
    this.name = "LimitationError";
  }
}

export function limitationsPath(projectDir) {
  return path.join(projectDir, LIMITATIONS_FILE);
}

/**
 * @param {string} projectDir
 * @returns {Array<object>} active entries (retired ones are kept on disk but not returned)
 */
export function readLimitations(projectDir) {
  const all = readAll(projectDir);
  return all.filter((entry) => !entry.retiredAt);
}

export function readAll(projectDir) {
  try {
    const body = JSON.parse(fs.readFileSync(limitationsPath(projectDir), "utf8"));
    return Array.isArray(body?.limitations) ? body.limitations : [];
  } catch {
    return [];
  }
}

function writeAll(projectDir, limitations) {
  const body = {
    schemaVersion: 1,
    $comment:
      "Mismatches this project has decided not to fix, with the reason. iterate-status routes " +
      "around them; review-template lists them as ACCEPTED_LIMITATION. Add with " +
      "`node scripts/limitations.mjs accept …`, never by hand.",
    limitations,
  };
  fs.writeFileSync(limitationsPath(projectDir), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

/**
 * Record one.
 *
 * @param {string} projectDir
 * @param {object} entry
 * @param {string} entry.id stable kebab-case id of the limitation itself
 * @param {string} entry.reason why it is acceptable — at least MIN_REASON characters
 * @param {"user"|"harness"} entry.decidedBy
 * @param {string|null} [entry.cause] one of the mismatch causes (TYPOGRAPHY, ASSET, …)
 * @param {string[]} [entry.mismatchIds] review mismatch ids this covers
 * @param {string[]} [entry.regions] region ids this covers (with `cause`)
 * @param {string|null} [entry.quote] the user's words, when they decided
 * @param {object|null} [entry.measured] what settled it, when the harness decided
 */
export function acceptLimitation(projectDir, entry) {
  if (!entry?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id)) {
    throw new LimitationError(`id must be kebab-case, got ${JSON.stringify(entry?.id)}`);
  }
  const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
  if (reason.length < MIN_REASON) {
    throw new LimitationError(
      `reason must say what was measured or decided and why it is acceptable (at least ${MIN_REASON} characters)`,
    );
  }
  if (entry.decidedBy !== "user" && entry.decidedBy !== "harness") {
    throw new LimitationError('decidedBy must be "user" or "harness"');
  }
  if (entry.decidedBy === "harness" && !HARNESS_ACCEPTABLE_CAUSES.includes(entry.cause)) {
    throw new LimitationError(
      `the harness may only accept ${HARNESS_ACCEPTABLE_CAUSES.join(" or ")} on a measurement; ` +
        `${entry.cause ?? "an unnamed cause"} is a person's decision`,
    );
  }
  const mismatchIds = unique(entry.mismatchIds ?? []);
  const regions = unique(entry.regions ?? []);
  if (mismatchIds.length === 0 && (regions.length === 0 || !entry.cause)) {
    throw new LimitationError("name at least one mismatch id, or a region together with a cause");
  }

  const all = readAll(projectDir);
  const existing = all.find((l) => l.id === entry.id && !l.retiredAt);
  const record = {
    id: entry.id,
    cause: entry.cause ?? null,
    mismatchIds,
    regions,
    reason,
    decidedBy: entry.decidedBy,
    quote: entry.quote ?? null,
    measured: entry.measured ?? null,
    acceptedAt: existing?.acceptedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retiredAt: null,
  };
  const next = existing ? all.map((l) => (l === existing ? record : l)) : [...all, record];
  writeAll(projectDir, next);
  return record;
}

/** A limitation that stops applying — the font arrived, the API landed. */
export function retireLimitation(projectDir, id, note) {
  const all = readAll(projectDir);
  const target = all.find((l) => l.id === id && !l.retiredAt);
  if (!target) throw new LimitationError(`no active limitation named ${id}`);
  if (typeof note !== "string" || note.trim().length < MIN_REASON) {
    throw new LimitationError(`say what changed (at least ${MIN_REASON} characters)`);
  }
  target.retiredAt = new Date().toISOString();
  target.retiredNote = note.trim();
  writeAll(projectDir, all);
  return target;
}

/**
 * Does an accepted limitation cover this mismatch?
 *
 * By id first (the review's `id` or its `rootCause`), then by region + cause
 * when the review recorded both. A limitation with a cause and no regions
 * covers nothing by cause alone: "typography, anywhere" would excuse a wrong
 * face on the heading because a body face was accepted.
 *
 * @param {Array<object>} limitations active entries
 * @param {{ id?: string|null, rootCause?: string|null, region?: string|null, cause?: string|null }} mismatch
 * @returns {object|null} the covering entry
 */
export function coveringLimitation(limitations, mismatch) {
  if (!Array.isArray(limitations) || limitations.length === 0 || !mismatch) return null;
  for (const entry of limitations) {
    if (entry.retiredAt) continue;
    const ids = entry.mismatchIds ?? [];
    if (mismatch.id && ids.includes(mismatch.id)) return entry;
    if (mismatch.rootCause && ids.includes(mismatch.rootCause)) return entry;
    if (
      entry.cause &&
      mismatch.cause === entry.cause &&
      mismatch.region &&
      (entry.regions ?? []).includes(mismatch.region)
    ) {
      return entry;
    }
  }
  return null;
}

function unique(values) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => v.trim()))];
}
