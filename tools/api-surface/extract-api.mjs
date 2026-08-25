#!/usr/bin/env node
/**
 * tools/api-surface/extract-api.mjs — build the authoring allow-list from the
 * pinned GraphCompose artifact.
 *
 *   node tools/api-surface/extract-api.mjs --version 2.2.0
 *   node tools/api-surface/extract-api.mjs --version 2.2.0 --check
 *
 * The chain is: pinned artifact → this extractor → `api-surface.json` (the
 * canonical machine-readable representation) → `00-api-surface.md` (generated
 * from the JSON) → `scripts/api-query.mjs` (the deterministic query). One
 * source of truth, two renderings of it, neither hand-edited.
 *
 * It replaces a regex parser that read GraphCompose's Java **source**, which
 * could not see anything Lombok generates. That was not a cosmetic gap:
 * `DocumentHeaderFooter`, `DocumentMetadata`, `DocumentWatermark` and
 * `DocumentProtection` are Lombok value types whose entire construction path is
 * generated, so the allow-list listed `DocumentMetadata (class)` with no
 * members at all. Under the first invariant — "a symbol absent here does not
 * exist" — an agent reading that correctly concluded the type was
 * unconstructible, and page headers and footers were unreachable.
 *
 * Reading the class file also gives an exact definition of "generated": a
 * member the bytecode has and the source does not. Those are marked
 * `origin: "generated"` in the JSON and counted, so the regression test can
 * assert they never silently vanish again.
 *
 * --check regenerates into memory and compares with what is on disk, exiting 1
 * on any drift. That is what CI runs; it needs the artifact resolvable, so it
 * is skipped where it is not.
 *
 * Exit: 0 written (or --check clean) · 1 --check found drift · 2 usage
 *       4 the artifact could not be resolved
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { findJavap, readTypes, simplifyType } from "./lib/javap.mjs";
import { indexParameterNames, applyParameterNames } from "./lib/source-names.mjs";
import { openJar } from "./lib/zip.mjs";
import { renderMarkdown } from "./lib/render-markdown.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const GROUP = "io.github.demchaav";
/**
 * Which artifacts carry authoring surface. The `graph-compose` artifact itself
 * is an aggregator whose jar is four kilobytes of nothing — pointing the
 * extractor at it produces an empty allow-list that looks like a clean run.
 */
const ARTIFACTS = ["graph-compose-core", "graph-compose-templates"];

/**
 * The authoring surface, as package prefixes. Engine, layout and internals are
 * excluded on purpose: they are not what "compose this document" reaches for,
 * and listing them would triple the set an agent has to hold.
 */
const PACKAGES = [
  "com.demcha.compose.GraphCompose",
  "com.demcha.compose.document.api",
  "com.demcha.compose.document.dsl",
  "com.demcha.compose.document.theme",
  "com.demcha.compose.document.style",
  "com.demcha.compose.document.table",
  "com.demcha.compose.document.chart",
  "com.demcha.compose.document.node",
  "com.demcha.compose.document.image",
  "com.demcha.compose.document.svg",
  "com.demcha.compose.document.output",
  "com.demcha.compose.document.templates.builtins",
  "com.demcha.compose.document.templates.data",
  "com.demcha.compose.document.templates.api",
  "com.demcha.compose.document.templates.theme",
  "com.demcha.compose.document.templates.core",
  "com.demcha.compose.document.templates.cv",
  "com.demcha.compose.document.templates.coverletter",
  "com.demcha.compose.document.templates.invoice",
  "com.demcha.compose.document.templates.proposal",
  "com.demcha.compose.font",
];

function usage(code = 0) {
  process.stdout.write(
    "usage: node tools/api-surface/extract-api.mjs --version <x.y.z> [options]\n\n" +
      "  --version <x.y.z>   the GraphCompose release to read (required)\n" +
      "  --pack <dir>        pack to write into (default: skills/versions/graphcompose-<x.y>)\n" +
      "  --m2 <dir>          local Maven repository (default: ~/.m2/repository)\n" +
      "  --offline           never invoke Maven; fail if the artifact is not in the m2 cache\n" +
      "  --check             compare against what is on disk instead of writing\n" +
      "  --json              print a summary as JSON\n\n" +
      "exit: 0 ok | 1 --check found drift | 2 usage | 4 artifact unresolvable\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { version: null, pack: null, m2: null, offline: false, check: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--check") out.check = true;
    else if (a === "--json") out.json = true;
    else if (a === "--offline") out.offline = true;
    else if (a === "--version") out.version = argv[++i];
    else if (a === "--pack") out.pack = argv[++i];
    else if (a === "--m2") out.m2 = argv[++i];
    else usage(2);
  }
  return out;
}

// --- artifact resolution -----------------------------------------------------

function artifactPath(m2, artifact, version, classifier) {
  const suffix = classifier ? `-${classifier}` : "";
  return path.join(
    m2,
    ...GROUP.split("."),
    artifact,
    version,
    `${artifact}-${version}${suffix}.jar`,
  );
}

