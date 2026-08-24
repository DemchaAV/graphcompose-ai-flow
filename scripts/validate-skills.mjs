#!/usr/bin/env node
/**
 * scripts/validate-skills.mjs — render each skill fixture through the shared
 * preview-renderer and check it against a committed visual baseline.
 *
 *   node scripts/validate-skills.mjs                    # validate vs baselines (visual-diff, IDENTICAL)
 *   node scripts/validate-skills.mjs --update-baseline  # (re)capture expected-output/ baselines
 *   node scripts/validate-skills.mjs --render-only      # render + non-empty check, no diff (used in CI)
 *   node scripts/validate-skills.mjs row-basic ...      # limit to named fixtures
 *
 * PNG baselines are platform-specific (font rasterisation differs across OS/JDK),
 * so CI runs --render-only; the strict visual-diff gate is a local developer check.
 *
 * Each fixture exposes a no-arg `*FixtureDocument` class with
 * compose(DocumentSession); preview-renderer instantiates it and writes
 * output.pdf/png into a throwaway target/render-tmp folder. The committed
 * baseline is examples/skill-fixtures/<dir>/expected-output/output.{pdf,png}.
 * PDFs carry timestamps, so parity is judged on the PNG via tools/visual-diff.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

const FIXTURES = [
  ['row-basic', 'com.demcha.compose.document.fixtures.rowbasic.RowBasicFixtureDocument'],
  ['section-basic', 'com.demcha.compose.document.fixtures.sectionbasic.SectionBasicFixtureDocument'],
  ['table-basic', 'com.demcha.compose.document.fixtures.tablebasic.TableBasicFixtureDocument'],
  ['layer-stack-badge', 'com.demcha.compose.document.fixtures.layerstackbadge.LayerStackBadgeFixtureDocument'],
  ['shape-container-card', 'com.demcha.compose.document.fixtures.shapecontainercard.ShapeContainerCardFixtureDocument'],
];

const args = process.argv.slice(2);
const updateBaseline = args.includes('--update-baseline');
const renderOnly = args.includes('--render-only');
const only = args.filter((a) => !a.startsWith('--'));

const jar = path.join(repoRoot, 'tools', 'preview-renderer', 'target', 'preview-renderer.jar');
const previewRendererPom = path.join(repoRoot, 'tools', 'preview-renderer', 'pom.xml');
const visualDiff = path.join(repoRoot, 'tools', 'visual-diff', 'bin', 'visual-diff.mjs');

const STUB_REVISION = JSON.stringify({
  id: 'revision-001',
  parentRevisionId: null,
  status: 'DRAFT',
  userRequest: 'skill fixture render',
  targetGraphComposeVersion: '2.2.0',
  skillPack: 'skills/versions/graphcompose-2.2',
  createdAt: '2026-01-01T00:00:00Z',
  artifacts: { userRequest: 'user-request.md' },
  pendingArtifacts: ['output.pdf', 'output.png'],
});

function exec(cmd, cmdArgs, cwd) {
  return spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8', shell: false });
}
function mvn(mvnArgs, cwd) {
  return isWin ? exec('cmd.exe', ['/d', '/s', '/c', 'mvn', ...mvnArgs], cwd) : exec('mvn', mvnArgs, cwd);
}
function fail(msg, r) {
  console.error(`  ✗ ${msg}`);
  if (r) console.error((r.stdout || '').split('\n').slice(-6).join('\n') + (r.stderr || ''));
}

if (!fs.existsSync(jar)) {
  console.log('> building preview-renderer.jar ...');
  const b = mvn(['-q', '-B', '-f', previewRendererPom, '-Dmaven.test.skip=true', 'package'], repoRoot);
  if (b.status !== 0 || !fs.existsSync(jar)) { fail('preview-renderer build failed', b); process.exit(1); }
}

let failures = 0;
const selected = FIXTURES.filter(([dir]) => only.length === 0 || only.includes(dir));

for (const [dir, cls] of selected) {
  const fixtureDir = path.join(repoRoot, 'examples', 'skill-fixtures', dir);
  console.log(`\n▶ ${dir}`);

  let r = mvn(['-q', '-B', '-DskipTests', 'compile'], fixtureDir);
  if (r.status !== 0) { fail('compile failed', r); failures++; continue; }
  r = mvn(['-q', '-B', 'dependency:build-classpath', '-Dmdep.outputFile=target/cp.txt'], fixtureDir);
  if (r.status !== 0) { fail('classpath failed', r); failures++; continue; }

  const tmp = path.join(fixtureDir, 'target', 'render-tmp');
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'revision.json'), STUB_REVISION);

  r = exec('java', ['-jar', jar, 'render',
    '--revision', tmp,
    '--template-class', cls,
    '--classpath', path.join(fixtureDir, 'target', 'classes'),
    '--classpath-file', path.join(fixtureDir, 'target', 'cp.txt'),
    '--output', 'output.pdf', '--preview', 'output.png', '--dpi', '150', '--page', '0'], fixtureDir);
  const outPdf = path.join(tmp, 'output.pdf');
  const outPng = path.join(tmp, 'output.png');
  if (r.status !== 0 || !fs.existsSync(outPng)) { fail('render failed', r); failures++; continue; }
  console.log(`  rendered: ${fs.statSync(outPdf).size} b pdf, ${fs.statSync(outPng).size} b png`);

  const expectedDir = path.join(fixtureDir, 'expected-output');
  const basePdf = path.join(expectedDir, 'output.pdf');
  const basePng = path.join(expectedDir, 'output.png');

  if (renderOnly) {
    console.log('  ✓ rendered (render-only)');
  } else if (updateBaseline) {
    fs.mkdirSync(expectedDir, { recursive: true });
    fs.copyFileSync(outPdf, basePdf);
    fs.copyFileSync(outPng, basePng);
    console.log('  ✓ baseline updated');
  } else if (!fs.existsSync(basePng)) {
    fail('no committed baseline — run with --update-baseline'); failures++;
  } else {
    const vd = exec('node', [visualDiff, basePng, outPng, '--json', '--out', path.join(tmp, 'diff.png')], repoRoot);
    let classification = 'UNKNOWN';
    try {
      classification = JSON.parse((vd.stdout || '').trim()).classification;
    } catch { /* leave UNKNOWN */ }
    if (classification === 'IDENTICAL') console.log('  ✓ IDENTICAL vs baseline');
    else { fail(`visual drift vs baseline: ${classification}`, vd); failures++; }
  }
}

console.log(`\n${failures === 0 ? '✓ all fixtures OK' : `✗ ${failures} fixture(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
