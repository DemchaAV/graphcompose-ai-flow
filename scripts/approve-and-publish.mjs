#!/usr/bin/env node
/**
 * scripts/approve-and-publish.mjs — the whole approval, one command.
 *
 *   node scripts/approve-and-publish.mjs --project <id> [--root <ws>]
 *        [--revision <id>] [--verify static|render|none] [--json]
 *
 * Telemetry from the first real runs made the case. "approve" cost 11 model
 * requests, two minutes and 6.5M cache-read tokens — for a flow the approve
 * skill itself describes as "almost no judgement: the tools own the state
 * machine". The transcript showed why: status, approve, publish, verify and
 * the metrics report each ran as a separate turn, each carrying ~590k of
 * accumulated context, and the bundle README was written by hand in between.
 *
 * This chains the same CLIs — the revision manager still owns the state
 * machine, the publisher still owns the copy, the verifier still owns the
 * proof — and answers with one JSON. The agent's job shrinks to: confirm the
 * user actually approved, run this, relay the result. Two turns instead of
 * eleven.
 *
 * The bundle README's stable half is generated here from template.json (the
 * manifest is the source of truth; prose restating it drifts). Hand-written
 * sections below the marker survive republishing, because the serif run's
 * best README content — three library behaviours it discovered — is exactly
 * the kind of prose a regeneration must not eat.
 *
 * Exit codes: 0 all steps passed, 1 a step failed (the output names it),
 * 2 usage. Steps run in order and stop at the first failure, except verify:
 * by then the approve and the publish have already happened, so a verify
 * failure is reported against the completed state rather than hiding it.
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

/** Everything hand-written in a bundle README lives below this line. */
export const README_MARKER =
  "<!-- Hand-written sections below. Everything ABOVE this line is regenerated on publish from template.json — edit the manifest, not the prose. -->";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/approve-and-publish.mjs --project <id> [--root <workspace>]\n" +
      "                                            [--revision <id>] [--verify static|render|none] [--json]\n\n" +
      "  --project <id>      the project whose draft is being approved\n" +
      "  --revision <id>     approve this revision (default: the current draft)\n" +
      "  --root <workspace>  workspace override (default: discovered)\n" +
      "  --verify <tier>     bundle verification after publishing (default: static;\n" +
      "                      render also compiles and renders the bundle standalone)\n" +
      "  --json              machine-readable result\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, verify: "static", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (a === "--verify") out.verify = argv[++i];
    else {
      process.stderr.write(`[approve-and-publish] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.project) {
    process.stderr.write("[approve-and-publish] --project is required\n");
    usage(2);
  }
  if (!["static", "render", "none"].includes(out.verify)) {
    process.stderr.write(`[approve-and-publish] --verify must be static, render or none\n`);
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const result = {
  project: args.project,
  workspace: workspace.root,
  steps: [],
  approved: null,
  superseded: [],
  verdictAtApproval: null,
  bundle: null,
  readme: null,
  verify: null,
  telemetry: null,
};

// ------------------------------------------------------------------ helpers ---

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
  return entry;
}

function run(command, runArgs, options = {}) {
  const spawned = spawnSync(process.execPath, [command, ...runArgs], {
    encoding: "utf8",
    ...options,
  });
  return {
    status: spawned.status,
    stdout: spawned.stdout ?? "",
    stderr: spawned.stderr ?? "",
    output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}`,
  };
}

function finish(code) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const entry of result.steps) {
      const mark = entry.ok ? "ok  " : "FAIL";
      const detail = entry.detail ? `  ${entry.detail}` : "";
      console.log(`  ${mark} ${entry.name}${detail}`);
      if (entry.error) console.log(`       ${entry.error.split("\n")[0]}`);
    }
    if (result.approved) {
      console.log(
        `\n[approve-and-publish] ${result.approved} approved` +
          (result.superseded.length ? `, ${result.superseded.join(", ")} superseded` : "") +
          (result.bundle ? `; bundle at ${result.bundle}` : ""),
      );
    }
    if (result.readme?.handWrittenPending) {
      console.log(
        "[approve-and-publish] the bundle README's hand-written sections are placeholders — " +
          "fill Design notes / Known limitations if this template is worth explaining.",
      );
    }
  }
  process.exit(code);
}

// -------------------------------------------------------------------- steps ---

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionManager = path.join(repoRoot, "tools", "revision-manager", "bin", "graphcompose-flow.mjs");

let revisionId = args.revision;
let templateId = null;

