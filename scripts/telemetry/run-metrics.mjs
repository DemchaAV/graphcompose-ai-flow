#!/usr/bin/env node
/**
 * scripts/telemetry/run-metrics.mjs — what did this cost?
 *
 *   node scripts/telemetry/run-metrics.mjs start   --project <id> [--workflow create-template]
 *   node scripts/telemetry/run-metrics.mjs report  [--project <id>] [--json] [--status <verdict>]
 *   node scripts/telemetry/run-metrics.mjs finish  [--project <id>]
 *   node scripts/telemetry/run-metrics.mjs cycles  [--json]
 *
 * `start` marks where a workflow began. `report` prints the block a workflow
 * shows at a handoff. `finish` archives the run into the project so dozens of
 * runs can be compared later, not just the one still in front of you.
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
  formatReport,
  latestRevision,
  processedTokens,
  projectCounters,
  readState,
  writeState,
} from "./core.mjs";
import { provider } from "./providers/claude-code.mjs";
import { describeWorkspaceLine, projectDir as workspaceProjectDir, resolveWorkspace } from "../lib/workspace.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/telemetry/run-metrics.mjs <command> [options]\n\n" +
      "  start   --project <id> [--workflow <name>]   mark where a workflow began\n" +
      "  report  [--project <id>] [--json] [--status <verdict>]\n" +
      "  finish  [--project <id>]                     archive the run into the project\n" +
      "  cycles  [--json]                             per-cycle breakdown for this session\n\n" +
      "  --session <id>   override the host session id (default: $CLAUDE_SESSION_ID)\n" +
      "  --root <dir>     workspace override\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage(2);
const command = argv[0];

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

const sessionId = args.session ?? process.env.CLAUDE_SESSION_ID ?? newestSession();

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
    run: state.runStartedAt
      ? { startedAt: state.runStartedAt, usage: usageBetween(state.runStartedAt, null) }
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

/** Main-session usage in a window, plus every subagent transcript recorded. */
function usageBetween(since, until) {
  let total = provider.readUsage(state.transcriptPath, { since, until }).usage;
  for (const extra of state.subagentTranscripts ?? []) {
    total = addUsage(total, provider.readUsage(extra, { since, until }).usage);
  }
  return total.requests === 0 && !state.transcriptPath ? emptyUsage() : total;
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
