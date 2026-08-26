#!/usr/bin/env node
/**
 * scripts/use-template.mjs — take a published bundle and make it yours.
 *
 *   node scripts/use-template.mjs <template-id> --target <existing-project>
 *   node scripts/use-template.mjs <template-id> --new-project <dir>
 *
 * This is the cheap half of the lifecycle, and it is cheap on purpose. Creating
 * the template was expensive: a model read a reference, wrote Java, rendered,
 * compared and iterated until a human approved it. Using the result is file
 * copying and five substitutions out of `template.json`. No model is called
 * here, nothing is inferred that the manifest does not state, and if this
 * command ever needs a judgement call that is a manifest bug to fix in the
 * publisher.
 *
 * Two modes, because Java developers arrive from two directions:
 *
 *   --target        copy the sources, assets and a runtime data file into a
 *                   project that already exists, then REPORT the dependencies
 *                   its build file is missing. It does not patch the build
 *                   file: editing someone's pom by pattern is how a working
 *                   build becomes a broken one, and the report is the part
 *                   that was actually hard to find out.
 *
 *   --new-project   write a whole runnable project — pom with the runner wired
 *                   to exec:java, Main.java, the bundle's classes, the data,
 *                   the assets, a README — and compile it before saying it
 *                   worked.
 *
 * Neither mode overwrites anything without --force.
 *
 * Exit: 0 done · 1 refused, or the generated project did not compile
 *       2 usage · 3 no such template
 */

import fs from "node:fs";
import path from "node:path";