function fetchArtifact(artifact, version, classifier) {
  const coords = `${GROUP}:${artifact}:${version}${classifier ? `:jar:${classifier}` : ""}`;
  const args = ["-q", "-B", "dependency:get", `-Dartifact=${coords}`];
  const run =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "mvn", ...args], { encoding: "utf8" })
      : spawnSync("mvn", args, { encoding: "utf8" });
  return run.status === 0;
}

/**
 * Resolve one artifact's binary jar, and its sources jar when available.
 * Sources are optional: without them the surface is complete but its parameters
 * are unnamed, which is a worse allow-list, not a wrong one.
 */
function resolveArtifact(artifact, version, { m2, offline }) {
  const binary = artifactPath(m2, artifact, version);
  if (!fs.existsSync(binary)) {
    if (offline || !fetchArtifact(artifact, version)) return null;
  }
  if (!fs.existsSync(binary)) return null;

  const sources = artifactPath(m2, artifact, version, "sources");
  if (!fs.existsSync(sources) && !offline) fetchArtifact(artifact, version, "sources");

  return { artifact, binary, sources: fs.existsSync(sources) ? sources : null };
}

// --- surface assembly --------------------------------------------------------

const inAuthoringSurface = (binaryName) =>
  PACKAGES.some((prefix) => binaryName === prefix || binaryName.startsWith(`${prefix}.`));

