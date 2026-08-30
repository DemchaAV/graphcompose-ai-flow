#!/usr/bin/env node
/**
 * scripts/check-calibration.mjs — is this revision's template a layout, or a
 * calibration of one reference?
 *
 *   node scripts/check-calibration.mjs --project <id> --revision <id> [--root <ws>] [--json]
 *
 * Reads every Java file in the revision, classifies each as template, theme
 * or other, and scans it for the four shapes of calibration
 * (scripts/lib/source-calibration.mjs). The template is held to the gate; a
 * theme may carry calibrated tokens, because that is what a theme is for.
 *
 * Exit: 0 derived or leaning · 2 calibrated (the gate would refuse) · 1 usage/error.
 * approve-and-publish runs this and refuses on 2 unless a waiver is recorded.
 */

import fs from "node:fs";
import path from "node:path";

import { describeWorkspaceLine, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import { classifyJavaFile, scanCalibration } from "./lib/source-calibration.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-calibration.mjs --project <id> --revision <id> [--root <workspace>] [--json]\n\n" +
      "exit: 0 derived/leaning | 2 calibrated | 1 error\n",
  );
  process.exit(code);
}

const args = { project: null, revision: null, root: null, json: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--project" || a === "-p") args.project = argv[++i];
  else if (a === "--revision" || a === "-r") args.revision = argv[++i];
  else if (a === "--root") args.root = argv[++i];
  else {
    process.stderr.write(`[check-calibration] unknown argument: ${a}\n`);
    usage(1);
  }
}
if (!args.project || !args.revision) usage(1);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

let revisionDir;
try {
  revisionDir = path.join(requireProjectDir(workspace, args.project), "revisions", args.revision);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (!fs.existsSync(revisionDir)) {
  console.error(`[check-calibration] no such revision: ${revisionDir}`);
  process.exit(1);
}

export function scanRevision(dir) {
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".java"));
  const reports = [];
  for (const name of files) {
    const source = fs.readFileSync(path.join(dir, name), "utf8");
    const role = classifyJavaFile(name, source);
    if (role === "other") continue;
    const scan = scanCalibration(source, { role });
    reports.push({ file: name, ...scan });
  }
  const templates = reports.filter((r) => r.role === "template");
  const blocking = templates.flatMap((r) => r.blocking.map((b) => ({ ...b, file: r.file })));
  return {
    revision: dir,
    files: reports.map((r) => ({ file: r.file, role: r.role, verdict: r.verdict, counts: r.counts })),
    findings: reports.flatMap((r) => r.findings.map((f) => ({ ...f, file: r.file }))),
    blocking,
    verdict: blocking.length ? "calibrated" : reports.some((r) => r.findings.length) ? "leaning" : "derived",
  };
}

const report = scanRevision(revisionDir);

if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`[check-calibration] ${report.verdict} — ${report.findings.length} finding(s) in ${report.files.length} file(s)`);
  for (const f of report.files) {
    const counts = Object.entries(f.counts).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing";
    console.log(`  ${f.role.padEnd(8)} ${f.file}: ${counts}`);
  }
  const shown = report.findings.slice(0, 12);
  for (const f of shown) console.log(`    ${f.file}:${f.line}  ${f.kind}  ${f.detail}`);
  if (report.findings.length > shown.length) console.log(`    … and ${report.findings.length - shown.length} more`);
  if (report.blocking.length) {
    console.log("\n  the gate would refuse this template:");
    for (const b of report.blocking) console.log(`    - ${b.id}: ${b.detail}`);
    console.log(
      "\n  Move calibrated values into the theme as named tokens, replace reference-pixel arithmetic with\n" +
        "  anchors and derived constants (authoring-rules.md), or record a waiver at approval with the reason.",
    );
  } else if (report.findings.length) {
    console.log("\n  Evidence, not a refusal: the template leans on calibrated values but stays under the gate.");
  }
}
process.exit(report.verdict === "calibrated" ? 2 : 0);
