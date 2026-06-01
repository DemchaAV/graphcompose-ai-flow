#!/usr/bin/env node
/**
 * skill-validation-cache CLI.
 *
 * Subcommands:
 *
 *   lookup --target <coord> --skills <id,id,...> --skill-pack <dir> [--cache <dir>]
 *     Exit code 0 on hit, 1 on miss.
 *     On hit: prints the cached JSON entry to stdout.
 *
 *   store --target <coord> --skills <id,id,...> --skill-pack <dir>
 *         --verdict <pass|halt> [--reason <text>] [--report <path>] [--cache <dir>]
 *     Writes the verdict to cache. The report body is read from the
 *     given file path, or from stdin if --report is omitted.
 *
 *   key --target <coord> --skills <id,id,...> --skill-pack <dir>
 *     Prints the cache key the other subcommands would compute.
 *
 *   list [--cache <dir>]
 *     Lists every cached entry as one JSON object per line.
 *
 *   delete --key <hex> [--cache <dir>]
 *     Deletes a cache entry by key.
 *
 * Default cache dir: tools/skill-validation-cache/.cache/ relative to
 * the repo root (resolved from this script's own directory).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCacheKey } from '../src/hash.mjs';
import {
  lookupEntry,
  storeEntry,
  listEntries,
  deleteEntry,
} from '../src/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CACHE_DIR = path.join(TOOL_ROOT, '.cache');

function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out.opts[key] = true;
      } else {
        out.opts[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function requireOpt(opts, name) {
  if (!opts[name]) {
    console.error(`error: --${name} is required`);
    process.exit(2);
  }
  return opts[name];
}

function parseSkillList(raw) {
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function cmdKey(opts) {
  const targetCoordinate = requireOpt(opts, 'target');
  const skills = parseSkillList(requireOpt(opts, 'skills'));
  const skillPackDir = path.resolve(requireOpt(opts, 'skill-pack'));
  const { key, breakdown } = await computeCacheKey({
    targetCoordinate,
    coveredSkills: skills,
    skillPackDir,
  });
  process.stdout.write(JSON.stringify({ key, breakdown }, null, 2) + '\n');
}

async function cmdLookup(opts) {
  const targetCoordinate = requireOpt(opts, 'target');
  const skills = parseSkillList(requireOpt(opts, 'skills'));
  const skillPackDir = path.resolve(requireOpt(opts, 'skill-pack'));
  const cacheDir = path.resolve(opts.cache || DEFAULT_CACHE_DIR);
  const { key } = await computeCacheKey({
    targetCoordinate,
    coveredSkills: skills,
    skillPackDir,
  });
  const entry = await lookupEntry(cacheDir, key);
  if (entry == null) {
    process.stderr.write(`cache MISS: ${key}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ key, entry }, null, 2) + '\n');
  process.stderr.write(`cache HIT: ${key}\n`);
}

async function cmdStore(opts) {
  const targetCoordinate = requireOpt(opts, 'target');
  const skills = parseSkillList(requireOpt(opts, 'skills'));
  const skillPackDir = path.resolve(requireOpt(opts, 'skill-pack'));
  const verdict = requireOpt(opts, 'verdict');
  if (verdict !== 'pass' && verdict !== 'halt') {
    console.error('error: --verdict must be "pass" or "halt"');
    process.exit(2);
  }
  const cacheDir = path.resolve(opts.cache || DEFAULT_CACHE_DIR);
  const reportBody = opts.report
    ? await fs.readFile(path.resolve(opts.report), 'utf8')
    : await readStdin();

  const { key, breakdown } = await computeCacheKey({
    targetCoordinate,
    coveredSkills: skills,
    skillPackDir,
  });

  const entry = {
    verdict,
    reason: opts.reason || null,
    targetCoordinate,
    coveredSkills: breakdown.coveredSkills,
    skillPackFiles: breakdown.skillPackFiles,
    verifiedAt: new Date().toISOString(),
    reportBody,
  };
  await storeEntry(cacheDir, key, entry);
  process.stderr.write(`cache STORED: ${key}\n`);
  process.stdout.write(JSON.stringify({ key }, null, 2) + '\n');
}

async function cmdList(opts) {
  const cacheDir = path.resolve(opts.cache || DEFAULT_CACHE_DIR);
  const entries = await listEntries(cacheDir);
  for (const e of entries) {
    process.stdout.write(JSON.stringify(e) + '\n');
  }
  process.stderr.write(`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}\n`);
}

async function cmdDelete(opts) {
  const key = requireOpt(opts, 'key');
  const cacheDir = path.resolve(opts.cache || DEFAULT_CACHE_DIR);
  await deleteEntry(cacheDir, key);
  process.stderr.write(`cache DELETED: ${key}\n`);
}

async function main() {
  const { _: positional, opts } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  switch (cmd) {
    case 'key':
      await cmdKey(opts);
      break;
    case 'lookup':
      await cmdLookup(opts);
      break;
    case 'store':
      await cmdStore(opts);
      break;
    case 'list':
      await cmdList(opts);
      break;
    case 'delete':
      await cmdDelete(opts);
      break;
    default:
      console.error('usage: skill-validation-cache <key|lookup|store|list|delete> [options]');
      console.error('       run with no subcommand to see this help');
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(3);
});

// On Windows, the rare race where the temp file lingers around if the
// process is killed mid-write is acceptable — the next store call
// uses a new pid suffix so the previous tmp does not collide.
void path.sep;
