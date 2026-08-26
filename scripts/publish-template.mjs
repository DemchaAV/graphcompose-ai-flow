#!/usr/bin/env node
/**
 * Template Publisher — deterministic copy step.
 *
 * Promotes an APPROVED revision of an example project into a
 * publish-quality bundle under `templates/<template-id>/`. Everything here is
 * mechanical — file copy, class renaming, manifest write — and the result is
 * scanned before it is left on disk, so a bundle either matches its APPROVED
 * revision or the publish fails.
 *
 * It deliberately owns no editorial step. An earlier version left the template
 * class alone once it existed, so that a later publish would not discard the
 * Javadoc an agent had written on top of it; the cost was that the bundle could
 * silently stop matching the revision it claimed to come from.
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
 *     [--allow-unapproved]               (publish a non-APPROVED revision; development only)
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

/**
 * Every path this run wrote into the bundle.
 *
 * A bundle is not a directory that accumulates; it is the published form of one
 * approved revision. Anything in it this run did not write came from a previous
 * one, and a renamed template class is exactly how a bundle ends up shipping two
 * templates, one of them dead — which still compiles, so nothing downstream
 * notices.
 */
const written = new Set();
const record = (destPath) => written.add(path.resolve(destPath));

const repoRoot = installRoot();

const args = parseArgs(process.argv.slice(2));
const project = required(args, "project");
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const workspaceBanner = describeWorkspaceLine(workspace);
if (workspaceBanner) console.log(workspaceBanner);

/**
 * Path as a reader can act on it. Relative to whichever root actually contains
 * it — the workspace for work, the install for the harness — and absolute when
 * it is inside neither. Printing everything relative to the install root gave
 * "..\..\..\tmp\..." once the workspace moved out of this repository, which
 * tells a user nothing about where their bundle went.
 */
