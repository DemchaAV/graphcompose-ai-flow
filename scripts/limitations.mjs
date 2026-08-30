#!/usr/bin/env node
/**
 * scripts/limitations.mjs — what this project will not fix, on the record.
 *
 *   node scripts/limitations.mjs list   --project <id> [--json]
 *   node scripts/limitations.mjs accept <limitation-id> --project <id> --reason "<why>"
 *        [--mismatch <id>]… [--region <id> --cause <CAUSE>] [--by user|harness] [--quote "<their words>"]
 *   node scripts/limitations.mjs retire <limitation-id> --project <id> --note "<what changed>"
 *   node scripts/limitations.mjs covers --project <id> --mismatch <id> [--region <id> --cause <CAUSE>]
 *
 * `accept` is the answer to a question the loop keeps asking — "the heading
 * face is not among the bundled families; keep the substitute?" — recorded
 * once, with the reason, so no later pass spends its budget on it and no later
 * review has to re-type the argument. See scripts/lib/limitations.mjs for what
 * iterate-status does with the record.
 *
 * Exit: 0 done (for `covers`: 0 covered, 1 not) · 2 usage · 3 no such project
 *       · 4 refused (reason too thin, cause the harness may not decide, …)
 */

import { describeWorkspaceLine, requireProjectDir, resolveWorkspace } from "./lib/workspace.mjs";
import {
  acceptLimitation,
  coveringLimitation,
  LimitationError,
  limitationsPath,
  readAll,
  readLimitations,
  retireLimitation,
} from "./lib/limitations.mjs";

const COMMANDS = new Set(["list", "accept", "retire", "covers"]);

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/limitations.mjs <list|accept|retire|covers> [<id>] --project <id> [options]\n\n" +
      "  accept <id>  --reason <text> [--mismatch <id>]... [--region <id> --cause <CAUSE>]\n" +
      "               [--by user|harness] [--quote <their words>]\n" +
      "  retire <id>  --note <what changed>\n" +
      "  covers       --mismatch <id> [--region <id> --cause <CAUSE>]   exit 0 covered, 1 not\n" +
      "  --root <workspace>   --json\n\n" +
      "exit: 0 done | 1 (covers) not covered | 2 usage | 3 no such project | 4 refused\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    command: null, id: null, project: null, root: null, json: false, reason: null, note: null,
    mismatches: [], regions: [], cause: null, by: "user", quote: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--note") out.note = argv[++i];
    else if (a === "--mismatch") out.mismatches.push(argv[++i]);
    else if (a === "--region") out.regions.push(argv[++i]);
    else if (a === "--cause") out.cause = argv[++i];
    else if (a === "--by") out.by = argv[++i];
    else if (a === "--quote") out.quote = argv[++i];
    else if (!a.startsWith("-") && !out.command && COMMANDS.has(a)) out.command = a;
    else if (!a.startsWith("-") && out.command && !out.id) out.id = a;
    else {
      process.stderr.write(`[limitations] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.command || !args.project) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

let projectDir;
try {
  projectDir = requireProjectDir(workspace, args.project);
} catch (err) {
  console.error(err.message);
  process.exit(3);
}

try {
  if (args.command === "list") {
    const all = readAll(projectDir);
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ file: limitationsPath(projectDir), limitations: all }, null, 2)}\n`);
    } else if (all.length === 0) {
      console.log(`no accepted limitations on record for ${args.project}`);
    } else {
      for (const l of all) {
        const covers = [...l.mismatchIds.map((m) => `mismatch ${m}`), ...l.regions.map((r) => `${r} (${l.cause})`)];
        console.log(
          `  ${l.retiredAt ? "retired " : "        "}${l.id}  by ${l.decidedBy}  — ${covers.join(", ")}\n` +
            `           ${l.reason}` +
            (l.retiredAt ? `\n           retired: ${l.retiredNote}` : ""),
        );
      }
    }
    process.exit(0);
  }

  if (args.command === "accept") {
    if (!args.id) usage(2);
    const record = acceptLimitation(projectDir, {
      id: args.id,
      reason: args.reason,
      decidedBy: args.by,
      cause: args.cause,
      mismatchIds: args.mismatches,
      regions: args.regions,
      quote: args.quote,
    });
    if (args.json) process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    else {
      console.log(
        `accepted ${record.id} (${record.decidedBy}) — iterate-status will route around ` +
          `${[...record.mismatchIds, ...record.regions].join(", ")} from the next pass on`,
      );
    }
    process.exit(0);
  }

  if (args.command === "retire") {
    if (!args.id) usage(2);
    const record = retireLimitation(projectDir, args.id, args.note);
    if (args.json) process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    else console.log(`retired ${record.id} — it counts as a mismatch again`);
    process.exit(0);
  }

  if (args.command === "covers") {
    const hit = coveringLimitation(readLimitations(projectDir), {
      id: args.mismatches[0] ?? null,
      region: args.regions[0] ?? null,
      cause: args.cause,
    });
    if (args.json) process.stdout.write(`${JSON.stringify({ covered: Boolean(hit), by: hit }, null, 2)}\n`);
    else console.log(hit ? `covered by ${hit.id}: ${hit.reason}` : "not covered");
    process.exit(hit ? 0 : 1);
  }
} catch (err) {
  if (err instanceof LimitationError) {
    console.error(err.message);
    process.exit(4);
  }
  throw err;
}
