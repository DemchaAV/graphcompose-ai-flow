/**
 * scripts/lib/template-bundle.mjs — read a published bundle's contract, once.
 *
 * `templates/<id>/template.json` is what a consumer builds against, and there
 * are two of it. Bundles published before the consumer contract existed carry
 * a flat `className` / `specClass` / `specProviderClass` triple, a `dataFile`
 * that names the example but not the runtime name, and dependency keys in a
 * shorthand ("graphcompose", "jackson") that is not a Maven coordinate. Bundles
 * published after it carry `entrypoint`, `data`, `resources`, and real
 * coordinates.
 *
 * Every reader that expanded those shapes for itself got a different answer.
 * `generatePom` in verify-published-template.mjs expands "jackson" to
 * com.fasterxml.jackson.core:jackson-databind; `renderGeneratedHalf` in
 * approve-and-publish.mjs expanded the same key to io.github.demchaav:jackson
 * and printed it into the bundle README as the coordinate a consumer should
 * declare. Both read the same file. Only one was right.
 *
 * So this is the one place a manifest is expanded. `readManifest` returns a
 * normalised view in which the 1.0.0 and 1.1.0 shapes are indistinguishable:
 * the consumer contract is always present, derived from what is actually on
 * disk when the manifest does not declare it.
 *
 * The returned object is deliberately NOT the manifest. It carries fields
 * (`dependencyList`, `bundleDir`) that `schemas/template-manifest.schema.json`
 * forbids, so writing it back would produce a bundle that fails validation.
 * The manifest as written is under `.raw`, and that is what a writer edits.
 */

import fs from "node:fs";
import path from "node:path";

/** The manifest filename, so callers stop spelling it. */
export const MANIFEST_FILENAME = "template.json";

/** What a bundle is assumed to be when the manifest predates `version`. */
export const DEFAULT_BUNDLE_VERSION = "1.0.0";

/**
 * Dependency shorthand, expanded.
 *
 * These three keys are the whole pre-1.1.0 vocabulary — `readRunnerDependencies`
 * in publish-template.mjs has emitted real coordinates since it started reading
 * the runner pom, so nothing new arrives in this form. An unknown shorthand key
 * is treated as an artifactId in the GraphCompose group and flagged, rather than
 * silently becoming graph-compose: a wrong coordinate that compiles to the wrong
 * artifact is worse than one a caller can see is a guess.
 */
const SHORTHAND = new Map([
  ["graphcompose", ["io.github.demchaav", "graph-compose"]],
  ["graphcompose-fonts", ["io.github.demchaav", "graph-compose-fonts"]],
  ["jackson", ["com.fasterxml.jackson.core", "jackson-databind"]],
]);

/** The GraphCompose artifact, for lifting `graphComposeVersion` out of the map. */
const GRAPH_COMPOSE = "io.github.demchaav:graph-compose";

/**
 * Expand a manifest `dependencies` map into resolvable Maven coordinates.
 *
 * Insertion order is preserved, because it is the order a generated pom lists
 * them in and a diff of two generated poms should not churn.
 *
 * @param {Record<string, string|null>|null|undefined} dependencies
 * @returns {Array<{groupId: string, artifactId: string, version: string|null,
 *                  coordinate: string, key: string, assumedGroupId: boolean}>}
 */
export function normaliseDependencies(dependencies) {
  const out = [];
  for (const [key, version] of Object.entries(dependencies ?? {})) {
    let groupId;
    let artifactId;
    let assumedGroupId = false;
    if (key.includes(":")) {
      [groupId, artifactId] = key.split(":");
    } else if (SHORTHAND.has(key)) {
      [groupId, artifactId] = SHORTHAND.get(key);
    } else {
      groupId = "io.github.demchaav";
      artifactId = key;
      assumedGroupId = true;
    }
    out.push({
      groupId,
      artifactId,
      version: version ?? null,
      coordinate: `${groupId}:${artifactId}`,
      key,
      assumedGroupId,
    });
  }
  return out;
}

/**
 * The package a Java source declares, or null for the default package.
 *
 * Line-anchored so a `package` inside a Javadoc sentence or a string does not
 * win over the declaration.
 */
export function packageOf(javaFile) {
  if (!fs.existsSync(javaFile)) return null;
  const match = fs.readFileSync(javaFile, "utf8").match(/^\s*package\s+([\w.]+)\s*;/m);
  return match ? match[1] : null;
}

/** `pkg.Simple`, or `Simple` in the default package. */
export function fqcn(pkg, simpleName) {
  if (!simpleName) return null;
  return pkg ? `${pkg}.${simpleName}` : simpleName;
}

/**
 * Which package the bundle's classes live in.
 *
 * Prefer the file the manifest names, because that is the one a runner
 * instantiates. Fall back to the first source only when `className` does not
 * resolve to a file — a broken bundle, which verify-published-template.mjs
 * reports separately; guessing here would let it read as intact.
 */
export function bundlePackage(bundleDir, className) {
  const srcDir = path.join(bundleDir, "src");
  if (!fs.existsSync(srcDir)) return null;
  const named = className ? path.join(srcDir, `${className}.java`) : null;
  if (named && fs.existsSync(named)) return packageOf(named);
  const first = fs.readdirSync(srcDir).filter((f) => f.endsWith(".java")).sort()[0];
  return first ? packageOf(path.join(srcDir, first)) : null;
}

