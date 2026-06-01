/**
 * Commander wiring for the mask-regions CLI.
 *
 * Usage:
 *   mask-regions --input <png> --output <png>
 *                --regions '[{"x":0,"y":0,"w":600,"h":100,"label":"Header"}]'
 *                [--mode mask-out|keep-only]   (default: mask-out)
 *                [--color white|black|transparent|#hex]  (default: white)
 *                [--regions-file <path-to-json>]
 *                [--json]
 *
 * Exit codes:
 *   0  — masked PNG written
 *   1  — bad arguments, IO error, or invalid PNG
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import {
  maskPngFile,
  parseColor,
  parseRegions,
  DEFAULT_MASK_COLOR,
  type MaskMode,
  type Region,
  type Rgba,
} from './mask-regions.js';

interface CliOptions {
  input: string;
  output: string;
  regions?: string;
  regionsFile?: string;
  mode: MaskMode;
  color: Rgba;
  json: boolean;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('mask-regions')
    .description(
      'Paint rectangular regions of a PNG (mask-out) or paint ' +
        'everything outside the regions (keep-only). Used by the ' +
        'Visual Review Agent for region-aware pixel-AE gates on ' +
        'data-only and asset-only revisions.',
    )
    .requiredOption('--input <path>', 'source PNG')
    .requiredOption('--output <path>', 'destination PNG (overwritten)')
    .option('--regions <json>', 'inline regions JSON')
    .option('--regions-file <path>', 'path to a file containing the regions JSON')
    .option('--mode <mode>', 'mask-out | keep-only', 'mask-out')
    .option('--color <value>', 'fill colour: white | black | transparent | #RGB | #RRGGBB | #RRGGBBAA', 'white')
    .option('--json', 'print machine-readable result JSON', false)
    .action(async (raw: unknown) => {
      const options = await normalizeOptions(raw);
      await runCli(options);
    });

  return program;
}

async function normalizeOptions(raw: unknown): Promise<CliOptions> {
  const r = raw as Record<string, unknown>;
  const input = String(r.input);
  const output = String(r.output);
  const regions = typeof r.regions === 'string' ? r.regions : undefined;
  const regionsFile = typeof r.regionsFile === 'string' ? r.regionsFile : undefined;
  if (regions === undefined && regionsFile === undefined) {
    throw new Error('one of --regions or --regions-file is required');
  }
  const modeRaw = typeof r.mode === 'string' ? r.mode : 'mask-out';
  if (modeRaw !== 'mask-out' && modeRaw !== 'keep-only') {
    throw new Error('--mode must be mask-out or keep-only');
  }
  const colorRaw = typeof r.color === 'string' ? r.color : 'white';
  const color = colorRaw ? parseColor(colorRaw) : DEFAULT_MASK_COLOR;

  return {
    input,
    output,
    regions,
    regionsFile,
    mode: modeRaw,
    color,
    json: r.json === true,
  };
}

async function runCli(options: CliOptions): Promise<void> {
  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);

  // Confirm the input exists before trying to parse regions JSON;
  // a missing file produces a clearer error than a JSON parse failure
  // when the user types the wrong --input path.
  await stat(inputPath);

  const regionsJson = options.regions
    ?? (await readFile(resolve(options.regionsFile!), 'utf8'));
  const regions: Region[] = parseRegions(regionsJson);

  const result = await maskPngFile(inputPath, outputPath, regions, {
    mode: options.mode,
    color: options.color,
  });

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          input: inputPath,
          output: outputPath,
          mode: options.mode,
          color: options.color,
          regionCount: regions.length,
          regions: regions.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, label: r.label ?? null })),
          width: result.width,
          height: result.height,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(
      `mask-regions: ${options.mode} (${regions.length} region${regions.length === 1 ? '' : 's'}, ` +
        `colour ${options.color.r},${options.color.g},${options.color.b},${options.color.a}) -> ` +
        `${result.width}x${result.height} PNG at ${outputPath}\n`,
    );
  }
}

const program = buildProgram();
program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`mask-regions: ${message}\n`);
  process.exit(1);
});
