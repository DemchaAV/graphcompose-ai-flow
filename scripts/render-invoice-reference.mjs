#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const revisionId = parseRevisionId(process.argv.slice(2));
const invoiceDir = path.join(repoRoot, "examples", "invoice-reference");
const revisionDir = path.join(invoiceDir, "revisions", revisionId);
const runnerDir = path.join(invoiceDir, "render-runner");
const previewRendererDir = path.join(repoRoot, "tools", "preview-renderer");
const runnerPom = path.join(runnerDir, "pom.xml");
const previewRendererPom = path.join(previewRendererDir, "pom.xml");
const previewRendererJar = path.join(previewRendererDir, "target", "preview-renderer.jar");
const classpathFile = path.join(runnerDir, "target", "runtime-classpath.txt");
const renderClasspathFile = path.join(runnerDir, "target", `${revisionId}-render-classpath.txt`);

if (!fs.existsSync(revisionDir)) {
  console.error(`revision not found: ${revisionDir}`);
  process.exit(2);
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

run("java", [
  "-jar",
  previewRendererJar,
  "render",
  "--revision",
  revisionDir,
  "--template-class",
  "com.demcha.examples.invoice.GeneratedInvoiceTemplate",
  "--classpath-file",
  renderClasspathFile,
  "--spec-provider",
  "com.demcha.examples.invoice.SampleInvoiceSpecProvider",
  "--output",
  "output.pdf",
  "--preview",
  "output.png",
  "--dpi",
  "150",
  "--page",
  "0",
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
