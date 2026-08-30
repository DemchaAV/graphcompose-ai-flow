#!/usr/bin/env node
// Repository-contract checks. Run from the repo root.
//
// Validates that the on-disk state of the repository matches the
// contract the plan and AUDIT.md spell out:
//
//   1. Every skill listed in skills/skill-manifest.json exists AND
//      has YAML frontmatter with skillId / targetVersion / status /
//      verifiedAgainst.
//   2. The frontmatter `status` is one of the documented values.
//   3. The frontmatter `skillId` matches the manifest entry's `id`.
//   4. Every revision.json under examples/ parses as JSON and every
//      artifact it lists either exists on disk or is also listed in
//      `pendingArtifacts`.
//   5. Every internal markdown link of the form [text](relative.md)
//      resolves to a file on disk.
//   6. No file under examples/ or under tools/preview-renderer/
//      imports the fictional com.demcha.graphcompose.*
//      (DocumentSession / BusinessTheme / DocumentTemplate / RowBuilder
//      / SectionBuilder / TableBuilder / LayerStack /
//      ShapeContainer) -- the renderer's own package
//      com.demcha.graphcompose.preview.* is the exception.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];

function fail(msg) {
  errors.push(msg);
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function fileExists(p) {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function walk(dir, predicate) {
  const out = [];
  async function visit(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        // `graphcompose-flow/` at the root is a user's workspace created inside
        // the checkout — their revisions, not the repository's contract.
        if (
          e.name === 'node_modules' || e.name === 'target' || e.name === 'dist' || e.name === '.git' ||
          (e.name === 'graphcompose-flow' && d === repoRoot)
        ) {
          continue;
        }
        await visit(full);
      } else if (e.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  await visit(dir);
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = text.slice(3, end).trim();
  const obj = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (m) obj[m[1]] = m[2].trim();
  }
  return obj;
}

const ALLOWED_SKILL_STATUSES = new Set([
  'active',
  'experimental',
  'deprecated',
  'needs-validation',
  'failed-validation',
]);

async function checkSkillManifest() {
  const manifestPath = path.join(ROOT, 'skills/skill-manifest.json');
  const manifest = await readJson(manifestPath);
  if (!Array.isArray(manifest.skills)) {
    fail('skill-manifest.json: `skills` is not an array');
    return;
  }
  for (const entry of manifest.skills) {
    if (!entry.id || !entry.file) {
      fail(`skill-manifest entry missing id or file: ${JSON.stringify(entry)}`);
      continue;
    }
    const skillPath = path.join(ROOT, 'skills', entry.file);
    if (!(await fileExists(skillPath))) {
      fail(`skill-manifest references missing file: skills/${entry.file} (id: ${entry.id})`);
      continue;
    }
    const text = await fs.readFile(skillPath, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) {
      fail(`skill ${entry.id}: no YAML frontmatter at top of skills/${entry.file}`);
      continue;
    }
    for (const key of ['skillId', 'targetVersion', 'status', 'verifiedAgainst']) {
      if (!fm[key]) {
        fail(`skill ${entry.id}: frontmatter missing required field "${key}"`);
      }
    }
    if (fm.skillId && fm.skillId !== entry.id) {
      fail(
        `skill ${entry.id}: frontmatter skillId="${fm.skillId}" disagrees with manifest id`,
      );
    }
    if (fm.status && !ALLOWED_SKILL_STATUSES.has(fm.status)) {
      fail(
        `skill ${entry.id}: frontmatter status="${fm.status}" is not a documented value`,
      );
    }
    if (entry.status && fm.status && entry.status !== fm.status) {
      fail(
        `skill ${entry.id}: manifest status="${entry.status}" disagrees with frontmatter status="${fm.status}"`,
      );
    }
  }
}

async function checkTemplateProjects() {
  const projectFiles = await walk(
    path.join(ROOT, 'examples'),
    (p) => path.basename(p) === 'template-project.json',
  );
  for (const p of projectFiles) {
    try {
      await readJson(p);
    } catch (e) {
      fail(`${path.relative(ROOT, p)}: invalid JSON (${e.message})`);
    }
  }
}

async function checkRevisionArtifacts() {
  const revisionFiles = await walk(
    path.join(ROOT, 'examples'),
    (p) => path.basename(p) === 'revision.json',
  );
  for (const revFile of revisionFiles) {
    let rev;
    try {
      rev = await readJson(revFile);
    } catch (e) {
      fail(`${path.relative(ROOT, revFile)}: invalid JSON (${e.message})`);
      continue;
    }
    const dir = path.dirname(revFile);
    const pending = new Set(rev.pendingArtifacts ?? []);
    if (rev.artifacts && typeof rev.artifacts === 'object') {
      for (const [label, name] of Object.entries(rev.artifacts)) {
        if (typeof name !== 'string') continue;
        if (pending.has(name)) continue;
        const artifactPath = path.join(dir, name);
        if (!(await fileExists(artifactPath))) {
          fail(
            `${path.relative(ROOT, revFile)}: artifact "${label}" -> "${name}" not on disk and not in pendingArtifacts`,
          );
        }
      }
    }
  }
}

const LINK_RE = /\[(?:[^\]]+)\]\(((?!https?:|mailto:|#)[^)#]+?)(?:#[^)]*)?\)/g;

// Strip fenced code blocks (``` ... ```) and inline code spans (`...`) so
// markdown examples that contain literal "[text](path)" inside code do not
// trip the link checker.
function stripCodeRegions(text) {
  let out = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/\S/g, ' '));
  out = out.replace(/`[^`\n]*`/g, (m) => m.replace(/\S/g, ' '));
  return out;
}

async function checkMarkdownLinks() {
  const mdFiles = await walk(ROOT, (p) => p.endsWith('.md'));
  for (const md of mdFiles) {
    const raw = await fs.readFile(md, 'utf8');
    const text = stripCodeRegions(raw);
    const dir = path.dirname(md);
    for (const match of text.matchAll(LINK_RE)) {
      const rel = match[1].trim();
      if (rel.length === 0) continue;
      // Skip data URIs and image refs that obviously aren't files in repo.
      if (rel.startsWith('data:')) continue;
      const resolved = path.resolve(dir, rel);
      if (!(await fileExists(resolved))) {
        // Also allow links to directories (some pages link to a folder index).
        try {
          const s = await fs.stat(resolved);
          if (s.isDirectory()) continue;
        } catch {}
        fail(`${path.relative(ROOT, md)}: broken link -> ${rel}`);
      }
    }
  }
}

const FORBIDDEN_LIB_TYPES = new Set([
  'DocumentSession',
  'BusinessTheme',
  'DocumentTemplate',
  'RowBuilder',
  'SectionBuilder',
  'TableBuilder',
  'LayerStackBuilder',
  'LayerStack',
  'ShapeContainerBuilder',
  'ShapeContainer',
]);

async function checkNoFakeGraphComposeImports() {
  const javaFiles = [
    ...(await walk(path.join(ROOT, 'examples'), (p) => p.endsWith('.java'))),
    ...(await walk(path.join(ROOT, 'tools/preview-renderer/src'), (p) => p.endsWith('.java'))),
  ];
  for (const j of javaFiles) {
    const text = await fs.readFile(j, 'utf8');
    for (const match of text.matchAll(/^\s*import\s+(com\.demcha\.graphcompose\.[A-Za-z0-9_.]+);/gm)) {
      const fqcn = match[1];
      const last = fqcn.split('.').pop();
      if (FORBIDDEN_LIB_TYPES.has(last)) {
        fail(`${path.relative(ROOT, j)}: forbidden import (fictional package): ${fqcn}`);
      }
    }
  }
}

async function main() {
  await checkSkillManifest();
  await checkTemplateProjects();
  await checkRevisionArtifacts();
  await checkMarkdownLinks();
  await checkNoFakeGraphComposeImports();
  if (errors.length === 0) {
    console.log('repository-contract: all checks passed.');
    return;
  }
  console.error(`repository-contract: ${errors.length} failure(s):\n`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

main().catch((err) => {
  console.error('repository-contract: crashed: ' + (err.stack ?? err.message));
  process.exit(2);
});
