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
 * One check is added rather than chained: before anything is approved, the
 * links declared in the data are read back out of the rendered PDF. It sits
 * here because it is the one defect the person approving cannot have seen —
 * they are judging pixels, and a dead link has none.
 *
 * Exit codes: 0 all steps passed, 1 a step failed (the output names it),
 * 2 usage. Steps run in order and stop at the first failure, except verify:
 * by then the approve and the publish have already happened, so a verify
 * failure is reported against the completed state rather than hiding it.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { measurementEvidence } from "./lib/iteration-status.mjs";
import { describeSeal, sealState } from "./lib/revision-seal.mjs";

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
      "  --readme-only       the bundle is already published and only its README is\n" +
      "                      missing; regenerate and verify, skipping approve\n" +
      "  --json              machine-readable result\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, verify: "static", json: false, readmeOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--readme-only") out.readmeOnly = true;
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

// --readme-only: the bundle is already on disk and only its README is missing.
// That happens when publish-template was run on its own to get past a failure —
// the publisher writes the bundle, the README is generated here, and the
// composite cannot be re-run end to end because the revision is APPROVED by
// then and re-approving history is correctly refused. Skipping straight to the
// README step is the difference between finishing the bundle and hand-writing
// generated content back into it.
if (args.readmeOnly) {
  // --revision has no meaning here and taking it silently would let someone
  // believe they had regenerated a particular revision's bundle. This path
  // reads whatever bundle is on disk; that is the whole point of it.
  if (args.revision) {
    process.stderr.write(
      "[approve-and-publish] --readme-only regenerates the README of the bundle that is " +
        `already published, so --revision ${args.revision} would be ignored. Drop it, or use ` +
        "the full composite to approve and publish that revision.\n",
    );
    process.exit(2);
  }

  step("locate the published bundle", (entry) => {
    const metaPath = path.join(projectDir, "template-project.json");
    if (!fs.existsSync(metaPath)) {
      throw new Error(`no project at ${projectDir} (missing template-project.json)`);
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    templateId = meta.templateId || meta.projectName || args.project;
    const bundleDir = path.join(workspace.templatesDir, templateId);
    if (!fs.existsSync(path.join(bundleDir, "template.json"))) {
      throw new Error(
        `no published bundle at ${bundleDir} — publish it first with `
          + `scripts/publish-template.mjs --project ${args.project}`,
      );
    }
    result.bundle = bundleDir;
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
        /* the reporter below falls back to the raw output */
      }
      result.verify = parsed ?? { ok: verified.status === 0, output: verified.output.trim() };
      entry.detail = (parsed && parsed.ok) || verified.status === 0
        ? "bundle verified"
        : "bundle did NOT verify";
      if (verified.status !== 0) throw new Error(entry.detail);
    });
  }

  finish(0);
}

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

step("was it measured", (entry) => {
  // The same argument the links step makes below, one level up. The person
  // approving is judging the render, and parity with the reference is the one
  // property judging the render cannot establish: they are looking at the thing
  // itself, not at the difference between it and what it was rebuilt from.
  //
  // Every gate this harness has — the page diff, the footer band, the border
  // topology, the links, the integrity check — runs inside `render-and-diff`,
  // so a revision that never called it has passed none of them. A real proposal
  // run reached a seven-mismatch review with no diff artifacts at all, and
  // nothing between that and a published bundle asked.
  const evidence = measurementEvidence(path.join(projectDir, "revisions", revisionId));
  result.measurement = evidence;

  if (!evidence.rendered) {
    entry.detail = "no render to measure";
    return;
  }
  if (evidence.measured) {
    entry.detail = "compared against the reference";
    return;
  }
  throw new Error(
    `${revisionId} has a render that was never compared with anything — no visual-diff-stats.json, ` +
      "no diff.png, no reference-scaled.png. Every gate lives in render-and-diff, so this revision " +
      "has passed none of them.\n" +
      `  Measure it: node scripts/render-and-diff.mjs --project ${args.project} --revision ${revisionId} --skip-render\n` +
      "  If you mean to approve it unmeasured anyway, run the revision manager's approve directly.",
  );
});

step("does the source match what was reviewed", (entry) => {
  // The render gate stops a second render into a judged revision. The edit
  // happens before the render, so a revision can reach approval with source
  // that was never rendered and never reviewed — measured on a real run, where
  // a template was rewritten eleven minutes after the review that judged it.
  //
  // Publishing that is the irreversible half: the bundle carries code nobody
  // compared with anything, under a review that was written about other code.
  const seal = sealState(path.join(projectDir, "revisions", revisionId));
  result.seal = { reviewed: seal.reviewed, broken: seal.broken, edited: seal.edited };

  if (!seal.reviewed) {
    entry.detail = "no review to compare against";
    return;
  }
  if (!seal.broken) {
    entry.detail = "unchanged since the review";
    return;
  }
  throw new Error(
    `${describeSeal(seal)}.\n` +
      "  Re-render and re-review it, or carry the change into a new revision:\n" +
      `    node scripts/render-and-diff.mjs --project ${args.project} --revision ${revisionId}\n` +
      "  If you mean to approve the reviewed state anyway, run the revision manager's approve directly.",
  );
});

step("links", (entry) => {
  // The one defect the person approving cannot have seen. They are judging the
  // render, and a dead link looks exactly like a live one there — same glyphs,
  // same colour, zero pixel difference. So "the user approved it" is not
  // informed consent about this, and the last gate before a bundle ships is the
  // right place to say so. navy-sidebar-cv was published with every contact
  // dead, and nothing between the render and the bundle asked.
  const checked = run(path.join(repoRoot, "scripts", "check-links.mjs"), [
    "--project", args.project,
    "--revision", revisionId,
    ...(args.root ? ["--root", args.root] : []),
    "--json",
  ]);
  let links;
  try {
    links = JSON.parse(checked.stdout);
  } catch {
    entry.detail = "not checked";
    return;
  }
  result.links = { missing: links.missing ?? [], undeclared: links.undeclared ?? [] };
  if (!links.checked) {
    entry.detail = `not checked — ${links.skipped}`;
    return;
  }
  entry.detail = `${links.rendered.linkAnnotations} live, ${links.declaredCount} declared` +
    (links.undeclared.length ? `, ${links.undeclared.length} link-shaped without an href` : "");
  if (links.missing.length) {
    // Same hard line as BLOCKED, and the same escape: the human can still
    // insist through the revision manager, but not by accident from here.
    throw new Error(
      `${links.missing.length} declared link(s) never reached the render: ` +
        links.missing.map((m) => `${m.at} = ${m.target}`).join(", ") +
        ". Wire them through the link API and re-render, or approve via the revision manager " +
        "directly if shipping them dead is deliberate.",
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
