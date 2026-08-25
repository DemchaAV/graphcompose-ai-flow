import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from './helpers.js';
import {
  canonicaliseArtifacts,
  nextRevisionId,
  copyRevisionBody,
  formatRevisionId,
} from '../src/revisionStore.js';
import { revisionDirPath, revisionsDirPath } from '../src/paths.js';

let root: string;

beforeEach(async () => {
  root = await makeTempDir();
});

afterEach(async () => {
  await rmrf(root);
});

describe('revisionStore.nextRevisionId', () => {
  it('returns revision-001 on a fresh project', async () => {
    expect(await nextRevisionId(root)).toBe('revision-001');
  });

  it('increments past existing revisions', async () => {
    await fs.mkdir(revisionDirPath(root, 'revision-001'), { recursive: true });
    expect(await nextRevisionId(root)).toBe('revision-002');
    await fs.mkdir(revisionDirPath(root, 'revision-002'), { recursive: true });
    expect(await nextRevisionId(root)).toBe('revision-003');
  });

  it('skips gaps — uses max+1 not the lowest free slot', async () => {
    await fs.mkdir(revisionDirPath(root, 'revision-001'), { recursive: true });
    await fs.mkdir(revisionDirPath(root, 'revision-003'), { recursive: true });
    expect(await nextRevisionId(root)).toBe('revision-004');
  });

  it('always pads to at least three digits', () => {
    expect(formatRevisionId(1)).toBe('revision-001');
    expect(formatRevisionId(42)).toBe('revision-042');
    expect(formatRevisionId(999)).toBe('revision-999');
    // Numbers above 999 keep their full width.
    expect(formatRevisionId(1000)).toBe('revision-1000');
  });
});

describe('revisionStore.copyRevisionBody', () => {
  it('copies every file (except revision.json) into the destination', async () => {
    const fromDir = revisionDirPath(root, 'revision-001');
    await fs.mkdir(fromDir, { recursive: true });
    await fs.writeFile(path.join(fromDir, 'revision.json'), '{}', 'utf8');
    await fs.writeFile(path.join(fromDir, 'user-request.md'), 'hello', 'utf8');
    await fs.writeFile(path.join(fromDir, 'generated-template.java'), 'class A {}', 'utf8');
    await fs.mkdir(path.join(fromDir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(fromDir, 'sub', 'nested.txt'), 'nested', 'utf8');

    await fs.mkdir(revisionsDirPath(root), { recursive: true });
    const copied = await copyRevisionBody(root, 'revision-001', 'revision-002');
    expect(copied.sort()).toEqual(
      ['generated-template.java', 'user-request.md', path.join('sub', 'nested.txt')].sort(),
    );

    const destDir = revisionDirPath(root, 'revision-002');
    await fs.access(path.join(destDir, 'user-request.md'));
    await fs.access(path.join(destDir, 'generated-template.java'));
    await fs.access(path.join(destDir, 'sub', 'nested.txt'));
    // revision.json was excluded.
    await expect(fs.access(path.join(destDir, 'revision.json'))).rejects.toThrow();
  });
});

describe('canonicaliseArtifacts', () => {
  it('renames the labels an agent reaches for instead of the canonical one', () => {
    // Two acceptance runs of this harness labelled the same seven files two
    // ways. Both read fine; only one satisfies revision.schema.json, and the
    // error it produces ("missing property template") names a key that is
    // sitting in the file under a different spelling.
    expect(
      canonicaliseArtifacts({
        userRequest: 'user-request.md',
        generatedTemplate: 'Invoice.java',
        generatedTest: 'InvoiceTest.java',
        outputPdf: 'output.pdf',
        dataFile: 'invoice-data.json',
      }),
    ).toEqual({
      userRequest: 'user-request.md',
      template: 'Invoice.java',
      test: 'InvoiceTest.java',
      pdf: 'output.pdf',
      data: 'invoice-data.json',
    });
  });

  it('leaves an already-canonical map exactly as it is', () => {
    const canonical = { userRequest: 'user-request.md', template: 'Cv.java', test: 'CvTest.java' };
    expect(canonicaliseArtifacts(canonical)).toEqual(canonical);
  });

  it('lets an explicit canonical entry win over an alias for the same slot', () => {
    // Otherwise the result depends on key order, which is not something a
    // manifest should decide by.
    expect(
      canonicaliseArtifacts({ generatedTemplate: 'Old.java', template: 'New.java' }),
    ).toEqual({ template: 'New.java' });
    expect(
      canonicaliseArtifacts({ template: 'New.java', generatedTemplate: 'Old.java' }),
    ).toEqual({ template: 'New.java' });
  });

  it('does not invent an artifact that is absent under every name', () => {
    // Renaming is the deterministic half of the problem. A genuinely missing
    // artifact is a real gap and has to stay visible as one.
    expect(canonicaliseArtifacts({ userRequest: 'user-request.md' })).toEqual({
      userRequest: 'user-request.md',
    });
  });

  it('survives a revision written before artifacts existed', () => {
    expect(canonicaliseArtifacts(undefined as never)).toEqual({});
  });
});
