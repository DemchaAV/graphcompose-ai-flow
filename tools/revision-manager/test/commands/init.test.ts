import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';

let cwdBackup: string;
let root: string;

beforeEach(async () => {
  cwdBackup = process.cwd();
  root = await makeTempDir();
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(cwdBackup);
  await rmrf(root);
});

describe('init', () => {
  it('creates template-project.json plus reference/ and revisions/', async () => {
    const dir = await runInit('demo');
    expect(dir).toBe(path.resolve(root, 'demo'));
    const projectJsonRaw = await fs.readFile(path.join(dir, 'template-project.json'), 'utf8');
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.projectName).toBe('demo');
    expect(projectJson.currentApprovedRevisionId).toBeNull();
    expect(projectJson.currentDraftRevisionId).toBeNull();
    await fs.access(path.join(dir, 'reference'));
    await fs.access(path.join(dir, 'revisions'));
  });

  it('refuses to overwrite an existing project', async () => {
    await runInit('demo');
    await expect(runInit('demo')).rejects.toThrow(/already exists/);
  });
});

describe('init --template', () => {
  it('seeds a ready-to-render invoice project in the current directory', async () => {
    await buildFakeRepo(root);
    // Placement follows the caller, exactly like bare mode: in a workspace
    // that is graphcompose-flow/projects, in a checkout it is examples/. It
    // used to be forced to <install>/examples, which wrote a user's project
    // into the harness install.
    const dir = await runInit('my-invoice', { template: 'invoice', repoRoot: root });
    expect(dir).toBe(path.resolve(root, 'my-invoice'));

    const proj = JSON.parse(
      await fs.readFile(path.join(dir, 'template-project.json'), 'utf8'),
    ) as Record<string, any>;
    expect(proj.projectName).toBe('my-invoice');
    expect(proj.currentDraftRevisionId).toBe('revision-001');
    expect(proj.currentApprovedRevisionId).toBeNull();
    expect(proj.docKind).toBe('invoice');
    expect(proj.render.templateClass).toContain('GeneratedInvoiceTemplate');
    expect(proj.render.specProviderClass).toContain('SampleInvoiceSpecProvider');
    expect(proj.schemaVersion).toBe(1);

    // render-runner + reference + revision inputs copied
    await fs.access(path.join(dir, 'render-runner', 'pom.xml'));
    await fs.access(
      path.join(
        dir,
        'render-runner/src/main/java/com/demcha/examples/invoice/SampleInvoiceSpecProvider.java',
      ),
    );
    await fs.access(path.join(dir, 'reference', 'reference.md'));
    await fs.access(path.join(dir, 'revisions/revision-001/generated-template.java'));
    await fs.access(path.join(dir, 'revisions/revision-001/generated-test.java'));
    await fs.access(path.join(dir, 'revisions/revision-001/user-request.md'));

    // a fresh DRAFT revision-001 (not the seed's status/parent)
    const rev = JSON.parse(
      await fs.readFile(path.join(dir, 'revisions/revision-001/revision.json'), 'utf8'),
    ) as Record<string, any>;
    expect(rev.status).toBe('DRAFT');
    expect(rev.parentRevisionId).toBeNull();
    expect(rev.artifacts.template).toBe('generated-template.java');
    expect(rev.pendingArtifacts).toContain('output.pdf');
    expect(rev.schemaVersion).toBe(1);

    // built render-runner/target/ must NOT be copied
    await expect(fs.access(path.join(dir, 'render-runner', 'target'))).rejects.toBeTruthy();
  });

  it('omits the densely cross-linked narrative artifacts (minimal seed)', async () => {
    await buildFakeRepo(root);
    const dir = await runInit('inv-a', { template: 'invoice', repoRoot: root });
    await expect(
      fs.access(path.join(dir, 'revisions/revision-001/architecture-plan.md')),
    ).rejects.toBeTruthy();
  });

  it('rejects an unknown template', async () => {
    await buildFakeRepo(root);
    await expect(runInit('x', { template: 'nope', repoRoot: root })).rejects.toThrow(
      /unknown template/,
    );
  });

  it('finds the seed from the install root, not from the current directory', async () => {
    // No fake repo and no repoRoot: the only way this can resolve a seed is by
    // walking up from the module's own location. That is the whole install-mode
    // fix — cwd here is a bare temp directory, which is what a user's Java
    // project looks like from the tool's point of view.
    const dir = await runInit('auto-inv', {
      template: 'invoice',
      targetGraphComposeVersion: '1.7.0',
    });
    expect(dir).toBe(path.resolve(root, 'auto-inv'));
    await fs.access(path.join(dir, 'render-runner', 'pom.xml'));
    await fs.access(path.join(dir, 'revisions/revision-001/generated-template.java'));
  });

  it('points the seeded runner at the requested version', async () => {
    await buildFakeRepo(root);
    const dir = await runInit('pinned', {
      template: 'invoice',
      repoRoot: root,
      targetGraphComposeVersion: '1.7.2',
      skillPack: 'skills/versions/graphcompose-1.7',
    });

    // Nothing overrides graphcompose.version at render time, so an unrewritten
    // runner would silently build against the seed's version instead.
    const pom = await fs.readFile(path.join(dir, 'render-runner', 'pom.xml'), 'utf8');
    expect(pom).toContain('<graphcompose.version>1.7.2</graphcompose.version>');
    expect(pom).not.toContain('1.7.0');

    const proj = JSON.parse(
      await fs.readFile(path.join(dir, 'template-project.json'), 'utf8'),
    ) as Record<string, any>;
    expect(proj.targetGraphComposeVersion).toBe('1.7.2');

    const rev = JSON.parse(
      await fs.readFile(path.join(dir, 'revisions/revision-001/revision.json'), 'utf8'),
    ) as Record<string, any>;
    expect(rev.targetGraphComposeVersion).toBe('1.7.2');
  });

  it('refuses a seed written for another GraphCompose line', async () => {
    await buildFakeRepo(root);
    // The 1.7 invoice does not compile against 2.x at all, so seeding it would
    // hand back a project whose first build fails with errors pointing at the
    // library rather than at this decision.
    await expect(
      runInit('cross-major', {
        template: 'invoice',
        repoRoot: root,
        targetGraphComposeVersion: '2.2.0',
      }),
    ).rejects.toThrow(/written against GraphCompose 1\.7\.x.*pins 2\.2\.0/s);

    await expect(fs.access(path.resolve(root, 'cross-major'))).rejects.toBeTruthy();
  });

  it('accepts a patch difference within the seed line', async () => {
    await buildFakeRepo(root);
    const dir = await runInit('patchy', {
      template: 'invoice',
      repoRoot: root,
      targetGraphComposeVersion: '1.7.9',
    });
    await fs.access(path.join(dir, 'template-project.json'));
  });
});

