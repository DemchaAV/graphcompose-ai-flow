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
 * ## Three pack layouts, one question
 *
 * A pack is whatever the line it describes could produce, and this reads all
 * three so an older line keeps answering:
 *
 *   `api/` + `manifest.json`   imported from a GraphCompose knowledge bundle
 *                              (`tools/api-surface/import-bundle.mjs`). The API
 *                              is split per surface, and the bundle also brings
 *                              `routing/tasks.json` — see below.
 *   `api-surface.json`         one file, written by the local extractor from
 *                              the pinned artifact's class files.
 *   `00-api-surface.md`        prose, for packs that predate the extractor.
 *
 * The Markdown is generated from the JSON wherever both exist, so the two
 * cannot drift and this reads the structured form.
 *
 * ## Routing: which way, not just what exists
 *
 * A surface says a symbol exists. It cannot say which of three ways is the
 * right one, and that is where wrong-API choices actually come from — a skills
 * list in two columns is a row with weights, and nothing in a signature says
 * so. `--tasks` and `--task` answer that from the bundle's `routing/tasks.json`,
 * which only a bundle-imported pack carries.
 *
 * What comes back is the decision, not the guide: the recommended route, the
 * alternatives with their costs, the constraints, and the symbols to verify.
 * The `docs` anchors are paths inside the GraphCompose repository — the bundle
 * ships knowledge, not prose — so the answer says as much rather than sending a
 * reader after a file this workspace does not have.
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
      "  --task <id>            how to do a thing: the route, the alternatives,\n" +
      "                         the constraints, and the symbols to verify\n" +
      "  --tasks                every intent the routing table answers\n" +
      "  --dump                 the whole surface as JSON, on stdout\n\n" +
      "  --surface <name>       restrict to one surface (authoring, templates,\n" +
      "                         backends, testing, extension-spi). Default: all\n" +
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
    surface: null, task: null, tasks: false,
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
    else if (a === "--surface") out.surface = argv[++i];
    else if (a === "--task") out.task = argv[++i];
    else if (a === "--tasks") out.tasks = true;
    else {
      process.stderr.write(`[api-query] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  const asked =
    out.type || out.method || out.exists || out.search || out.constant || out.package ||
    out.dump || out.task || out.tasks;
  if (!asked) {
    process.stderr.write("[api-query] nothing asked\n");
    usage(2);
  }
  // A route is not a search over surfaces, so there is nothing for --surface to
  // narrow. Accepting it and doing nothing is the worse half of the two: the
  // answer would look filtered, and on a flat pack the combination would slip
  // past the "--surface needs a bundle-imported pack" refusal entirely.
  if (out.surface && (out.task || out.tasks)) {
    process.stderr.write(
      "[api-query] --surface does not apply to --task or --tasks: a route is not a search.\n" +
        "  The route names its own surfaces in the answer.\n",
    );
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const line = resolveLine();
const packDir = path.join(PACKS_DIR, `graphcompose-${line}`);
const apiDir = path.join(packDir, "api");
const tasksPath = path.join(packDir, "routing", "tasks.json");

// A bundle-imported pack wins over anything the local extractor left behind:
// it is the tree GraphCompose itself published, split per surface, and it is
// the only layout that carries routing at all.
const usingBundle = fs.existsSync(apiDir) && fs.existsSync(path.join(packDir, "manifest.json"));

// Routing is answered from its own file and needs no surfaces loaded, so it
// works on a pack whose API half is still the old single file — and says so
// plainly when the pack predates routing entirely.
const routing = args.tasks || args.task ? routingAnswer() : null;

if (!routing && args.surface && !usingBundle) {
  process.stderr.write(
    `[api-query] --surface needs a bundle-imported pack; ${line} carries a single flat surface\n` +
      "  Import one:  node tools/api-surface/import-bundle.mjs <bundle.zip>\n",
  );
  process.exit(2);
}

const canonicalPath = path.join(packDir, CANONICAL_FILE);
const usingCanonical = fs.existsSync(canonicalPath);
const surfacePath = usingBundle ? apiDir : usingCanonical ? canonicalPath : path.join(packDir, SURFACE_FILE);
// A routing question is already answered and never touches the surfaces, so a
// pack with a routing table and no allow-list must not be refused here.
if (!routing && !usingBundle && !fs.existsSync(surfacePath)) {
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

// Not loaded for a routing question: routing is answered from its own file, and
// parsing half a megabyte of surfaces to print a route nobody asked the API for
// is work with no reader.
const surface = routing
  ? null
  : usingBundle
    ? loadBundleSurfaces(apiDir, args.surface, line)
    : usingCanonical
      ? loadCanonical(JSON.parse(fs.readFileSync(surfacePath, "utf8")), line)
      : parseSurface(fs.readFileSync(surfacePath, "utf8"), line);

// `process.exit()` after a large write truncates it: writes to a pipe are
// asynchronous and exiting does not wait for them to drain. --dump is half a
// megabyte, so a caller reading it through a pipe got a cut-off document and a
// JSON parse error — which is how CI failed on Linux while Windows passed.
// Setting exitCode lets the process end once stdout has flushed. Every answer
// leaves through here, routing included, so there is one place to get it right.
if (routing) {
  process.stdout.write(`${JSON.stringify(routing.answer, null, 2)}\n`);
  process.exitCode = routing.code;
} else if (args.dump) {
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

// ----------------------------------------------------------------- routing ---

/**
 * Answer an intent instead of a symbol.
 *
 * Returns `{ answer, code }` rather than writing: every JSON answer this file
 * produces leaves through the one writer at the bottom, which sets `exitCode`
 * instead of calling `process.exit`. That is not a style preference — a write
 * to a pipe is asynchronous and exiting does not wait for it to drain, which is
 * how `--dump` once handed a caller half a document and failed CI on Linux
 * while passing on Windows.
 *
 * Deliberately not the guide: restating the prose here would make this a copy
 * of documentation that lives in another repository and would go stale the
 * moment that one changed. What a route ends is the *choice* — which way, why
 * that way, what the alternatives cost, and which symbols to verify afterwards.
 *
 * `docs` anchors are paths inside the GraphCompose repository, because that is
 * where the pages are; the bundle ships knowledge, not prose. They are handed
 * back labelled rather than silently, so a reader does not go looking for a
 * file this workspace has never had.
 */
function routingAnswer() {
  if (!fs.existsSync(tasksPath)) {
    process.stderr.write(
      `[api-query] no routing table for GraphCompose ${line}: ${path.relative(repoRoot, tasksPath).split(path.sep).join("/")}\n` +
        "  Routing arrives with a GraphCompose knowledge bundle; this pack predates it.\n" +
        "  Import one:  node tools/api-surface/import-bundle.mjs <bundle.zip>\n",
    );
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
  const tasks = doc.tasks ?? [];

  if (args.tasks) {
    return {
      answer: {
        graphComposeLine: line,
        found: tasks.length > 0,
        tasks: tasks.map((t) => ({ task: t.task, intent: t.intent })),
      },
      code: tasks.length > 0 ? 0 : 3,
    };
  }

  const route = tasks.find((t) => t.task === args.task);
  if (!route) {
    // Near-misses before the full list: an intent is usually mistyped or
    // half-remembered, and "layout.two-column" should not read the same as an
    // intent the table has never had.
    const near = tasks
      .map((t) => t.task)
      .filter((t) => t.includes(args.task) || args.task.includes(t.split(".").pop()));
    return {
      answer: {
        graphComposeLine: line,
        query: { task: args.task },
        found: false,
        didYouMean: near,
        available: tasks.map((t) => t.task),
      },
      code: 3,
    };
  }

  return {
    answer: {
      graphComposeLine: line,
      query: { task: args.task },
      found: true,
      ...route,
      // Two things a caller cannot infer from the route itself: where the
      // anchors point, and whether a human has signed off on the choice.
      docsIn: route.docs?.length ? "the GraphCompose repository, not this workspace" : undefined,
      confirmed: Boolean(route.confirmedBy),
    },
    code: 0,
  };
}

// ----------------------------------------------------------------- parsing ---

/**
 * Every surface JSON in a bundle-imported pack, flattened into one type list.
 *
 * The shape is the one `loadCanonical` produces, so every query below works
 * unchanged — a bundle pack is a different *layout*, not a different answer.
 * Two fields ride along that the flat layout has no room for: `surface`, since
 * a type's surface decides whether an author may call it at all, and
 * `stability`, because "does it exist" and "is it something I should be calling
 * yet" are the same question asked twice and an answer omitting the second
 * reads as a green light.
 */
function loadBundleSurfaces(dir, only, versionLine) {
  const available = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "excluded.json")
    .map((f) => path.basename(f, ".json"))
    .sort();

  const chosen = only ? available.filter((s) => s === only) : available;
  if (chosen.length === 0) {
    process.stderr.write(
      only
        ? `[api-query] no surface "${only}" in the ${versionLine} pack. Available: ${available.join(", ") || "(none)"}\n`
        : `[api-query] no surface JSON under ${path.relative(repoRoot, dir).split(path.sep).join("/")}\n`,
    );
    process.exit(1);
  }

  const types = [];
  let verifiedAgainst = null;
  for (const name of chosen) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
    verifiedAgainst ??= doc.verifiedAgainst ?? doc.targetVersion ?? null;
    for (const pkg of doc.packages ?? []) {
      for (const type of pkg.types ?? []) {
        const methods = [];
        const constants = [];
        for (const member of type.members ?? []) {
          if (member.kind === "constant") {
            constants.push(member.name);
            continue;
          }
          const params = (member.params ?? []).map((p) => (p.name ? `${p.type} ${p.name}` : p.type));
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
            stability: member.stability ?? null,
          });
        }
        types.push({
          name: type.name,
          kind: type.kind,
          package: pkg.name,
          surface: name,
          stability: type.stability ?? "stable",
          methods,
          constants,
        });
      }
    }
  }

  return {
    graphComposeLine: versionLine,
    verifiedAgainst,
    source: path.relative(repoRoot, dir).split(path.sep).join("/"),
    surfaces: chosen,
    typeCount: types.length,
    methodCount: types.reduce((n, t) => n + t.methods.length, 0),
    constantCount: types.reduce((n, t) => n + t.constants.length, 0),
    types,
  };
}


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

/**
 * The two fields a bundle pack has and a flat one does not, appended to an
 * answer the caller has already shaped.
 *
 * It takes the shape rather than building one on purpose. The first version of
 * this built the object itself, which quietly gave `--constant` a `name` beside
 * its `type` — the same string twice — and gave `--package` back the package
 * that was just asked for. Every query here answers a different question and
 * names its fields for that question; only the appending is common.
 *
 * `stable` is left unsaid: it is the default, and an answer that says it on
 * every line is noise. Both fields are omitted rather than nulled on a flat
 * pack, so an old pack's answer is unchanged and nothing reading these has to
 * learn a second shape.
 */
function withSurface(t, shaped) {
  return {
    ...shaped,
    ...(t.surface ? { surface: t.surface } : {}),
    ...(t.stability && t.stability !== "stable" ? { stability: t.stability } : {}),
  };
}

function query(index, options) {
  const base = {
    graphComposeLine: index.graphComposeLine,
    verifiedAgainst: index.verifiedAgainst,
    ...(index.surfaces ? { surfaces: index.surfaces } : {}),
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
      type: type ? withSurface(type, { name: type.name, kind: type.kind, package: type.package }) : null,
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
      .map((t) => withSurface(t, { type: t.name, package: t.package, kind: t.kind }));
    return { ...base, query: { constant: options.constant }, found: hits.length > 0, declaredBy: hits };
  }

  if (options.package) {
    const hits = index.types
      .filter((t) => t.package === options.package)
      .map((t) => withSurface(t, { name: t.name, kind: t.kind, methods: t.methods.length }));
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
      type: withSurface(type, { name: type.name, kind: type.kind, package: type.package }),
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
    types: types
      .map((t) => withSurface(t, { name: t.name, kind: t.kind, package: t.package, methods: t.methods.length }))
      .slice(0, 30),
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
