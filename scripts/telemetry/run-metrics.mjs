#!/usr/bin/env node
/**
 * scripts/telemetry/run-metrics.mjs — what did this cost?
 *
 *   node scripts/telemetry/run-metrics.mjs start   --project <id> [--workflow create-template]
 *   node scripts/telemetry/run-metrics.mjs report  [--project <id>] [--json] [--status <verdict>]
 *   node scripts/telemetry/run-metrics.mjs finish  [--project <id>]
 *   node scripts/telemetry/run-metrics.mjs cycles  [--json]
 *   node scripts/telemetry/run-metrics.mjs phases  [--project <id>] [--json]
 *
 * `start` marks where a workflow began. `report` prints the block a workflow
 * shows at a handoff. `finish` archives the run into the project so dozens of
 * runs can be compared later, not just the one still in front of you.
 *
 * `phases` splits the same transcript by phase — setup, discovery, authoring,
 * loop — with the three discovery workers attributed by name. `report` answers
 * "what did this cost"; only `phases` answers "which part of it", which is the
 * question that has to be answered before anything is changed. See phases.mjs.
 *
 * The session id comes from the host, so this is only meaningful inside a
 * session whose hooks have been running. Outside one — a plain shell, a host
 * without hooks — it says so and exits 0. **Telemetry never fails the work it
 * measures**, and a workflow that stopped because a metric was unavailable
 * would be a worse tool than one with no metrics at all.
 */

import fs from "node:fs";
import path from "node:path";

import {
  PROJECT_TELEMETRY_DIR,
  STATE_DIR,
  addUsage,
  elapsed,
  emptyUsage,
  formatDuration,
  formatReport,
  formatTokens,
  latestRevision,
  processedTokens,
  projectCounters,
  readState,
  writeState,
} from "./core.mjs";
import { artifactSizes, foldByPhase, phaseMarkers, renderTiming, resolveMarks, workerNameOf } from "./phases.mjs";
import { workspaceBaseline } from "./baseline.mjs";
import { provider as claudeCode } from "./providers/claude-code.mjs";
import { provider as gemini } from "./providers/gemini.mjs";
import { describeWorkspaceLine, installRoot, projectDir as workspaceProjectDir, resolveWorkspace } from "../lib/workspace.mjs";
import { loadPipelineConfig } from "../lib/pipeline-config.mjs";
import { compareLines } from "../lib/version-resolver.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/telemetry/run-metrics.mjs <command> [options]\n\n" +
      "  start   --project <id> [--workflow <name>]   mark where a workflow began\n" +
      "  report  [--project <id>] [--json] [--status <verdict>]\n" +
      "  finish  [--project <id>]                     archive the run into the project\n" +
      "  cycles  [--json]                             per-cycle breakdown for this session\n" +
      "  phases  [--project <id>] [--json]            per-phase tokens, tool calls, context growth\n" +
      "  baseline [--json] [--root <dir>]             recount the corpus; needs no session\n\n" +
      "  --session <id>   override the host session id (default: $CLAUDE_CODE_SESSION_ID, then the newest session on record)\n" +
      "  --root <dir>     workspace override\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage(2);
const command = argv[0];

/**
 * Parsed events per transcript, read at most once per invocation.
 *
 * A report covers three windows and an archive one per cycle. Parsing per
 * window meant a 37 MB transcript was read three times for a report and N
 * times for an archive — linear in cycles, which is the one place this could
 * have become genuinely slow.
 */
const eventCache = new Map();

const args = { project: null, workflow: null, session: null, root: null, json: false, status: null };
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = argv[++i];
  else if (a === "--workflow") args.workflow = argv[++i];
  else if (a === "--session") args.session = argv[++i];
  else if (a === "--status") args.status = argv[++i];
  else if (a === "--root") args.root = argv[++i];
  else {
    process.stderr.write(`[telemetry] unknown argument: ${a}\n`);
    usage(2);
  }
}

// Before the session lookup on purpose. Everything else here prices one live
// run from the host's own telemetry; this recounts what is on disk, which is
// the property a baseline needs — anyone can re-derive it later, on a machine
// that never saw the session that produced the work.
if (command === "baseline") {
  runBaseline();
  process.exit(0);
}

