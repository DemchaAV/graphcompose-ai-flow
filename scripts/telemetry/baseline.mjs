/**
 * scripts/telemetry/baseline.mjs — what the corpus looks like before the
 * diagnostics work.
 *
 * The layout-diagnostics plan is an investment: a real layout snapshot out of
 * the engine, an inspector, a diff, evidence packages. The only honest way to
 * find out afterwards whether any of it helped is to write down what things
 * looked like first, with a date on it. Without that, every later claim is
 * "it feels faster".
 *
 * This measures the **corpus**, not a session. `run-metrics.mjs report` already
 * prices one run from the host's own telemetry; that needs a live session with
 * hooks running, so it cannot be re-derived later and cannot cover projects
 * authored months ago. What is on disk can be recounted at any time by anyone,
 * which is the property a baseline needs.
 *
 * ## What it deliberately does not claim to measure
 *
 * Item 35 of the plan names two headline metrics: *visual mismatch → correct
 * owner identified on first attempt*, and *average renders per geometry
 * correction*. Neither is derivable from the files a revision leaves behind.
 * Both need the loop to record, per pass, which region it was trying to fix and
 * which property it changed — instrumentation that arrives with the layout diff
 * and the evidence packages. They are reported as `null` here rather than
 * approximated, because a number that is nearly the thing you wanted is worse
 * than a blank: it gets quoted later as if it were the thing.
 *
 * Telemetry never fails the work it measures. Everything here degrades to a
 * null field rather than throwing.
 */

import fs from "node:fs";
import path from "node:path";

import { checkStructuralSmells, insetCalls } from "../lib/structural-smells.mjs";
import { projectCounters } from "./core.mjs";

/** The generated template in a revision, or null. */
function templateOf(revisionDir) {
  if (!fs.existsSync(revisionDir)) return null;
  const candidates = fs
    .readdirSync(revisionDir)
    .filter((name) => name.endsWith(".java") && !/Test\.java$/i.test(name));
  if (!candidates.length) return null;
  const biggest = candidates
    .map((name) => ({ name, size: fs.statSync(path.join(revisionDir, name)).size }))
    .sort((a, b) => b.size - a.size)[0];
  try {
    return fs.readFileSync(path.join(revisionDir, biggest.name), "utf8");
  } catch {
    return null;
  }
}

function readJsonOr(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Revision ids in order, oldest first. */
function revisionIds(projectDir) {
  const dir = path.join(projectDir, "revisions");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^revision-\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * How much of the template changed between two revisions, counted in inset
 * calls added or removed.
 *
 * A proxy for "changed properties per revision", and labelled as one. The real
 * question — how many properties a pass had to touch to fix one mismatch —
 * needs the loop to say what it was fixing. This says how much geometry moved,
 * which is the part visible from disk.
 */
function insetChurn(before, after) {
  if (before === null || after === null) return null;
  const bag = (source) => {
    const counts = new Map();
    for (const { kind, args } of insetCalls(source)) {
      const key = `${kind}(${args.replace(/\s+/g, "")})`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const a = bag(before);
  const b = bag(after);
  let churn = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    churn += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  }
  return churn;
}

/**
 * The structural picture of one project.
 *
 * @param {string} projectDir
 * @param {{primitives?: Set<string>}} [options]
 */
export function projectBaseline(projectDir, { primitives = new Set() } = {}) {
  const project = path.basename(projectDir);
  const ids = revisionIds(projectDir);
  const counters = projectCounters(projectDir);

  let approved = 0;
  let iterationsRecorded = 0;
  let maxIteration = null;
  let firstCreatedAt = null;
  let firstApprovedAt = null;
  let javaEdits = 0;
  const churn = [];
  let previousTemplate = null;

  for (const id of ids) {
    const revisionDir = path.join(projectDir, "revisions", id);
    const record = readJsonOr(path.join(revisionDir, "revision.json"), {});

    if (record.status === "APPROVED") {
      approved += 1;
      if (!firstApprovedAt && record.createdAt) firstApprovedAt = record.createdAt;
    }
    if (Number.isInteger(record.iteration)) {
      iterationsRecorded += 1;
      maxIteration = Math.max(maxIteration ?? 0, record.iteration);
    }
    if (!firstCreatedAt && record.createdAt) firstCreatedAt = record.createdAt;

    const template = templateOf(revisionDir);
    if (template !== null && previousTemplate !== null && template !== previousTemplate) javaEdits += 1;
    const moved = insetChurn(previousTemplate, template);
    if (moved !== null) churn.push(moved);
    if (template !== null) previousTemplate = template;
  }

  // The newest template is the state the project is in now, and the one a later
  // comparison will be against.
  const latest = ids.length ? templateOf(path.join(projectDir, "revisions", ids[ids.length - 1])) : null;
  const findings = latest === null ? [] : checkStructuralSmells({ source: latest, primitives });
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

  const negativeInsets =
    latest === null ? 0 : insetCalls(latest).filter(({ args }) => /-\s*\d/.test(args)).length;

  return {
    project,
    revisions: counters.revisions,
    renders: counters.renders,
    visualReviews: counters.visualReviews,
    failedRevisions: counters.failedRevisions,
    approved,
    iterationsRecorded,
    maxIteration,
    daysToFirstApproved: elapsedDays(firstCreatedAt, firstApprovedAt),
    javaEdits,
    insetChurnPerRevision: churn.length ? round(churn.reduce((a, b) => a + b, 0) / churn.length) : null,
    structuralSmells: { total: findings.length, byKind },
    negativeInsets,

    // Filled in when the loop can say what a pass was trying to fix. Reported
    // as null rather than approximated: a number that is nearly the thing you
    // wanted gets quoted later as if it were the thing.
    rendersPerGeometryCorrection: null,
    ownerCorrectOnFirstAttempt: null,
    collateralNodesPerRevision: null,
  };
}

function elapsedDays(from, to) {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? round(ms / 86_400_000) : null;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/** Every project under a workspace, plus the totals a comparison needs. */
export function workspaceBaseline(projectsDir, { primitives = new Set() } = {}) {
  if (!fs.existsSync(projectsDir)) return { projects: [], totals: emptyTotals() };

  const projects = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => projectBaseline(path.join(projectsDir, e.name), { primitives }))
    .sort((a, b) => a.project.localeCompare(b.project));

  const totals = emptyTotals();
  for (const p of projects) {
    totals.projects += 1;
    totals.revisions += p.revisions;
    totals.renders += p.renders;
    totals.failedRevisions += p.failedRevisions;
    totals.iterationsRecorded += p.iterationsRecorded;
    totals.javaEdits += p.javaEdits;
    totals.negativeInsets += p.negativeInsets;
    totals.structuralSmells += p.structuralSmells.total;
    for (const [kind, n] of Object.entries(p.structuralSmells.byKind)) {
      totals.byKind[kind] = (totals.byKind[kind] ?? 0) + n;
    }
  }
  return { projects, totals };
}

function emptyTotals() {
  return {
    projects: 0,
    revisions: 0,
    renders: 0,
    failedRevisions: 0,
    iterationsRecorded: 0,
    javaEdits: 0,
    negativeInsets: 0,
    structuralSmells: 0,
    byKind: {},
  };
}
