#!/usr/bin/env node
/**
 * scripts/setup.mjs — one-command local setup for GraphCompose AI Template Flow.
 *
 * Checks the toolchain (Node 20+, npm, Java 21+, Maven), installs and builds the
 * Node tools that have dependencies, and packages the Java preview-renderer.
 * Cross-platform: invoke via `npm run setup`, `./setup.sh`, or `.\setup.ps1`.
 *
 * ImageMagick is checked but does not block: nothing built here needs it, and
 * the pixel-parity gates do. Reporting it as a failure would stop a build that
 * would have worked; not reporting it at all — which is what this did — lets
 * someone finish setup, read "Toolchain OK", and meet the first gate hours
 * later with `magick` missing. So it is a warning, and it says what breaks.
 *
 * A missing tool is printed with the command that installs it. `setup` still
 * installs nothing itself: a JDK, Maven and ImageMagick are system packages,
 * and a script that installs those unasked has overstepped.
 *
 * Flags:
 *   --check   Only verify the toolchain; do not install or build.
 *
 * Setup is build-only by design. Test suites are for contributors and run in CI.
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { installHint } from './lib/install-hints.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const checkOnly = process.argv.includes('--check');

const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const paint = (c, s) => (useColor ? `\x1b[${c}m${s}\x1b[0m` : s);
const bold = (s) => paint('1', s);
const dim = (s) => paint('2', s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);

const problems = [];
const warnings = [];

function head(title) {
  console.log(`\n${bold('▶ ' + title)}`);
}

function capture(cmd) {
  // Single command string + shell:true avoids Node's DEP0190 (args+shell) warning.
  // All callers pass hard-coded probes (no user input), so there is no injection risk.
  const r = spawnSync(cmd, { encoding: 'utf8', shell: true });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout || ''}${r.stderr || ''}`;
}

function ok(name, detail) {
  console.log(`  ${green('✓')} ${name} ${dim(detail || '')}`);
}

function bad(name, detail) {
  console.log(`  ${red('✗')} ${name} ${detail || ''}`);
  hint(name);
  problems.push(name);
}

function warn(name, detail) {
  console.log(`  ${yellow('!')} ${name} ${detail || ''}`);
  hint(name);
  warnings.push(name);
}

/** The command that installs it here, when this module knows one. */
function hint(name) {
  const command = installHint(name);
  if (command) console.log(dim(`      ${command}`));
}

function run(cmd, relCwd) {
  const cwd = relCwd ? join(repoRoot, relCwd) : repoRoot;
  console.log(dim(`  $ ${cmd}${relCwd ? '   # ' + relCwd : ''}`));
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

// --- 1. Toolchain checks ---------------------------------------------------
head('Checking toolchain');

const nodeMajor = Number(process.versions.node.split('.')[0]);
nodeMajor >= 20
  ? ok('Node.js', `v${process.versions.node}`)
  : bad('Node.js', `v${process.versions.node} (need >= 20)`);

const npmV = capture('npm --version');
npmV ? ok('npm', `v${npmV.trim()}`) : bad('npm', 'not found on PATH');

const javaOut = capture('java -version');
const javaM = javaOut && javaOut.match(/version "(\d+)(?:[._\d]*)?"/);
const javaMajor = javaM ? Number(javaM[1]) : null;
javaMajor !== null && javaMajor >= 21
  ? ok('Java', javaM[0].replace('version ', '').replace(/"/g, ''))
  : bad('Java', javaMajor !== null ? `${javaMajor} (need >= 21)` : 'not found on PATH (need >= 21)');

const mvnOut = capture('mvn -version');
const mvnM = mvnOut && mvnOut.match(/Apache Maven ([\d.]+)/);
mvnM ? ok('Maven', `v${mvnM[1]}`) : bad('Maven', 'not found on PATH');

// Not in `problems`: the build below does not touch it. It is the parity gates
// that do, and they are a non-negotiable of the loop — so a machine without it
// can set up, and finds out here rather than at the first refactor-only revision.
const magickOut = capture('magick -version');
const magickM = magickOut && magickOut.match(/ImageMagick ([\d.-]+)/);
magickM
  ? ok('ImageMagick', `v${magickM[1]}`)
  : warn('ImageMagick', 'not found on PATH — the pixel-parity gates (`magick compare`) cannot run');

if (problems.length) {
  console.log(`\n${red('Toolchain incomplete:')} ${problems.join(', ')}.`);
  console.log('Install the missing tools (docs/quickstart.md -> Requirements) and re-run.');
  process.exit(1);
}
console.log(
  warnings.length
    ? `\n${green('Toolchain OK')} for building, ${yellow(warnings.join(', ') + ' missing')} — ` +
        'the gates that need it will fail until it is installed.'
    : `\n${green('Toolchain OK.')}`,
);

if (checkOnly) process.exit(0);

// --- 2. Node tools: install + build where needed ---------------------------
head('Node tools (install + build where needed)');
const nodeTools = ['revision-manager', 'visual-diff', 'asset-resolver', 'skill-validation-cache', 'schema-validate'];
try {
  for (const t of nodeTools) {
    const dir = join(repoRoot, 'tools', t);
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const hasLock = existsSync(join(dir, 'package-lock.json'));
    const hasDeps = Boolean(pkg.dependencies || pkg.devDependencies);
    const hasBuild = Boolean(pkg.scripts && pkg.scripts.build);
    if (hasLock) run('npm ci', `tools/${t}`);
    else if (hasDeps) run('npm install', `tools/${t}`);
    else console.log(dim(`  • tools/${t}: no dependencies — nothing to install`));
    if (hasBuild) run('npm run build', `tools/${t}`);
  }

  // --- 3. Java preview-renderer: package -----------------------------------
  // Use maven.test.skip (not skipTests): it skips test *compilation and
  // resources*, not just execution. That is correct for a jar build (we never
  // need test classes here) and avoids a maven-resources-plugin copy of the
  // test resources -- which fails with "Operation not permitted" when the repo
  // is a Windows/OneDrive bind mount inside a dev container. CI runs the real
  // preview-renderer test suite in its own job, so coverage is unaffected.
  head('Java preview-renderer (package)');
  run('mvn -q -B -Dmaven.test.skip=true package', 'tools/preview-renderer');
} catch (err) {
  const first = err && err.message ? err.message.split('\n')[0] : String(err);
  console.log(`\n${red('Setup failed:')} ${first}`);
  process.exit(1);
}

// --- 4. Done ---------------------------------------------------------------
head('Done');
console.log(`  ${green('Setup complete.')} Try:`);
console.log('    node scripts/render-invoice-reference.mjs            # render the invoice example');
console.log('    node scripts/render-cv-reference.mjs revision-002    # render the CV example');
console.log('    node tools/revision-manager/bin/graphcompose-flow.mjs --help');
