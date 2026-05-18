import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';
import { runNewRevision } from '../../src/commands/newRevision.js';
import { runDiff } from '../../src/commands/diff.js';

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

describe('diff', () => {
  it('produces a unified diff when both templates exist', async () => {
    await runNewRevision(projectRoot, 'first');
    await runNewRevision(projectRoot, 'second');
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-001', 'generated-template.java'),
      ['class Hello {', '  void greet() {', '    say("hi");', '  }', '}', ''].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-002', 'generated-template.java'),
      ['class Hello {', '  void greet() {', '    say("hello");', '  }', '}', ''].join('\n'),
      'utf8',
    );
    const out = await runDiff(projectRoot, 'revision-001', 'revision-002');
    expect(out).toContain('--- revision-001/generated-template.java');
    expect(out).toContain('+++ revision-002/generated-template.java');
    expect(out).toContain('-    say("hi");');
    expect(out).toContain('+    say("hello");');
  });

  it('falls back to artifact summary when one template is missing', async () => {
    await runNewRevision(projectRoot, 'first');
    await runNewRevision(projectRoot, 'second');
    // Only the second has a template file.
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-002', 'generated-template.java'),
      'class Hi {}\n',
      'utf8',
    );
    const out = await runDiff(projectRoot, 'revision-001', 'revision-002');
    expect(out).toContain('generated-template.java missing');
    expect(out).toContain('Falling back to artifact summary');
    expect(out).toContain('generated-template.java');
    expect(out).toContain('added');
  });

  it('reports no changes when the two templates are identical', async () => {
    await runNewRevision(projectRoot, 'first');
    await runNewRevision(projectRoot, 'second');
    const same = 'class Hi {}\n';
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-001', 'generated-template.java'),
      same,
      'utf8',
    );
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-002', 'generated-template.java'),
      same,
      'utf8',
    );
    const out = await runDiff(projectRoot, 'revision-001', 'revision-002');
    expect(out).toContain('no changes');
  });
});
