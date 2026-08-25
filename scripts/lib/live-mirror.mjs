/**
 * scripts/lib/live-mirror.mjs — a stable filename that always holds the newest
 * render.
 *
 * Extracted from the render runtime because it is a self-contained concern with
 * one job and its own failure policy: mirroring is a convenience, so every
 * error here warns and is dropped rather than failing a render that already
 * succeeded.
 */

import fs from "node:fs";
import path from "node:path";

// A viewer that auto-reloads on change and does not lock the file (e.g.
// SumatraPDF) can then be opened once, at revision 1, and show every later
// revision in place — no hunting for the newest revision folder, no reopening
// after each pass.
//
// Two places get a copy, because they answer different questions.
//
//   <project>/current.pdf        beside template-project.json: "what does THIS
//   <project>/current-debug.pdf  project look like now?" Per-project, so two
//   <project>/current.txt        projects never overwrite each other, and in
//                                the folder the user already has open.
//
//   live/current.pdf             "what did I render last, anywhere?" One set
//   live/current-debug.pdf       shared across projects. Only written when this
//   live/current.png             install IS the workspace (harness development)
//   live/current-debug.png       or GRAPHCOMPOSE_LIVE_DIR points somewhere on
//   live/current.txt             purpose — in a plugin install the install root
//                                is a cache directory nobody opens.
//
// The rasters stay in the shared folder alone: the project copy exists for a
// human with a PDF viewer open, and every tool that wants pixels reads the
// revision's own output.png.
//
// Location: <repoRoot>/live by default; override with GRAPHCOMPOSE_LIVE_DIR
// (e.g. a path outside OneDrive to avoid sync churn). Disable with
// RENDER_NO_LIVE=1. Mirroring is best-effort: a failure here only warns, it
// never fails the render.

const LIVE_README = `# Live preview

This folder always reflects the MOST RECENT render, regardless of which
project or revision produced it. It is regenerated on every render and is
gitignored — do not edit by hand.

Each project also keeps its own copy — <project>/current.pdf, beside
template-project.json — which only that project's renders touch. That is the
one to open when you are working on a single template; this folder is the
"whatever I rendered last" view across all of them.

Files:
  current.pdf        clean render (open this one)
  current-debug.pdf  debug render with guide lines
  current.png        page-1 raster of the clean render
  current-debug.png  page-1 raster of the debug render
  current.txt        which project / revision / time this reflects

## Watch renders update live (SumatraPDF)

SumatraPDF reloads a PDF automatically when the file changes on disk and does
not lock it. Open current.pdf once and leave it open; every render refreshes
the view in place.

  node scripts/preview-live.mjs           # opens live/current.pdf
  node scripts/preview-live.mjs --debug   # opens live/current-debug.pdf

Or open current.pdf in this folder manually in SumatraPDF.

## Options

  GRAPHCOMPOSE_LIVE_DIR   move this folder elsewhere (e.g. off OneDrive):
                            $env:GRAPHCOMPOSE_LIVE_DIR = "C:\\Temp\\gc-live"
  RENDER_NO_LIVE=1        disable this live mirror entirely
`;

/**
 * Where the shared "newest render anywhere" copy belongs, or null when it does
 * not belong anywhere.
 *
 * An explicit GRAPHCOMPOSE_LIVE_DIR is always honoured. Otherwise the folder is
 * only worth writing when the workspace lives inside this install — the
 * development case. A plugin or versioned-runtime install root is a cache
 * directory: writing a PDF there each render is churn nobody will ever look at,
 * and the per-project copy already covers the need.
 */
function resolveSharedLiveDir(repoRoot, projectDir) {
  const override = process.env.GRAPHCOMPOSE_LIVE_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  const inside = path.relative(repoRoot, projectDir);
  const isInstallWorkspace = inside !== "" && !inside.startsWith("..") && !path.isAbsolute(inside);
  return isInstallWorkspace ? path.join(repoRoot, "live") : null;
}

