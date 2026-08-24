/**
 * `graphcompose-flow init <projectName> [--template <name>] [--with-example]`
 *
 * Bare mode (no --template): creates an empty scaffold relative to the current
 * directory, exactly as before:
 *   <projectName>/template-project.json
 *   <projectName>/reference/
 *   <projectName>/revisions/
 *
 * Template mode (--template invoice): seeds a ready-to-render project by
 * copying the minimal renderable subset of the matching reference example --
 * render-runner (pom + spec provider), the textual reference, and revision-001's
 * generated-template.java / generated-test.java -- then writes a fresh
 * template-project.json (render block carried over, revision pointers reset)
 * and a DRAFT revision-001.
 *
 * Two roots are involved and they used to be one:
 *
 *   the seed comes from the INSTALL root, found by walking up from this
 *   module's own location. It used to be found by walking up from process.cwd()
 *   looking for the repository, which meant template mode simply refused to run
 *   anywhere except inside a checkout -- an installed user could not use it at
 *   all.
 *
 *   the project goes to the CURRENT DIRECTORY, exactly like bare mode, so it
 *   lands in whatever workspace the caller stands in. It used to be written to
 *   <install>/examples/<name> on the grounds that the renderer resolved
 *   projects as examples/<projectId>; runRender takes an explicit projectDir
 *   now, so that constraint is gone -- and honouring it would have written a
 *   user's project into the harness install.
 *
 * Seeds are pinned to a GraphCompose line, because a seed is real Java written
 * against one API. The 1.7 invoice does not compile against 2.x at all -- the
 * whole com.demcha.compose.document.templates.* tree moved -- so seeding it
 * into a 2.2 project would hand back something that cannot build. A line the
 * registry has no seed for is refused, and says so.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const DEFAULT_TARGET_VERSION = '1.9.0';
const DEFAULT_SKILL_PACK = 'skills/versions/graphcompose-1.9';

/**
 * Template name -> the example that backs it, and the GraphCompose line its
 * Java is written against. `line` is not decoration: seeding across a major
 * produces a project that does not compile.
 */
interface TemplateSeed {
  /** Directory relative to the install root. */
  readonly dir: string;
  /** major.minor of the GraphCompose API the seed is written against. */
  readonly line: string;
}

const TEMPLATE_REGISTRY: Record<string, TemplateSeed> = {
  invoice: { dir: 'examples/invoice-reference', line: '1.7' },
};

/** "2.2.0" -> "2.2"; anything unparseable comes back as-is. */
function lineOf(version: string): string {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

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
  const seed = TEMPLATE_REGISTRY[template];
  if (!seed) {
    throw new Error(
      `unknown template "${template}". Available: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`,
    );
  }

  // The seed ships with the harness, so it is found from this module's own
  // location. Deriving it from process.cwd() is what made template mode
  // repository-only.
  const installRoot = options.repoRoot ?? (await findInstallRoot());
  if (!installRoot) {
    throw new Error(
      'could not locate the harness install root from this module. ' +
        'The installation looks incomplete — reinstall, or run npm run setup.',
    );
  }

  // A seed is real Java against one API. Refusing is the honest answer: the
  // 1.7 invoice does not compile against 2.x, so seeding it would produce a
  // project that fails at the first build with errors pointing at the library
  // rather than at this decision.
  const requested = options.targetGraphComposeVersion;
  if (requested && lineOf(requested) !== seed.line) {
    const lines = [...new Set(Object.values(TEMPLATE_REGISTRY).map((s) => s.line))].sort();
    throw new Error(
      `template "${template}" is written against GraphCompose ${seed.line}.x, ` +
        `but this project pins ${requested}. Seeding it would not compile.\n` +
        `Templates exist for: ${lines.join(', ')}.\n` +
        'Use the empty scaffold instead (drop --template) and let the workflow ' +
        'author the template against your pinned version.',
    );
  }

  const seedDir = path.join(installRoot, seed.dir);
  if (!(await pathExists(projectFilePath(seedDir)))) {
    throw new Error(
      `template seed not found: ${seedDir} (expected ${seed.dir}/template-project.json)`,
    );
  }

  // Same placement rule as bare mode: the caller's directory decides. In a
  // workspace that is graphcompose-flow/projects; in a checkout it is
  // examples/, which is what `cd examples && init --template` always produced.
  const targetDir = path.resolve(process.cwd(), projectName);
  await assertFreshTarget(targetDir);

  const seedRevDir = revisionDirPath(seedDir, 'revision-001');
  const targetRevDir = revisionDirPath(targetDir, 'revision-001');
  await fs.mkdir(targetRevDir, { recursive: true });

  const seedProject = await readJson<TemplateProject>(projectFilePath(seedDir));

  // Within the seed's own line the caller's patch version wins, so a project
  // pinning 1.7.2 gets 1.7.2 everywhere rather than the seed's 1.7.0.
  const targetVersion = requested ?? seedProject.targetGraphComposeVersion;
  const targetPack = options.skillPack ?? seedProject.skillPack;

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
    targetGraphComposeVersion: targetVersion,
    skillPack: targetPack,
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

  // The runner pins the library itself, and nothing overrides it at render
  // time (revision.id is passed on the command line; graphcompose.version is
  // not). Left alone, a project pinning 1.7.2 would still build against the
  // seed's 1.7.0 and the mismatch would be invisible.
  await rewriteRunnerVersion(
    path.join(targetDir, 'render-runner', 'pom.xml'),
    targetVersion,
  );

  // template-project.json: reset pointers, carry the render block + docKind
  const now = nowIso();
  const project: TemplateProject = {
    projectName,
    referenceImage: seedProject.referenceImage,
    referenceDescription: seedProject.referenceDescription,
    targetGraphComposeVersion: targetVersion,
    skillPack: targetPack,
    currentApprovedRevisionId: null,
    currentDraftRevisionId: 'revision-001',
    createdAt: now,
    updatedAt: now,
    docKind: seedProject.docKind,
    render: seedProject.render,
    notes:
      `Seeded from the "${template}" template (${seed.dir}) via ` +
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

/**
 * Walk up from this module's own location to the harness install root.
 *
 * Deliberately not from process.cwd(): the seed ships with the harness, so
 * where the user happens to be standing has nothing to do with finding it.
 * This holds in a checkout, in ~/.codex/graphcompose-flow/<version>/ and in
 * the Claude Code plugin cache alike, because the tool always sits inside the
 * tree it belongs to.
 */
async function findInstallRoot(): Promise<string | null> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
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

/**
 * Point the seeded runner at `version`. Only the property is touched; the
 * dependency reads ${graphcompose.version} and nothing else in the pom names a
 * version of the library.
 */
async function rewriteRunnerVersion(pomPath: string, version: string): Promise<void> {
  if (!(await pathExists(pomPath))) return;
  const pom = await fs.readFile(pomPath, 'utf8');
  const property = /<graphcompose\.version>[^<]*<\/graphcompose\.version>/;
  if (!property.test(pom)) {
    throw new Error(
      `seeded runner ${pomPath} has no <graphcompose.version> property to set. ` +
        'The seed and this command disagree about the runner layout.',
    );
  }
  await fs.writeFile(
    pomPath,
    pom.replace(property, `<graphcompose.version>${version}</graphcompose.version>`),
    'utf8',
  );
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
