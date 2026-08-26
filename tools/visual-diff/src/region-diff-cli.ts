/**
 * Commander wiring for the region-diff CLI.
 *
 * Usage:
 *   region-diff --reference <png> --output <png>
 *               --regions-file <visual-analysis.json>   (or --regions '<json array>')
 *               [--page <n>]              (default: 1)
 *               [--threshold <0..1>]      (default: 0.1)
 *               [--include-aa]
 *               [--changed <id,id,...>]   regions this revision was allowed to touch
 *               [--write <revision-dir>]  write region-diff-stats.json there
 *               [--json]
 *
 * Exit codes:
 *   0  — measured; if --changed was given, nothing outside it moved
 *   1  — bad arguments, IO error, or invalid PNG
 *   2  — the region-diff gate failed: a region outside --changed carries
 *        mismatched pixels
 *
 * Exit 2 is what makes `region-diff` a gate rather than a description. It is
 * the rule `config/pipeline.json` has stated since Phase 1 and nothing has
 * enforced: "every region outside that list must be byte-equal to the parent".
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import {
  decodePng,
  regionsOfPage,
  runRegionDiff,
  type RegionDiffEntry,
  type RegionDiffResult,
  type RegionSpec,
} from './regionDiff.js';

const STATS_FILE = 'region-diff-stats.json';

interface CliOptions {
  reference: string;
  output: string;
  regions: RegionSpec[];
  page: number;
  threshold: number;
  includeAA: boolean;
  changed: string[] | null;
  write: string | null;
  json: boolean;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('region-diff')
    .description(
      'Compare a render against its reference region by region, using the ' +
        'bounds recorded in visual-analysis.json. Reports where the difference ' +
        'lives, not just how much of it there is.',
    )
    .requiredOption('--reference <path>', 'reference PNG (scaled to the output automatically)')
    .requiredOption('--output <path>', 'rendered PNG')
    .option('--regions-file <path>', 'visual-analysis.json, or a bare JSON array of regions')
    .option('--regions <json>', 'inline regions JSON array')
    .option('--page <n>', 'which page of the analysis to measure', '1')
    .option('--threshold <n>', 'pixelmatch threshold, 0..1 (lower is stricter)', '0.1')
    .option('--include-aa', 'count anti-aliased pixels as differences', false)
    .option(
      '--changed <ids>',
      'comma-separated region ids this revision was allowed to touch; ' +
        'any other region carrying mismatch exits 2',
    )
    .option('--write <dir>', `write ${STATS_FILE} into this revision folder`)
    .option('--json', 'print the full result as JSON', false)
    .action(async (raw: unknown) => {
      const options = await normalizeOptions(raw);
      await runCli(options);
    });

  return program;
}

async function normalizeOptions(raw: unknown): Promise<CliOptions> {
  const r = raw as Record<string, unknown>;

  const regionsFile = typeof r.regionsFile === 'string' ? r.regionsFile : undefined;
  const inline = typeof r.regions === 'string' ? r.regions : undefined;
  if (regionsFile === undefined && inline === undefined) {
    throw new Error('one of --regions-file or --regions is required');
  }

  const page = Number.parseInt(String(r.page ?? '1'), 10);
  if (!Number.isFinite(page) || page < 1) {
    throw new Error(`--page must be a positive integer, got "${String(r.page)}"`);
  }

  const threshold = Number.parseFloat(String(r.threshold ?? '0.1'));
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`--threshold must be between 0 and 1, got "${String(r.threshold)}"`);
  }

  let parsed: unknown;
  if (inline !== undefined) {
    try {
      parsed = JSON.parse(inline);
    } catch (err) {
      throw new Error(`--regions is not valid JSON: ${(err as Error).message}`);
    }
  } else {
    const file = resolve(String(regionsFile));
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      throw new Error(`cannot read --regions-file ${file}: ${(err as Error).message}`);
    }
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`--regions-file ${file} is not valid JSON: ${(err as Error).message}`);
    }
  }

  // A bare array is accepted so the tool is usable without a full analysis
  // document; the ordinary caller passes visual-analysis.json.
  const regions = Array.isArray(parsed)
    ? regionsOfPage({ regions: parsed }, page)
    : regionsOfPage(parsed, page);

  if (regions.length === 0) {
    throw new Error(
      `no regions found for page ${page}. A visual-analysis.json records them ` +
        'under `regions[]`, each with an `id`; ones without `bounds` are kept and ' +
        'reported unmeasurable rather than dropped',
    );
  }

  const changedRaw = typeof r.changed === 'string' ? r.changed : undefined;
  const changed = changedRaw
    ? changedRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  if (changed) {
    const known = new Set(regions.map((region) => region.id));
    const unknown = changed.filter((id) => !known.has(id));
    if (unknown.length) {
      // Silently ignoring an unknown id would turn a typo into a gate that
      // guards nothing, which is the failure this whole tool is a response to.
      throw new Error(
        `--changed names region(s) the analysis does not contain: ${unknown.join(', ')}. ` +
          `Known ids: ${[...known].join(', ')}`,
      );
    }
  }

  return {
    reference: resolve(String(r.reference)),
    output: resolve(String(r.output)),
    regions,
    page,
    threshold,
    includeAA: Boolean(r.includeAa ?? r.includeAA),
    changed,
    write: typeof r.write === 'string' ? resolve(r.write) : null,
    json: Boolean(r.json),
  };
}

/** Regions that moved when they were not supposed to. */
function trespassers(result: RegionDiffResult, changed: string[]): RegionDiffEntry[] {
  const allowed = new Set(changed);
  return result.regions.filter((r) => !r.skipped && !allowed.has(r.id) && r.mismatchPx > 0);
}

