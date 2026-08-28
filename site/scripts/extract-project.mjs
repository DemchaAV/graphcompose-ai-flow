#!/usr/bin/env node
// Builds the landing page's project facts from the files that declare them.
//
// The page used to state these in prose inside the components, and every one of
// them went stale: it advertised GraphCompose 1.6.0 "pulled via JitPack" for
// several releases after the coordinate moved to Maven Central, and labelled a
// link `prompts/visual-review-agent.md` after that whole chain was deleted. A
// fact typed into a component has nothing checking it. A fact read out of the
// file that owns it cannot drift further than the file does.
//
// Nothing here is editorial. If a number is worth putting on the page and some
// file in the repository owns it, it belongs in this script rather than in the
// markup.

import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');
const outFile = join(siteRoot, 'src', 'data', 'generated', 'project.json');

const readJson = async (...parts) => JSON.parse(await readFile(join(repoRoot, ...parts), 'utf8'));

/**
 * The Maven coordinate the harness resolves against, read out of the resolver
 * that owns it rather than restated. `version-resolver.mjs` also still
 * recognises the old JitPack coordinate for pre-1.6.7 pins; the page names the
 * current one, so only the Maven Central constants are read here.
 */
async function readCoordinate() {
  const source = await readFile(join(repoRoot, 'scripts', 'lib', 'version-resolver.mjs'), 'utf8');
  const pick = (name) => {
    const match = source.match(new RegExp(`const ${name} = "([^"]+)"`));
    if (!match) throw new Error(`extract-project: version-resolver.mjs no longer declares ${name}`);
    return match[1];
  };
  return `${pick('MAVEN_GROUP')}:${pick('MAVEN_ARTIFACT')}`;
}

/** One directory per GraphCompose line, each a versioned allow-list + guides. */
async function readPacks() {
  const dir = join(repoRoot, 'skills', 'versions');
  const entries = await readdir(dir, { withFileTypes: true });
  const packs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = await readdir(join(dir, entry.name));
    packs.push({
      id: entry.name,
      line: entry.name.replace(/^graphcompose-/, ''),
      fileCount: files.filter((f) => f.endsWith('.md')).length,
      hasApiSurface: files.includes('00-api-surface.md'),
      hasLoadingMap: files.includes('00-loading-map.md'),
    });
  }
  packs.sort((a, b) => a.line.localeCompare(b.line, undefined, { numeric: true }));
  return packs;
}

/** The hosts the harness installs into, derived from the packaging that exists. */
async function readHosts() {
  const plugin = await readJson('.claude-plugin', 'plugin.json');
  const marketplace = await readJson('.claude-plugin', 'marketplace.json');
  const exists = async (...parts) => Boolean(await stat(join(repoRoot, ...parts)).catch(() => null));
  const hosts = [
    { id: 'claude-code', name: 'Claude Code', packaging: 'plugin', docs: 'docs/plugin-installation.md' },
  ];
  if (await exists('adapters', 'codex', 'install.mjs')) {
    hosts.push({ id: 'codex', name: 'Codex', packaging: 'skills', docs: 'adapters/codex/README.md' });
  }
  if (await exists('adapters', 'gemini', 'install.mjs')) {
    hosts.push({ id: 'gemini', name: 'Gemini CLI', packaging: 'extension', docs: 'adapters/gemini/README.md' });
  }
  return {
    pluginName: plugin.name,
    pluginVersion: plugin.version,
    marketplaceName: marketplace.name,
    hosts,
  };
}

/** Published bundles under templates/, which the reuse-first check consults. */
async function readTemplates() {
  const dir = join(repoRoot, 'templates');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await readFile(join(dir, entry.name, 'template.json'), 'utf8').catch(() => null);
    if (manifest) count += 1;
  }
  return count;
}

async function main() {
  const pkg = await readJson('package.json');
  const manifest = await readJson('skills', 'skill-manifest.json');
  const pipeline = await readJson('config', 'pipeline.json');
  const packaging = await readHosts();

  const project = {
    generatedAt: new Date().toISOString(),
    version: pkg.version,
    description: pkg.description,
    ...packaging,
    library: {
      name: manifest.targetLibrary,
      coordinate: await readCoordinate(),
      supported: manifest.supportedGraphComposeVersions,
      default: manifest.defaultGraphComposeVersion,
      packs: await readPacks(),
    },
    limits: {
      maxIterations: pipeline.limits.maxIterations,
      maxConsecutiveBuildFailures: pipeline.limits.maxConsecutiveBuildFailures,
      maxSameMismatchAttempts: pipeline.limits.maxSameMismatchAttempts,
    },
    gates: Object.entries(pipeline.gates).map(([id, gate]) => ({
      id,
      summary: gate.summary,
      comparedAgainst: gate.comparedAgainst,
    })),
    scopeCount: Object.keys(pipeline.scopes).length,
    workflowCount: Object.keys(pipeline.workflows).filter((id) => !id.startsWith('$')).length,
    failureCategories: pipeline.failureCategories,
    publishedTemplates: await readTemplates(),
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(project, null, 2));
  console.log(
    `extract-project: ${project.version}, ${project.library.packs.length} skill packs, ` +
      `${project.hosts.length} hosts, ${project.gates.length} gates -> ${outFile}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
