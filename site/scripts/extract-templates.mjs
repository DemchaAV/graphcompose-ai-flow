#!/usr/bin/env node
// Scans templates/*/template.json and emits a normalized list for the
// LiveExample / template gallery sections.

import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');
const templatesDir = join(repoRoot, 'templates');
const outFile = join(siteRoot, 'src', 'data', 'generated', 'templates.json');

async function main() {
  await mkdir(dirname(outFile), { recursive: true });
  const entries = await readdir(templatesDir);
  const templates = [];

  for (const id of entries) {
    const dir = join(templatesDir, id);
    const s = await stat(dir).catch(() => null);
    if (!s?.isDirectory()) continue;
    const manifestPath = join(dir, 'template.json');
    const raw = await readFile(manifestPath, 'utf8').catch(() => null);
    if (!raw) continue;
    const json = JSON.parse(raw);
    templates.push({
      id: json.id || id,
      displayName: json.displayName || id,
      docKind: json.docKind || null,
      sourceProject: json.sourceProject || null,
      sourceRevision: json.sourceRevision || null,
      sourceCommit: json.sourceCommit || null,
      publishedAt: json.publishedAt || null,
      fonts: json.fonts || [],
      dependencies: json.dependencies || {},
      paths: {
        bundle: `templates/${id}/`,
        readme: `templates/${id}/README.md`,
        manifest: `templates/${id}/template.json`,
      },
    });
  }

  templates.sort((a, b) => a.displayName.localeCompare(b.displayName));
  await writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), templates }, null, 2));
  console.log(`extract-templates: wrote ${templates.length} templates to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