function formatRow(entry: RegionDiffEntry): string {
  if (entry.skipped) return `  ${entry.id.padEnd(24)} skipped — ${entry.skipped}`;
  const concentration =
    entry.concentration === null ? '   —  ' : `${entry.concentration.toFixed(2)}x`.padStart(6);
  return (
    `  ${entry.id.padEnd(24)} ${entry.mismatchPx.toString().padStart(9)} px  ` +
    `${entry.percent.toFixed(2).padStart(6)}% of region  ` +
    `${entry.shareOfPageMismatch.toFixed(1).padStart(5)}% of diff  ` +
    `${concentration}`
  );
}

async function runCli(options: CliOptions): Promise<void> {
  const [referenceRaw, outputRaw] = await Promise.all([
    readFile(options.reference),
    readFile(options.output),
  ]);

  const result = runRegionDiff(
    decodePng(referenceRaw),
    decodePng(outputRaw),
    options.regions,
    { threshold: options.threshold, includeAA: options.includeAA },
  );

  const failed = options.changed ? trespassers(result, options.changed) : [];

  // A gate that could not look at part of the page cannot say the page is
  // clean. Regions with no usable bounds are unmeasurable, so under --changed
  // they are a refusal rather than a pass: passing here would report "nothing
  // outside the changed set moved" about regions nothing looked at.
  const allowed = options.changed;
  const unmeasurable = allowed
    ? result.regions.filter((r) => r.skipped && !allowed.includes(r.id))
    : [];

  if (options.write) {
    const file = resolve(options.write, STATS_FILE);
    await writeFile(
      file,
      `${JSON.stringify(
        {
          reference: options.reference,
          output: options.output,
          page: options.page,
          ...result,
          ...(options.changed ? { changedRegions: options.changed } : {}),
          ...(options.changed ? { trespassers: failed.map((f) => f.id) } : {}),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    if (!options.json) process.stdout.write(`[region-diff] wrote ${file}\n`);
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ ...result, trespassers: failed.map((f) => f.id) }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      `page: ${result.pageMismatchPx} px (${result.pagePercent.toFixed(3)}%) over ` +
        `${result.width}x${result.height}\n\n`,
    );
    // Worst concentration first: the reading order is "which region carries
    // more of the damage than its size accounts for", not the analysis order.
    const byRank = new Map(result.ranked.map((id, i) => [id, i]));
    const rows = result.regions
      .slice()
      .sort((a, b) => (byRank.get(a.id) ?? 1e9) - (byRank.get(b.id) ?? 1e9));
    for (const entry of rows) process.stdout.write(`${formatRow(entry)}\n`);
    process.stdout.write(
      '\nconcentration = share of the diff / share of the page area. ' +
        'Even wear sits near 1.00; a structural defect drives one region well above it.\n',
    );
  }

  if (unmeasurable.length) {
    process.stderr.write(
      `\n[region-diff] GATE CANNOT RUN: ${unmeasurable.length} region(s) outside ` +
        '--changed could not be measured, so nothing here can say they did not move: ' +
        `${unmeasurable.map((r) => `${r.id} (${r.skipped})`).join(', ')}\n` +
        'Give them bounds in visual-analysis.json, or name them in --changed and ' +
        'account for them in the review.\n',
    );
  }

  if (failed.length) {
    process.stderr.write(
      `\n[region-diff] GATE FAILED: ${failed.length} region(s) outside --changed carry ` +
        `mismatched pixels: ${failed.map((f) => `${f.id} (${f.mismatchPx} px)`).join(', ')}\n`,
    );
  }

  // exitCode, not exit(). stdout is asynchronous when it is a pipe, and
  // `region-diff --json | jq` is the documented gate invocation - exiting
  // outright can truncate the payload on exactly the failing runs that matter.
  if (failed.length || unmeasurable.length) process.exitCode = 2;
}

const program = buildProgram();
program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`[region-diff] ${(err as Error).message}\n`);
  process.exitCode = 1;
});