step("resolve the draft", (entry) => {
  const metaPath = path.join(projectDir, "template-project.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error(`no project at ${projectDir} (missing template-project.json)`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  revisionId = revisionId ?? meta.currentDraftRevisionId;
  if (!revisionId) {
    throw new Error("the project has no current draft and no --revision was given — nothing to approve");
  }
  const revisionPath = path.join(projectDir, "revisions", revisionId, "revision.json");
  if (!fs.existsSync(revisionPath)) {
    throw new Error(`revision ${revisionId} does not exist`);
  }
  const revision = JSON.parse(fs.readFileSync(revisionPath, "utf8"));
  if (revision.status !== "DRAFT") {
    throw new Error(
      `revision ${revisionId} is ${revision.status}, not DRAFT. Approving is a DRAFT->APPROVED ` +
        "transition; re-approving history is undo/revert-approved territory.",
    );
  }
  entry.detail = revisionId;
});

step("read the verdict", (entry) => {
  // The human approving IS the decision — a REVISE verdict does not block it.
  // But the fact must survive into the record: approving over an open verdict
  // silently is how "the review said it was fine" gets invented later.
  const reviewPath = path.join(projectDir, "revisions", revisionId, "visual-review.json");
  if (!fs.existsSync(reviewPath)) {
    result.verdictAtApproval = "NO_REVIEW";
    entry.detail = "no visual-review.json — approving an unreviewed render";
    return;
  }
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  result.verdictAtApproval = review.verdict ?? "UNKNOWN";
  entry.detail = String(result.verdictAtApproval);
  if (review.verdict === "BLOCKED") {
    // The skill's one hard line: never quietly approve over BLOCKED. The
    // human can still insist — by approving via the revision manager
    // directly — but this fast path refuses to make it frictionless.
    throw new Error(
      "the review verdict is BLOCKED. State the failure category to the user and let them " +
        "decide; if they still want it approved, run the revision manager's approve directly.",
    );
  }
});

step("approve", (entry) => {
  const approved = run(revisionManager, ["approve", revisionId, "--project", projectDir]);
  if (approved.status !== 0) throw new Error(approved.output.trim() || "approve failed");
  result.approved = revisionId;
  for (const [, superseded] of approved.stdout.matchAll(/superseded (\S+)/g)) {
    result.superseded.push(superseded);
  }
  entry.detail = result.superseded.length ? `superseded ${result.superseded.join(", ")}` : "first approval";
});

step("publish", (entry) => {
  const published = run(path.join(repoRoot, "scripts", "publish-template.mjs"), [
    "--project", args.project,
    ...(args.root ? ["--root", args.root] : []),
  ]);
  if (published.status !== 0) throw new Error(published.output.trim() || "publish failed");
  // The publisher prints the template id it derived; the manifest is the
  // durable source, so read it back from the newest bundle write.
  const match = published.stdout.match(/templateId\s*=\s*(\S+)/);
  templateId = match ? match[1] : null;
  if (!templateId) throw new Error("could not read the templateId back from the publisher");
  result.bundle = path.join(workspace.templatesDir, templateId);
  entry.detail = templateId;
});

step("write the README's generated half", (entry) => {
  const readme = generateReadme(result.bundle);
  result.readme = readme;
  entry.detail = readme.state;
});

if (args.verify !== "none") {
  step(`verify (${args.verify})`, (entry) => {
    const verified = run(path.join(repoRoot, "scripts", "verify-published-template.mjs"), [
      "--template-id", templateId,
      ...(args.root ? ["--root", args.root] : []),
      ...(args.verify === "render" ? ["--render"] : []),
      "--json",
    ]);
    let parsed = null;
    try {
      parsed = JSON.parse(verified.stdout);
    } catch {
      /* fall through to the status check */
    }
    result.verify = parsed
      ? { verified: parsed.verified, checks: parsed.checks?.length ?? 0, problems: parsed.problems ?? [] }
      : { verified: false, problems: [verified.output.trim().slice(0, 400)] };
    entry.detail = parsed?.verified ? `${parsed.checks.length} checks` : undefined;
    if (!result.verify.verified) {
      throw new Error(
        `the published bundle failed verification: ${result.verify.problems[0] ?? "see problems"}`,
      );
    }
  });
}

// Telemetry is reported, never load-bearing: a metrics failure must not turn a
// completed approval into an error.
try {
  const metrics = run(path.join(repoRoot, "scripts", "telemetry", "run-metrics.mjs"), [
    "report", "--project", args.project, "--status", "APPROVED", "--json",
    ...(args.root ? ["--root", args.root] : []),
  ]);
  const parsed = JSON.parse(metrics.stdout);
  if (parsed?.cycle) {
    result.telemetry = {
      cycleStartedAt: parsed.cycle.startedAt,
      cycleUsage: parsed.cycle.usage,
      counters: parsed.counters,
    };
  }
} catch {
  /* no session, no hooks, or no transcript — all fine */
}

finish(0);

// ------------------------------------------------------------------- readme ---

/**
 * Generate the README's stable half from template.json, preserving everything
 * a person wrote below the marker.
 *
 * Three cases, decided by what is on disk:
 *  - no README            -> full skeleton, placeholders below the marker
 *  - README with marker   -> regenerate above it, keep below it byte-for-byte
 *  - README, no marker    -> LEFT ALONE. A legacy or fully hand-written README
 *                            is someone's work; silently rewriting it is the
 *                            publisher-clobbers-content bug wearing a new hat.
 */
function generateReadme(bundleDir) {
  const readmePath = path.join(bundleDir, "README.md");
  const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "template.json"), "utf8"));
  const generated = renderGeneratedHalf(manifest, bundleDir);

  if (!fs.existsSync(readmePath)) {
    const placeholders = [
      "## Design notes",
      "",
      "_Not written yet. What makes this layout work: the base constants, the anchoring decisions, anything a maintainer would need to know before changing it._",
      "",
      "## Known limitations",
      "",
      "_Not written yet. Differences from the reference that were accepted, and why._",
      "",
    ].join("\n");
    fs.writeFileSync(readmePath, `${generated}\n${README_MARKER}\n\n${placeholders}`, "utf8");
    return { state: "created with placeholders", handWrittenPending: true, path: readmePath };
  }

  const current = fs.readFileSync(readmePath, "utf8");
  const markerAt = current.indexOf(README_MARKER);
  if (markerAt === -1) {
    return { state: "left alone (no marker — hand-written README)", handWrittenPending: false, path: readmePath };
  }
  const handWritten = current.slice(markerAt);
  fs.writeFileSync(readmePath, `${generated}\n${handWritten}`, "utf8");
  return {
    state: "regenerated above the marker",
    handWrittenPending: /_Not written yet/.test(handWritten),
    path: readmePath,
  };
}

