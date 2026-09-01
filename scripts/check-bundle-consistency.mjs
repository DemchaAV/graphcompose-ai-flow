#!/usr/bin/env node
/**
 * scripts/check-bundle-consistency.mjs — does the imported bundle agree with
 * itself?
 *
 *   node scripts/check-bundle-consistency.mjs [--version 2.3] [--json]
 *
 * A GraphCompose knowledge bundle ships three things that reference each
 * other: `api/` says what exists, `routing/tasks.json` recommends a
 * construction and names the symbols and constraints behind it, and
 * `claims/index.json` records which documentation page asserts what. Nothing
 * checked that the three agree, and they can disagree in ways that are silent
 * where it matters most — inside a route, which is advice an agent follows
 * without re-deriving it.
 *
 * ## Two questions, and only one of them may fail a build
 *
 * **Is the bundle internally consistent?** A route naming a constraint no
 * claim asserts is advice dressed as a verified fact. A route naming a symbol
 * the surfaces do not have is a route that outlived its API. Both mean the
 * data is untrustworthy, both are cheap to detect, and both fail here.
 *
 * **Is routing coverage complete?** A capability with no route is a gap, and a
 * verified behaviour no route names as a constraint is knowledge shipped and
 * unused. Neither is reported as a failure. This repository imports the bundle
 * and does not author it: `routing/tasks.json` is overwritten by the next
 * import, so failing a build over a routing decision made upstream would
 * produce a gate nobody here can fix — the worst kind. Coverage is printed so
 * it can be acted on where it belongs, and so the backlog is measured rather
 * than remembered.
 *
 * Only bundle-imported packs have any of these files. A flat pack has nothing
 * to be inconsistent about and passes silently.
 *
 * Exit: 0 consistent (or nothing to check) · 1 inconsistent · 2 usage.
 */

import fs from "node:fs";
import path from "node:path";

import { installRoot } from "./lib/workspace.mjs";
import { packLayout } from "./lib/pack-surface.mjs";

const repoRoot = installRoot();
const PACKS = path.join(repoRoot, "skills", "versions");

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-bundle-consistency.mjs [--version <line>] [--json]\n\n" +
      "  --version <line>   which pack to check (default: the newest bundle pack)\n" +
      "  --json             machine-readable\n\n" +
      "exit: 0 consistent or nothing to check | 1 inconsistent | 2 usage\n",
  );
  process.exit(code);
}

const args = { version: null, json: false };
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--version" || a === "-v") args.version = process.argv[++i];
  else {
    process.stderr.write(`[bundle-consistency] unknown argument: ${a}\n`);
    usage(2);
  }
}

/** Bundle packs on disk, newest first. */
function bundlePacks() {
  if (!fs.existsSync(PACKS)) return [];
  return fs
    .readdirSync(PACKS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^graphcompose-\d+\.\d+$/.test(e.name))
    .map((e) => e.name.replace("graphcompose-", ""))
    .filter((line) => packLayout(path.join(PACKS, `graphcompose-${line}`)) === "bundle")
    .sort((a, b) => {
      const [am, an] = a.split(".").map(Number);
      const [bm, bn] = b.split(".").map(Number);
      return bm - am || bn - an;
    });
}

const packs = bundlePacks();
const line = args.version ?? packs[0] ?? null;

if (!line) {
  const message = "[bundle-consistency] no bundle-imported pack on disk; nothing to check\n";
  process.stdout.write(args.json ? `${JSON.stringify({ checked: null, ok: true }, null, 2)}\n` : message);
  process.exit(0);
}

