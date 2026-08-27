#!/usr/bin/env node
/**
 * scripts/source.mjs — read the part of a generated template you need.
 *
 *   node scripts/source.mjs outline   --project <id> --revision <id>
 *   node scripts/source.mjs symbol    <name> --project <id> --revision <id>
 *   node scripts/source.mjs constants --project <id> --revision <id>
 *
 * ## Why
 *
 * Measured across one create run's transcript: `sed` returned **30.3k tokens
 * across 17 calls** and `cat` **17.7k across 18** — together more than half of
 * everything the model read back from a tool, and more than twice what all nine
 * of the harness's deterministic tools returned across ninety calls. The
 * expensive reading was not the diffs or the measurements. It was slicing a
 * 1,233-line Java file to find one method, repeatedly, because the only way to
 * ask for `renderExperience` was to guess its line range.
 *
 * A generated template has a shape this harness imposes: geometry constants at
 * the top, one render method per visible region. That is enough structure to
 * answer by name.
 *
 * ## What stays with the model
 *
 * Which method to open, and what to change in it. `outline` exists so that
 * decision is made against a list of names and sizes rather than against a file.
 *
 * Exit: 0 answered | 1 no template or no such symbol | 2 usage | 3 no such revision
 */

import fs from "node:fs";
import path from "node:path";

import {
  describeWorkspaceLine,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { constants, declaredType, extract, methods } from "./lib/java-outline.mjs";

const COMMANDS = new Set(["outline", "symbol", "constants"]);

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/source.mjs <outline|symbol <name>|constants> --project <id> --revision <id>\n\n" +
      "  outline            every method, its line range and its size\n" +
      "  symbol <name>      one method with its Javadoc\n" +
      "  constants          the named constants the geometry derives from\n" +
      "  --context <n>      extra lines either side of a symbol (default 0)\n" +
      "  --file <path>      a Java file to read instead of the revision's template\n" +
      "  --root <dir>       workspace override\n" +
      "  --json             machine-readable\n\n" +
      "exit: 0 answered | 1 no template or no such symbol | 2 usage | 3 no such revision\n",
  );
  process.exit(code);
}

function fail(code, message) {
  process.stderr.write(`[source] ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    command: null,
    name: null,
    project: null,
    revision: null,
    file: null,
    root: null,
    context: 0,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--file") out.file = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (a === "--context") out.context = Number.parseInt(argv[++i], 10) || 0;
    else if (a.startsWith("--")) {
      process.stderr.write(`[source] unknown argument: ${a}\n`);
      usage(2);
    } else if (!out.command) out.command = a;
    else if (!out.name) out.name = a;
  }
  if (!COMMANDS.has(out.command)) usage(2);
  if (out.command === "symbol" && !out.name) {
    process.stderr.write("[source] symbol needs a name\n");
    usage(2);
  }
  if (!out.file && (!out.project || !out.revision)) {
    process.stderr.write("[source] --project and --revision are required without --file\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

/**
 * The revision's generated template.
 *
 * <p>Largest `.java` in the revision, the same rule `check-structural-smells`
 * uses: a revision can hold a spec and a provider beside the template, and the
 * template is the one with the rendering in it.</p>
 */
function templatePath() {
  if (args.file) return path.resolve(args.file);

  const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
  const revisionDir = path.join(workspaceProjectDir(workspace, args.project), "revisions", args.revision);
  if (!fs.existsSync(revisionDir)) fail(3, `no such revision: ${revisionDir}`);

  const candidates = fs
    .readdirSync(revisionDir)
    .filter((name) => name.endsWith(".java") && !/Test\.java$/i.test(name))
    .map((name) => ({ name, size: fs.statSync(path.join(revisionDir, name)).size }))
    .sort((a, b) => b.size - a.size);

  if (candidates.length === 0) fail(1, `no generated template (.java) in ${revisionDir}`);
  return path.join(revisionDir, candidates[0].name);
}

const file = templatePath();
if (!fs.existsSync(file)) fail(1, `no such file: ${file}`);
const source = fs.readFileSync(file, "utf8");
const totalLines = source.split(/\r?\n/).length;

let result;
if (args.command === "outline") {
  const found = methods(source).sort((a, b) => a.line - b.line);
  result = {
    file: path.basename(file),
    type: declaredType(source),
    lines: totalLines,
    methods: found.map(({ name, line, endLine, lines, signature, balanced }) => ({
      name,
      line,
      endLine,
      lines,
      signature,
      ...(balanced ? {} : { balanced: false }),
    })),
  };
} else if (args.command === "constants") {
  result = {
    file: path.basename(file),
    type: declaredType(source),
    lines: totalLines,
    constants: constants(source),
  };
} else {
  const cut = extract(source, args.name, { context: args.context });
  if (!cut) {
    const names = methods(source).map((m) => m.name);
    fail(
      1,
      `no method named ${JSON.stringify(args.name)} in ${path.basename(file)}. ` +
        `Declared: ${names.join(", ") || "(none)"}`,
    );
  }
  result = { file: path.basename(file), lines: totalLines, ...cut };
}

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

const banner = args.file ? null : describeWorkspaceLine(resolveWorkspace({ explicitRoot: args.root ?? null }));
if (banner) process.stdout.write(`${banner}\n\n`);

if (args.command === "outline") {
  process.stdout.write(`${result.file} — ${result.type ?? "?"}, ${result.lines} lines\n\n`);
  for (const method of result.methods) {
    process.stdout.write(
      `  ${String(method.line).padStart(5)}-${String(method.endLine).padEnd(5)} ` +
        `${String(method.lines).padStart(4)}L  ${method.name}` +
        `${method.balanced === false ? "  (unbalanced — read it whole)" : ""}\n`,
    );
  }
  process.stdout.write(`\n  node scripts/source.mjs symbol <name> --project … --revision …\n`);
} else if (args.command === "constants") {
  process.stdout.write(`${result.file} — ${result.constants.length} constants\n\n`);
  for (const constant of result.constants) {
    process.stdout.write(
      `  ${String(constant.line).padStart(5)}  ${constant.name} = ${constant.value}\n`,
    );
  }
} else {
  process.stdout.write(`${result.file}:${result.line}-${result.endLine}\n\n${result.text}\n`);
  if (result.balanced === false) {
    process.stderr.write(
      "[source] the closing brace was not found — this cut may be incomplete, so read the file\n",
    );
  }
}
process.exit(0);