/**
 * Pages in the published preview.
 *
 * Two naming conventions are on disk: `output-page-N.png` from the current
 * publisher, and a bare `output.png` from before multi-page previews existed.
 * The bare one is one page by definition — it is what a single-page render was
 * called — so it counts rather than reading as "no preview".
 */
export function previewPageCount(bundleDir) {
  const previewDir = path.join(bundleDir, "preview");
  if (!fs.existsSync(previewDir)) return null;
  const entries = fs.readdirSync(previewDir);
  const pages = entries.filter((f) => /^output-page-\d+\.png$/.test(f)).length;
  if (pages > 0) return pages;
  return entries.includes("output.png") ? 1 : null;
}

/**
 * Where the example data is, and what a consumer renames it to.
 *
 * A template that ships hard-coded content publishes no data file, and that is
 * a real shape — publish-template.mjs says so and continues. Returning a path
 * that does not exist would make a consumer command copy nothing and report
 * success.
 */
export function deriveData(bundleDir, docKind, legacyDataFile = null) {
  const candidate = legacyDataFile || (docKind ? path.posix.join("data", `${docKind}-data.example.json`) : null);
  if (!candidate) return null;
  if (!fs.existsSync(path.join(bundleDir, candidate))) return null;
  // `<kind>-data.json` when the kind is known. Otherwise the example's own name
  // with `.example` dropped, which is the convention the publisher applied when
  // it wrote the file — inventing "null-data.json" from a missing docKind would
  // be a filename no provider looks for.
  const runtimeName = docKind
    ? `${docKind}-data.json`
    : path.posix.basename(candidate).replace(/\.example(?=\.json$)/, "");
  return { example: candidate, runtimeName };
}

/**
 * Template-owned resources, when the bundle ships any.
 *
 * The manifest travels with the assets rather than beside them in a revision:
 * a template resolves `assets-manifest.json` against its resource root, which
 * is the bundle root once published.
 */
export function deriveResources(bundleDir) {
  const assets = fs.existsSync(path.join(bundleDir, "assets")) ? "assets" : null;
  const manifest = fs.existsSync(path.join(bundleDir, "assets-manifest.json"))
    ? "assets-manifest.json"
    : null;
  return assets || manifest ? { assets, manifest } : null;
}

/**
 * Read `templates/<id>/template.json` and return it with the consumer contract
 * guaranteed present.
 *
 * `entrypoint`, `data` and `resources` are back-filled from disk for a 1.0.0
 * bundle and taken verbatim from a 1.1.0 one. A field the manifest sets to
 * `null` is honoured as an answer — "this bundle has no data file" is different
 * from "this manifest predates the field", and only the second is derived.
 *
 * @param {string} bundleDir absolute path to the bundle root
 * @throws {Error} when the manifest is missing or is not JSON
 */
export function readManifest(bundleDir) {
  const manifestPath = path.join(bundleDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${MANIFEST_FILENAME} not found in ${bundleDir} — this is not a published bundle`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (cause) {
    throw new Error(`${manifestPath} is not valid JSON: ${cause.message}`);
  }

  const docKind = raw.docKind ?? null;
  const className = raw.className ?? null;
  const dependencyList = normaliseDependencies(raw.dependencies);

  const declaredEntry = raw.entrypoint ?? null;
  const pkg = declaredEntry?.templateClass ? null : bundlePackage(bundleDir, className);
  const entrypoint = {
    templateClass: declaredEntry?.templateClass ?? fqcn(pkg, className),
    specClass: declaredEntry?.specClass ?? raw.specClass ?? null,
    providerClass: declaredEntry?.providerClass ?? raw.specProviderClass ?? null,
  };

  return {
    bundleDir,
    manifestPath,
    raw,

    schemaVersion: raw.schemaVersion ?? null,
    id: raw.id ?? path.basename(bundleDir),
    displayName: raw.displayName ?? null,
    version: raw.version ?? DEFAULT_BUNDLE_VERSION,
    docKind,
    className,

    entrypoint,
    data: raw.data !== undefined ? raw.data : deriveData(bundleDir, docKind, raw.dataFile),
    resources: raw.resources !== undefined ? raw.resources : deriveResources(bundleDir),

    graphComposeVersion:
      raw.graphComposeVersion
      ?? dependencyList.find((d) => d.coordinate === GRAPH_COMPOSE)?.version
      ?? null,
    pageCount: raw.pageCount !== undefined ? raw.pageCount : previewPageCount(bundleDir),

    fonts: raw.fonts ?? [],
    dependencies: raw.dependencies ?? {},
    dependencyList,

    sourceProject: raw.sourceProject ?? null,
    sourceRevision: raw.sourceRevision ?? null,
    sourceCommit: raw.sourceCommit ?? null,
    publishedAt: raw.publishedAt ?? null,
  };
}

/**
 * Every bundle in a workspace's `templates/`, sorted by id.
 *
 * A directory without a manifest is not a bundle and is skipped rather than
 * reported: `templates/` is also where a consumer may have left a scratch
 * directory, and a catalog that errors on it is a catalog nobody runs.
 *
 * @returns {Array<{id: string, dir: string, manifest: object|null, error: string|null}>}
 */
export function listBundles(templatesDir) {
  if (!fs.existsSync(templatesDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(templatesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(templatesDir, entry.name);
    if (!fs.existsSync(path.join(dir, MANIFEST_FILENAME))) continue;
    try {
      out.push({ id: entry.name, dir, manifest: readManifest(dir), error: null });
    } catch (cause) {
      out.push({ id: entry.name, dir, manifest: null, error: cause.message });
    }
  }
  return out;
}
