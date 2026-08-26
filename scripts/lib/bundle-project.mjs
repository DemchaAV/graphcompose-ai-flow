/**
 * scripts/lib/bundle-project.mjs — turn a published bundle into a buildable
 * Maven project, deterministically.
 *
 * This is the whole "zero-token" half of the lifecycle. Once a revision is
 * APPROVED and published, everything a consumer needs is already decided:
 * `template.json` names the classes, the data file, the assets and the
 * dependencies, so producing a project from it is string substitution and file
 * copying. Nothing here may ask a model anything, and nothing here may guess —
 * if a value is not in the manifest or on disk, that is a manifest bug to fix
 * in the publisher, not a judgement call to make here.
 *
 * All of it already existed, as private functions of
 * `scripts/verify-published-template.mjs`: it has been synthesising a project
 * from `template.json` alone and compiling the bundle against it since the
 * `--build` tier was added. That was the right code in the wrong place — the
 * one command that could turn a bundle into a project was the one command whose
 * output a consumer never sees. This module is that code, made reachable.
 *
 * The verifier and `use-template` therefore share one implementation, which is
 * the point: a bundle that verifies is a bundle that instantiates, because the
 * same functions did both.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bundlePackage, fqcn, normaliseDependencies } from "./template-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The static runner, expanded by `generateMainClass`. */
export const MAIN_TEMPLATE_PATH = path.join(HERE, "consumer-main.java.tpl");

/**
 * Which bundled-font artifact a GraphCompose line expects.
 *
 * Lifted from scripts/scaffold-runner.mjs, where it was written for the
 * authoring runner and needed by the consumer generator too. The fonts left the
 * core artifact at 1.8.0 and are versioned independently, so there is no
 * mapping to guess: 2.x pins fonts 1.1.0. A template that asks for
 * `FontName.LATO` without this on the classpath fails at render with "Bundled
 * font resource not found", which reads like a template bug and is not one.
 */
export function fontsVersionFor(graphComposeVersion) {
  if (!graphComposeVersion) return null;
  const [major, minor] = String(graphComposeVersion).split(".").map(Number);
  if (Number.isNaN(major)) return null;
  if (major > 1 || (major === 1 && minor >= 8)) return "1.1.0";
  return null; // before 1.8 the fonts are inside the core artifact
}

/**
 * The dependencies a build file must declare, as resolvable coordinates.
 *
 * The manifest is preferred in every case; the fonts artifact is the one thing
 * added when it is absent, and only for a line that needs it. A manifest
 * written before `readRunnerDependencies` started reading the real runner pom
 * lists graphcompose and jackson and nothing else, so a 2.x bundle generated
 * from it compiled and then failed at render — the failure this backfill exists
 * to prevent. An extra jar on the classpath is inert; a missing one is fatal.
 *
 * @param {object} manifest raw or normalised (`readManifest`) manifest
 */
export function resolveDependencies(manifest) {
  const declared = manifest?.dependencyList ?? normaliseDependencies(manifest?.dependencies);
  const graphCompose = declared.find((d) => d.coordinate === "io.github.demchaav:graph-compose");
  const hasFonts = declared.some((d) => d.coordinate === "io.github.demchaav:graph-compose-fonts");

  const fontsVersion = hasFonts ? null : fontsVersionFor(graphCompose?.version);
  if (!fontsVersion) return declared;

  return [
    ...declared,
    {
      groupId: "io.github.demchaav",
      artifactId: "graph-compose-fonts",
      version: fontsVersion,
      coordinate: "io.github.demchaav:graph-compose-fonts",
      key: "io.github.demchaav:graph-compose-fonts",
      assumedGroupId: false,
      backfilled: true,
    },
  ];
}

/**
 * A `pom.xml` built from the manifest and nothing else.
 *
 * That is deliberate rather than convenient: when the verifier compiles a
 * bundle against this, an incomplete `dependencies` block fails the build, which
 * is exactly the report wanted. A pom assembled from the source project's real
 * pom would compile whatever the manifest said.
 *
 * @param {object} manifest raw or normalised manifest
 * @param {object} [options]
 * @param {string} [options.groupId]
 * @param {string} [options.artifactId]
 * @param {string} [options.version]
 * @param {string} [options.mainClass] wires exec-maven-plugin to this class
 */
