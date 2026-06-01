#!/usr/bin/env node
/**
 * Smoke test for skill-validation-cache.
 *
 * Runs the CLI through its 5 subcommands against a temp cache dir
 * and asserts the round-trip works. Uses node:assert; no external
 * test runner.
 */

import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '..', 'bin', 'skill-validation-cache.mjs');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL_PACK = path.join(REPO_ROOT, 'skills', 'versions', 'graphcompose-1.6');

const TARGET = 'io.github.demchaav:graph-compose:1.6.6';
const SKILLS = 'layout-primitives,tables,themes-and-colors';

function run(args, opts = {}) {
  return spawnSync('node', [BIN, ...args], {
    encoding: 'utf8',
    input: opts.input,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

async function main() {
  const cacheDir = await fs.mkdtemp(path.join(tmpdir(), 'svc-smoke-'));
  console.log(`smoke: temp cache dir = ${cacheDir}`);

  // 1. key — deterministic computation
  const keyA = run(['key', '--target', TARGET, '--skills', SKILLS, '--skill-pack', SKILL_PACK]);
  assert.equal(keyA.status, 0, `key cmd failed: ${keyA.stderr}`);
  const keyAJson = JSON.parse(keyA.stdout);
  assert.match(keyAJson.key, /^[0-9a-f]{64}$/, 'key must be a 64-char hex sha256');
  console.log(`smoke: key = ${keyAJson.key.slice(0, 16)}...`);

  // 2. lookup BEFORE store — miss, exit 1
  const lookupMiss = run(['lookup', '--target', TARGET, '--skills', SKILLS,
    '--skill-pack', SKILL_PACK, '--cache', cacheDir]);
  assert.equal(lookupMiss.status, 1, `pre-store lookup should miss (exit 1), got ${lookupMiss.status}`);
  console.log('smoke: pre-store lookup = MISS (ok)');

  // 3. store — read reportBody from stdin
  const reportBody = '# Skill Validation Report\n\nall passed\n\nverdict: pass\n';
  const stored = run(['store', '--target', TARGET, '--skills', SKILLS,
    '--skill-pack', SKILL_PACK, '--verdict', 'pass', '--cache', cacheDir],
    { input: reportBody });
  assert.equal(stored.status, 0, `store cmd failed: ${stored.stderr}`);
  const storedJson = JSON.parse(stored.stdout);
  assert.equal(storedJson.key, keyAJson.key, 'store key must match key cmd');
  console.log('smoke: store = ok');

  // 4. lookup AFTER store — hit, exit 0, entry round-tripped
  const lookupHit = run(['lookup', '--target', TARGET, '--skills', SKILLS,
    '--skill-pack', SKILL_PACK, '--cache', cacheDir]);
  assert.equal(lookupHit.status, 0, `post-store lookup should hit (exit 0), got ${lookupHit.status}`);
  const hitJson = JSON.parse(lookupHit.stdout);
  assert.equal(hitJson.entry.verdict, 'pass');
  assert.equal(hitJson.entry.reportBody, reportBody);
  assert.deepEqual(hitJson.entry.coveredSkills.sort(), SKILLS.split(',').sort());
  console.log('smoke: post-store lookup = HIT (ok)');

  // 5. list — finds the one entry
  const list = run(['list', '--cache', cacheDir]);
  assert.equal(list.status, 0);
  const listed = list.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(listed.length, 1);
  assert.equal(listed[0].key, keyAJson.key);
  console.log('smoke: list = 1 entry (ok)');

  // 6. delete — entry gone, follow-up lookup misses
  const del = run(['delete', '--key', keyAJson.key, '--cache', cacheDir]);
  assert.equal(del.status, 0);
  const lookupAfterDelete = run(['lookup', '--target', TARGET, '--skills', SKILLS,
    '--skill-pack', SKILL_PACK, '--cache', cacheDir]);
  assert.equal(lookupAfterDelete.status, 1, 'post-delete lookup should miss');
  console.log('smoke: delete = ok');

  // 7. key sensitivity — changing target version flips the key
  const keyB = run(['key', '--target', 'io.github.demchaav:graph-compose:1.6.5',
    '--skills', SKILLS, '--skill-pack', SKILL_PACK]);
  const keyBJson = JSON.parse(keyB.stdout);
  assert.notEqual(keyAJson.key, keyBJson.key, 'different target version must yield different key');
  console.log('smoke: key sensitivity (target version) = ok');

  // 8. key sensitivity — different skill order yields SAME key (sorted)
  const keyC = run(['key', '--target', TARGET,
    '--skills', SKILLS.split(',').reverse().join(','),
    '--skill-pack', SKILL_PACK]);
  const keyCJson = JSON.parse(keyC.stdout);
  assert.equal(keyAJson.key, keyCJson.key, 'skill order must not affect key');
  console.log('smoke: key insensitivity (skill order) = ok');

  // cleanup
  await fs.rm(cacheDir, { recursive: true, force: true });
  console.log('smoke: PASS');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
