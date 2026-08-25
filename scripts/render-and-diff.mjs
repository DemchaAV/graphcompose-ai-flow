#!/usr/bin/env node
/**
 * scripts/render-and-diff.mjs — one loop pass, one command.
 *
 *   node scripts/render-and-diff.mjs --project <id> --revision <id> [--root <ws>]
 *        [--against reference|parent] [--skip-render] [--json]
 *
 * Every pass of the iteration loop runs the same deterministic chain: render,
 * scale the reference to the render's size, diff, write the evidence into the
 * revision, ask whether the loop may continue. The serif acceptance run paid
 * for that as three to four separate model turns per pass — and solved the
 * scaling step itself, with ImageMagick shell arithmetic that left junk files
 * in the user's project root.
 *
 * This is that chain as one call. The agent's part of a pass — look at the
 * images, judge, decide the one cause to fix — is untouched; what is removed
 * is the taxi ride between the tools.
 *
 * The exit code is the loop's own verdict, so a skill can branch without
 * parsing anything:
 *
 *   0  READY_FOR_APPROVAL     stop and hand over to the user
 *   2  REVISE                 keep going; the JSON names the focus
 *   3  BLOCKED                stop and report the failure category
 *   1  a step failed          (compile error, missing image, …)
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const repoRoot = installRoot();

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/render-and-diff.mjs --project <id> --revision <id> [--root <workspace>]\n" +
      "                                        [--against reference|parent] [--skip-render] [--json]\n\n" +
      "  --project <id>        the project\n" +
      "  --revision <id>       the revision to render and judge\n" +
      "  --against <what>      what to diff the render against (default: reference;\n" +
      "                        parent diffs against the parent revision's output.png,\n" +
      "                        which is what refactor-only and data-only gates need)\n" +
      "  --skip-render         reuse the existing output.png (diff and verdict only)\n" +
      "  --root <workspace>    workspace override (default: discovered)\n" +
      "  --json                machine-readable result\n\n" +
      "exit: 0 ready for approval | 2 revise | 3 blocked | 1 a step failed\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, against: "reference", skipRender: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--skip-render") out.skipRender = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--against") out.against = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[render-and-diff] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.project || !out.revision) {
    process.stderr.write("[render-and-diff] --project and --revision are required\n");
    usage(2);
  }
  if (!["reference", "parent"].includes(out.against)) {
    process.stderr.write("[render-and-diff] --against must be reference or parent\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);

const result = { project: args.project, revision: args.revision, steps: [], diff: null, loop: null };

function step(name, fn) {
  const entry = { name, ok: false };
  result.steps.push(entry);
  try {
    fn(entry);
    entry.ok = true;
  } catch (cause) {
    entry.error = cause.message;
    finish(1);
  }
}

function run(command, runArgs) {
  const spawned = spawnSync(process.execPath, [command, ...runArgs], { encoding: "utf8" });
  return {
    status: spawned.status,
    stdout: spawned.stdout ?? "",
    output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}`,
  };
}

function finish(code) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const entry of result.steps) {
      console.log(`  ${entry.ok ? "ok  " : "FAIL"} ${entry.name}${entry.detail ? `  ${entry.detail}` : ""}`);
      if (entry.error) console.log(`       ${entry.error.split("\n").slice(0, 3).join("\n       ")}`);
    }
    if (result.diff) {
      console.log(
        `\n  diff: ${result.diff.mismatchPx} px (${result.diff.percent.toFixed(3)}%) — ${result.diff.classification}`,
      );
    }
    if (result.loop) {
      console.log(`  loop: ${result.loop.verdict}` + (result.loop.next ? ` — ${result.loop.next}` : ""));
    }
    console.log("");
  }
  process.exit(code);
}

// -------------------------------------------------------------------- steps ---

if (!args.skipRender) {
  step("render", (entry) => {
    const rendered = run(path.join(repoRoot, "scripts", "render.mjs"), [
      args.project,
      args.revision,
      "--root",
      workspace.root,
    ]);
    if (rendered.status !== 0) {
      // The tail, not the whole build log: a compile error's useful lines are
      // its last ones, and the agent reads this error inside one turn.
      const tail = rendered.output.trim().split("\n").slice(-15).join("\n");
      throw new Error(`render failed:\n${tail}`);
    }
    entry.detail = "output.pdf + output.png (clean + debug)";
  });
} else {
  step("render (skipped)", (entry) => {
    if (!fs.existsSync(path.join(revisionDir, "output.png"))) {
      throw new Error("--skip-render was given but the revision has no output.png");
    }
    entry.detail = "reusing existing output.png";
  });
}

step("diff", (entry) => {
  const outputPng = path.join(revisionDir, "output.png");

  let referencePng;
  if (args.against === "parent") {
    const revision = JSON.parse(fs.readFileSync(path.join(revisionDir, "revision.json"), "utf8"));
    if (!revision.parentRevisionId) {
      throw new Error("--against parent, but this revision has no parent");
    }
    referencePng = path.join(projectDir, "revisions", revision.parentRevisionId, "output.png");
    if (!fs.existsSync(referencePng)) {
      throw new Error(`the parent revision has no output.png: ${referencePng}`);
    }
  } else {
    // Prefer the scaled copy a previous pass already produced; else the
    // project reference, which --scale-reference below brings to size.
    referencePng = [
      path.join(revisionDir, "reference-scaled.png"),
      path.join(projectDir, "reference", "reference.png"),
    ].find(fs.existsSync);
    if (!referencePng) {
      throw new Error(`no reference image found under ${path.join(projectDir, "reference")}`);
    }
  }

  const diffArgs = [
    referencePng,
    outputPng,
    "--json",
    "--out",
    path.join(revisionDir, "diff.png"),
    "--update-revision",
    revisionDir,
  ];
  if (args.against === "reference") {
    // Scaling is for the reference comparison only. A parent comparison is
    // same-renderer, same-size by construction — if the sizes differ there,
    // something real changed and the diff must fail loudly, not resample.
    diffArgs.push("--scale-reference", "--save-scaled", path.join(revisionDir, "reference-scaled.png"));
  }

  const diffed = run(path.join(repoRoot, "tools", "visual-diff", "bin", "visual-diff.mjs"), diffArgs);
  if (diffed.status !== 0) throw new Error(diffed.output.trim() || "diff failed");

  const stats = JSON.parse(diffed.stdout);
  result.diff = {
    against: args.against,
    mismatchPx: stats.mismatchPx,
    percent: stats.percent,
    classification: stats.classification,
    parityScore: stats.parityScore,
    diffImage: stats.diff,
  };
  entry.detail = `${stats.mismatchPx} px vs ${args.against} — ${stats.classification}`;
});

step("loop verdict", (entry) => {
  const status = run(path.join(repoRoot, "scripts", "iterate-status.mjs"), [
    args.project,
    "--revision",
    args.revision,
    "--root",
    workspace.root,
    "--json",
  ]);
  // iterate-status exits 0/2/3 by verdict; anything it printed as JSON is the
  // answer regardless of which of those it chose.
  let loop;
  try {
    loop = JSON.parse(status.stdout);
  } catch {
    throw new Error(status.output.trim() || "iterate-status failed");
  }
  result.loop = {
    verdict: loop.verdict,
    focus: loop.largestMismatch,
    focusSource: loop.focusSource,
    rootCause: loop.rootCause,
    iterations: loop.iterations,
    remaining: loop.remaining,
    failureCategory: loop.failureCategory,
    next:
      loop.verdict === "REVISE"
        ? `fix "${loop.largestMismatch ?? "the largest mismatch"}"` +
          (loop.focusSource === "human" ? " (reported by the user)" : "")
        : loop.verdict === "BLOCKED"
          ? `stop: ${loop.failureCategory}`
          : "report to the user and wait",
  };
  entry.detail = loop.verdict;
});

const EXIT = { READY_FOR_APPROVAL: 0, REVISE: 2, BLOCKED: 3 };
finish(EXIT[result.loop?.verdict] ?? 1);
