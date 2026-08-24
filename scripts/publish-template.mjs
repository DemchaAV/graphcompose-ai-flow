#!/usr/bin/env node
/**
 * Template Publisher — deterministic copy step.
 *
 * Promotes an APPROVED revision of an example project into a
 * publish-quality bundle under `templates/<template-id>/`. This script
 * owns the mechanical work (file copy, class renaming via string
 * substitution, manifest write); the Template Publisher Agent owns
 * the editorial Javadoc polish on top.
 *
 * The project is read from, and the bundle written into, the resolved
 * workspace: --root, else GRAPHCOMPOSE_FLOW_ROOT, else a graphcompose-flow/
 * directory found above the cwd, else this repository's own examples/ +
 * templates/ (see scripts/lib/workspace.mjs).
 *
 * Usage:
 *   node scripts/publish-template.mjs \
 *     --project cv-reference            (required — a project in the workspace)
 *     [--root <workspace>]               (default: discovered, see above)
 *     [--revision revision-006]          (default: template-project.json#currentApprovedRevisionId)
 *     [--template-id mint-editorial-cv]  (default: kebab(displayName))
 *     [--class-name MintEditorialCvTemplate] (default: pascal(displayName) + "Template")
 *     [--doc-kind cv]                    (default: derived from currentApprovedRevisionId's data file)
 *     [--dry-run]                        (print plan only)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const repoRoot = installRoot();

const args = parseArgs(process.argv.slice(2));
const project = required(args, "project");
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const workspaceBanner = describeWorkspaceLine(workspace);
if (workspaceBanner) console.log(workspaceBanner);

const projectDir = workspaceProjectDir(workspace, project);
const projectMetaPath = path.join(projectDir, "template-project.json");
if (!fs.existsSync(projectMetaPath)) {
  abort(`template-project.json not found: ${projectMetaPath}`);
}
const projectMeta = JSON.parse(fs.readFileSync(projectMetaPath, "utf8"));

const revisionId = args.revision || projectMeta.currentApprovedRevisionId;
if (!revisionId) {
  abort("No revision provided and template-project.json#currentApprovedRevisionId is null. Approve a revision or pass --revision.");
}
const revisionDir = path.join(projectDir, "revisions", revisionId);
if (!fs.existsSync(revisionDir)) {
  abort(`Revision folder not found: ${revisionDir}`);
}
const revisionMetaPath = path.join(revisionDir, "revision.json");
if (!fs.existsSync(revisionMetaPath)) {
  abort(`revision.json missing in ${revisionDir}`);
}
const revisionMeta = JSON.parse(fs.readFileSync(revisionMetaPath, "utf8"));
if (revisionMeta.status !== "APPROVED") {
  console.warn(`[publish-template] WARN: revision ${revisionId} status is "${revisionMeta.status}", not APPROVED. Proceeding anyway because --revision was provided explicitly.`);
}

const displayName = projectMeta.displayName || project;
const templateId = args["template-id"] || toKebab(displayName);
const className = args["class-name"] || pascalCase(displayName) + "Template";
const docKind = args["doc-kind"] || inferDocKind(revisionDir);

const targetDir = path.join(workspace.templatesDir, templateId);
const targetSrcDir = path.join(targetDir, "src");
const targetDataDir = path.join(targetDir, "data");
const targetAssetsDir = path.join(targetDir, "assets");
const targetIconsDir = path.join(targetAssetsDir, "icons");
const targetPreviewDir = path.join(targetDir, "preview");

console.log(`[publish-template] project       = ${project}`);
console.log(`[publish-template] revision      = ${revisionId}`);
console.log(`[publish-template] displayName   = ${displayName}`);
console.log(`[publish-template] templateId    = ${templateId}`);
console.log(`[publish-template] className     = ${className}`);
console.log(`[publish-template] docKind       = ${docKind}`);
console.log(`[publish-template] targetDir     = ${path.relative(repoRoot, targetDir)}`);

if (args["dry-run"]) {
  console.log("[publish-template] --dry-run set; not writing files.");
  process.exit(0);
}

mkdirp(targetSrcDir, targetDataDir, targetAssetsDir, targetIconsDir, targetPreviewDir);

const sourceClassFile = path.join(revisionDir, "generated-template.java");
const targetClassFile = path.join(targetSrcDir, `${className}.java`);
const sourceClassName =
  simpleClassName(projectMeta.render && projectMeta.render.templateClass)
  || simpleClassName(projectMeta.templateClass)
  || inferPublicClassName(sourceClassFile)
  || "GeneratedCvTemplate";
// The template class carries the agent's editorial Javadoc polish on
// top of the renamed source. Subsequent publishes preserve that work
// by default — pass --force-template to overwrite (e.g. after a real
// behavioural change in the revision's generated-template.java).
if (fs.existsSync(targetClassFile) && !args["force-template"]) {
  console.log(`[publish-template] ${path.relative(repoRoot, targetClassFile)} already exists; preserving the agent's Javadoc polish. Pass --force-template to overwrite.`);
} else {
  copyJavaClass(sourceClassFile, targetClassFile, {
    oldClassName: sourceClassName,
    newClassName: className,
  });
}

const runnerSrcDir = path.join(projectDir, "render-runner", "src", "main", "java");
const specClassFqcn = projectMeta.specClass;
const specProviderFqcn = projectMeta.specProviderClass;
if (specClassFqcn) {
  const specSrc = fqcnToPath(runnerSrcDir, specClassFqcn);
  copyJavaSource(specSrc, path.join(targetSrcDir, path.basename(specSrc)));
}
if (specProviderFqcn) {
  const providerSrc = fqcnToPath(runnerSrcDir, specProviderFqcn);
  copyJavaSource(providerSrc, path.join(targetSrcDir, path.basename(providerSrc)));
}

const sourceDataFile = path.join(revisionDir, `${docKind}-data.json`);
if (fs.existsSync(sourceDataFile)) {
  copyFile(sourceDataFile, path.join(targetDataDir, `${docKind}-data.example.json`));
} else {
  console.log(`[publish-template] data file ${path.relative(repoRoot, sourceDataFile)} not found; skipping data copy. Templates that ship hard-coded content do not need a data file.`);
}

const sourceAssetRequest = path.join(revisionDir, "asset-request.json");
if (fs.existsSync(sourceAssetRequest)) {
  copyFile(sourceAssetRequest, path.join(targetAssetsDir, "asset-request.json"));
}
const sourceIconsDir = path.join(revisionDir, "assets", "icons");
if (fs.existsSync(sourceIconsDir)) {
  for (const entry of fs.readdirSync(sourceIconsDir)) {
    copyFile(path.join(sourceIconsDir, entry), path.join(targetIconsDir, entry));
  }
}

// Copy custom font files when the revision shipped any. Bundled
// GraphCompose Google Fonts (DefaultFonts.googleFamilies) load from
// the JAR's classpath and need no copy here — the asset-resolver
// records those as source=graphcompose-bundled in the manifest, and
// the assets/fonts/ directory only exists for source=google-fonts
// (manual_drop_required) or source=custom roles.
const sourceFontsDir = path.join(revisionDir, "assets", "fonts");
const targetFontsDir = path.join(targetAssetsDir, "fonts");
if (fs.existsSync(sourceFontsDir)) {
  const fontFiles = fs.readdirSync(sourceFontsDir)
      .filter((name) => /\.(ttf|otf)$/i.test(name));
  if (fontFiles.length > 0) {
    mkdirp(targetFontsDir);
    for (const entry of fontFiles) {
      copyFile(path.join(sourceFontsDir, entry), path.join(targetFontsDir, entry));
    }
  }
}

for (const [src, dest] of [
  ["output.pdf",                  "output.pdf"],
  ["output.png",                  "output-page-1.png"],
  ["output-page-2.png",           "output-page-2.png"],
  // Debug variants — let downstream consumers SEE the GraphCompose
  // guide-line overlay so they can reason about layout when
  // customizing. Same render, just guides on.
  ["output-debug.pdf",            "output-debug.pdf"],
  ["output-debug.png",            "output-debug-page-1.png"],
  ["output-debug-page-2.png",     "output-debug-page-2.png"],
]) {
  const sourcePath = path.join(revisionDir, src);
  if (fs.existsSync(sourcePath)) {
    copyFile(sourcePath, path.join(targetPreviewDir, dest));
  }
}

// Pull the font roles from the asset manifest so the published bundle
// surfaces exactly which fonts it needs and how they should be loaded
// (bundled in the JAR vs file-resource registration vs standard-14).
const assetsManifest = readJsonIfExists(path.join(revisionDir, "assets-manifest.json"));
const fontRoles = assetsManifest && assetsManifest.fonts
  ? Object.entries(assetsManifest.fonts).map(([role, entry]) => ({
      role,
      family: entry.family ?? null,
      fontName: entry.fontName ?? null,
      source: entry.source ?? null,
      status: entry.status ?? null,
      registration: entry.registration ?? null,
      notes: entry.notes ?? null,
    }))
  : null;

const manifest = {
  id: templateId,
  displayName,
  sourceProject: project,
  sourceRevision: revisionId,
  sourceCommit: tryGitHead(),
  className,
  specClass: specClassFqcn ?? null,
  specProviderClass: specProviderFqcn ?? null,
  docKind,
  schemaVersion: "1.0.0",
  publishedAt: new Date().toISOString(),
  fonts: fontRoles,
  dependencies: {
    graphcompose: projectMeta.targetGraphComposeVersion ?? null,
    jackson: "2.17.2",
  },
};
const manifestPath = path.join(targetDir, "template.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`[publish-template] wrote ${path.relative(repoRoot, manifestPath)}`);

console.log(`[publish-template] done. Template Publisher Agent must now polish ${className}.java Javadoc and write/refresh README.md.`);

function copyJavaClass(srcPath, destPath, opts) {
  if (!fs.existsSync(srcPath)) {
    abort(`Source class missing: ${srcPath}`);
  }
  let content = fs.readFileSync(srcPath, "utf8");
  if (opts && opts.oldClassName && opts.newClassName) {
    const oldName = opts.oldClassName;
    const newName = opts.newClassName;
    content = content.replace(new RegExp(`\\b${oldName}\\b`, "g"), newName);
  }
  fs.writeFileSync(destPath, content, "utf8");
  console.log(`[publish-template] copied ${path.relative(repoRoot, srcPath)} -> ${path.relative(repoRoot, destPath)} (class renamed)`);
}

function copyJavaSource(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) {
    abort(`Source class missing: ${srcPath}`);
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`[publish-template] copied ${path.relative(repoRoot, srcPath)} -> ${path.relative(repoRoot, destPath)}`);
}

function copyFile(srcPath, destPath) {
  fs.copyFileSync(srcPath, destPath);
  console.log(`[publish-template] copied ${path.relative(repoRoot, srcPath)} -> ${path.relative(repoRoot, destPath)}`);
}

function mkdirp(...dirs) {
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function fqcnToPath(rootDir, fqcn) {
  return path.join(rootDir, ...fqcn.split(".")) + ".java";
}

function inferDocKind(revisionDir) {
  const entries = fs.readdirSync(revisionDir);
  const match = entries.find((name) => /-data\.json$/.test(name));
  if (!match) {
    return "cv";
  }
  return match.replace(/-data\.json$/, "");
}

function toKebab(s) {
  return s
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function pascalCase(s) {
  return s
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function simpleClassName(fqcn) {
  if (typeof fqcn !== "string" || fqcn.trim() === "") {
    return null;
  }
  const parts = fqcn.trim().split(".");
  return parts[parts.length - 1] || null;
}

function inferPublicClassName(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/\bpublic\s+final\s+class\s+([A-Za-z_$][\w$]*)\b/)
      || content.match(/\bpublic\s+class\s+([A-Za-z_$][\w$]*)\b/);
  return match ? match[1] : null;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (cause) {
    console.warn(`[publish-template] WARN: could not parse ${path.relative(repoRoot, filePath)}: ${cause.message}`);
    return null;
  }
}

function tryGitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot }).toString().trim();
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function required(args, name) {
  if (!args[name] || args[name] === true) {
    abort(`--${name} is required`);
  }
  return args[name];
}

function abort(msg) {
  console.error(`[publish-template] ${msg}`);
  process.exit(1);
}
