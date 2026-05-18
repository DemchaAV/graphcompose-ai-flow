/**
 * Test helpers.
 *
 * `withTempProject` creates a unique tmp folder, runs the test against it, and
 * cleans up afterwards. Tests build projects either through runInit or by
 * writing files directly under that root.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export async function makeTempDir(prefix = 'graphcompose-flow-test'): Promise<string> {
  const id = randomBytes(6).toString('hex');
  const dir = path.join(os.tmpdir(), `${prefix}-${id}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function rmrf(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}
