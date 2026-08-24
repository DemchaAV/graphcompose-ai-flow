#!/usr/bin/env node
// Builds the landing page's pipeline data from config/pipeline.json — the same
// file the harness itself routes on, so the site cannot describe a workflow the
// tools do not run.
//
// This replaces extract-agents.mjs, which parsed prompts/*-agent.md. That
// eleven-prompt chain was folded into four workflow skills, and the prompts are
// gone; a page generated from them would have been advertising an architecture
// the project no longer has.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');
const configFile = join(repoRoot, 'config', 'pipeline.json');
const outFile = join(siteRoot, 'src', 'data', 'generated', 'pipeline.json');

// The full chain is what a first generation runs; the shorter scopes are
// subsets of it, so this is the honest thing to show as "the pipeline".
const FULL_SCOPE = 'new';

async function main() {
  const config = JSON.parse(await readFile(configFile, 'utf8'));

  const scope = config.scopes[FULL_SCOPE];
  if (!scope) throw new Error(`extract-pipeline: config has no "${FULL_SCOPE}" scope`);

  const stages = scope.stages.map((id) => {
    const stage = config.stages[id];
    if (!stage) throw new Error(`extract-pipeline: scope "${FULL_SCOPE}" names unknown stage "${id}"`);
    return {
      id,
      label: stage.label,
      kind: stage.kind,
      description: stage.description,
      tool: stage.tool ?? null,
    };
  });

  const workflows = Object.entries(config.workflows ?? {})
    .filter(([id]) => !id.startsWith('$'))
    .map(([id, workflow]) => ({
      id,
      skill: workflow.skill,
      summary: workflow.summary,
      scopes: workflow.scopes ?? [],
    }));

  const scopes = Object.entries(config.scopes).map(([name, entry]) => ({
    name,
    gate: entry.gate,
    stageCount: entry.stages.length,
  }));

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(
    outFile,
    JSON.stringify({ generatedAt: new Date().toISOString(), stages, workflows, scopes }, null, 2),
  );
  console.log(
    `extract-pipeline: wrote ${stages.length} stages and ${workflows.length} workflows to ${outFile}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
