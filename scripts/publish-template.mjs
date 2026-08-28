#!/usr/bin/env node
/**
 * Template Publisher — deterministic copy step.
 *
 * Promotes an APPROVED revision of an example project into a
 * publish-quality bundle under `templates/<template-id>/`. Everything here is
 * mechanical — file copy, class renaming, manifest write — and the result is
 * assembled beside the bundle, scanned, and moved into place only if it passes.
 * A bundle therefore either matches its APPROVED revision or is not touched:
 * the run that cannot replace it says so and changes nothing.
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
 *     [--version 1.2.0]                  (default: the bundle's current version, else 1.0.0)
 *     [--allow-unapproved]               (publish a non-APPROVED revision; development only)
 *     [--dry-run]                        (print plan only)
 *
 * The manifest it writes is `schemas/template-manifest.schema.json` at
 * schemaVersion 1.1.0: the flat fields every bundle has always carried, plus the
 * consumer contract — `entrypoint`, `data`, `resources`, `graphComposeVersion`,
 * `pageCount` — so a generated runner or pom substitutes names rather than
 * inferring them. Read a bundle back through `scripts/lib/template-bundle.mjs`,
 * which back-fills that contract for the 1.0.0 bundles already on disk.
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
import {
  deriveData,
  deriveResources,
  fqcn,
  bundleSources,
  normaliseDependencies,
  packageOf,
  previewPageCount,
  toBundleId,
} from "./lib/template-bundle.mjs";
import { blocking, formatFinding, known, scanPortability } from "./lib/bundle-portability.mjs";
import { classify, emit, inspect } from "./lib/bundle-split.mjs";

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
 *
 * A staged path is shown as the place it is going. The staging directory is an
 * implementation detail of "assemble, then move"; a log full of
 * `.publishing-mint-editorial-cv/` would make every path in the run look like a
 * mistake.
 */
function display(target) {
  const text = String(target);
  const staged = text.startsWith(targetDir) ? bundleDir + text.slice(targetDir.length) : target;
  for (const base of [workspace.root, repoRoot]) {
    const rel = path.relative(base, staged);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return base === repoRoot ? rel : path.join(path.basename(base), rel);
    }
  }
  return staged;
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
const templateId = args["template-id"] || toBundleId(displayName);
const className = args["class-name"] || pascalCase(displayName) + "Template";
const docKind = args["doc-kind"] || inferDocKind(revisionDir);

/** Where the bundle lives, and where this run assembles it before it goes there. */
const bundleDir = path.join(workspace.templatesDir, templateId);

/**
 * The publish is staged and moved into place, rather than written where the
 * bundle lives.
 *
 * The scans below used to run on the bundle after every file had been written
 * over it, and the abort they raise says "not leaving it in this state" while
 * doing exactly that: four bundles ended a batch published *and* refused,
 * because a Javadoc line naming a revision is only visible once the file is on
 * disk. Assembling beside the bundle and moving in at the end makes a refusal a
 * refusal — the bundle a consumer has keeps working, and the run that could not
 * replace it says so and changes nothing.
 *
 * It also retires the stale sweep: a directory that starts empty cannot carry
 * a previous run's leftovers. What the move discards is still reported, because
 * "the renamed class is gone" is worth reading.
 */
const targetDir = path.join(workspace.templatesDir, `.publishing-${templateId}`);
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
console.log(`[publish-template] targetDir     = ${display(bundleDir)}`);

if (args["dry-run"]) {
  console.log("[publish-template] --dry-run set; not writing files.");
  process.exit(0);
}

// A staging directory left by a run that was killed rather than aborted.
fs.rmSync(targetDir, { recursive: true, force: true });
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
const renamedSource = fs
  .readFileSync(sourceClassFile, "utf8")
  .replace(new RegExp(`\\b${sourceClassName}\\b`, "g"), className);