// Claude Code exports the session to its Bash tool as CLAUDE_CODE_SESSION_ID —
// the same id the hooks receive as `session_id` and this store files under.
// This read `CLAUDE_SESSION_ID`, which nothing sets, so every call fell
// through to newestSession(): fine with one terminal, and with several open
// at once it filed six of eight recorded runs under the wrong project.
const sessionId =
  args.session ??
  process.env.CLAUDE_SESSION_ID ??
  process.env.CLAUDE_CODE_SESSION_ID ??
  newestSession();

if (!sessionId) {
  // Not an error: plenty of legitimate ways to be here.
  process.stdout.write(
    "[telemetry] no session on record. Metrics need the harness hooks, which run " +
      "inside a host session; pass --session <id> if you know it.\n",
  );
  process.exit(0);
}

const state = readState(sessionId);
if (!state) {
  process.stdout.write(`[telemetry] no state for session ${sessionId}\n`);
  process.exit(0);
}

/**
 * Which host's transcript this is. The checkpoint writer records it, because
 * only the host knows; state files written before it did are Claude Code's,
 * which is the only host that had hooks then. Parsing a Gemini transcript with
 * Claude's reader would report zeros — a run that looks free invites exactly
 * the wrong conclusion, so the host is read rather than assumed.
 */
const PROVIDERS = { "claude-code": claudeCode, gemini };
const provider = PROVIDERS[state.host] ?? claudeCode;

if (command === "start") {
  if (!args.project) usage(2);
  writeState(sessionId, {
    runStartedAt: new Date().toISOString(),
    runProject: args.project,
    runWorkflow: args.workflow ?? null,
  });
  process.stdout.write(`[telemetry] run started for ${args.project}\n`);
  process.exit(0);
}

if (command === "report" || command === "finish") {
  const report = buildReport();
  if (command === "finish") archive(report);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(report)}\n`);
  }
  process.exit(0);
}

if (command === "phases") {
  const report = buildPhaseReport();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatPhaseReport(report)}\n`);
  }
  process.exit(0);
}

if (command === "cycles") {
  const cycles = (state.cycles ?? []).map((cycle) => ({
    prompt: cycle.prompt,
    startedAt: cycle.startedAt,
    finishedAt: cycle.finishedAt,
    durationMs: cycle.finishedAt ? elapsed(cycle.startedAt, cycle.finishedAt) : elapsed(cycle.startedAt),
    usage: usageBetween(cycle.startedAt, cycle.finishedAt),
  }));
  if (args.json) {
    process.stdout.write(`${JSON.stringify(cycles, null, 2)}\n`);
  } else {
    for (const cycle of cycles) {
      const first = (cycle.prompt ?? "").split("\n")[0].slice(0, 60) || "(no prompt recorded)";
      process.stdout.write(
        `  ${first}\n    ${Math.round((cycle.durationMs ?? 0) / 1000)}s · ` +
          `${processedTokens(cycle.usage)} processed · ${cycle.usage.requests} requests\n`,
      );
    }
  }
  process.exit(0);
}

process.stderr.write(`[telemetry] unknown command: ${command}\n`);
usage(2);

// ----------------------------------------------------------------- building ---

function buildReport() {
  const cycles = state.cycles ?? [];
  const current = cycles[cycles.length - 1] ?? null;
  const projectId = args.project ?? state.runProject ?? null;
  const runStartedAt = state.runStartedAt ?? cycles[0]?.startedAt ?? null;

  let counters = null;
  let revision = null;
  if (projectId) {
    try {
      const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
      const dir = workspaceProjectDir(workspace, projectId);
      if (fs.existsSync(dir)) {
        counters = projectCounters(dir);
        revision = latestRevision(dir);
      }
    } catch {
      // A bad project id should not cost the caller its timings.
    }
  }

  return {
    sessionId,
    project: projectId,
    workflow: state.runWorkflow ?? null,
    revision,
    status: args.status ?? null,
    provider: provider.name,
    cycle: current
      ? {
          prompt: current.prompt,
          startedAt: current.startedAt,
          finishedAt: current.finishedAt,
          usage: usageBetween(current.startedAt, current.finishedAt),
        }
      : null,
    // `start` marks where a workflow began, but nothing forces it to be called
    // and the first real run showed exactly that: four sessions on disk, not
    // one with runStartedAt. Falling back to the first cycle means the run
    // clock still says something true — the work began when the user first
    // spoke — instead of the whole block vanishing.
    run: runStartedAt
      ? {
          startedAt: runStartedAt,
          inferred: !state.runStartedAt,
          usage: usageBetween(runStartedAt, null),
        }
      : null,
    session: {
      startedAt: state.sessionStartedAt ?? provider.sessionStart(state.transcriptPath),
      usage: usageBetween(null, null),
    },
    subagents: state.subagents ?? 0,
    counters,
    // Said plainly because a figure that looks final and is not would be worse
    // than no figure: the host writes its transcript asynchronously, so the
    // response being composed right now is not in these numbers yet.
    note: "Usage is as far as the transcript has been written; the current response is not counted yet.",
  };
}