export function generatePom(manifest, options = {}) {
  const {
    groupId = "verify.bundle",
    artifactId = `${manifest?.id ?? "bundle"}-verify`,
    version = "0.0.1-SNAPSHOT",
    mainClass = null,
  } = options;

  const entries = resolveDependencies(manifest).map((d) =>
    [
      "    <dependency>",
      `      <groupId>${d.groupId}</groupId>`,
      `      <artifactId>${d.artifactId}</artifactId>`,
      `      <version>${d.version ?? "RELEASE"}</version>`,
      "    </dependency>",
    ].join("\n"),
  );

  // Only when a runner exists. A bundle staged for compilation has no main
  // class, and declaring one that is not there turns `mvn exec:java` into a
  // confusing failure instead of an honest "no goal configured".
  const execPlugin = mainClass
    ? [
        "  <build>",
        "    <plugins>",
        "      <plugin>",
        "        <groupId>org.codehaus.mojo</groupId>",
        "        <artifactId>exec-maven-plugin</artifactId>",
        "        <version>3.5.0</version>",
        "        <configuration>",
        `          <mainClass>${mainClass}</mainClass>`,
        "        </configuration>",
        "      </plugin>",
        "    </plugins>",
        "  </build>",
      ].join("\n")
    : null;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    "  <modelVersion>4.0.0</modelVersion>",
    `  <groupId>${groupId}</groupId>`,
    `  <artifactId>${artifactId}</artifactId>`,
    `  <version>${version}</version>`,
    "  <properties>",
    "    <maven.compiler.release>21</maven.compiler.release>",
    "    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>",
    "  </properties>",
    "  <dependencies>",
    entries.join("\n"),
    "  </dependencies>",
    ...(execPlugin ? [execPlugin] : []),
    "</project>",
    "",
  ].join("\n");
}

/**
 * Copy the bundle's Java sources into a Maven source tree at their own package.
 *
 * The package comes from the file the manifest names, falling back to the first
 * source — same rule `readManifest` uses to resolve `entrypoint.templateClass`,
 * so a project staged here and a manifest read there cannot disagree about
 * where the class lives.
 *
 * @returns {{package: string|null, javaDir: string, files: string[]}}
 */
export function stageSources(bundleDir, projectDir, { className = null } = {}) {
  const srcDir = path.join(bundleDir, "src");
  const files = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter((f) => f.endsWith(".java")).sort()
    : [];

  const pkg = bundlePackage(bundleDir, className);
  const javaRoot = path.join(projectDir, "src", "main", "java");
  const javaDir = pkg ? path.join(javaRoot, ...pkg.split(".")) : javaRoot;

  fs.mkdirSync(javaDir, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(javaDir, file));
  }
  return { package: pkg, javaDir, files };
}

/**
 * Copy what the template reads at render time into one directory.
 *
 * A template resolves its data file, its icons and its asset manifest against a
 * single root, so they are staged together rather than left in the shape a
 * bundle has. The example data is renamed to the runtime name here, because
 * that rename is the contract — a provider looks for `<kind>-data.json` and
 * would not find `<kind>-data.example.json` sitting beside it.
 *
 * @returns {{data: string|null, assets: string|null, manifest: string|null}}
 *          what was staged, relative to `targetDir`
 */
export function stageResources(bundleDir, targetDir, manifest) {
  fs.mkdirSync(targetDir, { recursive: true });
  const staged = { data: null, assets: null, manifest: null };

  const data = manifest?.data ?? null;
  if (data?.example) {
    const from = path.join(bundleDir, data.example);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(targetDir, data.runtimeName));
      staged.data = data.runtimeName;
    }
  }

  const resources = manifest?.resources ?? null;
  if (resources?.assets) {
    const from = path.join(bundleDir, resources.assets);
    if (fs.existsSync(from)) {
      copyTree(from, path.join(targetDir, resources.assets));
      staged.assets = resources.assets;
    }
  }
  if (resources?.manifest) {
    const from = path.join(bundleDir, resources.manifest);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(targetDir, resources.manifest));
      staged.manifest = resources.manifest;
    }
  }
  return staged;
}

/**
 * The runner, from the static template plus five names out of the manifest.
 *
 * `Main` lands in the default package and addresses the template by its
 * fully-qualified name, so no import needs to be computed and the file is
 * correct wherever the bundle's own package happens to be.
 *
 * @param {object} manifest normalised manifest (`readManifest`)
 * @param {object} [options]
 * @param {string} [options.templateDir] where data and assets were staged
 * @param {string} [options.outputFile]  default output path
 * @param {string} [options.pageSize]    a DocumentPageSize constant
 */