/** Class entries in the jar that belong to the authoring surface. */
function authoringClassNames(jar) {
  return jar.names
    .filter((entry) => entry.endsWith(".class") && !entry.endsWith("package-info.class"))
    .map((entry) => entry.slice(0, -".class".length).replace(/\//g, "."))
    // A `Foo$1` is an anonymous class and a `Foo$Bar` may be a nested type that
    // matters (every Lombok builder is one), so only the anonymous form is cut.
    .filter((name) => !/\$\d/.test(name))
    .filter((name) => inAuthoringSurface(name.replace(/\$.*$/, "")))
    .sort();
}

const OBJECT_OVERRIDES = new Set(["toString", "hashCode", "equals", "clone", "finalize"]);
const ENUM_MECHANICS = new Set(["values", "valueOf"]);

/** Members worth listing: what a person composing a document would call. */
function isInteresting(member, typeKind) {
  if (member.kind === "field") return false;
  if (member.kind === "constant") return true;
  if (OBJECT_OVERRIDES.has(member.name)) return false;
  if (typeKind === "enum" && ENUM_MECHANICS.has(member.name)) return false;
  if (member.name === "main") return false;
  return true;
}

/** Every type name a member mentions, as it is spelled in the surface. */
function referencedTypeNames(type) {
  const text = type.members
    .map((m) =>
      m.kind === "constant"
        ? m.type
        : [m.typeParameters, m.returns, ...m.params.map((p) => p.type)].filter(Boolean).join(" "),
    )
    .join(" ");
  return new Set(text.match(/[A-Z][\w.]*/g) ?? []);
}

/**
 * Nested types are kept only when the authoring surface can actually reach
 * them.
 *
 * Every Lombok `@Builder` produces one — `DocumentHeaderFooter.DocumentHeaderFooterBuilder`
 * is the entire construction path and must be listed. But a jar also holds
 * public nested implementation detail (`DocumentSession.RenderingContextImpl`,
 * `DocumentSession.InvalidatingNodeRegistry`) that nothing returns and nobody
 * should call. Listing those would pad the closed set an agent has to hold with
 * types that are not authoring surface at all.
 *
 * "Reachable" is transitive: a builder returned by a method, and anything that
 * builder in turn returns or takes.
 */
function reachableNestedTypes(all) {
  const nested = new Map(all.filter((t) => t.name.includes(".")).map((t) => [t.name, t]));
  const kept = new Set();
  let frontier = all.filter((t) => !t.name.includes("."));

  while (frontier.length) {
    const next = [];
    for (const type of frontier) {
      for (const referenced of referencedTypeNames(type)) {
        if (!nested.has(referenced) || kept.has(referenced)) continue;
        kept.add(referenced);
        next.push(nested.get(referenced));
      }
    }
    frontier = next;
  }
  return kept;
}

function buildSurface({ version, artifacts, javap }) {
  const types = [];
  const counts = { types: 0, methods: 0, constants: 0, generated: 0 };

  for (const resolved of artifacts) {
    const jar = openJar(resolved.binary);
    const classNames = authoringClassNames(jar);
    if (!classNames.length) continue;

    const raw = readTypes({ javap, classpath: resolved.binary, classNames });

    const names = resolved.sources
      ? indexParameterNames(openJar(resolved.sources), (entry) =>
          inAuthoringSurface(entry.slice(0, -".java".length).replace(/\//g, ".")),
        )
      : new Map();

    for (const type of raw) {
      // A jar holds package-private and annotation types too. Neither is
      // authoring surface: one cannot be named from another package, the other
      // cannot be called at all.
      if (!type.isPublic || type.kind === "annotation") continue;
      const simple = simplifyType(type.binaryName);
      const pkg = type.binaryName.replace(/\$.*$/, "").replace(/\.[^.]+$/, "");

      const members = type.members
        .filter((member) => isInteresting(member, type.kind))
        .map((member) => {
          const origin = resolved.sources ? applyParameterNames(names, simple, member) : "unknown";
          return {
            kind: member.kind,
            name: member.name,
            static: Boolean(member.static),
            origin,
            ...(member.kind === "constant"
              ? { type: simplifyType(member.type) }
              : {
                  typeParameters: member.typeParameters ? simplifyType(member.typeParameters) : null,
                  returns: member.returns === null ? null : simplifyType(member.returns),
                  params: member.params.map((p) => ({
                    type: simplifyType(p.type),
                    name: p.name,
                  })),
                }),
          };
        });

      types.push({
        name: simple,
        binaryName: type.binaryName,
        package: pkg,
        kind: type.kind,
        modifiers: type.modifiers,
        artifact: resolved.artifact,
        members,
      });
    }
  }

  const reachable = reachableNestedTypes(types);
  const surfaceTypes = types.filter((t) => !t.name.includes(".") || reachable.has(t.name));

  for (const type of surfaceTypes) {
    counts.types += 1;
    counts.methods += type.members.filter((m) => m.kind !== "constant").length;
    counts.constants += type.members.filter((m) => m.kind === "constant").length;
    counts.generated += type.members.filter((m) => m.origin === "generated").length;
  }

  surfaceTypes.sort((a, b) => a.package.localeCompare(b.package) || a.name.localeCompare(b.name));

  const packages = [];
  for (const type of surfaceTypes) {
    let bucket = packages[packages.length - 1];
    if (!bucket || bucket.name !== type.package) {
      bucket = { name: type.package, types: [] };
      packages.push(bucket);
    }
    const { package: _drop, ...rest } = type;
    bucket.types.push(rest);
  }

  return {
    schemaVersion: 1,
    targetLibrary: "GraphCompose",
    targetVersion: `${version.split(".").slice(0, 2).join(".")}.x`,
    verifiedAgainst: version,
    generator: "tools/api-surface/extract-api.mjs",
    generatedFrom: artifacts.map((a) => `${GROUP}:${a.artifact}:${version}`),
    parameterNamesFrom: artifacts.filter((a) => a.sources).map((a) => `${a.artifact}:sources`),
    counts,
    packages,
  };
}

// --- run ---------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (!args.version) usage(2);

const line = args.version.split(".").slice(0, 2).join(".");
const packDir = args.pack ?? path.join(repoRoot, "skills", "versions", `graphcompose-${line}`);
const m2 = args.m2 ?? path.join(os.homedir(), ".m2", "repository");

const resolved = ARTIFACTS.map((artifact) => resolveArtifact(artifact, args.version, { m2, offline: args.offline }));
if (resolved.some((r) => r === null)) {
  const missing = ARTIFACTS.filter((_, i) => resolved[i] === null);
  process.stderr.write(
    `[extract-api] could not resolve ${missing.join(", ")} ${args.version} from ${m2}` +
      (args.offline ? " (offline)" : " or Maven") +
      "\n",
  );
  process.exit(4);
}

const surface = buildSurface({ version: args.version, artifacts: resolved, javap: findJavap() });
const markdown = renderMarkdown(surface);

const jsonPath = path.join(packDir, "api-surface.json");
const markdownPath = path.join(packDir, "00-api-surface.md");
const jsonText = `${JSON.stringify(surface, null, 2)}\n`;

if (args.check) {
  const drift = [];
  // The JSON is the contract; the Markdown is a rendering of it. Both are
  // compared, because a stale rendering is what an agent actually reads.
  for (const [file, expected] of [
    [jsonPath, jsonText],
    [markdownPath, markdown],
  ]) {
    const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (actual !== expected) drift.push(path.relative(repoRoot, file));
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ version: args.version, drift, counts: surface.counts }, null, 2)}\n`);
  } else if (drift.length) {
    process.stdout.write(
      `[extract-api] out of date: ${drift.join(", ")}\n` +
        `  regenerate: node tools/api-surface/extract-api.mjs --version ${args.version}\n`,
    );
  } else {
    process.stdout.write(`[extract-api] ${args.version} surface is current (${surface.counts.types} types)\n`);
  }
  process.exit(drift.length ? 1 : 0);
}

fs.mkdirSync(packDir, { recursive: true });
fs.writeFileSync(jsonPath, jsonText, "utf8");
fs.writeFileSync(markdownPath, markdown, "utf8");

if (args.json) {
  process.stdout.write(`${JSON.stringify({ version: args.version, jsonPath, markdownPath, counts: surface.counts }, null, 2)}\n`);
} else {
  process.stdout.write(
    `[extract-api] ${args.version}: ${surface.counts.types} types, ${surface.counts.methods} methods, ` +
      `${surface.counts.constants} constants (${surface.counts.generated} generated)\n` +
      `  ${path.relative(repoRoot, jsonPath)}\n  ${path.relative(repoRoot, markdownPath)}\n`,
  );
}
