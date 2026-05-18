/**
 * JSON I/O helpers.
 *
 * Reads are typed by the caller (we cast immediately at the parse boundary).
 * Writes go through a tmp file + rename to make updates atomic — a crash
 * mid-write leaves the previous good state untouched. Indentation is fixed at
 * two spaces and a trailing newline is appended to match the existing
 * examples/invoice-reference style.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  // Cast at the parse boundary; callers immediately treat the result as T.
  return JSON.parse(raw) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${randomBytes(6).toString('hex')}.tmp`);
  const body = JSON.stringify(value, null, 2) + '\n';
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, body, 'utf8');
  // fs.rename is atomic on POSIX and on NTFS for same-volume renames; if the
  // target exists Windows requires us to remove it first.
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup; bubble the original error.
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
