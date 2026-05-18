/**
 * `graphcompose-flow history` — print every revision in a project, tabular.
 */

import { listRevisions } from '../revisionStore.js';

const COLS = [
  { key: 'id', header: 'ID' },
  { key: 'status', header: 'STATUS' },
  { key: 'parent', header: 'PARENT' },
  { key: 'request', header: 'REQUEST' },
  { key: 'createdAt', header: 'CREATED' },
] as const;

export interface HistoryRow {
  id: string;
  status: string;
  parent: string;
  request: string;
  createdAt: string;
}

export async function runHistory(projectRoot: string): Promise<HistoryRow[]> {
  const revisions = await listRevisions(projectRoot);
  return revisions.map((r) => ({
    id: r.id,
    status: r.status,
    parent: r.parentRevisionId ?? '(none)',
    request: truncate(r.userRequest, 60),
    createdAt: r.createdAt,
  }));
}

export function formatHistory(rows: HistoryRow[]): string {
  if (rows.length === 0) return 'no revisions yet';
  const widths = COLS.map((col) =>
    Math.max(col.header.length, ...rows.map((r) => r[col.key].length)),
  );
  const headerLine = COLS.map((col, i) => col.header.padEnd(widths[i] ?? col.header.length)).join('  ');
  const sepLine = COLS.map((_, i) => '-'.repeat(widths[i] ?? 1)).join('  ');
  const bodyLines = rows.map((row) =>
    COLS.map((col, i) => row[col.key].padEnd(widths[i] ?? row[col.key].length)).join('  '),
  );
  return [headerLine, sepLine, ...bodyLines].join('\n');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 3) return s.slice(0, n);
  return s.slice(0, n - 3) + '...';
}