/**
 * How the bundle's `src/` is laid out.
 *
 * The revision is one file on purpose: `source.mjs`, `check-structural-smells`
 * and `restore-component` all address a single template, and reading one method
 * out of it is what keeps a loop pass cheap. The bundle has the opposite reader
 * — a person who has to maintain it — so it is split into the structure the
 * document already has, once, here.
 *
 * `auto` splits when the split can be proven and publishes flat when it cannot.
 * It never fails: a template this cannot account for is published exactly as it
 * was, with the reason on the manifest, because a bundle that ships is worth
 * more than a layout that is prettier.
 */
// `parseArgs` gives `true` for a flag with no value, and coercing that to the
// default made a dropped value mean `auto` in silence — a caller who meant
// `flat` got a structured bundle and no diagnostic.
if (args.layout === true) abort("--layout needs a value: auto, structured or flat");
const layoutMode = args.layout ?? "auto";
if (!["auto", "structured", "flat"].includes(layoutMode)) {
  abort(`--layout must be auto, structured or flat (got "${layoutMode}")`);
}

let layout = "flat";
let layoutReason = null;
let layoutDetail = null;

if (layoutMode === "flat") {
  layoutReason = "--layout flat";
} else {
  const classification = classify(renamedSource, { plan: readArchitecturePlan(revisionDir) });

  // A plan entry naming a method the source does not declare no longer refuses
  // the split — it just names nothing, so the section it was meant to name is
  // called after its method instead. Said out loud because the region name is
  // the better one and the revision is where it gets fixed.
  for (const drift of classification.planDrift) {
    console.log(
      `[publish-template] plan drift    = ${drift.renderMethod}() is not declared; ` +
        `"${drift.region ?? "?"}" names no section`,
    );
  }

  // The note would have become that section's Javadoc, and it says something a
  // consumer cannot use. Named against the plan entry, which is where it is
  // edited — the scanner that used to catch this named the generated file.
  for (const dropped of classification.notesDropped) {
    console.log(
      `[publish-template] note dropped  = "${dropped.region ?? dropped.renderMethod}" — ` +
        `${dropped.message}`,
    );
  }

  if (!classification.feasible) {
    layoutReason = classification.reason;
    if (layoutMode === "structured") {
      abort(`--layout structured, but this template cannot be split: ${classification.reason}`);
    }
  } else {
    const basePackage = packageOf(sourceClassFile);
    if (!basePackage) {
      layoutReason = "the template declares no package";
      if (layoutMode === "structured") abort(`--layout structured, but ${layoutReason}`);
    } else {
      const split = emit(classification, { source: renamedSource, basePackage, className });

      // Read before written. A classification can be feasible and still emit a
      // set javac refuses — a declaration carried twice, a record method left
      // package-private — or one that compiles and renders wrong, which is what
      // a static-initialisation cycle between `theme/` and `support/` does.
      // All three happened, and all three were found by a Maven build on
      // someone else's machine. `inspect` reads the same text here, for the
      // price of a string scan, and an unsound split falls back to a layout
      // that is merely plainer.
      const unsound = inspect(classification, split.files);
      if (unsound.length > 0) {
        for (const finding of unsound) {
          console.error(`[publish-template] unsound split: ${finding.file}: ${finding.detail}`);
        }
        layoutReason = `the split would not hold: ${unsound[0].kind} in ${unsound[0].file}`;
        if (layoutMode === "structured") abort(`--layout structured, but ${layoutReason}`);
      } else {
        for (const [rel, contents] of split.files) {
          const target = path.join(targetSrcDir, ...rel.split("/"));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          writeJavaFile(target, contents);
        }
        layout = "structured";
        layoutDetail = split.layout;
        console.log(
          `[publish-template] layout        = structured ` +
            `(${split.layout.sections.length} section(s), ${split.layout.composites.length} composite(s), ` +
            `${split.files.size} file(s))`,
        );
      }
    }
  }
}

if (layout === "flat") {
  console.log(`[publish-template] layout        = flat (${layoutReason ?? "no reason given"})`);
  writeJavaFile(targetClassFile, renamedSource);
}

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

const dependencies = readRunnerDependencies(
  path.join(projectDir, "render-runner", "pom.xml"),
  projectMeta.targetGraphComposeVersion ?? null,
);

