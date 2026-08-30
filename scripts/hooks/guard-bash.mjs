#!/usr/bin/env node
/**
 * scripts/hooks/guard-bash.mjs — a PreToolUse hook that stops the four habits
 * the skills spend pages asking the agent not to have.
 *
 * ## Why a hook and not another paragraph
 *
 * The workflow skills already say, at length, to read a template through
 * `source.mjs`, to query the layout snapshot through `layout.mjs`, to compare
 * images through `render-and-diff` / `reference.mjs`, and to patch a method
 * with the editor rather than a throwaway script. Measured over 23 real
 * sessions after those paragraphs were written: 450 `cat`/`sed` reads of the
 * template, 89 raw reads of `layout-snapshot.json`, 402 raw ImageMagick calls,
 * 528 Python string-patches of Java against 49 editor edits. The instruction
 * was read and not followed, because nothing made following it cheaper than
 * not.
 *
 * A hook makes the shortcut fail at the moment it is reached, with the command
 * that should have been run in the refusal. That is the whole design: no
 * judgement, four patterns, and an off switch.
 *
 * ## Contract (Claude Code PreToolUse)
 *
 * Reads the tool call as JSON on stdin (`tool_name`, `tool_input.command`).
 * Exit 0 lets the call through; exit 2 blocks it and hands stderr to the model
 * as the reason. Any other tool, any parse failure, and GRAPHCOMPOSE_GUARD=off
 * all exit 0 — a guard that could block work by breaking would be worse than
 * no guard.
 */

import fs from "node:fs";

/** Template sources, by the names the harness and the runners give them. */
const TEMPLATE_FILE = /(?:^|[\s"'/\\=])(?:[\w.-]*[/\\])?(?:[A-Z][\w]*Template\.java|generated-template\.java)\b/;
const READER = /(?:^|[\s;&|(])(?:cat|sed|head|tail|less|more|type|Get-Content|gc|awk|grep|rg|findstr|nl|strings)\b/;
const SNAPSHOT_FILE = /layout-snapshot(?:-page-\d+)?\.json\b/;
const RAW_MAGICK_COMPARE = /(?:^|[\s;&|(])(?:magick\s+compare|compare\s+-metric|magick\s+(?:[^\s|;&]+\s+)*-metric)\b/;
const PYTHON_INLINE = /(?:^|[\s;&|(])python3?(?:\.exe)?\s+(?:-c\b|-\s*<<|<<)/;
const JAVA_MENTION = /\.java\b/;
const PATCH_VERBS = /\b(?:re\.sub|replace\(|write_text|open\([^)]*['"][wa]['"]|writelines|\.write\()/;

/**
 * @param {string} command
 * @returns {{ block: boolean, rule: string|null, message: string|null }}
 */
export function judgeCommand(command) {
  const text = String(command ?? "");
  if (text.trim() === "") return allow();

  // 1. Reading the template through the shell.
  if (READER.test(text) && TEMPLATE_FILE.test(text) && !/source\.mjs/.test(text)) {
    return block(
      "template-read",
      "Read the template through the harness, not the shell — a template is a thousand lines and a " +
        "correction touches one method:\n" +
        "  node scripts/source.mjs outline --project <id> --revision <id>\n" +
        "  node scripts/source.mjs symbol <methodName> --project <id> --revision <id>\n" +
        "  node scripts/source.mjs constants --project <id> --revision <id>\n" +
        "(measured: 450 shell reads of templates in 23 sessions, all hunting for one method)",
    );
  }

  // 2. Reading the layout snapshot.
  if (SNAPSHOT_FILE.test(text) && (READER.test(text) || /\bjq\b|node\s+-e|python/.test(text))) {
    return block(
      "snapshot-read",
      "Never read layout-snapshot.json into context (227 KB for a one-page CV, one node is the answer). Ask it:\n" +
        "  node scripts/layout.mjs inspect <node> --project <id> --revision <id>\n" +
        "  node scripts/layout.mjs explain <node> <x|y|width|height> --project <id> --revision <id>\n" +
        "  node scripts/evidence.mjs --project <id> --revision <id> --region <region-id>",
    );
  }

  // 3. Comparing images by hand.
  if (RAW_MAGICK_COMPARE.test(text)) {
    return block(
      "raw-compare",
      "The comparison is a harness step, so its numbers land in the revision and the loop reads them:\n" +
        "  node scripts/render-and-diff.mjs --project <id> --revision <id> [--skip-render] [--against parent]\n" +
        "  node scripts/reference.mjs compare --project <id> --revision <id> --window <name,x0,x1,y0,y1> …\n" +
        "A raw `magick compare` writes nothing anyone else can see.",
    );
  }

  // 4. Patching Java with an inline script.
  if (PYTHON_INLINE.test(text) && JAVA_MENTION.test(text) && (PATCH_VERBS.test(text) || /<<\s*['"]?PY/.test(text))) {
    return block(
      "script-patch",
      "Patch the method with the editor (Edit), not with a throwaway script: the script is model output, " +
        "and a 9 KB patcher to move one padding costs more than the edit it performs. Read the method with " +
        "`node scripts/source.mjs symbol <name> …`, then edit that range in place.\n" +
        "(measured: 528 inline Python patches of Java against 49 editor edits)",
    );
  }

  return allow();
}

function allow() {
  return { block: false, rule: null, message: null };
}

function block(rule, message) {
  return { block: true, rule, message: `[graphcompose-flow guard: ${rule}] ${message}\nSet GRAPHCOMPOSE_GUARD=off to bypass this once, on purpose.` };
}

/** Entry point when run as a hook. */
export function main(input, env = process.env) {
  if (env.GRAPHCOMPOSE_GUARD === "off") return { exit: 0, message: null };
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return { exit: 0, message: null };
  }
  if (event?.tool_name !== "Bash") return { exit: 0, message: null };
  const verdict = judgeCommand(event?.tool_input?.command);
  return verdict.block ? { exit: 2, message: verdict.message } : { exit: 0, message: null };
}

const invokedDirectly =
  process.argv[1] && /guard-bash\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));
if (invokedDirectly) {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {
    input = "";
  }
  const { exit, message } = main(input);
  if (message) process.stderr.write(`${message}\n`);
  process.exit(exit);
}
