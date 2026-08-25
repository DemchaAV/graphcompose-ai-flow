#!/usr/bin/env node
/**
 * scripts/check-links.mjs — did the links in the data survive into the render?
 *
 *   node scripts/check-links.mjs --project <id> --revision <id> [--root <ws>] [--json]
 *
 * A dead link is the one defect the visual loop cannot see. The text renders,
 * the accent colour renders, the underline renders, and the pixel diff against
 * the reference is exactly zero — because a link annotation has no pixels. It
 * is found by a human clicking it, which in both acceptance runs happened after
 * the template was otherwise finished:
 *
 *   serif-headline-cv   revisions 001-010 rendered zero link annotations; the
 *                       four hrefs were already sitting in cv-data.json. They
 *                       went live in 011, the last revision, after the user
 *                       asked for them.
 *   navy-sidebar-cv     approved with zero links and no hrefs in the data at
 *                       all — the published bundle ships dead contact text.
 *
 * So there are two failures, one per stage, and this checks both:
 *
 *   declared but not rendered   the data says href, the PDF has no such target.
 *                               The Java drew the value as text and ignored the
 *                               href. This is a FAILURE — the contract is
 *                               explicit and the render broke it.
 *
 *   link-shaped but undeclared  a value reads as a URL or an email and no href
 *                               was recorded anywhere near it. The content
 *                               stage did not notice it was a link. This is a
 *                               WARNING — whether a given string should be
 *                               clickable is a judgement, and this tool does
 *                               not get to make it.
 *
 * exit: 0 clean (or nothing to check) | 1 a declared href is missing | 2 usage
 */

import fs from "node:fs";
import path from "node:path";

import { findDataFile } from "./lib/data-spec.mjs";
import { readPdfLinks, containsTarget } from "./lib/pdf-links.mjs";
import {
  describeWorkspaceLine,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-links.mjs --project <id> --revision <id> [--root <workspace>] [--json]\n\n" +
      "  --project <id>     the project\n" +
      "  --revision <id>    the revision whose output.pdf and data spec to compare\n" +
      "  --root <dir>       workspace override (default: discovered)\n" +
      "  --json             machine-readable result\n\n" +
      "exit: 0 clean or nothing to check | 1 a declared href is missing from the render | 2 usage\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else usage(2);
  }
  return out;
}

// --- what counts as a link ---------------------------------------------------

const TARGET_KEY = /^(href|url|uri|link|linkTo|target)$/i;
const HAS_SCHEME = /^(https?|mailto|tel):/i;
// Deliberately narrow. A URL or an email is unambiguous; a phone number, a
// street address and a bare company name are not, and warning about those
// trains the reader to ignore the warnings.
const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)\S+$/i;
const LOOKS_LIKE_BARE_URL = /^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S+$/i;
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const isDeclaredTarget = (value) =>
  HAS_SCHEME.test(value) || LOOKS_LIKE_URL.test(value) || LOOKS_LIKE_BARE_URL.test(value);
const isLinkShaped = (value) =>
  LOOKS_LIKE_URL.test(value) || LOOKS_LIKE_BARE_URL.test(value) || LOOKS_LIKE_EMAIL.test(value);

/**
 * Walk the data spec once, collecting both kinds of finding.
 *
 * "Near" means: in the same object. `{value: "github.com/x", href: "https://…"}`
 * is one link described twice, not one declared plus one undeclared — which is
 * why the candidate check looks at the sibling keys rather than at the string
 * alone.
 */
function scanData(root) {
  const declared = [];
  const candidates = [];

  // ctx carries what a bare string cannot know about itself: the key it was
  // filed under, and whether anything beside it already declared a target. An
  // array passes both down, so `"links": ["https://…"]` is judged the same way
  // `"link": "https://…"` is.
  const walk = (node, trail, ctx) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${trail}[${i}]`, ctx));
      return;
    }

    if (typeof node === "string") {
      if (ctx.key && TARGET_KEY.test(ctx.key) && isDeclaredTarget(node)) {
        declared.push({ at: trail, target: node });
      } else if (!ctx.siblingDeclares && isLinkShaped(node)) {
        candidates.push({ at: trail, value: node });
      }
      return;
    }

    if (!node || typeof node !== "object") return;

    const keys = Object.keys(node);
    const siblingDeclares = keys.some(
      (k) => TARGET_KEY.test(k) && typeof node[k] === "string" && isDeclaredTarget(node[k]),
    );
    for (const key of keys) {
      walk(node[key], trail ? `${trail}.${key}` : key, { key, siblingDeclares });
    }
  };

  walk(root, "", { key: null, siblingDeclares: false });
  return { declared, candidates };
}

/**
 * An href may be written without a scheme (`linkedin.com/in/x`), while the
 * renderer will have resolved it to an absolute URL. Accept either reading —
 * the point is whether the target reached the document, not how it was spelled.
 */
function targetVariants(target) {
  const trimmed = target.trim();
  if (HAS_SCHEME.test(trimmed)) return [trimmed];
  const bare = trimmed.replace(/^www\./i, "");
  return [trimmed, `https://${trimmed}`, `http://${trimmed}`, `https://www.${bare}`];
}

// --- run ---------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.revision) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);

const result = {
  project: args.project,
  revision: args.revision,
  checked: false,
  skipped: null,
  rendered: { uris: [], linkAnnotations: 0, unreadableTargets: 0 },
  missing: [],
  undeclared: [],
};

const pdfPath = path.join(revisionDir, "output.pdf");
const dataFile = fs.existsSync(revisionDir) ? findDataFile(projectDir, revisionDir) : null;

if (!fs.existsSync(pdfPath)) {
  result.skipped = "no output.pdf — render first";
} else if (!dataFile) {
  result.skipped = "no data spec to compare against";
} else {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (cause) {
    result.skipped = `data spec is not readable JSON (${cause.message})`;
  }
  if (data !== undefined) {
    result.checked = true;
    result.dataFile = path.basename(dataFile);
    result.rendered = readPdfLinks(pdfPath);

    const { declared, candidates } = scanData(data);
    result.declaredCount = declared.length;
    for (const entry of declared) {
      const found = targetVariants(entry.target).some((v) => containsTarget(result.rendered.uris, v));
      if (!found) result.missing.push(entry);
    }
    result.undeclared = candidates;
  }
}

const ok = result.missing.length === 0;

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.skipped) {
  console.log(`  links: not checked — ${result.skipped}`);
} else {
  console.log(
    `  links: ${result.rendered.linkAnnotations} annotation(s), ` +
      `${result.rendered.uris.length} distinct target(s) in ${path.basename(pdfPath)}; ` +
      `${result.declaredCount} declared in ${result.dataFile}`,
  );
  for (const m of result.missing) {
    console.log(`  MISSING  ${m.at} = ${m.target}`);
    console.log(`           declared in the data, absent from the render`);
  }
  for (const c of result.undeclared) {
    console.log(`  warn     ${c.at} = ${c.value}  (link-shaped, no href recorded)`);
  }
  if (ok && !result.undeclared.length && result.checked) console.log("  every declared link is live in the render");
  if (result.rendered.unreadableTargets) {
    console.log(`  note     ${result.rendered.unreadableTargets} link target(s) could not be read and were not judged`);
  }
  console.log("");
}

process.exit(ok ? 0 : 1);
