/**
 * Cache key computation for skill-validation verdicts.
 *
 * The hash key is deterministic over the three inputs that decide
 * whether a previous verdict is still valid:
 *   - the target GraphCompose coordinate (artifactId:version),
 *   - the sorted list of covered skill IDs,
 *   - the content of every .md file in the skill pack folder.
 *
 * Anything outside those three (e.g. unrelated tooling changes,
 * non-skill-pack docs) must NOT shift the cache key.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const HASH_ALGO = 'sha256';

async function walkSkillPack(skillPackDir) {
  const entries = await fs.readdir(skillPackDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(skillPackDir, entry.name));
    }
  }
  files.sort();
  return files;
}

async function fileContentHash(filePath) {
  const buf = await fs.readFile(filePath);
  return createHash(HASH_ALGO).update(buf).digest('hex');
}

/**
 * Compute the cache key.
 *
 * @param {object} input
 * @param {string} input.targetCoordinate
 *   Resolved Maven coordinate, e.g. "io.github.demchaav:graph-compose:1.6.6".
 * @param {string[]} input.coveredSkills
 *   Skill IDs the validation covers. Order does not matter; the key
 *   sorts the array before hashing.
 * @param {string} input.skillPackDir
 *   Absolute path to the skill pack folder (the *.md files inside
 *   contribute to the key by content).
 * @returns {Promise<{key: string, breakdown: object}>}
 */
export async function computeCacheKey(input) {
  const { targetCoordinate, coveredSkills, skillPackDir } = input;
  if (!targetCoordinate || typeof targetCoordinate !== 'string') {
    throw new Error('targetCoordinate is required');
  }
  if (!Array.isArray(coveredSkills)) {
    throw new Error('coveredSkills must be an array of skill IDs');
  }
  if (!skillPackDir || typeof skillPackDir !== 'string') {
    throw new Error('skillPackDir is required');
  }

  const sortedSkills = [...coveredSkills].sort();
  const skillPackFiles = await walkSkillPack(skillPackDir);
  const fileHashes = await Promise.all(
    skillPackFiles.map(async (p) => `${path.basename(p)}:${await fileContentHash(p)}`),
  );

  const payload = [
    `coord:${targetCoordinate}`,
    `skills:${sortedSkills.join(',')}`,
    `pack:${fileHashes.join('\n')}`,
  ].join('\n---\n');

  const key = createHash(HASH_ALGO).update(payload).digest('hex');

  return {
    key,
    breakdown: {
      targetCoordinate,
      coveredSkills: sortedSkills,
      skillPackFileCount: skillPackFiles.length,
      skillPackFiles: skillPackFiles.map((p) => path.basename(p)),
    },
  };
}

export const _internal = { walkSkillPack, fileContentHash, HASH_ALGO };
