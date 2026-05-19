#!/usr/bin/env node
// Parses prompts/*-agent.md files into a structured JSON consumed by the
// Pipeline component. Each agent file has predictable sections (# title,
// ## Role, ## Inputs, ## Outputs). We extract just what the landing needs.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');
const promptsDir = join(repoRoot, 'prompts');
const outFile = join(siteRoot, 'src', 'data', 'generated', 'agents.json');

// Canonical chain order (matches docs/agents.md). One source of truth for
// ordering, since alphabetical sort would scramble the pipeline.
const order = [
  'orchestrator-agent.md',
  'version-skill-resolver-agent.md',
  'skill-validator-agent.md',
  'visual-analyzer-agent.md',
  'architecture-mapper-agent.md',
  'asset-resolver-agent.md',
  'template-coder-agent.md',
  'test-render-agent.md',
  'visual-review-agent.md',
  'revision-manager-agent.md',
  'template-publisher-agent.md',
];

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractSection(md, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|\\Z)`, 'm');
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

function firstParagraph(text) {
  if (!text) return '';
  // Skip leading blockquotes / entry-point banners
  const lines = text.split('\n');
  const buf = [];
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (line.startsWith('>') || line.trim() === '') continue;
      started = true;
    }
    if (line.trim() === '') break;
    buf.push(line.trim());
  }
  return buf.join(' ');
}

function extractCodeBlock(section) {
  const m = section.match(/```(?:text)?\s*\n([\s\S]*?)\n```/);
  if (!m) return [];
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean);
}

async function main() {
  await mkdir(dirname(outFile), { recursive: true });
  const files = await readdir(promptsDir);
  const known = new Set(files);
  const agents = [];

  for (const name of order) {
    if (!known.has(name)) {
      throw new Error(`extract-agents: missing prompts/${name}`);
    }
    const md = await readFile(join(promptsDir, name), 'utf8');
    const title = extractTitle(md) || name.replace(/-agent\.md$/, '');
    const roleSection = extractSection(md, 'Role');
    const role = firstParagraph(roleSection);
    const inputs = extractCodeBlock(extractSection(md, 'Inputs'));
    const outputs = extractCodeBlock(extractSection(md, 'Outputs'));
    agents.push({
      slug: name.replace(/\.md$/, ''),
      file: `prompts/${name}`,
      title,
      role,
      inputs,
      outputs,
    });
  }

  await writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), agents }, null, 2));
  console.log(`extract-agents: wrote ${agents.length} agents to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
