#!/usr/bin/env node
/**
 * Open the live-preview PDF in SumatraPDF (or the OS default viewer).
 *
 *   node scripts/preview-live.mjs           # opens live/current.pdf
 *   node scripts/preview-live.mjs --debug   # opens live/current-debug.pdf
 *
 * The render pipeline keeps a single stable copy of the most recent render in
 * `live/` (see scripts/lib/render-runtime.mjs). SumatraPDF reloads a PDF when
 * the file changes on disk and does not lock it, so you open this file once and
 * every subsequent render refreshes the view in place — no hunting for the
 * latest revision folder. Re-running this command focuses the existing window
 * (`-reuse-instance`) instead of spawning duplicates.
 *
 * Viewer resolution order:
 *   1. $SUMATRAPDF_PATH
 *   2. SumatraPDF on PATH
 *   3. known install locations (LOCALAPPDATA / Program Files [(x86)])
 *   4. OS default PDF handler (start / open / xdg-open) — note: viewers that
 *      lock the file (e.g. Acrobat) will not live-reload; SumatraPDF is the
 *      recommended companion for this workflow.
 *
 * Honors GRAPHCOMPOSE_LIVE_DIR, exactly like the renderer.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectDir as workspaceProjectDir, resolveWorkspace } from "./lib/workspace.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const wantDebug = argv.some((a) => a === "--debug" || a === "-d");
const projectId = readOption(argv, ["--project", "-p"]);
const rootOverride = readOption(argv, ["--root"]);
const targetName = wantDebug ? "current-debug.pdf" : "current.pdf";

const target = projectId
  ? path.join(workspaceProjectDir(resolveWorkspace({ explicitRoot: rootOverride }), projectId), targetName)
  : path.join(resolveLiveDir(repoRoot), targetName);

if (!fs.existsSync(target)) {
  // Which mirror is missing changes what to do about it, so the two say
  // different things rather than one generic "render something first".
  const advice = projectId
    ? `  Nothing has been rendered for "${projectId}" yet:\n` +
      `    node scripts/render.mjs ${projectId} <revision-id>\n`
    : `  The shared live/ copy is written only when the install is the workspace.\n` +
      `  In a plugin install, name the project instead:\n` +
      `    node scripts/preview-live.mjs --project <id>\n`;
  console.error(`[preview-live] nothing to open yet: ${target}\n${advice}`);
  process.exit(1);
}

const viewer = resolveSumatra();
if (viewer) {
  // -reuse-instance: focus the existing SumatraPDF window if one is already
  // showing this file, rather than opening a second copy.
  launchDetached(viewer, ["-reuse-instance", target]);
  console.log(`> opened ${target}\n  (SumatraPDF auto-reloads on every render — leave it open)`);
  process.exit(0);
}

console.warn(
  "[preview-live] SumatraPDF not found — falling back to the OS default viewer.\n" +
    "  For live auto-reload, install SumatraPDF or set SUMATRAPDF_PATH to its .exe.",
);
openWithDefault(target);
console.log(`> opened ${target}`);

// --- helpers ----------------------------------------------------------------

/** `--flag value`, tolerant of the flag being absent. */
function readOption(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i]) && i + 1 < args.length) return args[i + 1];
  }
  return null;
}

function resolveLiveDir(root) {
  const override = process.env.GRAPHCOMPOSE_LIVE_DIR;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(root, "live");
}

function resolveSumatra() {
  const fromEnv = process.env.SUMATRAPDF_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const onPath = whichSumatra();
  if (onPath) return onPath;

  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "SumatraPDF", "SumatraPDF.exe"),
    process.env.ProgramFiles &&
      path.join(process.env.ProgramFiles, "SumatraPDF", "SumatraPDF.exe"),
    process.env["ProgramFiles(x86)"] &&
      path.join(process.env["ProgramFiles(x86)"], "SumatraPDF", "SumatraPDF.exe"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function whichSumatra() {
  const finder = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(finder, ["SumatraPDF"], { encoding: "utf8" });
  if (res.status === 0 && res.stdout) {
    const first = res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first && fs.existsSync(first)) return first;
  }
  return null;
}

function launchDetached(command, args) {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", (err) => {
    console.error(`[preview-live] could not launch ${command}: ${err.message}`);
    process.exit(1);
  });
  child.unref();
}

function openWithDefault(file) {
  if (process.platform === "win32") {
    // `start` is a cmd builtin; the empty "" is the window title argument.
    spawn("cmd", ["/c", "start", "", file], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [file], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref();
  }
}