/**
 * Per-phase attribution for the current run.
 *
 * Everything here degrades to null rather than to zero. A phase table produced
 * from a transcript with no usage in it would be a plausible-looking answer to
 * a question the host cannot answer, and the whole point of splitting the run
 * this way is to make it possible to be wrong about which phase is expensive.
 */
function buildPhaseReport() {
  const projectId = args.project ?? state.runProject ?? null;
  const runStartedAt = state.runStartedAt ?? (state.cycles ?? [])[0]?.startedAt ?? null;

  let projectPaths = null;
  try {
    const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
    if (projectId) {
      const dir = workspaceProjectDir(workspace, projectId);
      if (fs.existsSync(dir)) {
        const revision = latestRevision(dir);
        projectPaths = { dir, revisionDir: revision ? path.join(dir, "revisions", revision) : null, revision };
      }
    }
  } catch {
    /* a bad project id costs the caller its artifact sizes, not its tokens */
  }

  const events = eventsOf(state.transcriptPath).filter((e) => {
    if (!runStartedAt || e.atMs === null) return true;
    return e.atMs >= Date.parse(runStartedAt);
  });

  let config = null;
  try {
    config = loadPipelineConfig({ repoRoot: installRoot() });
  } catch {
    /* the markers have defaults; a broken config should not cost a report */
  }

  // A recorded handoff is an exact boundary, so it wins over the inferred one.
  const recorded = [];
  if (projectPaths?.revisionDir) {
    try {
      const handoff = JSON.parse(fs.readFileSync(path.join(projectPaths.revisionDir, "handoff.json"), "utf8"));
      if (handoff.validatedAt && handoff.nextPhase) {
        recorded.push({ phase: handoff.nextPhase, atMs: Date.parse(handoff.validatedAt) });
      }
    } catch {
      /* no handoff, so the marker tools stand alone */
    }
  }
  const { marks, source: markSource } = resolveMarks(events, phaseMarkers(config), recorded);

  const hasUsage = events.some((e) => processedTokens(e.usage) > 0);
  const phases = hasUsage ? foldByPhase(events, marks) : null;

  // Workers are attributed by the name the host put in their transcript file.
  // An unnamed subagent transcript is reported under "(unnamed)" rather than
  // being folded into the coordinator, where it would look like main-thread cost.
  const workers = [];
  for (const extra of state.subagentTranscripts ?? []) {
    const workerEvents = eventsOf(extra);
    if (workerEvents.length === 0) continue;
    const folded = provider.foldEvents(workerEvents, { since: runStartedAt, until: null });
    workers.push({
      worker: workerNameOf(extra) ?? "(unnamed)",
      transcript: extra,
      requests: folded.usage.requests,
      usage: folded.usage,
      processedTokens: processedTokens(folded.usage),
      toolCalls: workerEvents.reduce((a, e) => a + (e.tools?.length ?? 0), 0),
      durationMs:
        folded.firstAt && folded.lastAt ? Date.parse(folded.lastAt) - Date.parse(folded.firstAt) : null,
    });
  }

  const coordinator = hasUsage
    ? provider.foldEvents(events, { since: null, until: null, includeSidechains: true }).usage
    : null;

  return {
    sessionId,
    project: projectId,
    revision: projectPaths?.revision ?? null,
    provider: provider.name,
    runStartedAt,
    markSource,
    // Said plainly: a null is "the host did not tell us", not "it was free".
    tokenTelemetry: hasUsage ? "available" : "unavailable — this host's transcript carries no usage",
    coordinator: coordinator
      ? { requests: coordinator.requests, usage: coordinator, processedTokens: processedTokens(coordinator) }
      : null,
    phases,
    workers,
    artifacts: projectPaths?.revisionDir ? artifactSizes(projectPaths.revisionDir) : null,
    render: projectPaths?.dir ? renderTiming(projectPaths.dir) : null,
  };
}

