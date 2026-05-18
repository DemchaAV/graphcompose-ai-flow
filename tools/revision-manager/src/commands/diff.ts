/**
 * `graphcompose-flow diff <revA> <revB>` — unified diff between two revisions'
 * generated-template.java files. Falls back to an artifact-name + size summary
 * when one of the templates is missing.
 *
 * We implement the unified diff in-process so the tool has no external diff
 * dependency. The algorithm is the textbook LCS-based unified diff used by
 * git: not optimised for huge files but correct for the small Java templates
 * we will diff.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revisionDirPath } from '../paths.js';
import { loadRevision } from '../revisionStore.js';
import { pathExists } from '../json.js';

const TEMPLATE_FILE = 'generated-template.java';

export async function runDiff(
  projectRoot: string,
  revA: string,
  revB: string,
): Promise<string> {
  // Ensure both revisions exist (loadRevision throws RevisionNotFoundError
  // with a useful message otherwise).
  await loadRevision(projectRoot, revA);
  await loadRevision(projectRoot, revB);

  const aPath = path.join(revisionDirPath(projectRoot, revA), TEMPLATE_FILE);
  const bPath = path.join(revisionDirPath(projectRoot, revB), TEMPLATE_FILE);
  const aExists = await pathExists(aPath);
  const bExists = await pathExists(bPath);
  if (!aExists || !bExists) {
    return formatArtifactSummary(projectRoot, revA, revB, aExists, bExists);
  }
  const aText = await fs.readFile(aPath, 'utf8');
  const bText = await fs.readFile(bPath, 'utf8');
  if (aText === bText) {
    return `(no changes in ${TEMPLATE_FILE} between ${revA} and ${revB})`;
  }
  return unifiedDiff(aText, bText, `${revA}/${TEMPLATE_FILE}`, `${revB}/${TEMPLATE_FILE}`);
}

async function formatArtifactSummary(
  projectRoot: string,
  revA: string,
  revB: string,
  aExists: boolean,
  bExists: boolean,
): Promise<string> {
  const aMap = await artifactMap(projectRoot, revA);
  const bMap = await artifactMap(projectRoot, revB);
  const names = Array.from(new Set([...aMap.keys(), ...bMap.keys()])).sort();
  const lines = [
    `${TEMPLATE_FILE} missing (${revA}: ${aExists ? 'present' : 'absent'}, ${revB}: ${bExists ? 'present' : 'absent'})`,
    `Falling back to artifact summary:`,
    `${'FILE'.padEnd(40)}  ${revA.padEnd(16)}  ${revB.padEnd(16)}  CHANGE`,
    `${'-'.repeat(40)}  ${'-'.repeat(16)}  ${'-'.repeat(16)}  ------`,
  ];
  for (const name of names) {
    const a = aMap.get(name);
    const b = bMap.get(name);
    let change: string;
    if (a === undefined) change = 'added';
    else if (b === undefined) change = 'removed';
    else if (a !== b) change = 'changed';
    else change = 'same';
    lines.push(
      `${name.padEnd(40)}  ${(a === undefined ? '-' : String(a)).padEnd(16)}  ${(b === undefined ? '-' : String(b)).padEnd(16)}  ${change}`,
    );
  }
  return lines.join('\n');
}

async function artifactMap(projectRoot: string, revisionId: string): Promise<Map<string, number>> {
  const dir = revisionDirPath(projectRoot, revisionId);
  if (!(await pathExists(dir))) return new Map();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fp = path.join(dir, entry.name);
    const stat = await fs.stat(fp);
    out.set(entry.name, stat.size);
  }
  return out;
}

// --- unified diff -----------------------------------------------------------

/**
 * Produce a unified diff string between two text blobs. The output mimics
 * `diff -u`: a single hunk per contiguous difference, 3 lines of context.
 */
export function unifiedDiff(
  aText: string,
  bText: string,
  aLabel: string,
  bLabel: string,
  context = 3,
): string {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const ops = diffLines(a, b);
  const hunks = collectHunks(ops, context);
  if (hunks.length === 0) {
    return `(no changes between ${aLabel} and ${bLabel})`;
  }
  const out: string[] = [];
  out.push(`--- ${aLabel}`);
  out.push(`+++ ${bLabel}`);
  for (const hunk of hunks) {
    const aStart = hunk.aStart + 1;
    const bStart = hunk.bStart + 1;
    out.push(`@@ -${aStart},${hunk.aLen} +${bStart},${hunk.bLen} @@`);
    for (const line of hunk.lines) out.push(line);
  }
  return out.join('\n');
}

