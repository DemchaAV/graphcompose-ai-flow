#!/usr/bin/env node
/**
 * scripts/api-query.mjs — ask the allow-list a question instead of reading it.
 *
 *   node scripts/api-query.mjs --type ShapeContainerBuilder
 *   node scripts/api-query.mjs --type TimelineBuilder --method entry
 *   node scripts/api-query.mjs --exists TimelineMarker.dot
 *   node scripts/api-query.mjs --search timeline
 *   node scripts/api-query.mjs --constant CENTER_LEFT
 *
 * `00-api-surface.md` is the closed set an agent authors against — 126 KB,
 * 268 types, 1886 methods. The first invariant says a symbol absent from it
 * does not exist, so it gets consulted constantly, and the acceptance run
 * spent a long series of shell calls grepping it.
 *
 * The answer to "does this method exist, and what is its signature" is ten
 * lines of JSON. This gives that.
 *
 * **The pack's `api-surface.json` is the source.** It is what
 * `tools/api-surface/extract-api.mjs` writes from the pinned artifact's class
 * files, and `00-api-surface.md` is generated from it — so the two cannot
 * drift, and this reads the structured form rather than re-parsing prose. A
 * pack that predates the extractor has only the Markdown, which is still
 * parsed, so an older line keeps answering.
 *
 * Exit codes: 0 found, 3 nothing matched (so a caller can branch), 2 usage.
 */

import fs from "node:fs";
import path from "node:path";

import { installRoot } from "./lib/workspace.mjs";
import { resolveVersion } from "./lib/version-resolver.mjs";

