/**
 * Cache I/O for skill-validation verdicts.
 *
 * Cache entries live under `<cacheDir>/<hash>.json`. Reads and writes
 * are atomic: write goes to a tmp file then renames, so a partial
 * write never corrupts a hit.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

function cacheFile(cacheDir, key) {
  return path.join(cacheDir, `${key}.json`);
}

/**
 * Look up a cached verdict for the given key.
 *
 * @param {string} cacheDir
 * @param {string} key
 * @returns {Promise<object|null>} the cached entry, or null on miss
 */
export async function lookupEntry(cacheDir, key) {
  const file = cacheFile(cacheDir, key);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Store a verdict entry under the given key. Atomic via tmp+rename.
 *
 * @param {string} cacheDir
 * @param {string} key
 * @param {object} entry  shape: { verdict, reason, targetCoordinate, coveredSkills, verifiedAt, reportBody }
 */
export async function storeEntry(cacheDir, key, entry) {
  await fs.mkdir(cacheDir, { recursive: true });
  const file = cacheFile(cacheDir, key);
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(entry, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Delete a cached entry. Idempotent — missing entries are silently ignored.
 */
export async function deleteEntry(cacheDir, key) {
  const file = cacheFile(cacheDir, key);
  try {
    await fs.unlink(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * List every cached entry under cacheDir.
 *
 * @returns {Promise<Array<{ key: string, entry: object }>>}
 */
export async function listEntries(cacheDir) {
  let names;
  try {
    names = await fs.readdir(cacheDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const key = name.replace(/\.json$/, '');
    const entry = JSON.parse(await fs.readFile(path.join(cacheDir, name), 'utf8'));
    out.push({ key, entry });
  }
  return out;
}