type Op =
  | { kind: 'equal'; a: string }
  | { kind: 'del'; a: string }
  | { kind: 'ins'; b: string };

/**
 * LCS via classic dynamic programming. Returns a flat operation list (equal /
 * del / ins). Memory is O(|a|*|b|), acceptable for the small Java templates
 * (<= a few thousand lines) we expect here.
 */
function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = length of LCS of a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const ai = a[i - 1];
      const bj = b[j - 1];
      if (ai !== undefined && bj !== undefined && ai === bj) {
        dp[i]![j] = (dp[i - 1]![j - 1] ?? 0) + 1;
      } else {
        const left = dp[i - 1]![j] ?? 0;
        const up = dp[i]![j - 1] ?? 0;
        dp[i]![j] = left >= up ? left : up;
      }
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const ai = a[i - 1]!;
    const bj = b[j - 1]!;
    if (ai === bj) {
      ops.push({ kind: 'equal', a: ai });
      i--;
      j--;
    } else if ((dp[i - 1]![j] ?? 0) >= (dp[i]![j - 1] ?? 0)) {
      ops.push({ kind: 'del', a: ai });
      i--;
    } else {
      ops.push({ kind: 'ins', b: bj });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ kind: 'del', a: a[i - 1]! });
    i--;
  }
  while (j > 0) {
    ops.push({ kind: 'ins', b: b[j - 1]! });
    j--;
  }
  ops.reverse();
  return ops;
}

interface Hunk {
  aStart: number;
  aLen: number;
  bStart: number;
  bLen: number;
  lines: string[];
}

/**
 * Group ops into unified-diff hunks with `context` surrounding equal lines.
 * Indices in the result are 0-based; unifiedDiff() converts to 1-based.
 */
function collectHunks(ops: Op[], context: number): Hunk[] {
  // Compute, for each op, its absolute index in a (aIdx) and b (bIdx).
  const aIdx: number[] = [];
  const bIdx: number[] = [];
  let ai = 0;
  let bi = 0;
  for (const op of ops) {
    aIdx.push(ai);
    bIdx.push(bi);
    if (op.kind === 'equal') {
      ai++;
      bi++;
    } else if (op.kind === 'del') {
      ai++;
    } else {
      bi++;
    }
  }

  const hunks: Hunk[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i]!;
    if (op.kind === 'equal') {
      i++;
      continue;
    }
    // Find the end of this run of changes plus trailing context.
    let start = i;
    let end = i;
    let lookahead = 0;
    while (end < ops.length) {
      const cur = ops[end]!;
      if (cur.kind === 'equal') {
        lookahead++;
        if (lookahead > context * 2) break;
      } else {
        lookahead = 0;
      }
      end++;
    }
    // Trim trailing equals beyond `context`.
    let trimEnd = end;
    let trailingEquals = 0;
    while (trimEnd > start && ops[trimEnd - 1]!.kind === 'equal') {
      trailingEquals++;
      trimEnd--;
    }
    trimEnd = Math.min(end, trimEnd + Math.min(context, trailingEquals));

    // Prepend up to `context` equals before the change for context.
    let leadStart = start;
    let leadCount = 0;
    while (leadStart > 0 && ops[leadStart - 1]!.kind === 'equal' && leadCount < context) {
      leadStart--;
      leadCount++;
    }

    const slice = ops.slice(leadStart, trimEnd);
    const hunk: Hunk = {
      aStart: aIdx[leadStart] ?? 0,
      bStart: bIdx[leadStart] ?? 0,
      aLen: 0,
      bLen: 0,
      lines: [],
    };
    for (const o of slice) {
      if (o.kind === 'equal') {
        hunk.lines.push(' ' + o.a);
        hunk.aLen++;
        hunk.bLen++;
      } else if (o.kind === 'del') {
        hunk.lines.push('-' + o.a);
        hunk.aLen++;
      } else {
        hunk.lines.push('+' + o.b);
        hunk.bLen++;
      }
    }
    hunks.push(hunk);
    i = trimEnd;
  }
  return hunks;
}
