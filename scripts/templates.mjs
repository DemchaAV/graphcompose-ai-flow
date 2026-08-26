#!/usr/bin/env node
/**
 * scripts/templates.mjs — what has been published, and how do I use it?
 *
 *   node scripts/templates.mjs                       list every published bundle
 *   node scripts/templates.mjs inspect <template-id> everything needed to use one
 *
 * A bundle under `templates/` is the end of the expensive half of the
 * lifecycle: a model looked at a reference, wrote a template, and iterated until
 * a human approved it. Everything after that should be lookup. Until this
 * existed there was no lookup — nothing listed what had been published, and
 * answering "how do I use this one" meant opening `template.json`, then the
 * sources to find the package, then `data/` to find the example, then the
 * README to find the dependencies. Four files and a convention, to learn facts
 * the manifest already states.
 *
 * So: no model is called here, and nothing is inferred that the manifest or the
 * bundle does not already say. `--json` is the same answer for an agent, which
 * is the point — an agent asked to reuse a template should read one command's
 * output, not reconstruct the bundle by reading it.
 *
 * Exit: 0 listed/inspected · 1 the bundle is unreadable · 2 usage
 *       3 no such template
 */

import fs from "node:fs";
import path from "node:path";

import { describeWorkspaceLine, resolveWorkspace } from "./lib/workspace.mjs";
import { listBundles, readManifest, resourceProperty } from "./lib/template-bundle.mjs";
import { resolveDependencies } from "./lib/bundle-project.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/templates.mjs [inspect <template-id>] [--root <workspace>] [--json]\n\n" +
      "  (no arguments)       list every published bundle in the workspace\n" +
      "  inspect <id>         everything a consumer needs to use that bundle\n" +
      "  --root <dir>         workspace override (default: discovered)\n" +
      "  --json               machine-readable output\n\n" +
      "exit: 0 ok | 1 unreadable bundle | 2 usage | 3 no such template\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { command: "list", templateId: null, root: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--root") out.root = argv[++i];
    else if (a === "inspect" && out.command === "list") out.command = "inspect";
    else if (!a.startsWith("-") && !out.templateId) out.templateId = a;
    else {
      process.stderr.write(`[templates] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (out.command === "inspect" && !out.templateId) {
    process.stderr.write("[templates] inspect needs a template id\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

if (args.command === "inspect") inspect();
else list();

// ------------------------------------------------------------------- list ---

function list() {
  const bundles = listBundles(workspace.templatesDir);

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          templatesDir: workspace.templatesDir,
          templates: bundles.map((b) => (b.manifest ? summary(b.manifest) : { id: b.id, error: b.error })),
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }

  if (bundles.length === 0) {
    console.log("[templates] no published bundles in this workspace");
    console.log("[templates] approve a revision to publish one: node scripts/approve-and-publish.mjs --project <id>");
    process.exit(0);
  }

  console.log(`\nPublished templates (${bundles.length})\n`);
  for (const bundle of bundles) {
    if (!bundle.manifest) {
      console.log(`${bundle.id}`);
      console.log(`  UNREADABLE — ${bundle.error}\n`);
      continue;
    }
    const m = bundle.manifest;
    console.log(m.id);
    console.log(
      `  ${[m.displayName, m.docKind, m.pageCount ? `${m.pageCount} page${m.pageCount === 1 ? "" : "s"}` : null]
        .filter(Boolean)
        .join(" · ")}`,
    );
    console.log(
      `  GraphCompose ${m.graphComposeVersion ?? "unstated"} · bundle ${m.version}`,
    );
    if (m.sourceProject) {
      console.log(`  from ${m.sourceProject} ${m.sourceRevision ?? ""}`.trimEnd());
    }
    console.log("");
  }
  console.log("Use one:  node scripts/templates.mjs inspect <template-id>\n");
  process.exit(0);
}

/** The row a catalog prints, and the object an agent reads. */
function summary(m) {
  return {
    id: m.id,
    displayName: m.displayName,
    version: m.version,
    docKind: m.docKind,
    graphComposeVersion: m.graphComposeVersion,
    pageCount: m.pageCount,
    sourceProject: m.sourceProject,
    sourceRevision: m.sourceRevision,
  };
}

// ---------------------------------------------------------------- inspect ---

function inspect() {
  const bundleDir = path.join(workspace.templatesDir, args.templateId);
  if (!fs.existsSync(path.join(bundleDir, "template.json"))) {
    process.stderr.write(
      `[templates] no published bundle "${args.templateId}" in ${workspace.templatesDir}\n` +
        "[templates] list what is there: node scripts/templates.mjs\n",
    );
    process.exit(3);
  }

  let m;
  try {
    m = readManifest(bundleDir);
  } catch (cause) {
    process.stderr.write(`[templates] ${cause.message}\n`);
    process.exit(1);
  }

  // What a build file must declare — not what the manifest happens to list.
  // The two differ for a bundle whose manifest predates the fonts artifact
  // being separate, and the difference is a render failure, not a warning.
  const dependencies = resolveDependencies(m);
  const assets = countAssets(bundleDir, m.resources?.assets ?? null);
  const property = resourceProperty(bundleDir);

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...summary(m),
          bundleDir,
          entrypoint: m.entrypoint,
          data: m.data,
          resources: m.resources,
          resourceProperty: property,
          assets,
          fonts: m.fonts,
          dependencies: dependencies.map((d) => ({
            groupId: d.groupId,
            artifactId: d.artifactId,
            version: d.version,
            backfilled: d.backfilled === true,
          })),
          sourceCommit: m.sourceCommit,
          publishedAt: m.publishedAt,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }

  const out = [];
  out.push("", `${m.displayName ?? m.id}`, `${"─".repeat((m.displayName ?? m.id).length)}`, "");
  out.push(`id           ${m.id}`);
  out.push(`kind         ${m.docKind}${m.pageCount ? ` · ${m.pageCount} page${m.pageCount === 1 ? "" : "s"}` : ""}`);
  out.push(`version      bundle ${m.version} · GraphCompose ${m.graphComposeVersion ?? "unstated"}`);
  out.push(`bundle       ${bundleDir}`);

  out.push("", "Classes");
  out.push(`  template   ${m.entrypoint.templateClass}`);
  if (m.entrypoint.specClass) out.push(`  spec       ${m.entrypoint.specClass}`);
  if (m.entrypoint.providerClass) out.push(`  provider   ${m.entrypoint.providerClass}`);

  out.push("", "Data");
  out.push(
    m.data
      ? `  ${m.data.example}  →  copy to ${m.data.runtimeName} and edit that`
      : "  none — this template ships its content in Java",
  );

  out.push("", "Resources");
  if (assets.total === 0) {
    out.push("  none");
  } else {
    for (const [ext, count] of Object.entries(assets.byExtension)) {
      out.push(`  ${String(count).padStart(3)} ${ext}`);
    }
    if (m.resources?.manifest) out.push(`      ${m.resources.manifest} (icon resolution)`);
  }

  out.push("", "Fonts");
  if (!m.fonts || m.fonts.length === 0) {
    out.push("  not recorded");
  } else {
    for (const font of m.fonts) {
      const manual = font.registration && !["default-fonts", "standard14"].includes(font.registration);
      out.push(
        `  ${String(font.role).padEnd(10)} ${font.family ?? "?"}` +
          ` (${font.source ?? "?"}${manual ? ` — needs ${font.registration}` : ""})`,
      );
    }
  }

  out.push("", "Dependencies");
  for (const d of dependencies) {
    out.push(
      `  ${d.groupId}:${d.artifactId}:${d.version ?? "?"}` +
        (d.backfilled ? "   (not in the manifest; this line needs it)" : ""),
    );
  }

  out.push("", "Use it");
  out.push(...usageSnippet(m, property).map((line) => (line ? `  ${line}` : "")));
  if (property === "graphcompose.revision.dir") {
    out.push(
      "",
      "  This bundle reads the older property name. It is the harness's own",
      "  vocabulary leaking into published code, and it is not optional here:",
      "  the provider throws when the property is unset.",
    );
  }

  out.push("", "Published from");
  out.push(
    `  ${m.sourceProject ?? "?"} ${m.sourceRevision ?? ""}`.trimEnd() +
      (m.sourceCommit ? ` (harness ${m.sourceCommit.slice(0, 7)})` : ""),
  );
  if (m.publishedAt) out.push(`  ${m.publishedAt.slice(0, 10)}`);
  out.push("");

  console.log(out.join("\n"));
  process.exit(0);
}

/**
 * What the bundle ships, by extension.
 *
 * Counted rather than listed: the question `inspect` answers is "does this need
 * icons, images, fonts", and a hundred SVG filenames answers it worse than
 * "97 .svg" does.
 */
function countAssets(bundleDir, assetsRel) {
  const byExtension = {};
  let total = 0;
  if (!assetsRel) return { total, byExtension };
  const root = path.join(bundleDir, assetsRel);
  if (!fs.existsSync(root)) return { total, byExtension };

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        // The asset request is the input to resolution, not a shipped asset;
        // counting it as one implies the template draws it.
        if (entry.name === "asset-request.json") continue;
        const ext = path.extname(entry.name).toLowerCase() || "(no extension)";
        byExtension[ext] = (byExtension[ext] ?? 0) + 1;
        total += 1;
      }
    }
  };
  walk(root);
  return { total, byExtension };
}

/**
 * The call, from the classes this bundle actually publishes.
 *
 * Generated rather than written, so it cannot describe an API the bundle does
 * not have — a generic snippet in prose is exactly the thing that goes stale
 * without anything turning red.
 */
function usageSnippet(m, property) {
  const simple = (fq) => (fq ? fq.slice(fq.lastIndexOf(".") + 1) : null);
  const lines = [];
  if (property) {
    lines.push(`System.setProperty("${property}", "template");`, "");
  }
  lines.push(`try (DocumentSession session = GraphCompose.document(Path.of("${m.docKind}.pdf"))`);
  lines.push("        .pageSize(DocumentPageSize.A4)");
  lines.push("        .create()) {");
  lines.push("");
  if (m.entrypoint.providerClass) {
    lines.push(
      `    ${simple(m.entrypoint.specClass) ?? "var"} spec = ${simple(m.entrypoint.providerClass)}.create();`,
    );
    lines.push(`    new ${simple(m.entrypoint.templateClass)}().compose(session, spec);`);
  } else {
    lines.push(`    new ${simple(m.entrypoint.templateClass)}().compose(session);`);
  }
  lines.push("");
  lines.push("    session.buildPdf();");
  lines.push("}");
  // Only once that command exists. Advertising a script that is not on disk
  // yet reads as a broken install rather than as work in progress.
  if (fs.existsSync(new URL("./use-template.mjs", import.meta.url))) {
    lines.push("");
    lines.push("Or let the tooling write the whole project:");
    lines.push(`  node scripts/use-template.mjs ${m.id} --new-project ./my-${m.docKind}`);
  }
  return lines;
}
