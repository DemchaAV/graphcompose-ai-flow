#!/usr/bin/env node
/**
 * scripts/telemetry/phases.mjs — where a run's tokens actually went.
 *
 * ## Why the three-clock report was not enough
 *
 * `run-metrics report` prices cycle, run and session. All three are windows of
 * wall-clock time, and a create run is one cycle: the user says "make this",
 * and 328 requests later there is a template. The report could say the run cost
 * 129M cache-read tokens and could not say whether that was the fan-out, the
 * analysis or the loop — which is the only question worth asking before
 * changing anything.
 *
 * Segmenting the same transcript by phase answers it. On two recorded runs:
 *
 *   phase             run 1              run 2
 *   discovery         14.5%              2.8%
 *   authoring+loop    84.1%              95.8%
 *   the 3 workers      3.0%              0.0%
 *
 * ## Carry cost, which is the figure that explains the others
 *
 * Tokens are not spent where they are read; they are spent on every request
 * *after* they enter the context. A 4.7k-token reference page loaded at request
 * 28 and still there at request 340 costs 4.7k x 312 = 1.5M cache-read. So this
 * reports, per phase, both the tokens billed inside it and the context it
 * *handed to the phases after it* — because that is the number a context
 * boundary changes and the flat total is not.
 *
 * ## Segmentation, and saying how it was derived
 *
 * Marks come from two sources, best first:
 *
 *   handoff.json   an exact timestamp for a boundary the harness recorded
 *   marker tools   the first call to a stage's declared `tool` in
 *                  config/pipeline.json — deterministic config, not a guess
 *
 * Every report says which it used. A number whose derivation is not stated
 * invites being quoted as if it were exact.
 *
 * ## When the host does not expose any of this
 *
 * Nulls, never zeros — the rule `providers/codex.mjs` already follows. A run
 * that looks free invites exactly the wrong conclusion, and so does a phase
 * breakdown invented from a transcript that carries no usage.
 */

import fs from "node:fs";
import path from "node:path";

import { addUsage, emptyUsage, processedTokens } from "./core.mjs";

/** Phases, in the order a create run passes through them. */
export const PHASES = Object.freeze(["setup", "discovery", "authoring", "loop"]);

/**
 * Which tool opens each phase. Read from the pipeline config where it declares
 * one, so a stage that changes its tool does not leave this reading the old
 * name; the fallbacks are the commands those stages have always run.
 */
export function phaseMarkers(config = null) {
  const stages = config?.stages ?? {};
  const base = (id, fallback) => escapeForRegExp(path.basename(stages[id]?.tool ?? fallback));
  const handoff = base("handoff", "scripts/handoff.mjs");
  const render = base("testRender", "scripts/render-and-diff.mjs");
  return [
    { phase: "setup", match: /preflight\.mjs|init-workspace\.mjs|import-reference\.mjs/ },
    // Any reference.mjs subcommand, not `analyze` alone: one recorded run
    // opened discovery with `reference.mjs bands`, and a marker that names one
    // of a tool's subcommands reports the phase as never having happened.
    { phase: "discovery", match: /reference\.mjs\b|check-analysis\.mjs\b|asset-resolver/ },
    // The Write/Edit of the template, or the handoff that precedes it. Anchored
    // on the tool name because the bare filename also appears in a `cat` of
    // another project's template, which is a thing a run does while planning
    // and is not the moment authoring began.
    { phase: "authoring", match: new RegExp(`${handoff}\\s+write|^(?:Write|Edit|MultiEdit):.*generated-template\\.java`) },
    // pass.mjs is what a loop pass is actually typed as; it calls render-and-diff.
    { phase: "loop", match: new RegExp(`pass\\.mjs\\b|${render}`) },
  ];
}

function escapeForRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The timestamp each phase opened, in phase order and never going backwards.
 *
 * A marker can legitimately appear early — a run reads another project's
 * template while planning, and `pass.mjs` shows up in a page it printed. Taking
 * the first hit *at or after* the previous phase's opening is what keeps one
 * stray line from re-ordering the whole segmentation.
 *
 * `recorded` marks — a handoff's own timestamp — are exact and win over any
 * inferred hit for the same phase.
 *
 * @returns {{marks: Array<{phase: string, atMs: number}>, source: string}}
 */
