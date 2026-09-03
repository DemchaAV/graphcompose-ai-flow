#!/usr/bin/env node
/**
 * scripts/handoff.mjs — everything the next phase needs, as paths and hashes.
 *
 *   node scripts/handoff.mjs write  --project <id> [--revision <id>] [--next authoring]
 *   node scripts/handoff.mjs show   --project <id> [--revision <id>] [--json]
 *   node scripts/handoff.mjs verify --project <id> [--revision <id>] [--json]
 *
 * ## Why
 *
 * Discovery and authoring are two phases of one run, and in a real create run
 * they were also one conversation. Measured on two recorded runs: the
 * coordinator's context at the discovery/authoring boundary was 192–266k
 * tokens, it never came down, and the authoring-plus-loop phase then re-read
 * all of it on every one of 218–382 further requests — 84% and 96% of each
 * run's cache-read. The three discovery subagents, the part everyone assumes is
 * expensive, were 3.0% and 0.0%.
 *
 * Almost none of what the boundary context held was information authoring
 * needed. The measurement, the reasoning, the reference crops, the pages of
 * `create-2-analyse.md` — all of it had already been distilled into four files
 * on disk. What authoring needs is those four files and the knowledge that they
 * are complete, and that fits in a page.
 *
 * So this writes the page. `handoff.json` is the durable state at the boundary:
 * where each artifact is, what it hashed to, that the barrier was clear when it
 * was written. A fresh authoring context reads it and starts; it never has to
 * reconstruct discovery from a transcript.
 *
 * ## It does not decide whether the artifacts are good
 *
 * `check-analysis.mjs --for authoring` decides that, and this runs it as a
 * subprocess rather than reimplementing it. Two validators of one join drift,
 * and the one that drifts is always the copy. A red barrier means no handoff is
 * written at all — there is no such thing as a handoff that says "not
 * validated", because a next phase reading one would have to decide what to do
 * about it, and that decision belongs to the barrier.
 *
 * ## Contents, and what is deliberately absent
 *
 * Paths and hashes. Never artifact *contents*: copying `visual-analysis.json`
 * in here would put the same document in context twice and make the handoff
 * another thing that can disagree with the artifact it describes. The hash is
 * what makes the path trustworthy — `verify` re-reads the files and says
 * whether the state on disk is still the state the barrier passed.
 *
 * Exit: 0 · 1 the barrier is red, or verify found the state stale · 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describeWorkspaceLine, installRoot, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { writeJsonAtomic } from "./lib/atomic-write.mjs";
import {
  HANDOFF_FILE,
  HANDOFF_SCHEMA_VERSION,
  NEXT_PHASES,
  artifactPaths,
  boundaryState,
  describeArtifacts,
  recordCrossing,
  describeBoundary,
  hashFile,
  verifyHandoff,
} from "./lib/handoff.mjs";

const repoRoot = installRoot();

// ------------------------------------------------------------------ the CLI ---

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/handoff.mjs <command> --project <id> [options]\n\n" +
      "  write   record the boundary: artifact paths + hashes, once the authoring barrier is clear\n" +
      "  show    print the recorded handoff\n" +
      "  verify  re-hash the artifacts and say whether the recorded state still holds\n" +
      "  request declare the coordinator is about to cross — run BEFORE spawning\n" +
      "  claim   the authoring context announces itself — run FIRST, from inside it\n" +
      "  status  written / requested / mechanism / TAKEN, as separate answers\n\n" +
      "  --project <id>     the project\n" +
      "  --by <who>         with claim: the authoring agent's name or session id\n" +
      "  --mechanism <how>  with request: the host action used, e.g. \"Agent\"\n" +
      "  --revision <id>    the revision (default: the project's current draft)\n" +
      `  --next <phase>     ${NEXT_PHASES.join(" | ")} (default: authoring)\n` +
      "  --root <workspace> workspace override\n" +
      "  --json             machine-readable\n\n" +
      "exit: 0 | 1 the barrier is red, or the recorded state is stale | 2 usage\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage(2);
const command = argv[0];
if (!["write", "show", "verify", "request", "claim", "status", "escalate"].includes(command)) {
  process.stderr.write(`[handoff] unknown command: ${command}\n`);
  usage(2);
}

const args = { project: null, revision: null, root: null, json: false, next: "authoring", by: null, mechanism: null, fromSession: null, read: null, because: null };
function valueOf(flag, i) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    process.stderr.write(`[handoff] ${flag} needs a value\n`);
    usage(2);
  }
  return value;
}
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = valueOf(a, i++);
  else if (a === "--revision" || a === "-r") args.revision = valueOf(a, i++);
  else if (a === "--next") args.next = valueOf(a, i++);
  else if (a === "--by") args.by = valueOf(a, i++);
  else if (a === "--mechanism") args.mechanism = valueOf(a, i++);
  else if (a === "--from-session") args.fromSession = valueOf(a, i++);
  else if (a === "--read") args.read = valueOf(a, i++);
  else if (a === "--because") args.because = valueOf(a, i++);
  else if (a === "--root") args.root = valueOf(a, i++);
  else {
    process.stderr.write(`[handoff] unknown argument: ${a}\n`);
    usage(2);
  }
}
if (!args.project) usage(2);
if (!NEXT_PHASES.includes(args.next)) {
  process.stderr.write(`[handoff] --next takes ${NEXT_PHASES.join(" or ")}, not "${args.next}"\n`);
  usage(2);
}

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
let projectDir;
try {
  projectDir = requireProjectDir(workspace, args.project);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(2);
}

let project;
try {
  project = JSON.parse(fs.readFileSync(path.join(projectDir, "template-project.json"), "utf8"));
} catch (err) {
  process.stderr.write(`[handoff] ${args.project}/template-project.json is not readable — ${err.message}\n`);
  process.exit(2);
}
const revisionId = args.revision ?? project.currentDraftRevisionId;
if (!revisionId) {
  process.stderr.write(`[handoff] ${args.project} has no draft revision, and none was named\n`);
  process.exit(2);
}
const revisionDir = path.join(projectDir, "revisions", revisionId);
if (!fs.existsSync(revisionDir)) {
  process.stderr.write(`[handoff] no such revision: ${revisionDir}\n`);
  process.exit(2);
}
const handoffFile = path.join(revisionDir, HANDOFF_FILE);

if (command === "write") {
  // The barrier decides, and it is the same barrier render-and-diff runs before
  // a first render. Running it here rather than restating it is the whole point:
  // one join, one implementation.
  const barrier = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "check-analysis.mjs"),
      "--project", args.project,
      "--revision", revisionId,
      "--for", "authoring",
      "--json",
      ...(args.root ? ["--root", args.root] : []),
    ],
    { encoding: "utf8" },
  );
  let verdict = null;
  try {
    verdict = JSON.parse(barrier.stdout);
  } catch {
    /* an unparseable barrier is a red barrier */
  }
  if (barrier.status !== 0 || !verdict?.complete) {
    const held = (verdict?.artifacts ?? []).filter((a) => !a.ok);
    const lines = [
      `[handoff] not written — the authoring barrier is not clear for ${args.project}/${revisionId}`,
    ];
    for (const a of held) lines.push(`          WAIT  ${a.name}: ${a.detail}`);
    if (held.length === 0 && barrier.stderr) lines.push(`          ${barrier.stderr.trim()}`);
    lines.push(
      `          node scripts/check-analysis.mjs --project ${args.project} --revision ${revisionId} --for authoring`,
    );
    process.stderr.write(`${lines.join("\n")}\n`);
    process.exit(1);
  }

  const paths = artifactPaths(projectDir, revisionDir, project);
  const artifacts = {};
  const hashes = {};
  for (const [key, file] of Object.entries(paths)) {
    if (!file || !fs.existsSync(file)) {
      // Recorded as an explicit null rather than omitted: "this project has no
      // data file" and "somebody forgot to list it" are different states, and
      // only one of them is fine.
      artifacts[key] = null;
      hashes[key] = null;
      continue;
    }
    artifacts[key] = path.relative(revisionDir, file).split(path.sep).join("/");
    hashes[key] = hashFile(file);
  }

  const handoff = {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    project: args.project,
    revision: revisionId,
    nextPhase: args.next,
    // Relative to this file, so a workspace that moves — or a project copied to
    // another machine — still resolves. Absolute paths in a durable record are
    // how a handoff stops working the first time anyone relocates the workspace.
    artifactRoot: ".",
    artifacts,
    hashes,
    validated: true,
    validatedBy: "scripts/check-analysis.mjs --for authoring",
    validatedAt: new Date().toISOString(),
    docKind: project.docKind ?? null,
    graphcomposeLine: project.graphcomposeLine ?? project.resolved?.line ?? null,
  };
  // writeFileAtomic's forgiving strength, not replaceFileAtomic's: this is a
  // 1 KB record with no concurrent reader — the phase that reads it has not
  // started — and losing it to a refused rename would end the phase for no
  // safety gained. What the Write guard protects here is provenance, not
  // atomicity: a hand-written handoff would claim a validation nobody ran.
  //
  // Crossings survive the rewrite. A real run wrote the handoff, crossed the
  // boundary, and then rewrote the handoff during the loop — which erased the
  // block and made `status` report TAKEN: NO on a run where a second context
  // demonstrably authored the template. The claim is rightly no longer current
  // (it described artifacts that have since moved), but the fact that it
  // happened is not the kind of thing a later write gets to forget.
  const priorCrossings = (() => {
    try {
      const prior = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
      return Array.isArray(prior?.boundary?.crossings) ? prior.boundary.crossings : [];
    } catch {
      return [];
    }
  })();
  if (priorCrossings.length > 0) handoff.boundary = { crossings: priorCrossings };
  writeJsonAtomic(handoffFile, handoff);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
  } else {
    const banner = describeWorkspaceLine(workspace);
    if (banner) process.stdout.write(`${banner}\n`);
    process.stdout.write(
      `handoff  ${args.project} / ${revisionId}  ->  ${args.next}\n` +
        describeArtifacts(handoff) +
        `\n  validated by ${handoff.validatedBy}\n` +
        // The shorter of the two. A relative path across drives, or out of a
        // worktree and into a temp directory, is a wall of `..\` that is
        // harder to read than the absolute path it replaced.
        `  written to ${shorterPath(handoffFile)}\n\n` +
        "  Authoring needs these files and nothing from the discovery conversation.\n",
    );
  }
  process.exit(0);
}