/** Build a minimal fake graphcompose-ai-flow repo with an invoice seed under `root`. */
async function buildFakeRepo(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'graphcompose-ai-flow' }),
    'utf8',
  );
  const seed = path.join(root, 'examples', 'invoice-reference');
  const runnerPkg = path.join(
    seed,
    'render-runner/src/main/java/com/demcha/examples/invoice',
  );
  const rev = path.join(seed, 'revisions', 'revision-001');
  await fs.mkdir(path.join(seed, 'reference'), { recursive: true });
  await fs.mkdir(runnerPkg, { recursive: true });
  await fs.mkdir(path.join(seed, 'render-runner', 'target', 'classes'), { recursive: true });
  await fs.mkdir(rev, { recursive: true });

  await fs.writeFile(
    path.join(seed, 'template-project.json'),
    JSON.stringify({
      projectName: 'invoice-reference',
      referenceImage: 'reference/reference.png',
      referenceDescription: 'reference/reference.md',
      targetGraphComposeVersion: '1.7.0',
      skillPack: 'skills/versions/graphcompose-1.7',
      currentApprovedRevisionId: 'revision-003',
      currentDraftRevisionId: null,
      createdAt: '2026-05-18T12:00:00Z',
      updatedAt: '2026-05-18T12:00:00Z',
      docKind: 'invoice',
      render: {
        templateClass: 'com.demcha.examples.invoice.GeneratedInvoiceTemplate',
        specProviderClass: 'com.demcha.examples.invoice.SampleInvoiceSpecProvider',
        dataFileName: null,
        pages: 1,
        assetResolverEnabled: false,
      },
    }),
    'utf8',
  );
  await fs.writeFile(path.join(seed, 'reference', 'reference.md'), '# reference\n', 'utf8');
  // Carries the property the real runner declares: the seeded copy is
  // repointed at the caller's version, and a seed without it is a drift the
  // command refuses rather than ignores.
  await fs.writeFile(
    path.join(seed, 'render-runner', 'pom.xml'),
    '<project><properties>' +
      '<graphcompose.version>1.7.0</graphcompose.version>' +
      '</properties></project>\n',
    'utf8',
  );
  await fs.writeFile(path.join(runnerPkg, 'SampleInvoiceSpecProvider.java'), '// provider\n', 'utf8');
  // a built artifact under target/ that must be excluded from the copy
  await fs.writeFile(
    path.join(seed, 'render-runner', 'target', 'classes', 'X.class'),
    'binary',
    'utf8',
  );

  await fs.writeFile(
    path.join(rev, 'revision.json'),
    JSON.stringify({
      id: 'revision-001',
      parentRevisionId: null,
      status: 'DRAFT',
      userRequest: 'Create an A4 invoice template from the reference image.',
      targetGraphComposeVersion: '1.7.0',
      skillPack: 'skills/versions/graphcompose-1.7',
      changedComponents: ['Header', 'Footer'],
      createdAt: '2026-05-18T12:30:00Z',
      artifacts: { template: 'generated-template.java' },
      pendingArtifacts: [],
    }),
    'utf8',
  );
  await fs.writeFile(path.join(rev, 'generated-template.java'), '// template\n', 'utf8');
  await fs.writeFile(path.join(rev, 'generated-test.java'), '// test\n', 'utf8');
  await fs.writeFile(path.join(rev, 'user-request.md'), '# User request\n\nseed\n', 'utf8');
  await fs.writeFile(path.join(rev, 'architecture-plan.md'), '# plan\n', 'utf8');
}