export function resolveMarks(events, markers, recorded = []) {
  const exact = new Map();
  for (const mark of recorded) {
    if (mark && typeof mark.phase === "string" && Number.isFinite(mark.atMs)) exact.set(mark.phase, mark.atMs);
  }

  const marks = [];
  let floor = -Infinity;
  for (const marker of markers) {
    const pinned = exact.get(marker.phase);
    if (pinned !== undefined && pinned >= floor) {
      marks.push({ phase: marker.phase, atMs: pinned });
      floor = pinned;
      continue;
    }
    const hit = events.find(
      (e) => Number.isFinite(e.atMs) && e.atMs >= floor && (e.tools ?? []).some((t) => marker.match.test(t)),
    );
    if (!hit) continue;
    marks.push({ phase: marker.phase, atMs: hit.atMs });
    floor = hit.atMs;
  }
  return {
    marks,
    source: exact.size > 0 ? "handoff.json (recorded) + marker tools" : "marker tools (config/pipeline.json)",
  };
}

/**
 * A worker's name, from whatever the host recorded beside its transcript.
 *
 * Two conventions, both seen on real runs of the same host, which is why this
 * tries both rather than picking one:
 *
 *   agent-a<name>-<16 hex>.jsonl   the name is in the filename
 *   agent-a<16 hex>.meta.json      the name is in a sidecar, as `name`
 *
 * A run measured with only the first read three named discovery workers as
 * "(unnamed)" and could not report the worker share at all. The sidecar is
 * authoritative where it exists; the filename is the fallback; null means the
 * spawn genuinely carried no name, and it is reported as such rather than
 * folded into the coordinator, where it would look like main-thread cost.
 */
export function workerNameOf(transcriptPath) {
  const file = String(transcriptPath ?? "");
  if (!file) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    if (typeof meta?.name === "string" && meta.name.trim()) return meta.name.trim();
  } catch {
    /* no sidecar, or not readable — fall through to the filename */
  }
  const named = path.basename(file).match(/^agent-a([a-z][a-z0-9-]*?)-[0-9a-f]{16}\.jsonl$/i);
  return named ? named[1] : null;
}

/**
 * Turn parsed usage events into one row per phase.
 *
 * Pure, so the tests can drive it with a handful of synthetic events rather
 * than a 31 MB fixture.
 *
 * @param {Array<{atMs: number|null, usage: object, context?: number, tools?: string[]}>} events
 *   in transcript order; `context` is the request's total input (cache read +
 *   cache write + input), i.e. how big the conversation was at that moment.
 * @param {Array<{phase: string, atMs: number}>} marks phase openings, any order
 * @returns {Array<object>} one row per phase that had at least one request
 */
export function foldByPhase(events, marks) {
  const ordered = [...marks].filter((m) => Number.isFinite(m.atMs)).sort((a, b) => a.atMs - b.atMs);
  const rows = new Map();

  const phaseAt = (atMs) => {
    if (!Number.isFinite(atMs)) return ordered[0]?.phase ?? "setup";
    let current = "setup";
    for (const mark of ordered) {
      if (mark.atMs <= atMs) current = mark.phase;
      else break;
    }
    return current;
  };

  for (const event of events) {
    const phase = phaseAt(event.atMs);
    const row = rows.get(phase) ?? {
      phase,
      requests: 0,
      usage: emptyUsage(),
      toolCalls: 0,
      unmeasured: 0,
      firstAtMs: null,
      lastAtMs: null,
      contextStart: null,
      contextEnd: null,
    };
    row.requests += 1;
    row.usage = addUsage(row.usage, event.usage);
    row.toolCalls += event.tools?.length ?? 0;
    if (Number.isFinite(event.atMs)) {
      if (row.firstAtMs === null || event.atMs < row.firstAtMs) row.firstAtMs = event.atMs;
      if (row.lastAtMs === null || event.atMs > row.lastAtMs) row.lastAtMs = event.atMs;
    }
    // A request that came back with no usage at all — an API error, a usage
    // limit, a cancelled turn — is a request, and it is not a measurement of
    // anything. Treating its context as 0 made a real run's growth read as
    // "+0" after two limit-refused turns landed at the end of the transcript:
    // contextEnd took the zero, and 125.5k of growth disappeared.
    if (Number.isFinite(event.context) && event.context > 0) {
      if (row.contextStart === null) row.contextStart = event.context;
      row.contextEnd = event.context;
    } else {
      row.unmeasured += 1;
    }
    rows.set(phase, row);
  }

  const out = [...rows.values()].sort((a, b) => (a.firstAtMs ?? 0) - (b.firstAtMs ?? 0));
  const totalCacheRead = out.reduce((a, r) => a + r.usage.cacheReadTokens, 0);
  for (const row of out) {
    row.durationMs = row.firstAtMs !== null && row.lastAtMs !== null ? row.lastAtMs - row.firstAtMs : null;
    row.processedTokens = processedTokens(row.usage);
    row.shareOfCacheRead = totalCacheRead > 0 ? row.usage.cacheReadTokens / totalCacheRead : null;
    // What this phase added to the context every later phase then re-read. The
    // flat total says a phase was cheap; this says what it made the next one
    // cost, which is the figure a context boundary moves.
    row.contextGrowth =
      row.contextStart !== null && row.contextEnd !== null ? Math.max(0, row.contextEnd - row.contextStart) : null;
    delete row.firstAtMs;
    delete row.lastAtMs;
  }
  return out;
}

