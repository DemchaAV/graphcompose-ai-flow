/**
 * `graphcompose-flow init <projectName> [--template <name>] [--with-example]`
 *
 * Bare mode (no --template): creates an empty scaffold relative to the current
 * directory, exactly as before:
 *   <projectName>/template-project.json
 *   <projectName>/reference/
 *   <projectName>/revisions/
 *
 * Template mode (--template invoice): seeds a ready-to-render project under
 * <repo>/examples/<projectName> by copying the minimal renderable subset of the
 * matching reference example -- render-runner (pom + spec provider), the
 * textual reference, and revision-001's generated-template.java /
 * generated-test.java -- then writes a fresh template-project.json (render
 * block carried over, revision pointers reset) and a DRAFT revision-001. With
 * --with-example the full worked-revision narrative artifacts are copied too.
 *
 * A template project lands under examples/ specifically because the shared
 * renderer (scripts/lib/render-runtime.mjs) resolves projects as
 * examples/<projectId>; that is the only place `node scripts/render.mjs <name>`
 * can find it.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathExists, readJson } from '../json.js';
import { saveProject, nowIso } from '../projectStore.js';
import { saveRevision } from '../revisionStore.js';
import {
  projectFilePath,
  referenceDirPath,
  revisionsDirPath,
  revisionDirPath,
  revisionFilePath,
} from '../paths.js';
import type { Revision, TemplateProject } from '../types.js';

const DEFAULT_TARGET_VERSION = '1.6.0';
const DEFAULT_SKILL_PACK = 'skills/versions/graphcompose-1.6';

/** Template name -> example directory (relative to repo root) that backs it. */
const TEMPLATE_REGISTRY: Record<string, string> = {
  invoice: 'examples/invoice-reference',
};

/** Render inputs copied for a minimal seed (user-request.md is written, not copied). */
const MINIMAL_ARTIFACTS: ReadonlyArray<{ label: string; file: string }> = [
  { label: 'template', file: 'generated-template.java' },
  { label: 'test', file: 'generated-test.java' },
];

export interface InitOptions {
  targetGraphComposeVersion?: string;
  skillPack?: string;
  /** Seed from a bundled template (e.g. "invoice") instead of an empty scaffold. */
  template?: string;
  /** Override repo-root detection (the dir containing examples/). For tests. */
  repoRoot?: string;
}

export async function runInit(projectName: string, options: InitOptions = {}): Promise<string> {
  if (!projectName || projectName.trim().length === 0) {
    throw new Error('projectName is required');
  }
  if (options.template) {
    return runInitFromTemplate(projectName, options.template, options);
  }
  return runInitBare(projectName, options);
}