// request / claim / status / show / verify all need the recorded document.
let handoff = null;
try {
  handoff = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
} catch {
  const detail = fs.existsSync(handoffFile) ? "is not readable JSON" : "has not been written";
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ project: args.project, revision: revisionId, handoff: null, fresh: false, problems: [`${HANDOFF_FILE} ${detail}`] }, null, 2)}\n`);
  } else {
    process.stderr.write(
      `[handoff] ${args.project}/${revisionId}/${HANDOFF_FILE} ${detail}\n` +
        `          node scripts/handoff.mjs write --project ${args.project} --revision ${revisionId}\n`,
    );
  }
  process.exit(1);
}

/**
 * Mutate the boundary block through the same atomic writer the handoff uses.
 * Read-modify-write, because `request` and `claim` are written by two different
 * processes and the second must not erase the first.
 */
function patchBoundary(patch) {
  const current = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
  current.boundary = { ...(current.boundary ?? {}), ...patch };
  writeJsonAtomic(handoffFile, current);
  return current;
}

if (command === "request") {
  // The coordinator says it is about to cross. On its own this proves nothing —
  // that is the point of keeping it separate from `claim`.
  const doc = patchBoundary({
    requested: true,
    requestedAt: new Date().toISOString(),
    mechanism: args.mechanism ?? null,
    mechanismAvailable: args.mechanism ? true : null,
  });
  const state = boundaryState(doc);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    process.stdout.write(
      `[handoff] boundary requested via ${state.mechanism ?? "(unnamed mechanism)"} — ` +
        "now spawn the authoring context, and have it claim\n",
    );
  }
  process.exit(0);
}

if (command === "claim") {
  // Run from INSIDE the authoring context, as its first action. This is the
  // only state that is evidence of anything: a claim exists because something
  // on the far side of the boundary ran a command.
  if (!args.by) {
    process.stderr.write("[handoff] claim needs --by <who> — an unattributed claim is not evidence\n");
    process.exit(2);
  }
  const fresh = verifyHandoff(JSON.parse(fs.readFileSync(handoffFile, "utf8")), { revisionDir });
  if (!fresh.fresh) {
    process.stderr.write(
      `[handoff] refusing to claim a stale handoff for ${args.project}/${revisionId}\n` +
        fresh.problems.map((p) => `          ${p}\n`).join(""),
    );
    process.exit(1);
  }
  // Append a crossing rather than set a flag: the record has to outlive the
  // next `write`, and a second claim on the same generation must not inflate
  // the history.
  const before = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
  const doc = recordCrossing(before, {
    claimedBy: args.by,
    fromSession: args.fromSession ?? null,
    toSession: process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CLAUDE_SESSION_ID ?? null,
    verified: true,
  });
  writeJsonAtomic(handoffFile, doc);
  const state = boundaryState(doc);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ...state, artifacts: doc.artifacts }, null, 2)}\n`);
  } else {
    process.stdout.write(
      `[handoff] ${args.project}/${revisionId} claimed by ${args.by}\n` +
        describeArtifacts(doc) +
        "\n\n  These are your inputs. You need nothing from the discovery conversation.\n",
    );
  }
  process.exit(0);
}