// The consumer contract. Everything below this comment answers a question a
// generated runner or build file would otherwise have to guess at, and every
// one of them is knowable here: the publisher just wrote the files.
//
// It is derived from the bundle rather than from the revision on purpose. What
// a consumer receives is this directory — if the data file was skipped because
// the template ships hard-coded content, the manifest has to say so, and the
// only witness to that is the bundle itself.
const publishedPackage = packageOf(targetClassFile);
const entrypoint = {
  templateClass: fqcn(publishedPackage, className),
  specClass: specClassFqcn ?? null,
  providerClass: specProviderFqcn ?? null,
};

// Preserved, not incremented. Whether consumers must re-integrate is an
// editorial judgement about what changed in the layout, and a publish step
// cannot make it; --version is how it is made deliberately.
// From the bundle, not from the staging directory: this asks what the version
// was before this run, and staging has no before.
const previousManifest = readJsonIfExists(path.join(bundleDir, "template.json"));
const bundleVersion =
  (typeof args.version === "string" ? args.version : null)
  ?? previousManifest?.version
  ?? "1.0.0";

// The bundle is the approved revision and nothing else — a renamed class, an
// asset the data no longer names, a preview page a shorter document no longer
// has. A stale `.java` still compiles, so nothing downstream would notice.
//
// The sweep that used to enforce this is gone with the directory it swept: this
// run assembles in an empty one, so there is nothing of a previous publish to
// carry over. What the move at the end discards is reported there instead.
const manifestPath = path.join(targetDir, "template.json");

const manifest = {
  id: templateId,
  displayName,
  version: bundleVersion,
  sourceProject: project,
  sourceRevision: revisionId,
  sourceCommit: tryGitHead(),
  className,
  specClass: specClassFqcn ?? null,
  specProviderClass: specProviderFqcn ?? null,
  entrypoint,
  data: deriveData(targetDir, docKind),
  resources: deriveResources(targetDir),
  docKind,
  graphComposeVersion:
    normaliseDependencies(dependencies)
      .find((d) => d.coordinate === "io.github.demchaav:graph-compose")?.version ?? null,
  pageCount: previewPageCount(targetDir),
  // How `src/` is laid out, and why, when it is not the structured one. A
  // consumer reading the manifest should not have to infer the shape of the
  // directory beside it, and a run that fell back needs to say so somewhere
  // more durable than a console line.
  layout,
  layoutReason: layout === "structured" ? null : layoutReason,
  structure: layoutDetail,
  sources: bundleSources(targetDir),
  schemaVersion: "1.2.0",
  publishedAt: new Date().toISOString(),
  fonts: fontRoles,
  dependencies,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`[publish-template] wrote ${display(manifestPath)}`);

// Nothing above proves the bundle is self-consistent, and the failures it can
// leave are quiet ones: a name that no longer resolves, a path that only exists
// on the publishing machine. Both are cheap to detect and expensive to meet as
// a consumer, so they fail the publish rather than being reported afterwards.
const scanFindings = scanBundle(targetDir, { sourceClassName, className, revisionId });

// Portability is checked by the same scanner the verifier runs, so a bundle
// cannot pass publishing and then fail the consumer gate for a reason
// publishing could have caught. A `known` finding is a leak that is real and
// scheduled: it prints on every publish so it cannot be forgotten, and does not
// stop a publish that would otherwise be correct.
const portability = scanPortability(targetDir);
for (const finding of known(portability)) {
  console.warn(`[publish-template] known leak: ${formatFinding(finding)}`);
}
const blockers = blocking(portability).map(formatFinding);

const problems = [...scanFindings, ...blockers];
if (problems.length > 0) {
  for (const finding of problems) {
    console.error(`[publish-template] ${finding}`);
  }
  abort(
    `${problems.length} problem(s) in the bundle this run assembled; `
      + `${fs.existsSync(bundleDir) ? "the published one is untouched" : "nothing was published"}`,
  );
}