function renderGeneratedHalf(manifest, bundleDir) {
  const previewDir = path.join(bundleDir, "preview");
  const previews = fs.existsSync(previewDir)
    ? fs.readdirSync(previewDir).filter((f) => /^output-page-\d+\.png$/.test(f)).sort()
    : [];
  const dataDir = path.join(bundleDir, "data");
  const dataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.endsWith(".json")) : [];

  const dependencyRows = Object.entries(manifest.dependencies ?? {}).map(([key, version]) => {
    const [groupId, artifactId] = key.includes(":") ? key.split(":") : ["io.github.demchaav", key];
    return `| \`${groupId}\` | \`${artifactId}\` | ${version ?? "?"} |`;
  });

  // Roles share families (heading and body are both Lato in the serif run),
  // so list distinct families rather than one entry per role.
  const fonts = [...new Map(
    (manifest.fonts ?? [])
      .filter((f) => f.role !== "fallback" && f.family)
      .map((f) => [f.family, `\`${f.family}\` (${f.source})`]),
  ).values()];

  const lines = [
    `# ${manifest.displayName}`,
    "",
    `A ${manifest.docKind ?? "document"} template, produced by the GraphCompose harness from ` +
      `\`${manifest.sourceProject}\` at \`${manifest.sourceRevision}\` and published ` +
      `${(manifest.publishedAt ?? "").slice(0, 10)}.`,
    "",
    ...previews.slice(0, 1).map((p) => `![preview](preview/${p})`),
    "",
    "## What is in the bundle",
    "",
    "```text",
    ...renderFileTable([
      [`src/${manifest.className}.java`, "the template"],
      ...(manifest.specClass ? [[`src/${simple(manifest.specClass)}.java`, "the typed content spec"]] : []),
      ...(manifest.specProviderClass ? [[`src/${simple(manifest.specProviderClass)}.java`, "loads the data JSON into the spec"]] : []),
      ...dataFiles.map((f) => [`data/${f}`, "example content — edit this, not the Java"]),
      ["assets/", "icons and images the template loads"],
      ["preview/", "rendered output, clean and with layout guides"],
      ["template.json", "the manifest this README is generated from"],
    ]),
    "```",
    "",
    "## Dependencies",
    "",
    "| group | artifact | version |",
    "|---|---|---|",
    ...dependencyRows,
    "",
    ...(fonts.length ? [`Fonts: ${fonts.join(", ")}.`, ""] : []),
    "## Using it",
    "",
    "Copy `src/`, `data/` and `assets/` into your project, keep the data file's",
    `path relative to the working directory, and compose the document:`,
    "",
    "```java",
    `new ${manifest.className}().compose(session, ${manifest.specProviderClass ? `${simple(manifest.specProviderClass)}.create()` : "spec"});`,
    "```",
    "",
    `Content changes are data changes: edit \`data/${dataFiles[0] ?? "<doc>-data.json"}\`.`,
    "Layout changes are template changes: open a revision in the harness rather",
    "than editing the published copy, so the change is rendered, compared and",
    "kept.",
    "",
  ];
  return lines.join("\n");
}

/** One aligned column, sized to the longest path actually present. */
function renderFileTable(rows) {
  const width = Math.max(...rows.map(([file]) => file.length)) + 3;
  return rows.map(([file, note]) => file + " ".repeat(width - file.length) + note);
}

function simple(fqcn) {
  const parts = String(fqcn).split(".");
  return parts[parts.length - 1];
}
