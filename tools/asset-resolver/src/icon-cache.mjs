/**
 * Content-addressed cache for Iconify downloads, SVG and PNG.
 *
 * The cache key is sha256 over (prefix, name, size, color) — the
 * four parameters that determine the bytes Iconify returns. Same
 * tuple = same bytes = byte-equal PNG. Anything else (icon token
 * name in the asset-request, point size hint, picked-by source)
 * does NOT belong in the key because it does not change the PNG.
 *
 * Cache layout:
 *
 *   tools/asset-resolver/.cache/icons/<hash>.png
 *
 * Lookup: read the file if it exists. Store: atomic tmp+rename so a
 * partial download never poisons a future hit.
 *
 * The wrapper {@link cachedDownloadIconPng} is a drop-in replacement
 * for {@link downloadIconPng} from ./iconify.mjs — same signature,
 * same return type (Uint8Array), same exceptions on network failure.
 * The difference is two extra fields it sets on its returned object:
 *
 *   - .source — "cache" on hit, "iconify" on miss-then-download
 *   - .hash   — the cache key, useful for logs and tests
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { downloadIconPng as iconifyDownload, downloadIconSvg as iconifySvgDownload } from "./iconify.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CACHE_ROOT = path.join(TOOL_ROOT, ".cache", "icons");

const HASH_ALGO = "sha256";

function hashIcon(prefix, name, options) {
  const size = options?.size ?? "default";
  const color = options?.color ?? "default";
  const payload = `${prefix}|${name}|${size}|${color}`;
  return createHash(HASH_ALGO).update(payload).digest("hex");
}

async function readCacheEntry(cacheRoot, hash) {
  try {
    const buf = await fs.readFile(path.join(cacheRoot, `${hash}.png`));
    return buf;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeCacheEntry(cacheRoot, hash, bytes) {
  await fs.mkdir(cacheRoot, { recursive: true });
  const file = path.join(cacheRoot, `${hash}.png`);
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, file);
}

/**
 * Cached wrapper around {@link iconifyDownload}.
 *
 * @param {string} prefix    Iconify set prefix (mdi, tabler, lucide, ...)
 * @param {string} name      Icon name within the set
 * @param {object} options   { size, color } — same shape as iconify.mjs
 * @param {object} [hooks]   { cacheRoot?, log? } — test seam
 * @returns {Promise<Buffer & { source: "cache"|"iconify", hash: string }>}
 */
export async function cachedDownloadIconPng(prefix, name, options, hooks = {}) {
  const cacheRoot = hooks.cacheRoot ?? DEFAULT_CACHE_ROOT;
  const log = hooks.log ?? (() => {});

  const hash = hashIcon(prefix, name, options);
  const hit = await readCacheEntry(cacheRoot, hash);
  if (hit !== null) {
    log(`cache HIT ${prefix}:${name} -> ${hash.slice(0, 12)}`);
    const buf = Buffer.from(hit);
    Object.defineProperty(buf, "source", { value: "cache", enumerable: false });
    Object.defineProperty(buf, "hash", { value: hash, enumerable: false });
    return buf;
  }

  log(`cache MISS ${prefix}:${name} -> ${hash.slice(0, 12)} (downloading)`);
  const downloaded = await iconifyDownload(prefix, name, options);
  await writeCacheEntry(cacheRoot, hash, downloaded);
  const buf = Buffer.from(downloaded);
  Object.defineProperty(buf, "source", { value: "iconify", enumerable: false });
  Object.defineProperty(buf, "hash", { value: hash, enumerable: false });
  return buf;
}

/**
 * The same cache for raw SVG, keyed WITHOUT a size.
 *
 * A PNG's bytes depend on the pixel size it was rendered at, so size belongs in
 * that key. An SVG's do not — the markup is the same however large it will be
 * drawn — and including size there would split one cache entry into one per
 * requested dimension and re-download identical bytes for each.
 */
function hashIconSvg(prefix, name, options) {
  const color = options?.color ?? "default";
  return createHash(HASH_ALGO).update(`svg|${prefix}|${name}|${color}`).digest("hex");
}

async function readSvgCacheEntry(cacheRoot, hash) {
  try {
    return await fs.readFile(path.join(cacheRoot, `${hash}.svg`));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeSvgCacheEntry(cacheRoot, hash, bytes) {
  await fs.mkdir(cacheRoot, { recursive: true });
  const file = path.join(cacheRoot, `${hash}.svg`);
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, file);
}

/**
 * Cached wrapper around {@link iconifySvgDownload}, mirroring
 * {@link cachedDownloadIconPng}.
 *
 * @param {string} prefix
 * @param {string} name
 * @param {object} options   { color }
 * @param {object} [hooks]   { cacheRoot?, log? }
 * @returns {Promise<Buffer & { source: "cache"|"iconify", hash: string }>}
 */
export async function cachedDownloadIconSvg(prefix, name, options, hooks = {}) {
  const cacheRoot = hooks.cacheRoot ?? DEFAULT_CACHE_ROOT;
  const log = hooks.log ?? (() => {});

  const hash = hashIconSvg(prefix, name, options);
  const hit = await readSvgCacheEntry(cacheRoot, hash);
  if (hit !== null) {
    log(`cache HIT ${prefix}:${name} (svg) -> ${hash.slice(0, 12)}`);
    const buf = Buffer.from(hit);
    Object.defineProperty(buf, "source", { value: "cache", enumerable: false });
    Object.defineProperty(buf, "hash", { value: hash, enumerable: false });
    return buf;
  }

  log(`cache MISS ${prefix}:${name} (svg) -> ${hash.slice(0, 12)} (downloading)`);
  const downloaded = await iconifySvgDownload(prefix, name, options);
  await writeSvgCacheEntry(cacheRoot, hash, downloaded);
  const buf = Buffer.from(downloaded);
  Object.defineProperty(buf, "source", { value: "iconify", enumerable: false });
  Object.defineProperty(buf, "hash", { value: hash, enumerable: false });
  return buf;
}

/**
 * Inspection helpers — used by smoke tests and CLI `cache-stats`.
 */
export async function statsForCacheRoot(cacheRoot = DEFAULT_CACHE_ROOT) {
  let names;
  try {
    names = await fs.readdir(cacheRoot);
  } catch (err) {
    if (err.code === "ENOENT") return { entries: 0, bytes: 0 };
    throw err;
  }
  const cached = names.filter((n) => n.endsWith(".png") || n.endsWith(".svg"));
  let bytes = 0;
  for (const n of cached) {
    const s = await fs.stat(path.join(cacheRoot, n));
    bytes += s.size;
  }
  return {
    entries: cached.length,
    bytes,
    svg: cached.filter((n) => n.endsWith(".svg")).length,
    png: cached.filter((n) => n.endsWith(".png")).length,
  };
}

export const _internal = {
  hashIcon,
  hashIconSvg,
  DEFAULT_CACHE_ROOT,
  HASH_ALGO,
  readCacheEntry,
  writeCacheEntry,
};