if (command === "escalate") {
  // The contract's `mustNotLoadByDefault` is a default, not a ban. When a
  // narrow tool genuinely cannot answer, the author reads the page — and says
  // so here, so the cost is attributable rather than invisible. A habit and a
  // considered read look identical in a transcript; only one of them is
  // willing to write down why.
  if (!args.read || !args.because) {
    process.stderr.write(
      "[handoff] escalate needs --read <path> and --because <what the narrow tool could not answer>\n" +
        "          An escalation nobody justified is the habit the contract exists to name.\n",
    );
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(handoffFile, "utf8"));
  const boundary = { ...(before.boundary ?? {}) };
  boundary.escalations = [
    ...(Array.isArray(boundary.escalations) ? boundary.escalations : []),
    { at: new Date().toISOString(), by: args.by ?? null, read: args.read, because: args.because },
  ];
  writeJsonAtomic(handoffFile, { ...before, boundary });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(boundary.escalations.at(-1), null, 2)}\n`);
  } else {
    process.stdout.write(`[handoff] escalation recorded: ${args.read} — ${args.because}\n`);
  }
  process.exit(0);
}

if (command === "status") {
  const state = boundaryState(handoff);
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ project: handoff.project, revision: handoff.revision, ...state }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      `boundary  ${handoff.project} / ${handoff.revision}\n` +
        `  written    ${state.written ? "yes" : "no"}\n` +
        `  requested  ${state.requested ? `yes (${state.requestedAt})` : "no"}\n` +
        `  mechanism  ${state.mechanism ?? "(none named)"}\n` +
        `  TAKEN      ${state.taken ? `yes — ${state.claimedBy} at ${state.claimedAt}` : "NO"}\n\n` +
        `  ${describeBoundary(state)}\n`,
    );
  }
  // Exit 1 when the boundary was requested and never taken: that is a defect,
  // and a smoke test should be able to branch on it.
  process.exit(state.requested && !state.taken ? 1 : 0);
}

if (command === "show") {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
  } else {
    process.stdout.write(
      `handoff  ${handoff.project} / ${handoff.revision}  ->  ${handoff.nextPhase}\n` + describeArtifacts(handoff) + "\n",
    );
  }
  process.exit(0);
}

// verify
const { fresh, problems } = verifyHandoff(handoff, { revisionDir });
if (args.json) {
  process.stdout.write(`${JSON.stringify({ project: handoff.project, revision: handoff.revision, fresh, problems }, null, 2)}\n`);
} else if (fresh) {
  process.stdout.write(`[handoff] ${handoff.project}/${handoff.revision} is current — every artifact still hashes to what the barrier passed\n`);
} else {
  process.stderr.write(
    `[handoff] STALE ${handoff.project}/${handoff.revision}\n` +
      problems.map((p) => `          ${p}\n`).join("") +
      `          re-run the barrier and write the handoff again:\n` +
      `          node scripts/handoff.mjs write --project ${handoff.project} --revision ${handoff.revision}\n`,
  );
}
process.exit(fresh ? 0 : 1);

/** Whichever of the relative and absolute forms is shorter to read. */
function shorterPath(file) {
  const relative = path.relative(process.cwd(), file);
  return relative && relative.length < file.length ? relative : file;
}
