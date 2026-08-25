#!/usr/bin/env node
/**
 * scripts/lib/workspace.mjs — where the work lives, as opposed to where the
 * harness lives.
 *
 * Two roots were conflated until now, both called "repoRoot":
 *
 *   install root    skills/, config/, tools/, schemas/, scripts/ — the harness
 *                   itself. Always derived from the script's own location.
 *   workspace root  projects, revisions, references, published templates — the
 *                   user's work product.
 *
 * Inside this repository they are the same directory, which is why the
 * distinction never surfaced. Once the harness is installed as a plugin they
 * are not: the tools sit in the plugin directory and the work belongs to
 * whatever Java project the user has open. Everything that reaches for a
 * project must therefore ask this module, never join "examples" onto the
 * install root.
 *
 * Resolution order, first match wins:
 *
 *   1. an explicit --root
 *   2. the GRAPHCOMPOSE_FLOW_ROOT environment variable
 *   3. a graphcompose-flow/flow.config.json found by walking up from cwd
 *   4. the install root's own examples/ + templates/ (development mode)
 *
 * Step 4 is a correct default only inside this repository. Anywhere else it
 * means the work is about to be written into the harness install, so the
 * manifest that stops it is not optional: scripts/init-workspace.mjs writes
 * one, and is the first thing to run in a project that has none.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory a user project gets, holding the workspace manifest and the work. */
export const WORKSPACE_DIR_NAME = "graphcompose-flow";

/** Workspace manifest filename, inside WORKSPACE_DIR_NAME. */
export const WORKSPACE_MANIFEST = "flow.config.json";

export const ENV_ROOT = "GRAPHCOMPOSE_FLOW_ROOT";

/** How the workspace was found. Reported so a surprised user can see why. */
export const WORKSPACE_MODES = Object.freeze(["explicit", "env", "discovered", "install"]);

const DEFAULT_INSTALL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/**
 * A project id is one path segment. Must start with a letter or digit, so "."
 * and ".." cannot be spelled, and carries no separator of either flavour.
 */
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class WorkspaceError extends Error {
  constructor(message) {
    super(`[workspace] ${message}`);
    this.name = "WorkspaceError";
  }
}

/**
 * The harness's own root — where prompts, skills, config and tools live.
 *
 * @returns {string}
 */
export function installRoot() {
  return DEFAULT_INSTALL_ROOT;
}

/**
 * Resolve the workspace.
 *
 * @param {{ explicitRoot?: string|null, env?: NodeJS.ProcessEnv, cwd?: string, install?: string }} [options]
 * @returns {{ root: string, projectsDir: string, templatesDir: string, manifestPath: string|null, manifest: object|null, mode: string }}
 */
export function resolveWorkspace({
  explicitRoot = null,
  env = process.env,
  cwd = process.cwd(),
  install = DEFAULT_INSTALL_ROOT,
} = {}) {
  if (explicitRoot) return describeWorkspace(path.resolve(explicitRoot), "explicit");

  const fromEnv = env?.[ENV_ROOT];
  if (fromEnv && fromEnv.trim() !== "") return describeWorkspace(path.resolve(fromEnv), "env");

  const discovered = discoverWorkspaceRoot(cwd);
  if (discovered) return describeWorkspace(discovered, "discovered");

  return {
    root: install,
    projectsDir: path.join(install, "examples"),
    templatesDir: path.join(install, "templates"),
    manifestPath: null,
    manifest: null,
    mode: "install",
  };
}

/**
 * Walk up from `startDir` looking for a workspace. Both shapes count: a
 * directory containing graphcompose-flow/flow.config.json, and the
 * graphcompose-flow directory itself.
 *
 * @param {string} startDir
 * @returns {string|null} the workspace root (the graphcompose-flow directory)
 */
