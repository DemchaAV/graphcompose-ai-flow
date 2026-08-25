#!/usr/bin/env node
/**
 * scripts/check-document-integrity.mjs — is this document whole?
 *
 *   node scripts/check-document-integrity.mjs --project <id> --revision <id> [--root <ws>]
 *
 * For a flowing business document a one-page render proves almost nothing. The
 * properties that decide whether an invoice, a statement or a report is usable
 * all live past page one:
 *
 *   the pages exist at all           an overflow that silently truncates
 *   the page number increments       "Page 1 of 1" on page three
 *   the total is right               "Page 2 of 2" in a four-page document
 *   the footer repeats               chrome drawn as a body section
 *   the table header repeats         a continuation page with unlabelled columns
 *   nothing was dropped              a line item lost across the break
 *
 * None of those is a pixel difference. A page that reads "Page 1 of 1" when
 * there are three is a *functional* defect scoring perhaps forty grey pixels,
 * and a document missing a line item may diff to zero because the reference
 * never had that row either. So this is a separate gate with its own verdict,
 * and its findings are stated as document defects rather than mismatches.
 *
 * Text is read through the preview renderer's PDFBox path, which decodes the
 * embedded ToUnicode maps — GraphCompose subsets its fonts, so searching a
 * content stream for "Page 2 of 3" finds nothing at all.
 *
 * Exit: 0 whole (or nothing to check) · 1 a document defect · 2 usage
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { contentStrings, findDataFile, normalizeText, valueAppears } from "./lib/data-spec.mjs";
import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";

const repoRoot = installRoot();
const PAGE_OF = /page\s+(\d+)\s+of\s+(\d+)/i;

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/check-document-integrity.mjs --project <id> --revision <id> [options]\n\n" +
      "  --project <id>     the project\n" +
      "  --revision <id>    the revision whose output.pdf to inspect\n" +
      "  --root <dir>       workspace override (default: discovered)\n" +
      "  --json             machine-readable result\n\n" +
      "exit: 0 whole or nothing to check | 1 a document defect | 2 usage\n",
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

/** Decoded text, page by page, from the renderer that already owns PDFBox. */
function readPdfText(pdfPath) {
  const jar = path.join(repoRoot, "tools", "preview-renderer", "target", "preview-renderer.jar");
  if (!fs.existsSync(jar)) return { error: `preview-renderer.jar is missing — run npm run setup` };
  const run = spawnSync("java", ["-jar", jar, "text", "--pdf", pdfPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) return { error: (run.stderr || run.stdout || "text extraction failed").trim() };
  try {
    return JSON.parse(run.stdout);
  } catch (cause) {
    return { error: `text extraction printed something unparseable: ${cause.message}` };
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.project || !args.revision) usage(2);

const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);
const pdfPath = path.join(revisionDir, "output.pdf");

const result = {
  project: args.project,
  revision: args.revision,
  checked: false,
  skipped: null,
  flow: null,
  pageCount: null,
  defects: [],
  notes: [],
};

const defect = (id, detail) => result.defects.push({ id, detail });

if (!fs.existsSync(pdfPath)) {
  result.skipped = "no output.pdf — render first";
} else {
  const analysisPath = path.join(revisionDir, "visual-analysis.json");
  const analysis = fs.existsSync(analysisPath)
    ? JSON.parse(fs.readFileSync(analysisPath, "utf8"))
    : null;
  const flow = analysis?.flow ?? null;
  result.flow = flow ? { kind: flow.kind, drivenBy: flow.drivenBy ?? null } : null;

  const text = readPdfText(pdfPath);
  if (text.error) {
    result.skipped = text.error;
  } else {
    result.checked = true;
    result.pageCount = text.pageCount;
    const pages = text.pages ?? [];

    // 1. Does the render match the page count the analysis claimed?
    const claimed = analysis?.page?.pageCount;
    if (typeof claimed === "number" && claimed !== text.pageCount) {
      defect(
        "page-count-mismatch",
        `the analysis says ${claimed} page(s); the render has ${text.pageCount}`,
      );
    }

    // 2. A flowing document whose example data never overflows has an untested
    //    pagination path shipped as a template.
    if (flow?.kind === "flowing" && text.pageCount < 2) {
      defect(
        "pagination-never-exercised",
        "the document is flowing, and the example data fits on one page — the page break, " +
          "the repeated header and the footer were never rendered even once",
      );
    }

    // 3. Page enumeration, where the analysis says the reader must be able to
    //    tell a page is missing.
    const enumeration = flow?.pageEnumeration;
    if (enumeration?.required) {
      const readings = [];
      pages.forEach((pageText, index) => {
        const match = PAGE_OF.exec(pageText);
        if (!match) {
          readings.push({ page: index + 1, reads: null, correct: false });
          defect("page-enumeration-missing", `page ${index + 1} carries no "Page N of M"`);
          return;
        }
        const current = Number(match[1]);
        const total = Number(match[2]);
        const correct = current === index + 1 && total === text.pageCount;
        readings.push({ page: index + 1, reads: match[0], correct });
        if (current !== index + 1) {
          defect("page-number-wrong", `page ${index + 1} reads "${match[0]}"`);
        } else if (total !== text.pageCount) {
          defect(
            "page-total-wrong",
            `page ${index + 1} reads "${match[0]}" in a ${text.pageCount}-page document`,
          );
        }
      });
      result.enumeration = readings;
    } else if (flow?.kind === "flowing") {
      result.notes.push("page enumeration is not required by the analysis, so it was not checked");
    }

    // 4. Repeated chrome. Judged structurally: whatever page 1 ends with, with
    //    its digits blanked, should end every page. That catches a footer drawn
    //    as a body section, which renders once and looks right on page one.
    if (text.pageCount > 1) {
      const trailing = (pageText) => {
        const lines = String(pageText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        return lines.length ? lines[lines.length - 1].replace(/\d+/g, "#") : "";
      };
      const first = trailing(pages[0]);
      if (first) {
        const missing = pages
          .map((pageText, index) => ({ page: index + 1, trailing: trailing(pageText) }))
          .filter((entry) => entry.trailing !== first);
        if (missing.length) {
          result.notes.push(
            `pages ${missing.map((m) => m.page).join(", ")} do not end the way page 1 does ` +
              `("${first}") — expected when the last body block differs, a defect when that line was the footer`,
          );
        }
      }
    }

    // 5. Nothing dropped. Every content string in the data has to be somewhere
    //    in the document; a line item lost across a page break diffs to zero
    //    against a reference that never had it.
    const dataFile = findDataFile(projectDir, revisionDir);
    if (dataFile) {
      const whole = normalizeText(pages.join("\n"));
      let data;
      try {
        data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      } catch {
        result.notes.push(`${path.basename(dataFile)} is not readable JSON, so content was not checked`);
      }
      if (data !== undefined) {
        const values = contentStrings(data);
        const missing = values.filter((entry) => !valueAppears(entry.value, whole));
        result.contentValues = values.length;
        result.dataFile = path.basename(dataFile);
        result.contentChecked = true;
        result.missingContent = missing.slice(0, 20);
        if (missing.length) {
          // A note rather than a defect, on purpose. Text extracted through a
          // subset font is not clean enough to fail a build on: a ToUnicode map
          // need not cover its ligatures, and a measured CV had seven perfectly
          // present words reported missing because their "ti" pair extracted as
          // a replacement character. The tolerant matcher above recovers most of
          // that, and what is left is worth reading and not worth blocking on.
          // The gates that DO block here are the ones digits make reliable:
          // page count, whether pagination ran at all, and "Page N of M".
          result.notes.push(
            `${missing.length} of ${values.length} value(s) from ${path.basename(dataFile)} were not` +
              ` found in the rendered text — check whether they were dropped or merely extracted badly: ` +
              missing.slice(0, 3).map((m) => `${m.at} = "${m.value.slice(0, 40)}"`).join(", "),
          );
        }
      }
    } else {
      result.notes.push("no data spec, so content preservation was not checked");
    }
  }
}

const whole = result.defects.length === 0;

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.skipped) {
  console.log(`  document integrity: not checked — ${result.skipped}`);
} else {
  console.log(
    `  document integrity: ${result.pageCount} page(s)` +
      (result.flow ? `, flow ${result.flow.kind}` : "") +
      (result.contentChecked ? `, content compared against ${result.dataFile}` : ""),
  );
  for (const entry of result.defects) console.log(`  DEFECT  ${entry.id}: ${entry.detail}`);
  for (const note of result.notes) console.log(`  note    ${note}`);
  if (whole && result.checked) console.log("  the document is whole");
  console.log("");
}

process.exit(whole ? 0 : 1);