const repoRoot = installRoot();
const PACKS_DIR = path.join(repoRoot, "skills", "versions");
const SURFACE_FILE = "00-api-surface.md";
const CANONICAL_FILE = "api-surface.json";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/api-query.mjs [--version <line>] <query>\n\n" +
      "  --type <Type>          everything the allow-list has for a type\n" +
      "  --method <name>        filter to methods whose name matches\n" +
      "  --exists <Type.method> a yes/no answer with the signatures, if any\n" +
      "  --search <term>        types, methods and constants matching a term\n" +
      "  --constant <NAME>      which types declare a constant\n" +
      "  --package <pkg>        the types in a package\n" +
      "  --dump                 the whole surface as JSON, on stdout\n\n" +
      "  --version <line>       2.2, 1.9, ... (default: the newest pack)\n" +
      "  --project-dir <dir>    resolve the line from a Java project's pin instead\n" +
      "  --json                 machine-readable (default for --dump)\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    version: null, projectDir: null, type: null, method: null, exists: null,
    search: null, constant: null, package: null, dump: false, json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--dump") out.dump = true;
    else if (a === "--version" || a === "-v") out.version = argv[++i];
    else if (a === "--project-dir" || a === "-C") out.projectDir = argv[++i];
    else if (a === "--type" || a === "-t") out.type = argv[++i];
    else if (a === "--method" || a === "-m") out.method = argv[++i];
    else if (a === "--exists") out.exists = argv[++i];
    else if (a === "--search" || a === "-s" || a === "--query" || a === "-q") out.search = argv[++i];
    else if (a === "--constant") out.constant = argv[++i];
    else if (a === "--package") out.package = argv[++i];
    else {
      process.stderr.write(`[api-query] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  const asked = out.type || out.method || out.exists || out.search || out.constant || out.package || out.dump;
  if (!asked) {
    process.stderr.write("[api-query] nothing asked\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const line = resolveLine();
const packDir = path.join(PACKS_DIR, `graphcompose-${line}`);
const canonicalPath = path.join(packDir, CANONICAL_FILE);
const usingCanonical = fs.existsSync(canonicalPath);
const surfacePath = usingCanonical ? canonicalPath : path.join(packDir, SURFACE_FILE);
if (!fs.existsSync(surfacePath)) {
  // Which lines CAN answer. Two of the packs on disk are prose written before
  // the surface was extracted from the jar, and a bare "no allow-list" left the
  // reader unable to tell a missing generation step from a typo in --version.
  const answerable = fs.existsSync(PACKS_DIR)
    ? fs
        .readdirSync(PACKS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
        .map((e) => e.name.replace("graphcompose-", ""))
        .filter(
          (l) =>
            fs.existsSync(path.join(PACKS_DIR, `graphcompose-${l}`, CANONICAL_FILE)) ||
            fs.existsSync(path.join(PACKS_DIR, `graphcompose-${l}`, SURFACE_FILE)),
        )
    : [];
  process.stderr.write(
    `[api-query] no allow-list for GraphCompose ${line}: ${packDir}\n` +
      `  lines that can answer: ${answerable.join(", ") || "(none)"}\n` +
      "  this line's pack is prose only. Verify calls against the pinned jar:\n" +
      "    javap -classpath <core jar> com.demcha.compose.document.api.DocumentDsl\n",
  );
process.exit(1);
}

const surface = usingCanonical
  ? loadCanonical(JSON.parse(fs.readFileSync(surfacePath, "utf8")), line)
  : parseSurface(fs.readFileSync(surfacePath, "utf8"), line);

// `process.exit()` after a large write truncates it: writes to a pipe are
// asynchronous and exiting does not wait for them to drain. --dump is half a
// megabyte, so a caller reading it through a pipe got a cut-off document and a
// JSON parse error — which is how CI failed on Linux while Windows passed.
// Setting exitCode lets the process end once stdout has flushed.
if (args.dump) {
  process.stdout.write(`${JSON.stringify(surface, null, 2)}\n`);
  process.exitCode = 0;
} else {
  const answer = query(surface, args);
  process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  process.exitCode = answer.found ? 0 : 3;
}

// --------------------------------------------------------------- resolving ---

function resolveLine() {
  if (args.version) return args.version;
  if (args.projectDir) {
    const resolved = resolveVersion({ projectDir: args.projectDir, install: repoRoot });
    if (resolved.status !== "supported") {
      process.stderr.write(`[api-query] ${resolved.status}: ${resolved.message}\n`);
      process.exit(1);
    }
    return resolved.line;
  }
  const packs = fs.existsSync(PACKS_DIR)
    ? fs.readdirSync(PACKS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^graphcompose-\d+\.\d+$/.test(e.name))
        .map((e) => e.name.replace("graphcompose-", ""))
        .sort((a, b) => {
          const [am, an] = a.split(".").map(Number);
          const [bm, bn] = b.split(".").map(Number);
          return bm - am || bn - an;
        })
    : [];
  if (packs.length === 0) {
    process.stderr.write(`[api-query] no skill packs under ${PACKS_DIR}\n`);
    process.exit(1);
  }
  return packs[0];
}

// ----------------------------------------------------------------- parsing ---

/**
 * The document is regular by construction — it is generated. Package headings,
 * type headings, one method per list item, constants on a single line.
 */
/**
 * The pack's canonical surface, in the shape the queries below expect.
 *
 * Nothing is re-derived here: `signature` is rendered the same way the Markdown
 * renders it, so an answer reads identically whichever file the pack happens to
 * carry. `origin` rides along because "does `builder()` exist" and "is
 * `builder()` something Lombok generated" are the same question asked twice,
 * and the second one is what the header/footer failure turned on.
 */
function loadCanonical(canonical, versionLine) {
  const types = [];
  for (const pkg of canonical.packages) {
    for (const type of pkg.types) {
      const methods = [];
      const constants = [];
      for (const member of type.members) {
        if (member.kind === "constant") {
          constants.push(member.name);
          continue;
        }
        const params = member.params.map((p) => (p.name ? `${p.type} ${p.name}` : p.type));
        const head =
          member.kind === "constructor"
            ? `new ${member.name}`
            : `${member.typeParameters ? `${member.typeParameters} ` : ""}` +
              `${member.returns ? `${member.returns} ` : ""}${member.name}`;
        methods.push({
          signature: `${head}(${params.join(", ")})`,
          name: member.name,
          returns: member.returns ?? null,
          parameters: params,
          origin: member.origin,
          static: member.static,
        });
      }
      types.push({ name: type.name, kind: type.kind, package: pkg.name, methods, constants });
    }
  }

  return {
    graphComposeLine: versionLine,
    verifiedAgainst: canonical.verifiedAgainst,
    source: path.relative(repoRoot, surfacePath).split(path.sep).join("/"),
    typeCount: types.length,
    methodCount: types.reduce((n, t) => n + t.methods.length, 0),
    constantCount: types.reduce((n, t) => n + t.constants.length, 0),
    types,
  };
}

function parseSurface(text, versionLine) {
  const types = [];
  let currentPackage = null;
  let current = null;
  let declaredVersion = null;

  for (const raw of text.split(/\r?\n/)) {
    const packageHeading = raw.match(/^##\s+([a-z][\w.]*)\s*$/);
    if (packageHeading) {
      currentPackage = packageHeading[1];
      continue;
    }

    const typeHeading = raw.match(/^###\s+(\S+)\s+\((class|record|enum|interface|annotation)\)\s*$/);
    if (typeHeading) {
      current = {
        name: typeHeading[1],
        kind: typeHeading[2],
        package: currentPackage,
        methods: [],
        constants: [],
      };
      types.push(current);
      continue;
    }

    if (!declaredVersion) {
      const version = raw.match(/^\*\*GraphCompose version:\*\*\s+(\S+)/);
      if (version) declaredVersion = version[1];
    }

    if (!current) continue;

    const constants = raw.match(/^-\s+constants:\s+(.+)$/);
    if (constants) {
      for (const [, name] of constants[1].matchAll(/`([^`]+)`/g)) current.constants.push(name);
      continue;
    }

    const member = raw.match(/^-\s+`([^`]+)`\s*$/);
    if (member) current.methods.push(parseSignature(member[1]));
  }

  return {
    graphComposeLine: versionLine,
    verifiedAgainst: declaredVersion,
    source: path.relative(repoRoot, surfacePath).split(path.sep).join("/"),
    typeCount: types.length,
    methodCount: types.reduce((n, t) => n + t.methods.length, 0),
    constantCount: types.reduce((n, t) => n + t.constants.length, 0),
    types,
  };
}

/** "TimelineBuilder entry(TimelineMarker marker, Consumer<X> c)" split up. */
function parseSignature(signature) {
  const match = signature.match(/^(.*?)\s+([A-Za-z_$][\w$]*)\s*\((.*)\)\s*$/s);
  if (!match) return { signature, name: null, returns: null, parameters: null };
  const [, returns, name, params] = match;
  return {
    signature,
    name,
    returns: returns.trim(),
    parameters: splitParameters(params),
  };
}

/** Split on commas that are not inside generics. */
function splitParameters(raw) {
  if (raw.trim() === "") return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === "<") depth += 1;
    else if (c === ">") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(raw.slice(start).trim());
  return parts.filter(Boolean);
}

// --------------------------------------------------------------- answering ---

function query(index, options) {
  const base = {
    graphComposeLine: index.graphComposeLine,
    verifiedAgainst: index.verifiedAgainst,
    source: index.source,
  };

  if (options.exists) {
    // Accept a fully-qualified name as well as Type.method. Splitting on the
    // first dot turned "com.demcha.compose.dsl.TimelineMarker.dot" into type
    // "com" and answered "no type com — it does not exist for this version":
    // a confident, authoritative, wrong negative, from the one tool whose
    // whole value is that its "no" can be trusted.
    const parts = options.exists.split(".").filter(Boolean);
    const methodName = parts.length > 1 ? parts[parts.length - 1] : null;
    const typeName = parts.length > 1 ? parts[parts.length - 2] : null;
    if (!typeName || !methodName) {
      process.stderr.write("[api-query] --exists takes Type.method or a fully-qualified name\n");
      process.exit(2);
    }
    const type = index.types.find((t) => t.name === typeName);
    const overloads = (type?.methods ?? []).filter((m) => m.name === methodName);
    const constant = (type?.constants ?? []).includes(methodName);
    return {
      ...base,
      query: { exists: options.exists },
      found: Boolean(type) && (overloads.length > 0 || constant),
      // The negative answer is the useful one: it is what stops an invented call.
      type: type ? { name: type.name, kind: type.kind, package: type.package } : null,
      overloads: overloads.map((m) => m.signature),
      isConstant: constant,
      note: type
        ? undefined
        : `No type "${typeName}" in the ${index.graphComposeLine} allow-list — it does not exist for this version.`,
    };
  }

  if (options.constant) {
    const hits = index.types
      .filter((t) => t.constants.includes(options.constant))
      .map((t) => ({ type: t.name, package: t.package, kind: t.kind }));
    return { ...base, query: { constant: options.constant }, found: hits.length > 0, declaredBy: hits };
  }

  if (options.package) {
    const hits = index.types
      .filter((t) => t.package === options.package)
      .map((t) => ({ name: t.name, kind: t.kind, methods: t.methods.length }));
    return { ...base, query: { package: options.package }, found: hits.length > 0, types: hits };
  }

  if (options.type) {
    const type = index.types.find((t) => t.name === options.type)
      ?? index.types.find((t) => t.name.toLowerCase() === options.type.toLowerCase());
    if (!type) {
      const near = index.types
        .filter((t) => t.name.toLowerCase().includes(options.type.toLowerCase()))
        .map((t) => t.name)
        .slice(0, 8);
      return {
        ...base,
        query: { type: options.type },
        found: false,
        note: `No type "${options.type}" for GraphCompose ${index.graphComposeLine}.`,
        didYouMean: near,
      };
    }
    const methods = options.method
      ? type.methods.filter((m) => matches(m.name, options.method))
      : type.methods;
    return {
      ...base,
      query: { type: options.type, method: options.method ?? undefined },
      found: methods.length > 0 || type.constants.length > 0,
      type: { name: type.name, kind: type.kind, package: type.package },
      methods: methods.map((m) => m.signature),
      constants: type.constants,
    };
  }

  if (options.method) {
    const hits = [];
    for (const type of index.types) {
      for (const method of type.methods) {
        if (matches(method.name, options.method)) {
          hits.push({ type: type.name, signature: method.signature });
        }
      }
    }
    return { ...base, query: { method: options.method }, found: hits.length > 0, matches: hits.slice(0, 60), total: hits.length };
  }

  // --search: one term across everything, for when the type name is unknown.
  const term = options.search.toLowerCase();
  const types = index.types.filter((t) => t.name.toLowerCase().includes(term));
  const methods = [];
  const constants = [];
  for (const type of index.types) {
    for (const method of type.methods) {
      if (method.name && method.name.toLowerCase().includes(term)) {
        methods.push({ type: type.name, signature: method.signature });
      }
    }
    for (const constant of type.constants) {
      if (constant.toLowerCase().includes(term)) constants.push({ type: type.name, constant });
    }
  }
  return {
    ...base,
    query: { search: options.search },
    found: types.length > 0 || methods.length > 0 || constants.length > 0,
    types: types.map((t) => ({ name: t.name, kind: t.kind, package: t.package, methods: t.methods.length })).slice(0, 30),
    methods: methods.slice(0, 40),
    constants: constants.slice(0, 40),
    total: { types: types.length, methods: methods.length, constants: constants.length },
  };
}

/** Exact wins; substring is the fallback so a half-remembered name still lands. */
function matches(name, wanted) {
  if (!name) return false;
  return name === wanted || name.toLowerCase().includes(wanted.toLowerCase());
}