export function discoverWorkspaceRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, WORKSPACE_DIR_NAME, WORKSPACE_MANIFEST))) {
      return path.join(dir, WORKSPACE_DIR_NAME);
    }
    if (path.basename(dir) === WORKSPACE_DIR_NAME && fs.existsSync(path.join(dir, WORKSPACE_MANIFEST))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function describeWorkspace(root, mode) {
  // An explicit root may point either at the workspace directory or at the
  // project that contains one; accept both rather than making the user care.
  const nested = path.join(root, WORKSPACE_DIR_NAME);
  const actualRoot =
    path.basename(root) !== WORKSPACE_DIR_NAME && fs.existsSync(nested) ? nested : root;

  const manifestPath = path.join(actualRoot, WORKSPACE_MANIFEST);
  return {
    root: actualRoot,
    projectsDir: path.join(actualRoot, "projects"),
    templatesDir: path.join(actualRoot, "templates"),
    manifestPath,
    manifest: readManifest(manifestPath),
    mode,
  };
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Directory of one project inside a workspace.
 *
 * @param {{ projectsDir: string }} workspace
 * @param {string} projectId
 * @returns {string}
 */
export function projectDir(workspace, projectId) {
  // Allow-list rather than deny-list. Rejecting separators alone let "." and
  // ".." through, and path.join happily resolved them out of the projects
  // directory — ".." landed on the workspace root itself.
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) {
    throw new WorkspaceError(
      `invalid project id ${JSON.stringify(projectId)} — ` +
        "expected a single name of letters, digits, dots, dashes or underscores, " +
        "starting with a letter or digit",
    );
  }
  return path.join(workspace.projectsDir, projectId);
}

/**
 * Same, but fails with a message that names the workspace and how it was found
 * — the two facts a user needs when the project is not where they expected.
 *
 * @param {object} workspace
 * @param {string} projectId
 * @returns {string}
 */
export function requireProjectDir(workspace, projectId) {
  const dir = projectDir(workspace, projectId);
  if (!fs.existsSync(path.join(dir, "template-project.json"))) {
    throw new WorkspaceError(
      `project "${projectId}" not found in the workspace at ${workspace.root} ` +
        `(resolved by: ${workspace.mode}). Expected ${path.join(dir, "template-project.json")}.`,
    );
  }
  return dir;
}

/**
 * Create a workspace directory with its manifest. Idempotent: an existing
 * manifest is returned untouched, so this never overwrites a user's pins.
 *
 * Callers should prefer scripts/init-workspace.mjs, which resolves the pinned
 * GraphCompose version to seed the manifest and can create the project too.
 *
 * @param {string} hostDir the user project the workspace is created inside
 * @param {{ graphComposeVersion?: string, skillPack?: string }} [seed]
 * @returns {{ root: string, manifestPath: string, manifest: object, created: boolean }}
 */
export function initWorkspace(hostDir, seed = {}) {
  const root = path.basename(path.resolve(hostDir)) === WORKSPACE_DIR_NAME
    ? path.resolve(hostDir)
    : path.join(path.resolve(hostDir), WORKSPACE_DIR_NAME);
  const manifestPath = path.join(root, WORKSPACE_MANIFEST);

  if (fs.existsSync(manifestPath)) {
    return { root, manifestPath, manifest: readManifest(manifestPath), created: false };
  }

  const manifest = { schemaVersion: 1 };
  if (seed.graphComposeVersion) manifest.graphComposeVersion = seed.graphComposeVersion;
  if (seed.skillPack) manifest.skillPack = seed.skillPack;

  fs.mkdirSync(path.join(root, "projects"), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  // The workspace usually lands inside a git-tracked Java project. Only the
  // strictly derived files are ignored: the live-preview copies, which are
  // duplicates of a revision's output by construction, and Maven output. The
  // revisions themselves are the audit trail and are left for the user to
  // decide about — ignoring them here would quietly discard the record.
  const gitignorePath = path.join(root, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(
      gitignorePath,
      [
        "# Live-preview copies of the newest render — a stable filename for a viewer",
        "# to hold open, rewritten on every render. Derived; never a record.",
        "projects/*/current.pdf",
        "projects/*/current-debug.pdf",
        "projects/*/current.txt",
        "",
        "# Build output of the per-project render runners.",
        "projects/*/render-runner/target/",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  return { root, manifestPath, manifest, created: true };
}

/**
 * One line describing where the work is going, for CLI banners. Silent in
 * install mode, where the answer is "the repository you are standing in".
 *
 * @param {object} workspace
 * @returns {string|null}
 */
export function describeWorkspaceLine(workspace) {
  if (workspace.mode === "install") return null;
  return `[workspace] ${workspace.root} (${workspace.mode})`;
}
