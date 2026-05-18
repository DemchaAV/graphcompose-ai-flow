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
import { runUndo } from './commands/undo.js';
import { runRevertApproved } from './commands/revertApproved.js';
import { runRestoreComponent } from './commands/restoreComponent.js';
import { runHistory, formatHistory } from './commands/history.js';
import { runDiff } from './commands/diff.js';

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
    .action(async (projectName: string) => {
      try {
        const dir = await runInit(projectName);
        process.stdout.write(`initialised project at ${dir}\n`);
      } catch (err) {
        fail(err);
      }
    });

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
      .description('create a new DRAFT revision')
      .option('--base <revisionId>', 'parent revision id (defaults to current draft, then approved)')
      .action(async (message: string, opts: CommonOptions & { base?: string }) => {
        try {
          const root = resolveProjectRoot(opts.project);
          const rev = await runNewRevision(root, message, { base: opts.base });
          process.stdout.write(
            `created ${rev.id} (parent: ${rev.parentRevisionId ?? '(none)'}) -- DRAFT\n`,
          );
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
