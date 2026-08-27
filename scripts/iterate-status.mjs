#!/usr/bin/env node
/**
 * scripts/iterate-status.mjs — may this loop take another pass?
 *
 *   node scripts/iterate-status.mjs <project-id> [--revision <id>] [--root <workspace>] [--json]
 *
 * Counts the current loop from the revisions on disk and answers with one of
 * three verdicts. The point is that the answer is arithmetic: an agent deciding
 * for itself whether it has been going round in circles is exactly the
 * judgement a circling agent has already lost.
 *
 * Exit codes, so a workflow skill can branch without parsing prose:
 *
 *   0  READY_FOR_APPROVAL          stop and hand over to the user
 *   2  REVISE                      keep going; fix the one named mismatch
 *   4  CONVERGENCE_LIMIT_REACHED   the loop spent its budget with work still
 *                                  open: a document exists, and a person decides
 *   3  BLOCKED                     no usable document can be produced; the
 *                                  failure category says why
 *
 * The last two were one verdict until a run reached a finished-looking CV, hit
 * its same-cause bound, and was reported as unable to make progress - which then
 * refused the approval the user had already given.
 */

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadPipelineConfig } from "./lib/pipeline-config.mjs";
import { computeIterationStatus, IterationStatusError } from "./lib/iteration-status.mjs";
import { elapsed, formatDuration, formatTokens, processedTokens } from "./telemetry/core.mjs";
import {
  describeWorkspaceLine,
  installRoot,
  requireProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const EXIT = { READY_FOR_APPROVAL: 0, REVISE: 2, BLOCKED: 3, CONVERGENCE_LIMIT_REACHED: 4 };

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/iterate-status.mjs <project-id> [--revision <id>] [--root <workspace>] [--json]\n\n" +
      "  --revision <id>   default: the project's current draft\n" +
      "  --root <dir>      workspace holding the project\n" +
      "  --json            print the full status as JSON\n\n" +
      "exit: 0 ready for approval | 2 revise | 3 blocked\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (!a.startsWith("-") && !out.project) out.project = a;
    else {
      process.stderr.write(`[iterate-status] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.project) usage(2);

const config = loadPipelineConfig({ repoRoot: installRoot() });
const workspace = resolveWorkspace({ explicitRoot: args.root });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

let status;
try {
  status = computeIterationStatus({
    projectDir: requireProjectDir(workspace, args.project),
    config,
    revisionId: args.revision,
  });
} catch (err) {
  if (err instanceof IterationStatusError || err.name === "WorkspaceError") {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}

if (args.json) {
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
} else {
  const { verdict, iterations, agentIterations, limits, remaining } = status;
  console.log(`\n${verdict}  ${status.project} / ${status.revision}\n`);
  // Against the AGENT's passes, which is what the budget is about. A pass the
  // user asked for is not the agent circling, and reporting it as an overrun
  // was how a run showed "9/8" for a correction that had just been requested.
  console.log(
    `  iterations              ${agentIterations}/${limits.maxIterations}` +
      `   (${remaining.iterations} left)` +
      (status.humanDirected.length
        ? `   +${status.humanDirected.length} you asked for, not charged`
        : ""),
  );
  if (status.grantedExtension) {
    const g = status.grantedExtension;
    console.log(
      `  extension               ${g.used}/${g.of}` +
        `   (last pass closed ${g.from - g.to} blocking mismatch(es))`,
    );
  }
  console.log(
    `  consecutive build fails ${status.consecutiveBuildFailures}/${limits.maxConsecutiveBuildFailures}`,
  );
  // Named "cause" because that is what the bound counts once a review records
  // one: three symptoms of one cause are three attempts at it, not one each.
  console.log(
    `  same cause attempts     ${status.sameMismatchAttempts}/${limits.maxSameMismatchAttempts}` +
      (status.rootCause
        ? `   (cause "${status.rootCause}")`
        : status.largestMismatch
          ? `   ("${status.largestMismatch}")`
          : ""),
  );
  // What those attempts were. A count says the loop is circling; the list says
  // which values have already been rendered and measured, which is what stops
  // the next pass proposing one of them again.
  if ((status.attempts ?? []).length > 1) {
    console.log("\n  already tried, on this cause:");
    for (const attempt of status.attempts) {
      const measured = attempt.percent === null ? "" : `  → ${attempt.percent}%`;
      const moved = attempt.moved === null ? "" : ` (${attempt.moved >= 0 ? "+" : ""}${attempt.moved})`;
      console.log(`    ${attempt.revision}  ${attempt.action ?? "(no action recorded)"}${measured}${moved}`);
    }
    if (status.diminishingReturns?.stalled) {
      console.log(
        `    the last two moved under ${status.diminishingReturns.materialPercent}% between them — ` +
          "the passes have stopped buying anything, so change approach or accept the residual",
      );
    }
  }
  if (status.failureCategory) console.log(`\n  failureCategory: ${status.failureCategory}`);
  for (const reason of status.reasons) console.log(`  - ${reason}`);
  if (verdict === "REVISE") {
    // Say when the target came from the user. Reporting a person's own
    // observation back as a measurement is a small lie that makes the loop
    // look cleverer than it was.
    const target = status.largestMismatch ?? "the largest mismatch";
    const because = status.focusSource === "human" ? " (reported by the user)" : "";
    const scope = status.rootCause
      ? `everything sharing the cause "${status.rootCause}" in one region`
      : "that one thing";
    console.log(`\n  next: fix "${target}"${because} — ${scope}, then render and review again.`);
  } else if (verdict === "BLOCKED") {
    console.log("\n  next: stop iterating. Report the category above and what was tried.");
  } else {
    console.log("\n  next: report to the user and wait. Do not approve on their behalf.");
  }
  printCost();
  console.log("");
}

process.exit(EXIT[status.verdict] ?? 1);

/**
 * One line of cost, attached to the command the loop cannot skip.
 *
 * The skills already say to report metrics at a handoff, and the first real run
 * showed what that is worth on its own: four sessions recorded, not one report
 * printed. `iterate-status` runs after every render by contract, so the numbers
 * surface whether or not anyone remembers to ask for them.
 *
 * Silent when telemetry is unavailable, and never fatal — a measurement must
 * not cost the loop its answer.
 */
function printCost() {
  try {
    const run = spawnSync(
      process.execPath,
      [
        path.join(path.dirname(fileURLToPath(import.meta.url)), "telemetry", "run-metrics.mjs"),
        "report",
        "--json",
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    if (run.status !== 0 || !run.stdout?.trim().startsWith("{")) return;

    const report = JSON.parse(run.stdout);
    const cycle = report.cycle;
    if (!cycle?.startedAt) return;

    const processed = processedTokens(cycle.usage);
    console.log(
      `\n  this cycle: ${formatDuration(elapsed(cycle.startedAt, cycle.finishedAt))} · ` +
        `${formatTokens(processed)} processed · ${formatTokens(cycle.usage.outputTokens)} output`,
    );
  } catch {
    /* telemetry is never load-bearing */
  }
}