const packDir = path.join(PACKS, `graphcompose-${line}`);
if (packLayout(packDir) !== "bundle") {
  process.stderr.write(
    `[bundle-consistency] graphcompose-${line} is not a bundle pack; it has no routing or claims to check.\n` +
      `  Bundle packs on disk: ${packs.join(", ") || "(none)"}\n`,
  );
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const tasksFile = path.join(packDir, "routing", "tasks.json");
const claimsFile = path.join(packDir, "claims", "index.json");
const routes = fs.existsSync(tasksFile) ? (readJson(tasksFile).tasks ?? []) : [];
const claims = fs.existsSync(claimsFile) ? readJson(claimsFile).claims ?? {} : {};

const behaviours = new Set(Object.keys(claims.behavior ?? {}));
const capabilities = Object.keys(claims.capability ?? {});

/** Every bare name the pack's surfaces declare, for checking a route's symbols. */
function surfaceSymbols() {
  const apiDir = path.join(packDir, "api");
  const names = new Set();
  if (!fs.existsSync(apiDir)) return names;
  for (const file of fs.readdirSync(apiDir).filter((f) => f.endsWith(".json") && f !== "excluded.json")) {
    const doc = readJson(path.join(apiDir, file));
    for (const pkg of doc.packages ?? []) {
      for (const type of pkg.types ?? []) {
        if (type.name) names.add(type.name);
        for (const member of type.members ?? []) {
          if (member.name) {
            names.add(member.name);
            if (type.name) names.add(`${type.name}.${member.name}`);
          }
        }
      }
    }
  }
  return names;
}

const symbols = surfaceSymbols();

// --- inconsistencies: these fail ---------------------------------------------

const problems = [];

for (const route of routes) {
  for (const id of route.constraints ?? []) {
    if (!behaviours.has(id)) {
      problems.push({
        kind: "constraint-unclaimed",
        task: route.task,
        id,
        detail:
          `route "${route.task}" names the constraint "${id}", which no claim asserts. ` +
          "A constraint an agent is told to honour must be a verified behaviour, not advice.",
      });
    }
  }
  for (const symbol of route.symbols ?? []) {
    // Matched exactly, and the index carries both forms — `member` and
    // `Type.member` — so a route that qualifies its symbol is checked against
    // the type it named, and one that does not is checked against the bare
    // name it did.
    //
    // The first version fell back from `Type.member` to the member alone, which
    // let `TableBuilder.repeatHeader` pass on any type that happened to declare
    // a `repeatHeader` — including when `TableBuilder` had been removed
    // outright. A receiver disappearing is the commonest way a route outlives
    // its API, and it is exactly what this check claims to catch.
    if (symbols.size > 0 && !symbols.has(symbol)) {
      problems.push({
        kind: "symbol-absent",
        task: route.task,
        id: symbol,
        detail:
          `route "${route.task}" names the symbol "${symbol}", which the ${line} surfaces do not declare. ` +
          "The route has outlived the API it recommends.",
      });
    }
  }
}

// --- coverage: reported, never fatal -----------------------------------------

const routed = new Set(routes.map((r) => r.task));
const usedConstraints = new Set(routes.flatMap((r) => r.constraints ?? []));
const coverage = {
  capabilitiesWithoutRoute: capabilities.filter((c) => !routed.has(c)),
  behavioursNoRouteNames: [...behaviours].filter((b) => !usedConstraints.has(b)),
};

// --- output ------------------------------------------------------------------

const result = {
  checked: line,
  routes: routes.length,
  claims: { behavior: behaviours.size, capability: capabilities.length },
  ok: problems.length === 0,
  problems,
  coverage,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = problems.length === 0 ? 0 : 1;
} else {
  const out = [];
  if (problems.length === 0) {
    out.push(
      `[bundle-consistency] graphcompose-${line} agrees with itself ` +
        `(${routes.length} route(s), ${behaviours.size} behaviour claim(s))`,
    );
  } else {
    out.push(`[bundle-consistency] graphcompose-${line}: ${problems.length} inconsistenc(y|ies)`);
    for (const p of problems) out.push(`  ${p.detail}`);
  }
  if (coverage.capabilitiesWithoutRoute.length) {
    out.push(
      `  coverage: ${coverage.capabilitiesWithoutRoute.length} capability claim(s) no route answers — ` +
        coverage.capabilitiesWithoutRoute.join(", "),
    );
  }
  if (coverage.behavioursNoRouteNames.length) {
    out.push(
      `  coverage: ${coverage.behavioursNoRouteNames.length} verified behaviour(s) no route names as a constraint — ` +
        coverage.behavioursNoRouteNames.join(", "),
    );
  }
  process.stdout.write(`${out.join("\n")}\n`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
