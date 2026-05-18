#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const revisionId = parseRevisionId(process.argv.slice(2));
const cvDir = path.join(repoRoot, "examples", "cv-reference");
const revisionDir = path.join(cvDir, "revisions", revisionId);
const runnerDir = path.join(cvDir, "render-runner");
const previewRendererDir = path.join(repoRoot, "tools", "preview-renderer");
const assetResolverCli = path.join(repoRoot, "tools", "asset-resolver", "src", "cli.mjs");
const assetRequestFile = path.join(revisionDir, "asset-request.json");
const runnerPom = path.join(runnerDir, "pom.xml");
const previewRendererPom = path.join(previewRendererDir, "pom.xml");
const previewRendererJar = path.join(previewRendererDir, "target", "preview-renderer.jar");
const classpathFile = path.join(runnerDir, "target", "runtime-classpath.txt");
const renderClasspathFile = path.join(runnerDir, "target", `${revisionId}-render-classpath.txt`);
const outputPdf = path.join(revisionDir, "output.pdf");
const pageTwoPreview = path.join(revisionDir, "output-page-2.png");

if (!fs.existsSync(revisionDir)) {
  console.error(`revision not found: ${revisionDir}`);
  process.exit(2);
}

if (fs.existsSync(assetRequestFile)) {
  console.log(`> asset-resolver --revision ${revisionDir}`);
  run("node", [assetResolverCli, "--revision", revisionDir], repoRoot);
} else {
  console.log(`> asset-resolver skipped (no ${path.relative(repoRoot, assetRequestFile)})`);
}

runMaven(["-q", "-B", "-f", previewRendererPom, "-DskipTests=true", "package"], repoRoot);
runMaven(["-q", "-B", "-f", runnerPom, `-Drevision.id=${revisionId}`, "-DskipTests=true", "package"], repoRoot);
runMaven([
  "-q",
  "-B",
  "-f",
  runnerPom,
  `-Drevision.id=${revisionId}`,
  "dependency:build-classpath",
  "-Dmdep.outputFile=target/runtime-classpath.txt",
], repoRoot);

const dependencyClasspath = fs.existsSync(classpathFile)
  ? fs.readFileSync(classpathFile, "utf8").trim()
  : "";
const classpath = [
  path.join(runnerDir, "target", "classes"),
  dependencyClasspath,
].filter(Boolean).join(path.delimiter);
fs.writeFileSync(renderClasspathFile, classpath, "utf8");

const cvDataFile = path.join(revisionDir, "cv-data.json");
const specProviderArgs = fs.existsSync(cvDataFile)
  ? ["--spec-provider", "com.demcha.examples.cv.MintEditorialCvSpecProvider"]
  : [];
if (specProviderArgs.length > 0) {
  console.log(`> using spec-provider for ${path.relative(repoRoot, cvDataFile)}`);
} else {
  console.log(`> spec-provider skipped (no ${path.relative(repoRoot, cvDataFile)})`);
}

// Render pass 1: clean PDF + previews (what the published bundle ships).
run("java", [
  `-Dgraphcompose.revision.dir=${revisionDir}`,
  "-jar",
  previewRendererJar,
  "render",
  "--revision",
  revisionDir,
  "--template-class",
  "com.demcha.examples.cv.GeneratedCvTemplate",
  ...specProviderArgs,
  "--classpath-file",
  renderClasspathFile,
  "--output",
  "output.pdf",
  "--preview",
  "output.png",
  "--dpi",
  "150",
  "--page",
  "0",
], repoRoot);

run("java", [
  "-jar",
  previewRendererJar,
  "preview",
  "--pdf",
  outputPdf,
  "--out",
  pageTwoPreview,
  "--dpi",
  "150",
  "--page",
  "1",
], repoRoot);

// Render pass 2: debug PDF with GraphCompose guide-line overlays.
// Same revision dir, same spec, same assets — only the convenience PDF
// gains the overlay. The layout snapshot and clean PDF are unchanged.
const debugPdf = path.join(revisionDir, "output-debug.pdf");
const debugPagePreview = path.join(revisionDir, "output-debug.png");
const debugPageTwoPreview = path.join(revisionDir, "output-debug-page-2.png");

console.log("> rendering debug pass with --guide-lines");
run("java", [
  `-Dgraphcompose.revision.dir=${revisionDir}`,
  "-jar",
  previewRendererJar,
  "render",
  "--revision",
  revisionDir,
  "--template-class",
  "com.demcha.examples.cv.GeneratedCvTemplate",
  ...specProviderArgs,
  "--classpath-file",
  renderClasspathFile,
  "--output",
  "output-debug.pdf",
  "--preview",
  "output-debug.png",
  "--dpi",
  "150",
  "--page",
  "0",
  "--guide-lines",
  "true",
], repoRoot);

run("java", [
  "-jar",
  previewRendererJar,
  "preview",
  "--pdf",
  debugPdf,
  "--out",
  debugPageTwoPreview,
  "--dpi",
  "150",
  "--page",
  "1",
], repoRoot);

function parseRevisionId(args) {
  let revision = "revision-002";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--revision" || arg === "-r") {
      revision = args[i + 1] ?? revision;
      i += 1;
      continue;
    }
    if (!arg.startsWith("--")) {
      revision = arg;
    }
  }
  return revision;
}

function runMaven(args, cwd) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "mvn", ...args], cwd);
    return;
  }
  run("mvn", args, cwd);
}

function run(command, args, cwd) {
  console.log(`> ${command} ${args.map(quoteArg).join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function quoteArg(arg) {
  return /\s/.test(arg) ? `"${arg}"` : arg;
}
