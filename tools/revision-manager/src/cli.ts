/**
 * Commander entry point for the `graphcompose-flow` CLI.
 *
 * Each subcommand delegates to a function in src/commands/. Errors print to
 * stderr and force a non-zero exit so the tool plays well in pipelines.
 */

import { Command } from 'commander';
import { resolveProjectRoot } from './paths.js';
import { runInit } from './commands/init.js';
import { runStatus, formatStatus } from './commands/status.js';
import { runNewRevision } from './commands/newRevision.js';
import { runApprove } from './commands/approve.js';
import { runReject } from './commands/reject.js';
import { runFail } from './commands/fail.js';
import { runUndo } from './commands/undo.js';
import { runRevertApproved } from './commands/revertApproved.js';
import { runRestoreComponent } from './commands/restoreComponent.js';
import { runHistory, formatHistory } from './commands/history.js';
import { runDiff } from './commands/diff.js';
import { FAILURE_CATEGORIES, FAILURE_STAGES } from './types.js';

interface CommonOptions {
  project?: string;
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function projectOption(cmd: Command): Command {
  return cmd.option('--project <path>', 'project folder (defaults to current directory)');
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('graphcompose-flow')
    .description('File-based revision manager for GraphCompose AI Template Flow projects.')
    .version('0.1.0');

  program
    .command('init <projectName>')
    .description('create a new template project folder')
    .option(
      '--template <name>',
      'seed a ready-to-render project from a bundled template (e.g. invoice)',
    )
    // The pins were reachable from runInit but not from the CLI, so every
    // project created through it claimed the built-in default regardless of
    // what the Java project actually pins. scripts/init-workspace.mjs resolves
    // the real version and passes it through here.
    .option('--target-version <x.y.z>', 'GraphCompose version this project targets')
    .option('--skill-pack <path>', 'skill pack backing that version')
    .action(
      async (
        projectName: string,
        opts: { template?: string; targetVersion?: string; skillPack?: string },
      ) => {
        try {
          const dir = await runInit(projectName, {
            template: opts.template,
            targetGraphComposeVersion: opts.targetVersion,
            skillPack: opts.skillPack,
          });
          if (opts.template) {
            process.stdout.write(`initialised ${opts.template} project at ${dir}\n\n`);
            // Both lines used to assume a checkout — "from the repository root"
            // and --project examples/<name> — which is wrong everywhere the
            // harness is installed rather than cloned. The resolved directory
            // is the one fact that holds in either.
            process.stdout.write('Next steps:\n');
            process.stdout.write(
              `  node scripts/render.mjs ${projectName} revision-001   # -> output.pdf + output.png\n`,
            );
            process.stdout.write(
              `  node tools/revision-manager/bin/graphcompose-flow.mjs status --project ${dir}\n`,
            );
          } else {
            process.stdout.write(`initialised project at ${dir}\n`);
          }
        } catch (err) {
          fail(err);
        }
      },
    );

  projectOption(
    program
      .command('status')
      .description('summarise the project and its newest revision')
      .action(async (opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const s = await runStatus(root);
          process.stdout.write(formatStatus(s) + '\n');
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('new-revision <message>')
      .description(
        "create a new DRAFT revision, carrying the parent's sources forward (not its render or review)",
      )
      .option('--base <revisionId>', 'parent revision id (defaults to current draft, then approved)')
      .option('--empty', "start from an empty folder instead of the parent's sources")
      .action(async (message: string, opts: CommonOptions & { base?: string; empty?: boolean }) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rev = await runNewRevision(root, message, { base: opts.base, empty: opts.empty });
          process.stdout.write(
            `created ${rev.id} (parent: ${rev.parentRevisionId ?? '(none)'}) -- DRAFT\n`,
          );
          if (rev.parentRevisionId) {
            process.stdout.write(
              rev.copiedFiles.length > 0
                ? `carried ${rev.copiedFiles.length} source file(s) forward from ${rev.parentRevisionId}; ` +
                    'render and review artifacts stay with the parent\n'
                : `nothing carried forward from ${rev.parentRevisionId}` +
                    (opts.empty ? ' (--empty)\n' : ' (it has no source files)\n'),
            );
          }
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('approve [revisionId]')
      .description('mark a revision APPROVED (defaults to current draft)')
      .action(async (revisionId: string | undefined, opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const { approved, superseded } = await runApprove(root, revisionId);
          process.stdout.write(`approved ${approved.id}\n`);
          for (const s of superseded) {
            process.stdout.write(`superseded ${s.id} (was APPROVED)\n`);
          }
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('reject [revisionId]')
      .description('mark a revision REJECTED (defaults to current draft)')
      .action(async (revisionId: string | undefined, opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rejected = await runReject(root, revisionId);
          process.stdout.write(`rejected ${rejected.id}\n`);
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('fail [revisionId]')
      .description('mark a revision FAILED (compile/render breakage; preserves artifacts)')
      .option('--reason <text>', 'short note appended to the userRequest and used as the failure summary')
      .option(
        '--category <category>',
        `why the run stopped: ${FAILURE_CATEGORIES.join(' | ')}`,
      )
      .option(
        '--stage <stage>',
        `where it broke: ${FAILURE_STAGES.join(' | ')} (defaults from --category when unambiguous)`,
      )
      .option('--message <text>', 'verbatim error output from the failing stage')
      .action(
        async (
          revisionId: string | undefined,
          opts: CommonOptions & {
            reason?: string;
            category?: string;
            stage?: string;
            message?: string;
          },
        ) => {
          try {
            const root = resolveProjectRoot(opts.project);
            const failed = await runFail(root, revisionId, opts.reason, {
              category: opts.category,
              stage: opts.stage,
              message: opts.message,
            });
            process.stdout.write(`failed ${failed.id}\n`);
          } catch (err) {
            fail(err);
          }
        },
      ),
  );

  projectOption(
    program
      .command('undo')
      .description('roll the current draft back to its parent (creates a new DRAFT)')
      .action(async (opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rev = await runUndo(root);
          process.stdout.write(`undo -> ${rev.id} (parent: ${rev.parentRevisionId ?? '(none)'})\n`);
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('revert-approved')
      .description('start a fresh DRAFT from the current APPROVED revision')
      .action(async (opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rev = await runRevertApproved(root);
          process.stdout.write(
            `revert-approved -> ${rev.id} (parent: ${rev.parentRevisionId ?? '(none)'})\n`,
          );
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('restore-component <name>')
      .description('restore a single component region from another revision')
      .requiredOption('--from <revisionId>', 'source revision id')
      .action(async (name: string, opts: CommonOptions & { from: string }) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rev = await runRestoreComponent(root, name, { from: opts.from });
          process.stdout.write(`restore-component -> ${rev.id} (parent: ${rev.parentRevisionId})\n`);
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('history')
      .description('list every revision in the project')
      .action(async (opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rows = await runHistory(root);
          process.stdout.write(formatHistory(rows) + '\n');
        } catch (err) {
          fail(err);
        }
      }),
  );

  projectOption(
    program
      .command('diff <revA> <revB>')
      .description('unified diff of generated-template.java between two revisions')
      .action(async (revA: string, revB: string, opts: CommonOptions) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const out = await runDiff(root, revA, revB);
          process.stdout.write(out + '\n');
        } catch (err) {
          fail(err);
        }
      }),
  );

  return program;
}

// Parse argv when invoked as the entry script (true for both `node dist/cli.js`
// and the bin shim that imports it).
const program = buildProgram();
program.parseAsync(process.argv).catch((err) => fail(err));
