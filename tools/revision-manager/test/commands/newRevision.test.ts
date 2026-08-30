import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';
import { runNewRevision } from '../../src/commands/newRevision.js';
import { loadProject } from '../../src/projectStore.js';

let cwdBackup: string;
let root: string;
let projectRoot: string;

beforeEach(async () => {
  cwdBackup = process.cwd();
  root = await makeTempDir();
  process.chdir(root);
  await runInit('demo');
  projectRoot = path.join(root, 'demo');
});

afterEach(async () => {
  process.chdir(cwdBackup);
  await rmrf(root);
});

describe('new-revision', () => {
  it('creates revision-001 on a fresh project with no parent', async () => {
    const rev = await runNewRevision(projectRoot, 'first draft');
    expect(rev.id).toBe('revision-001');
    expect(rev.parentRevisionId).toBeNull();
    expect(rev.status).toBe('DRAFT');
    expect(rev.userRequest).toBe('first draft');
    const userReq = await fs.readFile(
      path.join(projectRoot, 'revisions', 'revision-001', 'user-request.md'),
      'utf8',
    );
    expect(userReq).toContain('first draft');
    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBe('revision-001');
  });

  it('uses currentDraft as the parent for revision-002', async () => {
    await runNewRevision(projectRoot, 'first');
    const rev2 = await runNewRevision(projectRoot, 'second');
    expect(rev2.id).toBe('revision-002');
    expect(rev2.parentRevisionId).toBe('revision-001');
    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBe('revision-002');
  });

  it('honours --base when provided', async () => {
    await runNewRevision(projectRoot, 'first');
    await runNewRevision(projectRoot, 'second');
    const rev3 = await runNewRevision(projectRoot, 'third', { base: 'revision-001' });
    expect(rev3.parentRevisionId).toBe('revision-001');
  });

  it("carries the parent's sources forward and leaves its render and review behind", async () => {
    const first = await runNewRevision(projectRoot, 'first');
    expect(first.copiedFiles).toEqual([]);
    const dir = path.join(projectRoot, 'revisions', 'revision-001');

    // What a pass authors…
    const sources: Record<string, string> = {
      'GeneratedCvTemplate.java': 'class GeneratedCvTemplate {}',
      'cv-data.json': '{"name":"A"}',
      'cv-data.overflow.json': '{"name":"B"}',
      'asset-request.json': '{}',
      'assets-manifest.json': '{}',
      'assets/icons/mail.svg': '<svg/>',
      'visual-analysis.json': '{}',
      'architecture-plan.json': '{}',
      'data-schema.md': '# schema',
    };
    // …and what the render and the review write.
    const artifacts = [
      'output.pdf',
      'output.png',
      'output-debug.pdf',
      'output-page-2.png',
      'output-overflow.pdf',
      'diff.png',
      'diff-page-2.png',
      'reference-scaled.png',
      'layout-snapshot.json',
      'visual-diff-stats.json',
      'region-diff-stats.json',
      'visual-review.json',
      'visual-review.md',
      'visual-review-classification.md',
      'evidence.json',
      'skill-validation-report.md',
      'render.log',
      'attempts/001/output.png',
    ];
    for (const [rel, body] of Object.entries(sources)) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), body, 'utf8');
    }
    for (const rel of artifacts) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), 'x', 'utf8');
    }

    const second = await runNewRevision(projectRoot, 'second');
    const copied = second.copiedFiles.map((f) => f.replace(/\\/g, '/')).sort();
    expect(copied).toEqual(Object.keys(sources).sort());

    const next = path.join(projectRoot, 'revisions', 'revision-002');
    for (const rel of Object.keys(sources)) {
      await expect(fs.readFile(path.join(next, rel), 'utf8')).resolves.toBe(sources[rel]);
    }
    for (const rel of artifacts) {
      await expect(fs.access(path.join(next, rel))).rejects.toThrow();
    }
    // The child writes its own request and metadata rather than inheriting them.
    const req = await fs.readFile(path.join(next, 'user-request.md'), 'utf8');
    expect(req).toContain('second');
    expect(req).not.toContain('first');
    expect(second.parentRevisionId).toBe('revision-001');
  });

  it('--empty starts from a bare folder', async () => {
    await runNewRevision(projectRoot, 'first');
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-001', 'cv-data.json'),
      '{}',
      'utf8',
    );
    const second = await runNewRevision(projectRoot, 'second', { empty: true });
    expect(second.copiedFiles).toEqual([]);
    await expect(
      fs.access(path.join(projectRoot, 'revisions', 'revision-002', 'cv-data.json')),
    ).rejects.toThrow();
  });
});
