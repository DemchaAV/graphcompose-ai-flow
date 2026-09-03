#!/usr/bin/env node
/**
 * scripts/hooks/guard-artifact-write.mjs — a canonical artifact is never
 * written in place.
 *
 * ## Why a hook and not a paragraph in three prompts
 *
 * Three discovery workers run at once. Each writes one artifact straight to its
 * canonical path with the host's file-writing tool, which truncates the file
 * and then fills it: for as long as that takes, the path holds a partial JSON
 * document. The coordinator polls those paths. Nothing catches a partial read,
 * because a half-written file fails as "invalid JSON", which reads like a bad
 * artifact rather than a race — and the answer to a bad artifact is to re-run
 * the worker, which is the wrong fix for a timing problem and appears to work.
 *
 * `scripts/write-artifact.mjs` stages the content beside the target, validates
 * it, and renames — so the canonical path only ever holds a complete,
 * schema-valid document. This makes that the only way in. The same lesson as
 * `guard-bash.mjs`: the instruction was written and not followed, because
 * nothing made following it cheaper than not.
 *
 * ## Write, deliberately, and not Edit
 *
 * `Write` replaces a whole file, which is what a worker does and what opens the
 * window. `Edit` is a targeted change made during the render loop, where there
 * is one writer and no concurrent reader — and forcing it through a whole-file
 * rewrite would cost more output tokens than the race costs anything. The
 * window this closes is the fan-out's; it does not claim to close every one.
 *
 * ## Contract (Claude Code PreToolUse)
 *
 * Reads the tool call as JSON on stdin (`tool_name`, `tool_input.file_path`).
 * Exit 0 lets it through; exit 2 blocks and hands stderr to the model. Any
 * other tool, any parse failure, and GRAPHCOMPOSE_GUARD=off all exit 0 — a
 * guard that could block work by breaking would be worse than no guard.
 */

import path from "node:path";

/**
 * The artifacts a barrier joins on. `handoff.json` is here too: it is written
 * only by `handoff.mjs`, and only on a clear barrier, so a hand-written one
 * would be a record claiming a validation that never happened.
 */
export const GUARDED = Object.freeze([
  "visual-analysis.json",
  "asset-request.json",
  "assets-manifest.json",
  "architecture-plan.json",
  "handoff.json",
]);

/** `cv-data.json`, `invoice-data.json` — the content worker's artifact, per kind. */
const DATA_FILE = /^[a-z0-9][a-z0-9-]*-data\.json$/i;

/**
 * A revision inside a workspace, which is the only place the fan-out runs:
 * `…/projects/<id>/revisions/<id>/…`.
 *
 * The `projects/` segment is load-bearing and not decoration. The harness's own
 * `examples/cv-reference/revisions/revision-003/` is the same *shape* and is
 * source a maintainer edits by hand; refusing those writes would block work
 * that has nothing to do with a concurrent worker.
 */
const WORKSPACE_REVISION = /[/\\]projects[/\\][^/\\]+[/\\]revisions[/\\][^/\\]+[/\\]/;

/**
 * @param {string} filePath
 * @returns {{ block: boolean, artifact: string|null, message: string|null }}
 */
export function judgeWrite(filePath) {
  const raw = String(filePath ?? "");
  if (raw.trim() === "") return { block: false, artifact: null, message: null };
  const base = path.basename(raw.replace(/\\/g, "/"));

  // Only inside a workspace revision. The harness's own schemas, fixtures and
  // examples carry files with these names and are edited as source, not as
  // artifacts — blocking those would refuse work that has nothing to do with
  // the fan-out.
  if (!WORKSPACE_REVISION.test(raw)) return { block: false, artifact: null, message: null };

  // An overflow fixture is a second dataset, not the artifact the barrier
  // reads; it has no schema and no concurrent reader.
  if (/\.overflow\.json$/i.test(base)) return { block: false, artifact: null, message: null };

  const isData = DATA_FILE.test(base);
  if (!GUARDED.includes(base) && !isData) return { block: false, artifact: null, message: null };

  const artifact = isData ? base : base;
  const how =
    base === "handoff.json"
      ? "node scripts/handoff.mjs write --project <id>"
      : `node scripts/write-artifact.mjs --project <id> --artifact ${artifact} --from <your draft>`;

  return {
    block: true,
    artifact,
    message:
      `Writing ${artifact} directly leaves it truncated for as long as the write takes, and the ` +
      "other discovery workers and the barrier read that path.\n\n" +
      `Write your draft to a scratch file, then commit it:\n  ${how}\n\n` +
      "It stages beside the target, validates against the schema, and renames — so the canonical " +
      "path holds either the previous complete artifact or the new one, never half of either. " +
      "A rejected draft leaves the canonical file untouched and says why.\n" +
      "(GRAPHCOMPOSE_GUARD=off bypasses this hook.)",
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  if (process.env.GRAPHCOMPOSE_GUARD === "off") process.exit(0);
  let event;
  try {
    event = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  if (event?.tool_name !== "Write") process.exit(0);
  const verdict = judgeWrite(event?.tool_input?.file_path);
  if (!verdict.block) process.exit(0);
  process.stderr.write(`${verdict.message}\n`);
  process.exit(2);
}

// Importable for the tests; only the hook invocation reads stdin.
if (process.argv[1] && path.basename(process.argv[1]) === "guard-artifact-write.mjs") {
  await main();
}