// Everything has passed, so the assembled bundle becomes the bundle. The README
// is the one file the publisher does not write and a person does, so it is
// carried across rather than lost to the move.
const carriedReadme = path.join(bundleDir, "README.md");
if (fs.existsSync(carriedReadme) && !fs.existsSync(path.join(targetDir, "README.md"))) {
  fs.copyFileSync(carriedReadme, path.join(targetDir, "README.md"));
}
for (const stale of discarded(bundleDir, targetDir)) {
  console.log(`[publish-template] removed stale ${display(path.join(targetDir, stale))}`);
}
fs.rmSync(bundleDir, { recursive: true, force: true });
fs.renameSync(targetDir, bundleDir);

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
  fs.writeFileSync(destPath, content, "utf8");
  console.log(
    `[publish-template] copied ${display(srcPath)} -> ${display(destPath)} (${against(destPath, content)})`,
  );
}

/**
 * Write one published source, and say whether it changed.
 *
 * The state matters more than the write. A bundle is the published form of one
 * approved revision, and an `UPDATED` on a republish is the only signal that
 * what was on disk had drifted from what the revision holds — the failure this
 * whole file was rewritten to prevent.
 */
function writeJavaFile(destPath, contents) {
  const state = against(destPath, contents);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, contents, "utf8");
  console.log(`[publish-template] wrote ${display(destPath)} (${state})`);
}

/**
 * How what is about to be staged compares with what the bundle already ships.
 *
 * Against the bundle, not against the staging directory, which is empty by
 * construction and would report every file as new. `UPDATED` on a republish is
 * the only signal that what was on disk had drifted from what the revision
 * holds — the failure this whole file was rewritten to prevent.
 */
function against(destPath, contents) {
  const published = bundleDir + String(destPath).slice(targetDir.length);
  if (!String(destPath).startsWith(targetDir) || !fs.existsSync(published)) return "new";
  return fs.readFileSync(published, "utf8") === contents ? "unchanged" : "UPDATED";
}

function copyJavaSource(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) {
    abort(`Source class missing: ${srcPath}`);
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`[publish-template] copied ${display(srcPath)} -> ${display(destPath)}`);
}

function copyFile(srcPath, destPath) {
  fs.copyFileSync(srcPath, destPath);
  console.log(`[publish-template] copied ${display(srcPath)} -> ${display(destPath)}`);
}

/**
 * What the published bundle has that the assembled one does not.
 *
 * The stale sweep this replaces deleted files in place, which is what made a
 * failed publish destructive. The move does the deleting now; this only reads,
 * so the run can still say "the renamed class is gone" — which was the useful
 * half of the sweep.
 *
 * @returns {Array<string>} paths relative to the bundle
 */
function discarded(previous, assembled) {
  if (!fs.existsSync(previous)) return [];
  const under = (root) =>
    new Set([...walkFiles(root)].map((file) => path.relative(root, file).split(path.sep).join("/")));
  const now = under(assembled);
  // README.md is carried across before this runs, so it is never discarded; the
  // check stays for a caller that reorders them.
  return [...under(previous)].filter((rel) => rel !== "README.md" && !now.has(rel)).sort();
}


/**
 * The revision's machine-readable architecture plan, when it wrote one.
 *
 * Optional on purpose. Only the newest projects carry `architecture-plan.json`;
 * older ones have the prose `.md`, whose component table maps regions to
 * *primitives* rather than to methods and cannot name a section. Absent, the
 * split falls back to the `render*` prefix — the naming rule the harness
 * enforces anyway — so a plan is an improvement to the names, never a
 * precondition for the split.
 */
function readArchitecturePlan(dir) {
  const file = path.join(dir, "architecture-plan.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (cause) {
    console.warn(`[publish-template] WARN: architecture-plan.json is not valid JSON (${cause.message}); splitting on method names instead.`);
    return null;
  }
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
  // The staging directory is this run's workspace and nothing else's. Leaving
  // it behind would make the next run's "a directory that starts empty" untrue,
  // and would put a `.publishing-*` directory beside the templates a person
  // browses.
  try {
    if (typeof targetDir === "string") fs.rmSync(targetDir, { recursive: true, force: true });
  } catch {
    /* the exit code is the message; a failed cleanup must not hide it */
  }
  process.exit(1);
}