function mirrorFileTo(liveDir, srcPath, destName) {
  if (!srcPath || !fs.existsSync(srcPath)) return false;
  const dest = path.join(liveDir, destName);
  const tmp = path.join(liveDir, `.${destName}.tmp`);
  // Copy to a temp file, then rename over the target. rename is atomic on the
  // same volume, so a watching viewer never sees a half-written PDF (the same
  // trick the LaTeX + SumatraPDF live-preview workflow relies on). Fall back to
  // a direct copy if the rename is refused (e.g. a cross-volume live dir).
  try {
    fs.copyFileSync(srcPath, tmp);
    fs.renameSync(tmp, dest);
    return true;
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.copyFileSync(srcPath, dest);
      return true;
    } catch (err) {
      console.warn(`> live mirror: could not update ${destName} (${err.message})`);
      return false;
    }
  }
}

function writeLiveManifest(liveDir, info) {
  const lines = [
    `project:   ${info.projectId}`,
    `revision:  ${info.revisionId}`,
    `rendered:  ${new Date().toISOString()}`,
    `source:    ${info.revisionDir}`,
    ``,
    `current.pdf       <- output.pdf`,
  ];
  if (info.hasDebug) lines.push(`current-debug.pdf <- output-debug.pdf`);
  lines.push(
    ``,
    `Regenerated on every render; safe to delete, never edit. Open current.pdf`,
    `in a viewer that reloads on change and does not lock the file (SumatraPDF)`,
    `and it will follow every revision without being reopened.`,
    ``,
  );
  try {
    fs.writeFileSync(path.join(liveDir, "current.txt"), lines.join("\n"), "utf8");
  } catch (err) {
    console.warn(`> live mirror: could not write current.txt (${err.message})`);
  }
}

const NOOP_LIVE_MIRROR = { update() {}, manifest() {}, announce() {} };

/**
 * Open one mirror target, or null when it cannot be opened. A live mirror is a
 * convenience: a failure here warns and is dropped, and never fails a render.
 */
function openTarget(dir, { readme }) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (readme) {
      const readmePath = path.join(dir, "README.md");
      if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, LIVE_README, "utf8");
    }
    return dir;
  } catch (err) {
    console.warn(`> live mirror: ${dir} unavailable (${err.message})`);
    return null;
  }
}

/**
 * @param {string} repoRoot   the install root
 * @param {string} projectDir the project being rendered — its own copy is the
 *                            one the user keeps open, so it is written first
 *                            and announced.
 */
export function createLiveMirror(repoRoot, projectDir) {
  if (process.env.RENDER_NO_LIVE === "1") return NOOP_LIVE_MIRROR;

  const targets = [];
  const projectTarget = openTarget(projectDir, { readme: false });
  // No README beside template-project.json: that folder is the user's, and
  // current.txt already says what the files are.
  if (projectTarget) targets.push({ dir: projectTarget, shared: false });

  const sharedDir = resolveSharedLiveDir(repoRoot, projectDir);
  if (sharedDir) {
    const sharedTarget = openTarget(sharedDir, { readme: true });
    if (sharedTarget) targets.push({ dir: sharedTarget, shared: true });
  }

  if (!targets.length) return NOOP_LIVE_MIRROR;

  let updated = 0;
  return {
    /**
     * @param {"all"|"shared"} scope  "shared" keeps a file out of the project
     *                                folder — used for the rasters, which every
     *                                tool reads from the revision instead.
     */
    update(srcPath, destName, scope = "all") {
      for (const target of targets) {
        if (scope === "shared" && !target.shared) continue;
        if (mirrorFileTo(target.dir, srcPath, destName)) updated += 1;
      }
    },
    manifest(info) {
      for (const target of targets) writeLiveManifest(target.dir, info);
    },
    announce() {
      if (updated > 0) {
        console.log(`> live preview updated -> ${path.join(targets[0].dir, "current.pdf")}`);
      }
    },
  };
}