import { describeWorkspaceLine, resolveWorkspace } from "./lib/workspace.mjs";
import { readManifest, resourceProperty } from "./lib/template-bundle.mjs";
import {
  JAVA_RELEASE,
  generateConsumerReadme,
  generateMainClass,
  generatePom,
  maven,
  resolveDependencies,
  stageResources,
  stageSources,
} from "./lib/bundle-project.mjs";

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/use-template.mjs <template-id> (--target <dir> | --new-project <dir>)\n" +
      "                                    [--root <workspace>] [--force] [--no-verify] [--json]\n\n" +
      "  --target <dir>        copy into an existing Java project and report what its\n" +
      "                        build file is missing\n" +
      "  --new-project <dir>   write a complete runnable Maven project\n" +
      "  --source-root <dir>   where Java sources live in --target (default: src/main/java)\n" +
      "  --resource-dir <dir>  where data and assets go, relative to the target\n" +
      "                        (default: template/<template-id>, or template/ for a new project)\n" +
      "  --root <workspace>    workspace holding the bundle (default: discovered)\n" +
      "  --force               overwrite files that are already there\n" +
      "  --no-verify           skip the compile check on --new-project\n" +
      "  --json                machine-readable result\n\n" +
      "exit: 0 done | 1 refused or did not compile | 2 usage | 3 no such template\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    templateId: null,
    target: null,
    newProject: null,
    sourceRoot: null,
    resourceDir: null,
    root: null,
    force: false,
    verify: true,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--force") out.force = true;
    else if (a === "--no-verify") out.verify = false;
    else if (a === "--target") out.target = argv[++i];
    else if (a === "--new-project") out.newProject = argv[++i];
    else if (a === "--source-root") out.sourceRoot = argv[++i];
    else if (a === "--resource-dir") out.resourceDir = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else if (!a.startsWith("-") && !out.templateId) out.templateId = a;
    else {
      process.stderr.write(`[use-template] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.templateId) {
    process.stderr.write("[use-template] a template id is required — see them with: node scripts/templates.mjs\n");
    usage(2);
  }
  // Both would mean two different answers to "where does this go", and the
  // second would silently win.
  if (out.target && out.newProject) {
    process.stderr.write("[use-template] --target and --new-project are alternatives, not a pair\n");
    usage(2);
  }
  if (!out.target && !out.newProject) {
    process.stderr.write("[use-template] one of --target <dir> or --new-project <dir> is required\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const bundleDir = path.join(workspace.templatesDir, args.templateId);
if (!fs.existsSync(path.join(bundleDir, "template.json"))) {
  process.stderr.write(
    `[use-template] no published bundle "${args.templateId}" in ${workspace.templatesDir}\n` +
      "[use-template] list what is there: node scripts/templates.mjs\n",
  );
  process.exit(3);
}

let manifest;
try {
  manifest = readManifest(bundleDir);
} catch (cause) {
  process.stderr.write(`[use-template] ${cause.message}\n`);
  process.exit(1);
}

/** Everything written, relative to the target, for the report and for --json. */
const wrote = [];
const notes = [];
const record = (root, absolute) => wrote.push(path.relative(root, absolute).split(path.sep).join("/"));

if (args.newProject) newProject();
else target();

// ---------------------------------------------------------- new project ---

function newProject() {
  const dir = path.resolve(args.newProject);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0 && !args.force) {
    refuse(
      `${dir} is not empty. Pass --force to write into it anyway, or choose a new directory.`,
    );
  }
  fs.mkdirSync(dir, { recursive: true });

  const resourceDir = args.resourceDir ?? "template";
  const outputFile = `output/${manifest.docKind ?? "document"}.pdf`;

  const sources = stageSources(bundleDir, dir, { className: manifest.className });
  for (const file of sources.files) record(dir, path.join(sources.javaDir, file));

  const staged = stageResources(bundleDir, path.join(dir, resourceDir), manifest);
  for (const key of ["data", "assets", "manifest"]) {
    if (staged[key]) record(dir, path.join(dir, resourceDir, staged[key]));
  }

  const mainPath = path.join(dir, "src", "main", "java", "Main.java");
  writeFile(mainPath, generateMainClass(manifest, { templateDir: resourceDir, outputFile }));
  record(dir, mainPath);

  const pomPath = path.join(dir, "pom.xml");
  writeFile(
    pomPath,
    generatePom(manifest, {
      groupId: "com.example",
      artifactId: `${manifest.id}-starter`,
      version: "0.1.0-SNAPSHOT",
      mainClass: "Main",
    }),
  );
  record(dir, pomPath);

  const readmePath = path.join(dir, "README.md");
  writeFile(readmePath, generateConsumerReadme(manifest, { templateDir: resourceDir, outputFile }));
  record(dir, readmePath);

  // The runner creates this itself on first run; making it here is so the tree
  // explains itself to whoever opens the directory before running anything.
  fs.mkdirSync(path.join(dir, path.dirname(outputFile)), { recursive: true });

  let verified = null;
  if (args.verify) {
    const compile = maven(["-q", "-B", "compile"], dir);
    verified = compile.status === 0;
    if (!verified) {
      report({ mode: "new-project", dir, resourceDir, outputFile, verified });
      process.stderr.write("[use-template] the generated project does not compile:\n");
      for (const line of `${compile.stdout ?? ""}${compile.stderr ?? ""}`
        .split(/\r?\n/)
        .filter((l) => /ERROR|error:/.test(l))
        .slice(-10)) {
        process.stderr.write(`  ${line.trim()}\n`);
      }
      process.exit(1);
    }
  }

  report({ mode: "new-project", dir, resourceDir, outputFile, verified });
  process.exit(0);
}

// -------------------------------------------------------------- target ---

function target() {
  const dir = path.resolve(args.target);
  if (!fs.existsSync(dir)) refuse(`${dir} does not exist. To create a project, use --new-project instead.`);

  const build = findBuildFile(dir);
  const sourceRoot = args.sourceRoot
    ? path.resolve(dir, args.sourceRoot)
    : path.join(dir, "src", "main", "java");
  // A directory with neither a build file nor a source tree is not a Java
  // project, and creating src/main/java inside it would be this command
  // deciding what the user's project is.
  if (!build && !fs.existsSync(sourceRoot)) {
    refuse(
      `${dir} has no pom.xml, build.gradle or src/main/java — this does not look like a Java project. ` +
        "Pass --source-root <dir> if the sources live somewhere else, or use --new-project.",
    );
  }

  const resourceDir = args.resourceDir ?? path.posix.join("template", manifest.id);

  // Refuse before writing anything, not halfway through: a partial copy leaves
  // a project that neither has the template nor is as it was.
  const pkgDir = manifest.entrypoint.templateClass?.includes(".")
    ? path.join(sourceRoot, ...manifest.entrypoint.templateClass.split(".").slice(0, -1))
    : sourceRoot;
  const clashes = [];
  const srcDir = path.join(bundleDir, "src");
  for (const file of fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => f.endsWith(".java")) : []) {
    if (fs.existsSync(path.join(pkgDir, file))) clashes.push(path.join(pkgDir, file));
  }
  const resourceTarget = path.join(dir, resourceDir);
  if (fs.existsSync(resourceTarget) && fs.readdirSync(resourceTarget).length > 0) clashes.push(resourceTarget);
  if (clashes.length > 0 && !args.force) {
    refuse(
      `${clashes.length} path(s) already exist:\n` +
        clashes.map((c) => `  ${c}`).join("\n") +
        "\nPass --force to overwrite, or --source-root / --resource-dir to put this copy elsewhere.",
    );
  }

  const sources = stageSources(bundleDir, dir, { className: manifest.className, javaRoot: sourceRoot });
  for (const file of sources.files) record(dir, path.join(sources.javaDir, file));

  const staged = stageResources(bundleDir, resourceTarget, manifest);
  for (const key of ["data", "assets", "manifest"]) {
    if (staged[key]) record(dir, path.join(resourceTarget, staged[key]));
  }

  const missing = missingDependencies(build);
  const java = javaReleaseOf(build);
  report({ mode: "target", dir, resourceDir, build, missing, java });
  process.exit(0);
}

/**
 * Whether the target compiles at a release that can parse these sources.
 *
 * Found the hard way: a project whose pom sets no compiler release gets Maven's
 * default of `-source 8`, the copied template uses records, and the build fails
 * with "records are not supported" — after the consumer has followed a report
 * that said only "add this dependency". A report that is followed and still
 * does not compile is worse than no report.
 *
 * @returns {{declared: number|null, sufficient: boolean}}
 */
function javaReleaseOf(build) {
  if (!build) return { declared: null, sufficient: false };
  const patterns = [
    /<maven\.compiler\.release>\s*(\d+)\s*</,
    /<maven\.compiler\.source>\s*(?:1\.)?(\d+)\s*</,
    /<release>\s*(\d+)\s*</,
    /<java\.version>\s*(?:1\.)?(\d+)\s*</,
    /sourceCompatibility\s*=?\s*['"]?(?:1\.)?(\d+)/,
    /JavaLanguageVersion\.of\((\d+)\)/,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(build.text);
    if (found) {
      const declared = Number(found[1]);
      return { declared, sufficient: declared >= JAVA_RELEASE };
    }
  }
  return { declared: null, sufficient: false };
}

/** The project's build file, or null when it has none. */
function findBuildFile(dir) {
  for (const name of ["pom.xml", "build.gradle.kts", "build.gradle"]) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return { name, path: full, text: fs.readFileSync(full, "utf8") };
  }
  return null;
}

/**
 * Which of the bundle's dependencies the target does not declare.
 *
 * Matched on group and artifact rather than on the whole coordinate, because
 * the version may legitimately differ and a project that already pins
 * GraphCompose does not need to be told to add it again. The version it pins is
 * reported separately when it is not the one the bundle was published against —
 * a fact worth knowing, not a failure to declare.
 */
function missingDependencies(build) {
  const required = resolveDependencies(manifest);
  if (!build) {
    return required.map((d) => ({ ...d, declaredVersion: null }));
  }
  const out = [];
  for (const dep of required) {
    const declared = declaredVersionOf(build.text, dep);
    if (declared === undefined) {
      out.push({ ...dep, declaredVersion: null });
    } else if (declared && dep.version && declared !== dep.version) {
      notes.push(
        `${dep.groupId}:${dep.artifactId} is declared as ${declared}; this bundle was published against ${dep.version}.`,
      );
    }
  }
  return out;
}

/**
 * The version the build file declares for a coordinate, `undefined` when it
 * does not declare it at all, and `null` when it declares it without a literal
 * version (a BOM, a property, a version catalog).
 */
function declaredVersionOf(text, dep) {
  const g = dep.groupId.replace(/[.\\]/g, "\\$&");
  const a = dep.artifactId.replace(/[.\\]/g, "\\$&");

  // Maven: <groupId>g</groupId> ... <artifactId>a</artifactId> ... <version>?
  const maven = new RegExp(
    `<groupId>\\s*${g}\\s*</groupId>\\s*<artifactId>\\s*${a}\\s*</artifactId>(?:\\s*<version>\\s*([^<]*)\\s*</version>)?`,
  ).exec(text);
  if (maven) return maven[1]?.trim() || null;

  // Gradle: "g:a:version" or "g:a"
  const gradle = new RegExp(`['"]${g}:${a}(?::([^'"]+))?['"]`).exec(text);
  if (gradle) return gradle[1]?.trim() || null;

  return undefined;
}

// -------------------------------------------------------------- reporting ---

function report(result) {
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          templateId: manifest.id,
          mode: result.mode,
          target: result.dir,
          resourceDir: result.resourceDir,
          wrote,
          notes,
          ...(result.mode === "new-project"
            ? { outputFile: result.outputFile, verified: result.verified }
            : {
                buildFile: result.build?.name ?? null,
                javaRelease: { required: JAVA_RELEASE, ...result.java },
                missingDependencies: result.missing.map((d) => ({
                  groupId: d.groupId,
                  artifactId: d.artifactId,
                  version: d.version,
                })),
              }),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const out = ["", `${manifest.displayName ?? manifest.id}  →  ${result.dir}`, ""];
  for (const file of wrote) out.push(`  wrote  ${file}`);

  if (result.mode === "new-project") {
    out.push("");
    out.push(result.verified === false ? "  DID NOT COMPILE" : result.verified ? "  compiles" : "  not compiled (--no-verify)");
    out.push("");
    out.push("Run it:");
    out.push(`  cd ${result.dir}`);
    out.push("  mvn -q compile exec:java");
    out.push("");
    out.push(
      manifest.data
        ? `Then edit ${result.resourceDir}/${manifest.data.runtimeName} and run again — new content is a data edit, not a Java edit.`
        : "This template ships its content in Java; there is no data file to edit.",
    );
    out.push("");
    console.log(out.join("\n"));
    return;
  }

  out.push("");
  if (result.missing.length === 0) {
    out.push(`  ${result.build?.name ?? "the build file"} already declares everything this template needs.`);
  } else {
    out.push(
      result.build
        ? `  ${result.build.name} is missing ${result.missing.length} dependenc${result.missing.length === 1 ? "y" : "ies"}:`
        : "  no build file found; this template needs:",
    );
    out.push("");
    out.push(...dependencySnippet(result.missing, result.build?.name).map((l) => `  ${l}`));
  }

  if (!result.java.sufficient) {
    out.push("");
    out.push(
      result.java.declared === null
        ? `  ${result.build?.name ?? "The build file"} sets no Java release. These sources use records, so`
        : `  ${result.build.name} compiles at Java ${result.java.declared}. These sources use records, so`,
    );
    out.push(`  they need ${JAVA_RELEASE} or later:`);
    out.push("");
    out.push(
      ...(result.build?.name?.startsWith("build.gradle")
        ? [`java { toolchain { languageVersion = JavaLanguageVersion.of(${JAVA_RELEASE}) } }`]
        : [
            "<properties>",
            `  <maven.compiler.release>${JAVA_RELEASE}</maven.compiler.release>`,
            "</properties>",
          ]
      ).map((l) => `  ${l}`),
    );
  }

  for (const note of notes) out.push("", `  note: ${note}`);

  // The property this bundle's own sources read, not the one the harness
  // prefers. Telling a consumer to set a name their template never looks up
  // produces a provider that throws with the property already set.
  const property = resourceProperty(result.dir) ?? resourceProperty(bundleDir);
  out.push("", "Wire it up:");
  if (property) {
    out.push(`  System.setProperty("${property}", "${result.resourceDir}");`);
    if (property === "graphcompose.revision.dir") {
      out.push("");
      out.push(
        "  That is the harness's own name, which this bundle was published with.",
        "  Newer templates read graphcompose.template.dir; setting both is safe.",
      );
    }
  } else {
    out.push("  Nothing to set — this template takes no data directory.");
  }
  out.push("");
  out.push("  See the exact call with:", `    node scripts/templates.mjs inspect ${manifest.id}`);
  out.push("");
  console.log(out.join("\n"));
}

/** The dependency block, in the syntax the target's build file actually uses. */
function dependencySnippet(missing, buildFileName) {
  if (buildFileName && buildFileName.startsWith("build.gradle")) {
    return missing.map((d) => `implementation("${d.groupId}:${d.artifactId}:${d.version ?? "RELEASE"}")`);
  }
  return missing.flatMap((d) => [
    "<dependency>",
    `  <groupId>${d.groupId}</groupId>`,
    `  <artifactId>${d.artifactId}</artifactId>`,
    `  <version>${d.version ?? "RELEASE"}</version>`,
    "</dependency>",
  ]);
}

// ------------------------------------------------------------------ util ---

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

function refuse(message) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ templateId: args.templateId, refused: message }, null, 2)}\n`);
  } else {
    process.stderr.write(`[use-template] ${message}\n`);
  }
  process.exit(1);
}
