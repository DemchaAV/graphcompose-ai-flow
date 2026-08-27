#!/usr/bin/env node
/**
 * scripts/test/version-resolver.test.mjs — reading the GraphCompose pin out of
 * a Java project's build file and mapping it to a skill pack.
 *
 * The case that matters most is the negative one: a version with no pack must
 * come back `unsupported`, never rounded down to the newest pack that happens
 * to exist. Authoring 2.2 code against a 1.9 allow-list produces calls that do
 * not compile, so a wrong answer here is worse than an honest gap.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  availableSkillPacks,
  compareVersions,
  describeArtifact,
  findBuildFile,
  readPinnedVersion,
  resolveVersion,
  versionLine,
} from "../lib/version-resolver.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcver-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function write(dir, name, contents) {
  fs.writeFileSync(path.join(dir, name), contents, "utf8");
  return path.join(dir, name);
}

const POM = (version) => `<project>
  <dependencies>
    <dependency>
      <groupId>io.github.demchaav</groupId>
      <artifactId>graph-compose</artifactId>
      <version>${version}</version>
    </dependency>
  </dependencies>
</project>
`;

test("versionLine reduces a pin to its major.minor line", () => {
  assert.equal(versionLine("1.9.0"), "1.9");
  assert.equal(versionLine("v2.2.0"), "2.2");
  assert.equal(versionLine("2.2.1-SNAPSHOT"), "2.2");
  assert.equal(versionLine("2.0.0-rc.1"), "2.0");
  assert.equal(versionLine("not-a-version"), null);
});

test("a Maven coordinate is read from pom.xml", () => {
  const dir = tempDir("maven");
  write(dir, "pom.xml", POM("1.9.0"));
  assert.deepEqual(readPinnedVersion(path.join(dir, "pom.xml")), {
    version: "1.9.0",
    coordinate: "io.github.demchaav:graph-compose",
  });
});

test("a version property is dereferenced", () => {
  const dir = tempDir("property");
  write(
    dir,
    "pom.xml",
    `<project>
  <properties>
    <graphcompose.version>2.2.0</graphcompose.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>io.github.demchaav</groupId>
      <artifactId>graph-compose</artifactId>
      <version>\${graphcompose.version}</version>
    </dependency>
  </dependencies>
</project>
`,
  );
  assert.equal(readPinnedVersion(path.join(dir, "pom.xml")).version, "2.2.0");
});

test("the real dependency wins over a dependencyManagement pin", () => {
  // A managed block states what a version WOULD be; the module may well use a
  // newer one. Taking the first match in the file handed back the older line.
  const dir = tempDir("managed");
  write(
    dir,
    "pom.xml",
    `<project>
  <dependencyManagement><dependencies><dependency>
    <groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId><version>1.6.0</version>
  </dependency></dependencies></dependencyManagement>
  <dependencies><dependency>
    <groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId><version>2.2.0</version>
  </dependency></dependencies>
</project>`,
  );
  assert.equal(readPinnedVersion(path.join(dir, "pom.xml")).version, "2.2.0");
});

test("a managed-only pin is still an answer, just the fallback one", () => {
  const dir = tempDir("managed-only");
  write(
    dir,
    "pom.xml",
    `<project>
  <dependencyManagement><dependencies><dependency>
    <groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId><version>2.2.0</version>
  </dependency></dependencies></dependencyManagement>
</project>`,
  );
  assert.equal(readPinnedVersion(path.join(dir, "pom.xml")).version, "2.2.0");
});

test("a commented-out dependency is not a dependency", () => {
  const dir = tempDir("commented");
  write(
    dir,
    "pom.xml",
    `<project>
  <!-- <dependency>
    <groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId><version>1.6.0</version>
  </dependency> -->
  <dependencies><dependency>
    <groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId><version>2.2.0</version>
  </dependency></dependencies>
</project>`,
  );
  assert.equal(readPinnedVersion(path.join(dir, "pom.xml")).version, "2.2.0");
});

test("a version property defined in a parent pom is reported as exactly that", () => {
  // Previously this said "declares no GraphCompose dependency", which sent the
  // reader to the wrong file: the dependency is right there, the property is not.
  const dir = tempDir("parent-property");
  write(
    dir,
    "pom.xml",
    `<project>
  <parent><groupId>com.example</groupId><artifactId>parent</artifactId><version>1.0</version></parent>
  <dependencies><dependency>
    <groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId>
    <version>\${graphcompose.version}</version>
  </dependency></dependencies>
</project>`,
  );

  const pinned = readPinnedVersion(path.join(dir, "pom.xml"));
  assert.equal(pinned.version, null);
  assert.equal(pinned.coordinate, "io.github.demchaav:graph-compose");
  assert.equal(pinned.unresolvedProperty, "${graphcompose.version}");

  const result = resolveVersion({ projectDir: dir, install: repoRoot });
  assert.equal(result.status, "unknown");
  assert.equal(result.coordinate, "io.github.demchaav:graph-compose");
  assert.doesNotMatch(
    result.message,
    /declares no GraphCompose dependency/,
    "the message still claims the dependency is absent when it is declared",
  );
  assert.match(result.message, /graphcompose\.version/);
  assert.match(result.message, /parent pom/);
});

test("the JitPack coordinate is recognised too", () => {
  const dir = tempDir("jitpack");
  write(
    dir,
    "pom.xml",
    `<project><dependencies><dependency>
      <groupId>com.github.DemchaAV</groupId>
      <artifactId>GraphCompose</artifactId>
      <version>v1.6.5</version>
    </dependency></dependencies></project>`,
  );
  const pinned = readPinnedVersion(path.join(dir, "pom.xml"));
  assert.equal(pinned.version, "v1.6.5");
  assert.equal(pinned.coordinate, "com.github.DemchaAV:GraphCompose");
});

test("Gradle build files are read as well", () => {
  for (const [name, contents] of [
    ["build.gradle.kts", 'dependencies {\n  implementation("io.github.demchaav:graph-compose:1.7.1")\n}\n'],
    ["build.gradle", "dependencies {\n  implementation 'io.github.demchaav:graph-compose:1.9.0'\n}\n"],
  ]) {
    const dir = tempDir("gradle");
    write(dir, name, contents);
    const pinned = readPinnedVersion(path.join(dir, name));
    assert.ok(pinned, `${name} produced no pin`);
    assert.match(pinned.version, /^1\.[79]\.\d$/);
  }
});

test("the build file is found by walking up from a nested directory", () => {
  const dir = tempDir("walkup");
  write(dir, "pom.xml", POM("1.9.0"));
  const nested = path.join(dir, "src", "main", "java", "com", "example");
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(findBuildFile(nested), path.join(dir, "pom.xml"));
  assert.equal(findBuildFile(tempDir("empty")), null);
});

test("a supported pin maps to a pack that exists on disk", () => {
  const dir = tempDir("supported");
  write(dir, "pom.xml", POM("1.9.0"));
  const result = resolveVersion({ projectDir: dir, install: repoRoot });
  assert.equal(result.status, "supported");
  assert.equal(result.version, "1.9.0");
  assert.equal(result.line, "1.9");
  assert.equal(result.skillPack, "skills/versions/graphcompose-1.9");
  assert.ok(fs.existsSync(path.join(repoRoot, result.skillPack)), "resolved pack is not on disk");
});

test("the current line resolves to the current pack", () => {
  const dir = tempDir("current");
  write(dir, "pom.xml", POM("2.2.0"));
  const result = resolveVersion({ projectDir: dir, install: repoRoot });
  assert.equal(result.status, "supported");
  assert.equal(result.line, "2.2");
  assert.equal(result.skillPack, "skills/versions/graphcompose-2.2");
});

test("a pin with no pack is unsupported, not rounded to the nearest one", () => {
  const dir = tempDir("unsupported");
  // A line ahead of every pack on disk: the resolver must stop rather than
  // hand back the newest pack it happens to have.
  write(dir, "pom.xml", POM("3.0.0"));
  const result = resolveVersion({ projectDir: dir, install: repoRoot });
  assert.equal(result.status, "unsupported");
  assert.equal(result.version, "3.0.0");
  assert.equal(result.skillPack, null, "an unsupported version was given a skill pack anyway");
  assert.match(result.message, /3\.0\.0/);
  assert.ok(result.availablePacks.includes("2.2"), "the available packs were not reported");
});

test("no build file and no GraphCompose dependency are both reported as unknown", () => {
  const bare = resolveVersion({ projectDir: tempDir("nobuild"), install: repoRoot });
  assert.equal(bare.status, "unknown");
  assert.match(bare.message, /pom\.xml/);

  const dir = tempDir("nodep");
  write(dir, "pom.xml", "<project><dependencies></dependencies></project>");
  const noDep = resolveVersion({ projectDir: dir, install: repoRoot });
  assert.equal(noDep.status, "unknown");
  assert.match(noDep.message, /no GraphCompose dependency/);
});

test("an explicit --version skips build-file detection", () => {
  const result = resolveVersion({ projectDir: tempDir("explicit"), install: repoRoot, version: "1.7.1" });
  assert.equal(result.status, "supported");
  assert.equal(result.skillPack, "skills/versions/graphcompose-1.7");
  assert.equal(result.buildFile, null);
});

test("a pack with prose but no generated allow-list says so before authoring starts", () => {
  // 1.6 and 1.7 predate the surface extraction. They resolve as supported —
  // correctly, the prose is real — and then `api-query`, which the workflow
  // requires before writing any call, dead-ends on a file nobody generated.
  // The resolver is the only place that knows early enough to warn.
  const prose = resolveVersion({ projectDir: tempDir("prose"), install: repoRoot, version: "1.7.1" });
  assert.equal(prose.status, "supported");
  assert.equal(prose.hasAllowList, false);
  assert.match(prose.message, /javap/, "the warning does not say how to verify a call instead");

  const generated = resolveVersion({ projectDir: tempDir("gen"), install: repoRoot, version: "2.2.0" });
  assert.equal(generated.hasAllowList, true);
  assert.equal(generated.message, undefined, "a pack that can answer should carry no warning");
});

test("api-query names the lines that can answer rather than only the one that cannot", () => {
  const cli = path.join(repoRoot, "scripts", "api-query.mjs");
  let stderr = "";
  try {
    execFileSync(process.execPath, [cli, "--version", "1.7", "--search", "table"], { stdio: "pipe" });
    assert.fail("a prose-only line answered a query");
  } catch (err) {
    stderr = err.stderr?.toString() ?? "";
  }
  assert.match(stderr, /lines that can answer: .*2\.2/);
  assert.match(stderr, /javap/);
});

test("the packs reported are the ones in skills/versions, newest line first", () => {
  const packs = availableSkillPacks(repoRoot);
  assert.ok(packs.length > 0, "no skill packs were found");

  for (const pack of packs) {
    assert.ok(fs.existsSync(path.join(repoRoot, pack.path)), `${pack.path} does not exist`);
  }

  const numeric = packs.map((pack) => pack.line.split(".").map(Number));
  for (let i = 1; i < numeric.length; i += 1) {
    const [prevMajor, prevMinor] = numeric[i - 1];
    const [major, minor] = numeric[i];
    assert.ok(
      prevMajor > major || (prevMajor === major && prevMinor > minor),
      `packs are not ordered newest first: ${packs[i - 1].line} came before ${packs[i].line}`,
    );
  }
});

test("the CLI exits 0 / 3 / 4 so a skill can branch without parsing prose", () => {
  const cli = path.join(repoRoot, "scripts", "resolve-version.mjs");
  const run = (args, cwd) => {
    try {
      const stdout = execFileSync(process.execPath, [cli, ...args], { cwd, stdio: "pipe" }).toString();
      return { code: 0, stdout };
    } catch (err) {
      return { code: err.status, stdout: err.stdout?.toString() ?? "" };
    }
  };

  const supported = tempDir("cli-ok");
  write(supported, "pom.xml", POM("1.9.0"));
  const ok = run(["--project-dir", supported, "--json"], repoRoot);
  assert.equal(ok.code, 0);
  assert.equal(JSON.parse(ok.stdout).skillPack, "skills/versions/graphcompose-1.9");

  const future = tempDir("cli-unsupported");
  write(future, "pom.xml", POM("3.0.0"));
  assert.equal(run(["--project-dir", future], repoRoot).code, 3, "unsupported did not exit 3");

  assert.equal(run(["--project-dir", tempDir("cli-unknown")], repoRoot).code, 4, "unknown did not exit 4");
});

// ---------------------------------------------------------------- identity ---

function fakeRepository(label, versions) {
  const root = tempDir(label);
  for (const [version, { jar = true, localInstall = false }] of Object.entries(versions)) {
    const dir = path.join(root, "io", "github", "demchaav", "graph-compose", version);
    fs.mkdirSync(dir, { recursive: true });
    if (jar) fs.writeFileSync(path.join(dir, `graph-compose-${version}.jar`), "PK", "utf8");
    if (localInstall) {
      fs.writeFileSync(path.join(dir, "maven-metadata-local.xml"), "<metadata/>", "utf8");
    }
  }
  return root;
}

test("a SNAPSHOT sorts before the release it leads up to", () => {
  assert.equal(compareVersions("2.2.1-SNAPSHOT", "2.2.1"), -1);
  assert.equal(compareVersions("2.2.2", "2.2.1"), 1);
  assert.equal(compareVersions("2.2.1", "2.2.1"), 0);
  assert.equal(compareVersions("v2.10.0", "2.9.9"), 1, "segments compare numerically, not as text");
});

test("a SNAPSHOT pin reports the releases already installed past it", () => {
  // The case this exists for: a run pinned 2.2.1-SNAPSHOT while 2.2.1 and 2.2.2
  // sat in the same repository, measured the engine against whatever jar carried
  // that name, and recorded what it saw as a fact about the released line.
  const repositoryRoot = fakeRepository("superseded", {
    "2.2.1-SNAPSHOT": { localInstall: true },
    "2.2.1": {},
    "2.2.2": {},
  });

  const artifact = describeArtifact({ version: "2.2.1-SNAPSHOT", repositoryRoot });

  assert.equal(artifact.mutable, true);
  assert.equal(artifact.origin, "local-install");
  assert.equal(artifact.identifiesOneBuild, false, "a SNAPSHOT names a build that can change");
  assert.deepEqual(artifact.supersededBy, ["2.2.2", "2.2.1"]);
  assert.match(artifact.message, /2\.2\.2, 2\.2\.1 are already installed/);
});

test("a released pin with a jar identifies one build and says nothing further", () => {
  const repositoryRoot = fakeRepository("release", { "2.2.2": {}, "2.2.1": {} });
  const artifact = describeArtifact({ version: "2.2.2", repositoryRoot });

  assert.equal(artifact.mutable, false);
  assert.equal(artifact.identifiesOneBuild, true);
  assert.deepEqual(artifact.supersededBy, []);
  assert.equal(artifact.message, null);
  assert.ok(artifact.jar.path.endsWith("graph-compose-2.2.2.jar"));
});

test("a pin nothing has resolved here says so rather than reporting a build", () => {
  const repositoryRoot = fakeRepository("absent", { "2.2.1": {} });
  const artifact = describeArtifact({ version: "2.2.2", repositoryRoot });

  assert.equal(artifact.jar, null);
  assert.match(artifact.message, /not in the local repository/);
  // Still one build: a release names immutable bits whether or not Maven has
  // fetched them onto this machine yet. Only a SNAPSHOT fails to.
  assert.equal(artifact.identifiesOneBuild, true);
});

test("resolveVersion carries the artifact, so one call answers pack and build", () => {
  const dir = tempDir("artifact-in-resolve");
  write(dir, "pom.xml", POM("2.2.0"));
  const resolved = resolveVersion({ projectDir: dir, install: repoRoot });

  assert.equal(resolved.status, "supported");
  assert.equal(resolved.artifact.version, "2.2.0");
  assert.equal(typeof resolved.artifact.identifiesOneBuild, "boolean");
});
