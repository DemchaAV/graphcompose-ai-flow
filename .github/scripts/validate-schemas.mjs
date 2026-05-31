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

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats.default(ajv);

const SCHEMA_BINDINGS = [
  {
    filename: 'assets-manifest.json',
    schemaFile: 'assets-manifest.schema.json',
  },
  {
    filename: 'revision.json',
    schemaFile: 'revision.schema.json',
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
      const binding = SCHEMA_BINDINGS.find((b) => entry.name === b.filename);
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

async function main() {
  const validators = new Map();
  for (const binding of SCHEMA_BINDINGS) {
    validators.set(binding.schemaFile, await loadSchema(binding.schemaFile));
  }

  const hits = [];
  await walk(ROOT, hits);

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