function display(target) {
  for (const base of [workspace.root, repoRoot]) {
    const rel = path.relative(base, target);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return base === repoRoot ? rel : path.join(path.basename(base), rel);
    }
  }
  return target;
}

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
// A published bundle is what someone else builds against, so it may only ever
// come from an APPROVED revision. This used to warn and continue, which meant
// an explicit --revision could ship a DRAFT under the same template id as the
// approved one — indistinguishable afterwards.
if (revisionMeta.status !== "APPROVED" && !args["allow-unapproved"]) {
  abort(
    `revision ${revisionId} is ${revisionMeta.status}, not APPROVED. ` +
      "Approve it first (graphcompose-flow approve), or pass --allow-unapproved " +
      "if you are publishing a scratch bundle during development.",
  );
}
if (revisionMeta.status !== "APPROVED") {
  console.warn(
    `[publish-template] WARN: publishing ${revisionMeta.status} revision ${revisionId} ` +
      "because --allow-unapproved was passed. This bundle does not correspond to an " +
      "approved revision.",
  );
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
console.log(`[publish-template] targetDir     = ${display(targetDir)}`);

if (args["dry-run"]) {
  console.log("[publish-template] --dry-run set; not writing files.");
  process.exit(0);
}

mkdirp(targetSrcDir, targetDataDir, targetAssetsDir, targetIconsDir, targetPreviewDir);

// Accept either name, exactly as the render-runner pom does: the flow writes
// "generated-template.java", and an IDE renames it to match the public class
// the moment anyone opens it. The pom has taken both since it was written; the
// publisher took only the first, so a revision that had been opened in an IDE
// approved cleanly and then failed to publish, with the approval already done.
// The canonical name wins when both exist, matching the pom's condition.
const declaredClassName =
  simpleClassName(projectMeta.render && projectMeta.render.templateClass)
  || simpleClassName(projectMeta.templateClass);
const flowName = path.join(revisionDir, "generated-template.java");
const canonicalName = declaredClassName ? path.join(revisionDir, `${declaredClassName}.java`) : null;
const sourceClassFile =
  canonicalName && fs.existsSync(canonicalName) ? canonicalName : flowName;

// Both names, when neither is there. Reporting one of two candidates is how the
// failure this whole branch exists to fix stayed opaque: the reader is told a
// file is missing and never learns the other name was tried too.
if (!fs.existsSync(sourceClassFile)) {
  abort(
    `no template source in ${revisionDir} — looked for ` +
      [canonicalName, flowName]
        .filter(Boolean)
        .map((file) => path.basename(file))
        .join(" and "),
  );
}

const targetClassFile = path.join(targetSrcDir, `${className}.java`);
const sourceClassName =
  declaredClassName
  || inferPublicClassName(sourceClassFile)
  || "GeneratedCvTemplate";
// The published class is always rewritten from the revision. It used to be
// preserved when it already existed, so that a later publish would not discard
// the editorial Javadoc an agent had added on top — but the cost was that an
// APPROVED revision and its published bundle could hold different code, with
// nothing reporting the divergence. Editorial polish belongs in the revision's
// generated-template.java, where the next render actually exercises it.
copyJavaClass(sourceClassFile, targetClassFile, {
  oldClassName: sourceClassName,
  newClassName: className,
});

const runnerSrcDir = path.join(projectDir, "render-runner", "src", "main", "java");
const specClassFqcn = projectMeta.specClass;
const specProviderFqcn = projectMeta.specProviderClass;
// The spec and provider were copied verbatim, so their Javadoc kept naming the
// revision-local class ("GeneratedCvTemplate") that no longer exists in the
// bundle. Every published source gets the same rename; the post-publish scan
// below fails the run if any reference survives.
if (specClassFqcn) {
  const specSrc = fqcnToPath(runnerSrcDir, specClassFqcn);
  copyJavaClass(specSrc, path.join(targetSrcDir, path.basename(specSrc)), {
    oldClassName: sourceClassName,
    newClassName: className,
  });
}
if (specProviderFqcn) {
  const providerSrc = fqcnToPath(runnerSrcDir, specProviderFqcn);
  copyJavaClass(providerSrc, path.join(targetSrcDir, path.basename(providerSrc)), {
    oldClassName: sourceClassName,
    newClassName: className,
  });
}

const sourceDataFile = path.join(revisionDir, `${docKind}-data.json`);
if (fs.existsSync(sourceDataFile)) {
  copyFile(sourceDataFile, path.join(targetDataDir, `${docKind}-data.example.json`));
} else {
  console.log(`[publish-template] data file ${display(sourceDataFile)} not found; skipping data copy. Templates that ship hard-coded content do not need a data file.`);
}

const sourceAssetRequest = path.join(revisionDir, "asset-request.json");
if (fs.existsSync(sourceAssetRequest)) {
  copyFile(sourceAssetRequest, path.join(targetAssetsDir, "asset-request.json"));
}
// The manifest goes to the bundle ROOT, beside template.json, because that is
// where a template looks for it: the authoring rules make assets-manifest.json
// the source of truth for what was actually resolved — the file, the format, the
// point size — so a template reads it rather than hardcoding an extension, and
// resolves it against graphcompose.revision.dir, which is the bundle root once
// published. Copying the request but not the manifest published a bundle that
// compiled and then failed at render with "No icon resolved for token", which is
// the exact failure the comment below says this step exists to prevent.
const sourceAssetsManifest = path.join(revisionDir, "assets-manifest.json");
if (fs.existsSync(sourceAssetsManifest)) {
  // Rewritten rather than copied. `revisionDir` names the folder the manifest
  // describes, and in a bundle that is the bundle itself — left as it was, it
  // points at revisions/<id> on the machine that published, which is both a
  // dead path for a consumer and something the bundle scan below correctly
  // refuses to ship. Everything else is carried over untouched: the icon file
  // paths are already relative to this directory.
  const published = JSON.parse(fs.readFileSync(sourceAssetsManifest, "utf8"));
  published.revisionDir = ".";
  const publishedManifestPath = path.join(targetDir, "assets-manifest.json");
  fs.writeFileSync(publishedManifestPath, `${JSON.stringify(published, null, 2)}
`, "utf8");
  // Recorded, or the stale sweep at the end of this run deletes it again: that
  // sweep removes whatever this run did not write, and a file written without
  // record() looks exactly like leftovers from a previous publish.
  record(publishedManifestPath);
  console.log(`[publish-template] wrote ${display(publishedManifestPath)}`);
}
// Everything under the revision's assets/, not just icons/. The old code
// copied assets/icons/* and assets/fonts/*, so an image the template actually
// loads — an avatar, a logo, a signature — was dropped without a word, and the
// published data file went on referencing it. A bundle that cannot render its
// own example data is the failure this whole step exists to prevent.
const sourceAssetsDir = path.join(revisionDir, "assets");
if (fs.existsSync(sourceAssetsDir)) {
  copyTree(sourceAssetsDir, targetAssetsDir, (rel) => !rel.startsWith("fonts"));
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
  dependencies: readRunnerDependencies(
    path.join(projectDir, "render-runner", "pom.xml"),
    projectMeta.targetGraphComposeVersion ?? null,
  ),
};
const manifestPath = path.join(targetDir, "template.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
record(manifestPath);
console.log(`[publish-template] wrote ${display(manifestPath)}`);

// The bundle is the approved revision and nothing else. Anything this run did
// not write is left over from a previous one: a renamed class, an asset the
// data no longer names, a preview page a shorter document no longer has. A
// stale .java still compiles, so nothing downstream would have noticed.
const pruned = pruneStale(targetDir, written);
for (const stale of pruned) {
  console.log(`[publish-template] removed stale ${display(stale)}`);
}

// Nothing above proves the bundle is self-consistent, and the failures it can
// leave are quiet ones: a name that no longer resolves, a path that only exists
// on the publishing machine. Both are cheap to detect and expensive to meet as
// a consumer, so they fail the publish rather than being reported afterwards.
const scanFindings = scanBundle(targetDir, { sourceClassName, className, revisionId });
if (scanFindings.length > 0) {
  for (const finding of scanFindings) {
    console.error(`[publish-template] ${finding}`);
  }
  abort(`${scanFindings.length} problem(s) in the published bundle; not leaving it in this state`);
}

console.log(`[publish-template] done. Verify it builds and renders on its own:`);
console.log(`[publish-template]   node scripts/verify-published-template.mjs --template-id ${templateId}` +
  (args.root ? ` --root ${args.root}` : ""));

/**
 * Read what the render runner really depends on. The manifest used to hardcode
 * graphcompose + jackson, so a bundle that needed graph-compose-fonts said so
 * only in its README — the prose knew more than the machine-readable manifest,
 * and a generated build file from that manifest would not compile.
 */
function readRunnerDependencies(pomPath, fallbackGraphCompose) {
  const fallback = { graphcompose: fallbackGraphCompose };
  if (!fs.existsSync(pomPath)) return fallback;

  const pom = fs.readFileSync(pomPath, "utf8");
  const properties = new Map();
  for (const [, key, value] of pom.matchAll(/<([\w.]+)>([^<]*)<\/\1>/g)) {
    if (key.includes(".")) properties.set(key, value.trim());
  }
  const resolve = (raw) => {
    const text = (raw ?? "").trim();
    const property = text.match(/^\$\{([\w.]+)\}$/);
    return property ? (properties.get(property[1]) ?? null) : (text || null);
  };

  const found = {};
  for (const [, block] of pom.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const groupId = block.match(/<groupId>([^<]*)<\/groupId>/)?.[1]?.trim();
    const artifactId = block.match(/<artifactId>([^<]*)<\/artifactId>/)?.[1]?.trim();
    if (!groupId || !artifactId) continue;
    const version = resolve(block.match(/<version>([^<]*)<\/version>/)?.[1]);
    found[`${groupId}:${artifactId}`] = version;
  }
  return Object.keys(found).length > 0 ? found : fallback;
}

/**
 * Look for the two things a copy step gets wrong quietly: a name carried over
 * from the revision that no longer exists here, and a path that only resolves
 * on the machine that published.
 */
function scanBundle(root, { sourceClassName: oldName, className: newName, revisionId: revision }) {
  const findings = [];
  // `\b` has to be escaped twice here: once for the template literal, which
  // would otherwise turn it into a backspace, and once for the regex.
  const stale = oldName && oldName !== newName ? new RegExp(`\\b${oldName}\\b`) : null;
  const absolute = /(?:^|[\s"'(<])(?:[A-Za-z]:[\\/]|\/(?:home|Users)\/)/;
  const revisionLocal = revision ? new RegExp(`revisions[\\\\/]${revision}\\b`) : null;

  for (const file of walkFiles(root)) {
    if (!/\.(java|md|json)$/i.test(file)) continue;
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const at = `${rel}:${index + 1}`;
      if (stale && stale.test(line)) {
        findings.push(`${at} still names the revision-local class ${oldName} (should be ${newName})`);
      }
      if (absolute.test(line)) {
        findings.push(`${at} carries an absolute path, which resolves only where this was published`);
      }
      if (revisionLocal && revisionLocal.test(line)) {
        findings.push(`${at} points back into revisions/${revision}, which no consumer has`);
      }
    });
  }
  return findings;
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

/** Copy a directory tree, skipping paths the filter rejects. */
function copyTree(srcDir, destDir, keep = () => true, relPrefix = "") {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
    if (!keep(rel)) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest, keep, rel);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      copyFile(src, dest);
    }
  }
}

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
  const previous = fs.existsSync(destPath) ? fs.readFileSync(destPath, "utf8") : null;
  fs.writeFileSync(destPath, content, "utf8");
  record(destPath);
  const state = previous === null ? "new" : previous === content ? "unchanged" : "UPDATED";
  console.log(`[publish-template] copied ${display(srcPath)} -> ${display(destPath)} (${state})`);
}

function copyJavaSource(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) {
    abort(`Source class missing: ${srcPath}`);
  }
  fs.copyFileSync(srcPath, destPath);
  record(destPath);
  console.log(`[publish-template] copied ${display(srcPath)} -> ${display(destPath)}`);
}

function copyFile(srcPath, destPath) {
  fs.copyFileSync(srcPath, destPath);
  record(destPath);
  console.log(`[publish-template] copied ${display(srcPath)} -> ${display(destPath)}`);
}

/**
 * Delete everything under the bundle this run did not write.
 *
 * README.md survives: the publisher does not write it, and it carries the
 * hand-written half that approve-and-publish is careful to preserve. Removing
 * it here would delete the one part of a bundle a person authored.
 */
function pruneStale(root, keep) {
  const PRESERVE = new Set(["README.md"]);
  const removed = [];

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        // A directory that emptied out was only there for files that are gone.
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        continue;
      }
      if (PRESERVE.has(path.relative(root, full))) continue;
      if (keep.has(path.resolve(full))) continue;
      fs.rmSync(full, { force: true });
      removed.push(full);
    }
  };

  walk(root);
  return removed;
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
    console.warn(`[publish-template] WARN: could not parse ${display(filePath)}: ${cause.message}`);
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