/**
 * Bytes on disk for the artifacts a phase produced.
 *
 * Deliberately from the filesystem rather than from the transcript: an artifact
 * is what is on disk, and a run whose telemetry is missing can still be asked
 * how big its discovery output was.
 */
export function artifactSizes(revisionDir) {
  const names = [
    "visual-analysis.json",
    "asset-request.json",
    "assets-manifest.json",
    "architecture-plan.json",
    "handoff.json",
  ];
  const sizes = {};
  for (const name of names) {
    const file = path.join(revisionDir, name);
    try {
      sizes[name] = fs.statSync(file).size;
    } catch {
      sizes[name] = null;
    }
  }
  try {
    const data = fs.readdirSync(revisionDir).filter((f) => /-data\.json$/.test(f)).sort()[0];
    sizes["<doc-kind>-data.json"] = data ? fs.statSync(path.join(revisionDir, data)).size : null;
  } catch {
    sizes["<doc-kind>-data.json"] = null;
  }
  return sizes;
}

/**
 * Render iterations and time to first render, from the project on disk.
 *
 * `renders` counts revisions that produced an `output.pdf`; `firstRenderMs` is
 * measured from `openedAt` on the first revision to the mtime of the first
 * render — the figure the concurrent asset resolution was meant to move, and
 * one nothing was reporting.
 */
export function renderTiming(projectDir) {
  const revisionsDir = path.join(projectDir, "revisions");
  let revisions;
  try {
    revisions = fs
      .readdirSync(revisionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^revision-\d+$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return { renders: 0, firstRenderAt: null, projectOpenedAt: null, timeToFirstRenderMs: null };
  }

  let renders = 0;
  let firstRenderMs = null;
  for (const id of revisions) {
    const pdf = path.join(revisionsDir, id, "output.pdf");
    try {
      const stat = fs.statSync(pdf);
      renders += 1;
      if (firstRenderMs === null) firstRenderMs = stat.mtimeMs;
    } catch {
      /* a revision with no render contributes nothing */
    }
  }

  let openedMs = null;
  try {
    const first = JSON.parse(fs.readFileSync(path.join(revisionsDir, revisions[0], "revision.json"), "utf8"));
    const at = first.openedAt ?? first.createdAt ?? null;
    openedMs = at ? Date.parse(at) : null;
  } catch {
    /* no record, so no figure — never a zero */
  }

  return {
    renders,
    firstRenderAt: firstRenderMs ? new Date(firstRenderMs).toISOString() : null,
    projectOpenedAt: openedMs ? new Date(openedMs).toISOString() : null,
    timeToFirstRenderMs:
      Number.isFinite(openedMs) && Number.isFinite(firstRenderMs) && firstRenderMs >= openedMs
        ? firstRenderMs - openedMs
        : null,
  };
}
