#!/usr/bin/env node
/**
 * scripts/write-artifact.mjs — the only way a canonical discovery artifact
 * becomes canonical.
 *
 *   node scripts/write-artifact.mjs --project <id> --artifact visual-analysis.json --from <file>
 *   … | node scripts/write-artifact.mjs --project <id> --artifact asset-request.json --from -
 *
 * ## Why this exists
 *
 * Three discovery workers run at once and each writes one artifact; the
 * coordinator joins on `check-analysis`, which validates them. That join is
 * semantic and it stays. What it cannot see is the *file* — a plain write
 * truncates the canonical path and fills it over some number of milliseconds,
 * so a reader arriving inside that window reads half a JSON document. In a real
 * run the three workers finished within seconds of each other and the
 * coordinator polled the directory between them; nothing caught a partial read
 * because a partial read fails as "invalid JSON", which reads like a bad
 * artifact rather than a race.
 *
 * So the write happens as:
 *
 *   artifact.tmp  ->  complete write  ->  schema validation  ->  atomic rename
 *
 * and the canonical path only ever holds a complete, schema-valid document.
 * The temp file is a sibling so the rename stays inside one filesystem; a
 * failed write leaves nothing behind.
 *
 * ## What this is NOT
 *
 * It is not a replacement for `check-analysis`. File atomicity cannot see a
 * schema-valid artifact that disagrees with another one, a required artifact
 * nobody wrote, or an icon the request asked for and the manifest does not
 * carry. Those are the barrier's job and the barrier still runs. This closes
 * one specific hole — "the reader saw half a file" — and claims nothing else.
 *
 * ## Windows
 *
 * `fs.renameSync` over an existing file is atomic on Windows too, but it is
 * refused with EPERM/EBUSY while another process holds the target open. That is
 * transient (a scanner, a just-exited process), so it is retried and then
 * reported — never downgraded to an in-place write, which is the truncation
 * this file exists to prevent.
 *
 * Exit: 0 written · 1 rejected (the canonical file is untouched) · 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installRoot, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { stageAndCommit } from "./lib/atomic-write.mjs";
import { findDataFile } from "./lib/data-spec.mjs";
import { loadFailure, ready, schemaValidator } from "./lib/schema-validator.mjs";

const repoRoot = installRoot();

/**
 * The artifacts this tool owns, and how each is checked before it is committed.
 *
 * `schema: null` is deliberate for the data file: its shape is the document's
 * and differs per kind, so what can be checked without one is that it is a
 * non-empty JSON object — which is exactly what the analysis barrier checks,
 * and it is stated in one place here rather than guessed at twice.
 */
export const ARTIFACTS = Object.freeze({
  "visual-analysis.json": { schema: "visual-analysis.schema.json", owner: "geometry" },
  "asset-request.json": { schema: "asset-request.schema.json", owner: "assets" },
  "architecture-plan.json": { schema: "architecture-plan.schema.json", owner: "architecture" },
  "assets-manifest.json": { schema: "assets-manifest.schema.json", owner: "asset-resolver" },
  "<doc-kind>-data.json": { schema: null, owner: "content" },
});

/** Any `*-data.json` names the data artifact; a caller should not have to know the placeholder. */
export function canonicalArtifactName(name) {
  if (typeof name !== "string") return null;
  const base = path.basename(name);
  if (/-data\.json$/.test(base)) return "<doc-kind>-data.json";
  return Object.hasOwn(ARTIFACTS, base) ? base : null;
}

/**
 * The document a staged artifact must be, before any schema runs.
 *
 * Split out because it is the check that has no schema behind it and the one a
 * truncated file trips: half a JSON document does not parse.
 *
 * @returns {{ok: true, doc: unknown} | {ok: false, detail: string}}
 */