async function runInitBare(projectName: string, options: InitOptions): Promise<string> {
  const targetDir = path.resolve(process.cwd(), projectName);
  await assertFreshTarget(targetDir);

  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(referenceDirPath(targetDir), { recursive: true });
  await fs.mkdir(revisionsDirPath(targetDir), { recursive: true });

  const now = nowIso();
  const project: TemplateProject = {
    projectName: path.basename(targetDir),
    referenceImage: 'reference/reference.png',
    referenceDescription: 'reference/reference.md',
    targetGraphComposeVersion: options.targetGraphComposeVersion ?? DEFAULT_TARGET_VERSION,
    skillPack: options.skillPack ?? DEFAULT_SKILL_PACK,
    currentApprovedRevisionId: null,
    currentDraftRevisionId: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(targetDir, project);
  return targetDir;
}

async function runInitFromTemplate(
  projectName: string,
  template: string,
  options: InitOptions,
): Promise<string> {
  const seedRel = TEMPLATE_REGISTRY[template];
  if (!seedRel) {
    throw new Error(
      `unknown template "${template}". Available: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`,
    );
  }

  const repoRoot = options.repoRoot ?? (await findRepoRoot(process.cwd()));
  if (!repoRoot) {
    throw new Error(
      '--template must run inside the graphcompose-ai-flow repository ' +
        '(could not locate the repo root). cd into the repo and retry.',
    );
  }

  const seedDir = path.join(repoRoot, seedRel);
  if (!(await pathExists(projectFilePath(seedDir)))) {
    throw new Error(
      `template seed not found: ${seedDir} (expected ${seedRel}/template-project.json)`,
    );
  }

  const targetDir = path.join(repoRoot, 'examples', projectName);
  await assertFreshTarget(targetDir);

  const seedRevDir = revisionDirPath(seedDir, 'revision-001');
  const targetRevDir = revisionDirPath(targetDir, 'revision-001');
  await fs.mkdir(targetRevDir, { recursive: true });

  const seedProject = await readJson<TemplateProject>(projectFilePath(seedDir));

  // Minimal renderable seed: the reference description plus the only two real
  // render inputs, with a fresh DRAFT revision.json. Deliberately NO narrative
  // artifacts and NO example README -- those are densely cross-linked, so any
  // partial copy breaks the repository-contract link check, and the complete
  // worked example already lives at the seed path for anyone who wants it.
  await fs.mkdir(referenceDirPath(targetDir), { recursive: true });
  await copyIfExists(
    path.join(referenceDirPath(seedDir), 'reference.md'),
    path.join(referenceDirPath(targetDir), 'reference.md'),
  );

  const seedRev = await readJson<Revision>(revisionFilePath(seedDir, 'revision-001'));
  const artifacts: Record<string, string> = { userRequest: 'user-request.md' };
  for (const { label, file } of MINIMAL_ARTIFACTS) {
    if (await copyIfExists(path.join(seedRevDir, file), path.join(targetRevDir, file))) {
      artifacts[label] = file;
    }
  }
  const userRequestBody = await readFileOr(
    path.join(seedRevDir, 'user-request.md'),
    `# User request\n\n${seedRev.userRequest}\n`,
  );
  await fs.writeFile(path.join(targetRevDir, 'user-request.md'), userRequestBody, 'utf8');

  const revision: Revision = {
    id: 'revision-001',
    parentRevisionId: null,
    status: 'DRAFT',
    userRequest: seedRev.userRequest,
    targetGraphComposeVersion: seedProject.targetGraphComposeVersion,
    skillPack: seedProject.skillPack,
    createdAt: nowIso(),
    artifacts,
    pendingArtifacts: ['output.pdf', 'output.png'],
  };
  if (seedRev.changedComponents) revision.changedComponents = seedRev.changedComponents;
  await saveRevision(targetDir, revision);

  // render-runner (both modes), excluding any built target/
  await copyDirFiltered(
    path.join(seedDir, 'render-runner'),
    path.join(targetDir, 'render-runner'),
    (rel) => !rel.split(path.sep).includes('target'),
  );

  // template-project.json: reset pointers, carry the render block + docKind
  const now = nowIso();
  const project: TemplateProject = {
    projectName,
    referenceImage: seedProject.referenceImage,
    referenceDescription: seedProject.referenceDescription,
    targetGraphComposeVersion: seedProject.targetGraphComposeVersion,
    skillPack: seedProject.skillPack,
    currentApprovedRevisionId: null,
    currentDraftRevisionId: 'revision-001',
    createdAt: now,
    updatedAt: now,
    docKind: seedProject.docKind,
    render: seedProject.render,
    notes:
      `Seeded from the "${template}" template (${seedRel}) via ` +
      `\`graphcompose-flow init --template ${template}\`.`,
  };
  await saveProject(targetDir, project);

  return targetDir;
}

async function assertFreshTarget(targetDir: string): Promise<void> {
  const pf = projectFilePath(targetDir);
  if (await pathExists(pf)) {
    throw new Error(
      `refusing to init: ${pf} already exists. Choose a different folder or delete the existing project.`,
    );
  }
}

/** Walk up from `startDir` to the repo root (its package.json `name`). */
async function findRepoRoot(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (await pathExists(pkg)) {
      try {
        const parsed = await readJson<{ name?: string }>(pkg);
        if (parsed.name === 'graphcompose-ai-flow') return dir;
      } catch {
        // ignore malformed package.json and keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function copyIfExists(src: string, dst: string): Promise<boolean> {
  if (!(await pathExists(src))) return false;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  return true;
}

async function readFileOr(p: string, fallback: string): Promise<string> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return fallback;
  }
}

async function copyDirFiltered(
  srcDir: string,
  dstDir: string,
  keep: (rel: string) => boolean,
  relPrefix = '',
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const rel = relPrefix ? path.join(relPrefix, e.name) : e.name;
    if (!keep(rel)) continue;
    const src = path.join(srcDir, e.name);
    const dst = path.join(dstDir, e.name);
    if (e.isDirectory()) {
      await fs.mkdir(dst, { recursive: true });
      await copyDirFiltered(src, dst, keep, rel);
    } else if (e.isFile()) {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
    }
  }
}
