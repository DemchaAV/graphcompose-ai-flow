/**
 * crop-region — cut the reference and the output down to one region, so a
 * correction pass reads two crops instead of two pages.
 *
 *   crop-region --revision <dir> --region <id> [--bounds x,y,w,h] [--pad 0.02]
 *               [--reference <png>] [--output <png>] [--out <dir>]
 *
 * Where the bounds come from, in order:
 *
 *   1. --bounds, four page fractions — always works, no analysis needed
 *   2. the region's `bounds` in the revision's visual-analysis.json — the
 *      analyse stage records them per region; older analyses that carry only
 *      prose proportions cannot be cropped from, and the error says so rather
 *      than guessing a rectangle
 *
 * The same fractional rect is projected onto each image's own pixel grid, so
 * a 1024-wide reference and a 1240-wide render produce corresponding crops
 * without either being resampled.
 *
 * Exit codes: 0 cropped, 1 nothing to crop from (missing image or bounds),
 * 2 usage.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { cropFile, type FractionalBounds } from './cropRegion.js';

interface Args {
  revision: string | null;
  region: string | null;
  bounds: FractionalBounds | null;
  pad: number;
  reference: string | null;
  output: string | null;
  outDir: string | null;
}

function usage(code: number): never {
  process.stdout.write(
    'usage: crop-region --revision <dir> --region <id> [--bounds x,y,w,h] [--pad <frac>]\n' +
      '                   [--reference <png>] [--output <png>] [--out <dir>]\n\n' +
      '  --revision <dir>   the revision holding output.png and visual-analysis.json\n' +
      '  --region <id>      region id from the analysis; names the crop files\n' +
      '  --bounds x,y,w,h   page fractions (top-left origin), overriding the analysis\n' +
      '  --pad <frac>       context margin around the bounds (default 0.02 of the page)\n' +
      '  --reference <png>  reference image (default: reference-scaled.png in the\n' +
      '                     revision, else the project reference/reference.png)\n' +
      '  --output <png>     rendered image (default: output.png in the revision)\n' +
      '  --out <dir>        where crops land (default: <revision>/crops)\n',
  );
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    revision: null,
    region: null,
    bounds: null,
    pad: 0.02,
    reference: null,
    output: null,
    outDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--revision') out.revision = argv[++i] ?? null;
    else if (a === '--region') out.region = argv[++i] ?? null;
    else if (a === '--pad') out.pad = Number(argv[++i]);
    else if (a === '--reference') out.reference = argv[++i] ?? null;
    else if (a === '--output') out.output = argv[++i] ?? null;
    else if (a === '--out') out.outDir = argv[++i] ?? null;
    else if (a === '--bounds') {
      const parts = String(argv[++i] ?? '')
        .split(',')
        .map((p) => Number(p.trim()));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        process.stderr.write('[crop-region] --bounds takes four numbers: x,y,w,h as page fractions\n');
        usage(2);
      }
      const [x, y, w, h] = parts as [number, number, number, number];
      out.bounds = { x, y, w, h };
    } else {
      process.stderr.write(`[crop-region] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.revision || !out.region) {
    process.stderr.write('[crop-region] --revision and --region are required\n');
    usage(2);
  }
  if (!Number.isFinite(out.pad) || out.pad < 0 || out.pad > 0.25) {
    process.stderr.write('[crop-region] --pad must be a fraction between 0 and 0.25\n');
    usage(2);
  }
  return out;
}

async function boundsFromAnalysis(
  revisionDir: string,
  regionId: string,
): Promise<FractionalBounds | null> {
  const analysisPath = join(revisionDir, 'visual-analysis.json');
  if (!existsSync(analysisPath)) return null;
  const analysis = JSON.parse(await readFile(analysisPath, 'utf8')) as {
    regions?: Array<{ id?: string; bounds?: FractionalBounds }>;
  };
  const region = (analysis.regions ?? []).find((r) => r.id === regionId);
  return region?.bounds ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const revisionDir = resolve(args.revision!);
  if (!existsSync(revisionDir)) {
    process.stderr.write(`[crop-region] no such revision directory: ${revisionDir}\n`);
    process.exit(1);
  }

  const bounds = args.bounds ?? (await boundsFromAnalysis(revisionDir, args.region!));
  if (!bounds) {
    process.stderr.write(
      `[crop-region] region "${args.region}" has no bounds in visual-analysis.json and no ` +
        '--bounds were given. Record `bounds: {x,y,w,h}` (page fractions) on the region, or ' +
        'pass --bounds — guessing a rectangle would defeat the point of cropping.\n',
    );
    process.exit(1);
  }

  const outputPng = args.output ?? join(revisionDir, 'output.png');
  // reference-scaled.png is the render-resolution copy the diff already uses;
  // fall back to the project's own reference, which fractions handle fine.
  const referencePng =
    args.reference ??
    [join(revisionDir, 'reference-scaled.png'), join(revisionDir, '..', '..', 'reference', 'reference.png')].find(
      existsSync,
    ) ??
    null;

  const jobs: Array<{ kind: string; source: string }> = [];
  if (referencePng && existsSync(referencePng)) jobs.push({ kind: 'reference', source: referencePng });
  if (existsSync(outputPng)) jobs.push({ kind: 'output', source: outputPng });
  if (jobs.length === 0) {
    process.stderr.write(
      `[crop-region] neither a reference nor an output image was found for ${revisionDir}\n`,
    );
    process.exit(1);
  }

  const outDir = resolve(args.outDir ?? join(revisionDir, 'crops'));
  await mkdir(outDir, { recursive: true });

  const crops: Record<string, unknown> = {};
  for (const job of jobs) {
    const target = join(outDir, `${args.region}-${job.kind}.png`);
    const result = await cropFile(job.source, target, bounds, args.pad);
    crops[job.kind] = { path: target, ...result };
  }

  process.stdout.write(
    `${JSON.stringify({ region: args.region, bounds, pad: args.pad, crops }, null, 2)}\n`,
  );
}

main().catch((err: Error) => {
  process.stderr.write(`[crop-region] ${err.message}\n`);
  process.exit(1);
});