function formatPhaseReport(report) {
  const lines = [`Phase metrics — ${report.project ?? "(no project)"}${report.revision ? ` / ${report.revision}` : ""}`];
  lines.push(`  segmentation: ${report.markSource}`);

  if (!report.phases) {
    lines.push("", `  ${report.tokenTelemetry}`);
    lines.push("  Phase token figures are omitted rather than reported as zero.");
  } else {
    lines.push("", "  phase        reqs   output   cache-read   share   tools   ctx grown    wall");
    for (const p of report.phases) {
      lines.push(
        `  ${p.phase.padEnd(12)}${String(p.requests).padStart(4)}` +
          `${formatTokens(p.usage.outputTokens).padStart(9)}` +
          `${formatTokens(p.usage.cacheReadTokens).padStart(13)}` +
          `${(p.shareOfCacheRead === null ? "-" : `${(p.shareOfCacheRead * 100).toFixed(1)}%`).padStart(8)}` +
          `${String(p.toolCalls).padStart(8)}` +
          `${(p.contextGrowth === null ? "-" : `+${formatTokens(p.contextGrowth)}`).padStart(12)}` +
          `${formatDuration(p.durationMs).padStart(8)}`,
      );
    }
    // A request that came back with no usage is a request and not a
    // measurement — an API error, a usage limit, a cancelled turn. Said out
    // loud, because a run that was cut short should not read like a complete one.
    const unmeasured = report.phases.reduce((a, p) => a + (p.unmeasured ?? 0), 0);
    if (unmeasured > 0) {
      lines.push(
        "",
        `  ${unmeasured} request(s) returned no usage — an error, a usage limit or a cancelled turn.`,
        "  They are counted as requests and excluded from the context figures.",
      );
    }
  }

  if (report.workers.length > 0) {
    lines.push("", "  worker        reqs   output   cache-read   tools    wall");
    for (const w of report.workers) {
      lines.push(
        `  ${w.worker.padEnd(13)}${String(w.requests).padStart(4)}` +
          `${formatTokens(w.usage.outputTokens).padStart(9)}` +
          `${formatTokens(w.usage.cacheReadTokens).padStart(13)}` +
          `${String(w.toolCalls).padStart(8)}` +
          `${formatDuration(w.durationMs).padStart(8)}`,
      );
    }
    if (report.coordinator) {
      const workerRead = report.workers.reduce((a, w) => a + w.usage.cacheReadTokens, 0);
      const all = report.coordinator.usage.cacheReadTokens + workerRead;
      if (all > 0) {
        lines.push(
          "",
          `  workers are ${((workerRead / all) * 100).toFixed(1)}% of this run's cache-read ` +
            `(${formatTokens(workerRead)} of ${formatTokens(all)})`,
        );
      }
    }
  }

  if (report.artifacts) {
    const written = Object.entries(report.artifacts).filter(([, size]) => size !== null);
    if (written.length > 0) {
      lines.push("", `  artifacts: ${written.map(([n, s]) => `${n} ${(s / 1024).toFixed(1)}KB`).join(" · ")}`);
    }
  }
  if (report.render) {
    const ttf = report.render.timeToFirstRenderMs;
    lines.push(
      "",
      `  renders: ${report.render.renders} · time to first render: ${ttf === null ? "not recorded" : formatDuration(ttf)}`,
    );
  }
  return lines.join("\n");
}

function eventsOf(transcriptPath) {
  if (!transcriptPath) return [];
  if (!eventCache.has(transcriptPath)) {
    eventCache.set(transcriptPath, provider.readEvents(transcriptPath));
  }
  return eventCache.get(transcriptPath);
}

/** Main-session usage in a window, plus every subagent transcript recorded. */
/**
 * Recount the corpus, for the record.
 *
 * The layout-diagnostics work is an investment, and the only honest way to find
 * out afterwards whether it helped is to have written down what things looked
 * like first, with a date on it.
 */