export function generateMainClass(manifest, options = {}) {
  const {
    templateDir = "template",
    outputFile = `output/${manifest?.docKind ?? "document"}.pdf`,
    pageSize = "A4",
  } = options;

  const templateClass = manifest?.entrypoint?.templateClass
    ?? fqcn(bundlePackage(manifest?.bundleDir ?? ".", manifest?.className), manifest?.className);
  if (!templateClass) {
    throw new Error(`${manifest?.id ?? "bundle"}: no template class to call — template.json names none`);
  }

  // A template that takes no spec composes against the session alone. Both
  // shapes are real, and the provider is what decides which: it is the thing
  // that loads the data file, so no provider means no data file to load.
  const provider = manifest?.entrypoint?.providerClass ?? null;
  const specType = manifest?.entrypoint?.specClass ?? null;
  const specDeclaration = provider
    ? `${specType ?? "var"} spec = ${provider}.create();\n\n            `
    : "";

  return expand(fs.readFileSync(MAIN_TEMPLATE_PATH, "utf8"), {
    DISPLAY_NAME: manifest?.displayName ?? manifest?.id ?? "document",
    TEMPLATE_ID: manifest?.id ?? "template",
    TEMPLATE_CLASS: templateClass,
    SPEC_DECLARATION: specDeclaration,
    SPEC_ARGUMENT: provider ? ", spec" : "",
    TEMPLATE_DIR: templateDir,
    RUNTIME_DATA_NAME: manifest?.data?.runtimeName ?? "(none — this template ships its content)",
    OUTPUT_FILE: outputFile,
    PAGE_SIZE: pageSize,
  });
}

/**
 * The starter project's README, from the manifest.
 *
 * Deliberately short. The bundle already ships a README written when the
 * template was approved, and that one carries the design notes; regenerating
 * anything like it here would produce a second, worse copy that drifts. This
 * says what this generated project is and how to run it, and points at the
 * other one.
 */
export function generateConsumerReadme(manifest, options = {}) {
  const { templateDir = "template", outputFile = `output/${manifest?.docKind ?? "document"}.pdf` } = options;
  const dependencies = resolveDependencies(manifest);

  const lines = [
    `# ${manifest?.displayName ?? manifest?.id}`,
    "",
    `A ${manifest?.docKind ?? "document"} starter generated from the published template ` +
      `\`${manifest?.id}\`${manifest?.version ? ` (${manifest.version})` : ""}. ` +
      "No part of it needs the GraphCompose harness at runtime: it is a plain Maven " +
      "project against GraphCompose.",
    "",
    "## Change the document",
    "",
    manifest?.data
      ? `Edit \`${templateDir}/${manifest.data.runtimeName}\`. The layout lives in ` +
        `\`${manifest.entrypoint?.templateClass}\` and rarely needs to change — new content ` +
        "is a data edit, not a Java edit."
      : "This template ships its content in Java; there is no data file to edit.",
    "",
    "## Run",
    "",
    "```bash",
    "mvn -q compile exec:java",
    "```",
    "",
    `The PDF is written to \`${outputFile}\`. Pass a path as the first argument to write elsewhere.`,
    "",
    "## Dependencies",
    "",
    "| groupId | artifactId | version |",
    "|---|---|---|",
    ...dependencies.map((d) => `| \`${d.groupId}\` | \`${d.artifactId}\` | ${d.version ?? "?"} |`),
    "",
  ];

  if (manifest?.sourceRevision) {
    lines.push(
      "## Provenance",
      "",
      `Published from \`${manifest.sourceProject}\` at \`${manifest.sourceRevision}\`` +
        `${manifest.graphComposeVersion ? `, against GraphCompose ${manifest.graphComposeVersion}` : ""}. ` +
        "The template's own README, in the published bundle, carries the design notes and known limitations.",
      "",
    );
  }
  return lines.join("\n");
}

/** Recursive file copy. Directories are created; nothing is deleted. */
export function copyTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyTree(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

/**
 * Run Maven.
 *
 * `mvn` is `mvn.cmd` on Windows and needs a shell there; getting that wrong
 * fails with ENOENT, which reads like Maven is not installed.
 */
export function maven(mvnArgs, cwd) {
  const command = process.platform === "win32" ? "mvn.cmd" : "mvn";
  return spawnSync(command, mvnArgs, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

/** `${NAME}` substitution, and nothing else — no expression evaluation. */
function expand(text, values) {
  return text.replace(/\$\{(\w+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}
