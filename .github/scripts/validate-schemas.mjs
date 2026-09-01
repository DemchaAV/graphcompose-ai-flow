#!/usr/bin/env node
// JSON Schema validation gate. Run from the repo root.
//
// Walks the repo tree and validates every JSON file whose filename
// matches a known contract against its schema under schemas/:
//
//   assets-manifest.json → schemas/assets-manifest.schema.json
//   revision.json        → schemas/revision.schema.json
//
// Fails the CI job (exit 1) and prints a structured list of violations
// when any file does not validate. Schemas live under schemas/ on the
// root so they are the single source of truth referenced by both
// tools/asset-resolver and tools/revision-manager READMEs.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCHEMAS_DIR = path.join(ROOT, 'schemas');

// strictRequired is relaxed because revision.schema.json uses
// if/then `required` arrays that do not duplicate the property
// definitions from the root `properties` map. Other strict checks
// (strictTypes, strictTuples, strictNumbers, unevaluatedProperties)
// stay on — strictRequired is the only one this hurts.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats.default(ajv);

const SCHEMA_BINDINGS = [
  {
    // The two halves of asset resolution. The request is what the analysis
    // decided the document needs; the manifest is what was actually fetched.
    // Binding both means a request that could never resolve is caught where it
    // is written rather than by the resolver twenty minutes later.
    filename: 'asset-request.json',
    schemaFile: 'asset-request.schema.json',
  },
  {
    filename: 'assets-manifest.json',
    schemaFile: 'assets-manifest.schema.json',
  },
  {
    filename: 'revision.json',
    schemaFile: 'revision.schema.json',
  },
  // The structured half of the artifacts the agent chain writes. Each has a
  // Markdown sibling that carries the prose; these carry what the loop reads.
  {
    filename: 'orchestration-decision.json',
    schemaFile: 'orchestration.schema.json',
  },
  {
    filename: 'visual-analysis.json',
    schemaFile: 'visual-analysis.schema.json',
  },
  {
    filename: 'architecture-plan.json',
    schemaFile: 'architecture-plan.schema.json',
  },
  {
    filename: 'visual-review.json',
    schemaFile: 'visual-review.schema.json',
  },
  {
    filename: 'flow.config.json',
    schemaFile: 'flow-config.schema.json',
  },
  // The published bundle's contract. Bound by bare filename like the rest,
  // which is safe because `template.json` only ever names a bundle manifest —
  // an authoring project's metadata is `template-project.json`.
  {
    filename: 'template.json',
    schemaFile: 'template-manifest.schema.json',
  },
  // Written by the preview renderer from GraphCompose's own post-layout
  // measurement, so drift here means the engine changed its shape, not that an
  // agent wrote the file wrongly.
  {
    filename: 'layout-snapshot.json',
    schemaFile: 'layout-snapshot.schema.json',
  },
  // Which GraphCompose build a workspace's work is against. Written by
  // preflight at the workspace root; bound here because a schema nothing is
  // matched against is documentation with a validator's costume on.
  {
    filename: 'resolved-version.json',
    schemaFile: 'resolved-version.schema.json',
  },
  // Observations are named after what they describe, not after their kind, so
  // this one binds by the directory that holds them.
  {
    dirPattern: /(^|[\\/])observations[\\/]graphcompose-\d+\.\d+$/,
    schemaFile: 'observation.schema.json',
  },
];

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  'out',
  '.mvn',
  '.gradle',
  '.idea',
  '.vscode',
  'docs/private',
]);

async function loadSchema(schemaFile) {
  const p = path.join(SCHEMAS_DIR, schemaFile);
  const raw = await fs.readFile(p, 'utf8');
  const schema = JSON.parse(raw);
  return ajv.compile(schema);
}

async function walk(dir, hits) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel.replace(/\\/g, '/'))) continue;
      await walk(abs, hits);
    } else if (entry.isFile()) {
      const binding = SCHEMA_BINDINGS.find((b) => b.filename
        ? entry.name === b.filename
        : b.dirPattern.test(dir) && entry.name.endsWith('.json'));
      if (binding) hits.push({ path: abs, binding });
    }
  }
}

function formatErrors(errors) {
  if (!errors) return '<no detail>';
  return errors
    .map((e) => `    ${e.instancePath || '/'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`)
    .join('\n');
}

/**
 * What to validate.
 *
 * The default is this repository, which is what CI checks. But the artifacts
 * these schemas describe are written into the USER's workspace, and until this
 * took an argument nothing validated them there — the contract existed and was
 * enforced everywhere except where the work happens. A revision could carry a
 * `colors` object where the schema says array, and the first sign of it was an
 * unrelated tool crashing three steps later.
 */
function targetsFromArgv(argv) {
  const paths = argv.filter((a) => !a.startsWith("--"));
  return paths.length ? paths.map((p) => path.resolve(p)) : [ROOT];
}

async function main() {
  const validators = new Map();
  for (const binding of SCHEMA_BINDINGS) {
    validators.set(binding.schemaFile, await loadSchema(binding.schemaFile));
  }

  const targets = targetsFromArgv(process.argv.slice(2));
  const hits = [];
  for (const target of targets) await walk(target, hits);

  const violations = [];
  const stats = new Map();
  for (const { path: filePath, binding } of hits) {
    const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
    let data;
    try {
      data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (err) {
      violations.push({ file: rel, schema: binding.schemaFile, message: `JSON parse error: ${err.message}` });
      continue;
    }
    const validator = validators.get(binding.schemaFile);
    const ok = validator(data);
    const tally = stats.get(binding.schemaFile) || { ok: 0, fail: 0 };
    if (ok) {
      tally.ok += 1;
    } else {
      tally.fail += 1;
      violations.push({
        file: rel,
        schema: binding.schemaFile,
        message: '\n' + formatErrors(validator.errors),
      });
    }
    stats.set(binding.schemaFile, tally);
  }

  console.log('JSON Schema validation summary');
  console.log('-------------------------------');
  for (const [schemaFile, tally] of stats.entries()) {
    console.log(`  ${schemaFile}: ${tally.ok} valid, ${tally.fail} invalid`);
  }
  if (stats.size === 0) {
    console.log('  (no files matched any contract)');
  }

  if (violations.length > 0) {
    console.error('');
    console.error(`Violations: ${violations.length}`);
    for (const v of violations) {
      console.error(`  - ${v.file} (${v.schema}):${v.message}`);
    }
    process.exit(1);
  }

  console.log('');
  console.log('OK — all matched JSON files validate against their schemas.');
}

main().catch((err) => {
  console.error('validate-schemas.mjs crashed:', err);
  process.exit(2);
});