function runBaseline() {
  const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
  const banner = describeWorkspaceLine(workspace);
  if (banner && !args.json) process.stdout.write(`${banner}\n`);

  // The manual-construction rule in the lint is gated on the pinned pack, so the
  // count depends on which pack is read. An unreadable one yields an empty set,
  // which makes that rule silent rather than wrong.
  let primitives = new Set();
  try {
    const packs = fs
      .readdirSync(path.join(repoRoot, "skills", "versions"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
      .map((e) => e.name)
      .sort((a, b) => compareLines(a.slice(13), b.slice(13)));
    const surface = path.join(repoRoot, "skills", "versions", packs[packs.length - 1], "00-api-surface.md");
    const source = fs.readFileSync(surface, "utf8");
    primitives = new Set([...source.matchAll(/^- `[^`]*?\b(\w+)\s*\(/gm)].map((m) => m[1]));
  } catch {
    /* telemetry never fails the work it measures */
  }

  const { projects, totals } = workspaceBaseline(workspace.projectsDir, { primitives });

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ measuredAt: new Date().toISOString(), totals, projects }, null, 2)}\n`,
    );
    return;
  }

  if (!projects.length) {
    process.stdout.write("[telemetry] no projects in this workspace to count\n");
    return;
  }

  const pad = (value, width) => String(value ?? "-").padStart(width);
  process.stdout.write(`\nCorpus baseline — ${projects.length} project(s)\n\n`);
  process.stdout.write("  project                     revs  rend  fail  edits  churn  smells   neg\n");
  for (const p of projects) {
    process.stdout.write(
      `  ${p.project.padEnd(26)}${pad(p.revisions, 5)}${pad(p.renders, 6)}` +
        `${pad(p.failedRevisions, 6)}${pad(p.javaEdits, 7)}${pad(p.insetChurnPerRevision, 7)}` +
        `${pad(p.structuralSmells.total, 8)}${pad(p.negativeInsets, 6)}\n`,
    );
  }
  process.stdout.write(
    `\n  totals: ${totals.revisions} revisions, ${totals.renders} renders, ` +
      `${totals.failedRevisions} FAILED, ${totals.structuralSmells} structural smell(s), ` +
      `${totals.negativeInsets} negative inset(s)\n`,
  );
  process.stdout.write(
    `  iteration counts recorded on ${totals.iterationsRecorded} of ${totals.revisions} revisions\n`,
  );
  process.stdout.write(
    "\n  Not measured here, and deliberately null rather than approximated:\n" +
      "  renders per geometry correction, and whether the owner was right first time.\n" +
      "  Both need the loop to record what a pass was trying to fix.\n\n",
  );
}

function usageBetween(since, until) {
  if (!state.transcriptPath) return emptyUsage();
  let total = provider.foldEvents(eventsOf(state.transcriptPath), { since, until }).usage;
  for (const extra of state.subagentTranscripts ?? []) {
    total = addUsage(total, provider.foldEvents(eventsOf(extra), { since, until }).usage);
  }
  return total;
}

/**
 * Write the run into the project, so a later question — "did this get faster?"
 * — has more than one data point to answer from.
 */
function archive(report) {
  if (!report.project) return;
  try {
    const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
    const dir = path.join(workspaceProjectDir(workspace, report.project), PROJECT_TELEMETRY_DIR);
    fs.mkdirSync(dir, { recursive: true });

    const stamp = (state.runStartedAt ?? new Date().toISOString())
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "")
      .replace("T", "-");
    const file = path.join(dir, `run-${stamp}.json`);

    const cycles = (state.cycles ?? []).map((cycle) => ({
      prompt: cycle.prompt,
      startedAt: cycle.startedAt,
      finishedAt: cycle.finishedAt,
      usage: usageBetween(cycle.startedAt, cycle.finishedAt),
    }));

    fs.writeFileSync(file, `${JSON.stringify({ ...report, cycles }, null, 2)}\n`, "utf8");
    const banner = describeWorkspaceLine(workspace);
    if (banner) process.stdout.write(`${banner}\n`);
    process.stdout.write(`[telemetry] archived ${file}\n`);
  } catch {
    /* never load-bearing */
  }
}

/** The most recently touched session, so a plain shell can still report. */
function newestSession() {
  try {
    const files = fs
      .readdirSync(STATE_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ f, at: fs.statSync(path.join(STATE_DIR, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    return files.length > 0 ? files[0].f.replace(/\.json$/, "") : null;
  } catch {
    return null;
  }
}