export function parseStaged(content) {
  let doc;
  try {
    doc = JSON.parse(content);
  } catch (err) {
    return { ok: false, detail: `not valid JSON — ${err.message}` };
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    const what = doc === null ? "null" : Array.isArray(doc) ? "an array" : `a ${typeof doc}`;
    return { ok: false, detail: `not a document — the content is ${what}, and every artifact here is an object` };
  }
  if (Object.keys(doc).length === 0) return { ok: false, detail: "parsed, but empty" };
  return { ok: true, doc };
}

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/write-artifact.mjs --project <id> --artifact <name> --from <file|->\n\n" +
      "  --project <id>     the project\n" +
      "  --revision <id>    the revision (default: the project's current draft)\n" +
      `  --artifact <name>  ${Object.keys(ARTIFACTS).join(" | ")}\n` +
      "                     (any *-data.json names the data artifact)\n" +
      "  --from <file|->    the candidate content; - reads stdin\n" +
      "  --root <workspace> workspace override\n" +
      "  --json             machine-readable\n\n" +
      "exit: 0 written | 1 rejected, the canonical file untouched | 2 usage\n",
  );
  process.exit(code);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  const args = { project: null, revision: null, artifact: null, from: null, root: null, json: false };
  function valueOf(flag, i) {
    const value = argv[i + 1];
    if (value === undefined || (value.startsWith("--") && value !== "--")) {
      process.stderr.write(`[artifact] ${flag} needs a value\n`);
      usage(2);
    }
    return value;
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") args.json = true;
    else if (a === "--project" || a === "-p") args.project = valueOf(a, i++);
    else if (a === "--revision" || a === "-r") args.revision = valueOf(a, i++);
    else if (a === "--artifact" || a === "-a") args.artifact = valueOf(a, i++);
    else if (a === "--from" || a === "-f") args.from = valueOf(a, i++);
    else if (a === "--root") args.root = valueOf(a, i++);
    else {
      process.stderr.write(`[artifact] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!args.project || !args.artifact || !args.from) usage(2);

  const canonical = canonicalArtifactName(args.artifact);
  if (!canonical) {
    process.stderr.write(
      `[artifact] --artifact takes one of ${Object.keys(ARTIFACTS).join(", ")}, not "${args.artifact}"\n`,
    );
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
    process.stderr.write(`[artifact] ${args.project}/template-project.json is not readable — ${err.message}\n`);
    process.exit(2);
  }
  const revisionId = args.revision ?? project.currentDraftRevisionId;
  if (!revisionId) {
    process.stderr.write(`[artifact] ${args.project} has no draft revision, and none was named\n`);
    process.exit(2);
  }
  const revisionDir = path.join(projectDir, "revisions", revisionId);
  if (!fs.existsSync(revisionDir)) {
    process.stderr.write(`[artifact] no such revision: ${revisionDir}\n`);
    process.exit(2);
  }

  // The data artifact's real name comes from the project, exactly as the render
  // runtime resolves it — a writer must not invent `doc-data.json` for a
  // project whose renderer reads `cv-data.json`.
  let target;
  if (canonical === "<doc-kind>-data.json") {
    if (project.render?.dataFileName === null) {
      report(args, {
        ok: false,
        artifact: canonical,
        detail: "this project carries its content inline (render.dataFileName is null) — there is no data file to write",
      });
      process.exit(1);
    }
    const existing = findDataFile(projectDir, revisionDir);
    const name = project.render?.dataFileName ?? `${project.docKind || "doc"}-data.json`;
    target = existing ?? path.join(revisionDir, name);
  } else {
    target = path.join(revisionDir, canonical);
  }

  let content;
  try {
    content = args.from === "-" ? await readStdin() : fs.readFileSync(args.from, "utf8");
  } catch (err) {
    process.stderr.write(`[artifact] cannot read the candidate — ${err.message}\n`);
    process.exit(2);
  }

  const schemaName = ARTIFACTS[canonical].schema;
  const validatorProblem = schemaName && !(await ready()) ? loadFailure() : null;

  const result = stageAndCommit(target, content, (_tmp, staged) => {
    const parsed = parseStaged(staged);
    if (!parsed.ok) return parsed;
    if (!schemaName) return { ok: true };
    if (validatorProblem) {
      // Hold, never pass. A writer that committed because the validator was
      // missing would put an unchecked artifact behind a barrier that reports
      // it as checked.
      return { ok: false, detail: validatorProblem };
    }
    const schemaFile = path.join(repoRoot, "schemas", schemaName);
    if (!fs.existsSync(schemaFile)) return { ok: false, detail: `no schema at schemas/${schemaName}` };
    const validate = schemaValidator(schemaFile);
    if (!validate) return { ok: false, detail: validatorProblem ?? "the schema validator is unavailable" };
    const verdict = validate(parsed.doc);
    return verdict.valid
      ? { ok: true }
      : { ok: false, detail: `fails ${schemaName}: ${String(verdict.errors).slice(0, 400)}` };
  });

  report(args, {
    ok: result.ok,
    artifact: canonical,
    file: target,
    replaced: result.ok ? result.replaced : undefined,
    detail: result.ok ? (result.replaced ? "replaced" : "created") : result.detail,
  });
  process.exit(result.ok ? 0 : 1);
}

function report(args, out) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  if (out.ok) {
    process.stdout.write(`[artifact] ${out.detail} ${out.artifact} -> ${out.file}\n`);
    return;
  }
  // Two failures wearing one exit code, and they want opposite responses. A
  // draft that failed its schema is fixed by changing the draft; a rename
  // Windows refused while a reader held the file is fixed by running the same
  // command again. Telling the second one to "fix the content" sends a worker
  // to rewrite an artifact that was already correct.
  const contended = /could not replace .* atomically/.test(out.detail ?? "");
  process.stderr.write(
    `[artifact] ${contended ? "NOT COMMITTED" : "REJECTED"} ${out.artifact}: ${out.detail}\n` +
      (contended
        ? "           the canonical file is unchanged and your draft is fine — run this again\n"
        : "           the canonical file is unchanged — fix the draft and write it again\n"),
  );
}

// Importable for the tests; only the CLI invocation runs main(). fileURLToPath
// rather than URL.pathname: on Windows the latter yields "/C:/…", which no
// path.resolve turns back into a drive path.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
