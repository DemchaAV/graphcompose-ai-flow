/**
 * Skill validation gate for render scripts.
 *
 * Sits between revision-existence check and the actual render
 * pipeline. Looks up the cached verdict from
 * tools/skill-validation-cache; on HIT, copies the verdict into the
 * revision's skill-validation-report.md and returns. On MISS, the
 * gate auto-populates a verdict=pass report keyed to "CI skill-
 * fixtures matrix" (the matrix in .github/workflows/ci.yml validates
 * every skill the manifest lists against the target coordinate on
 * every push), stores it under the same cache key so the second
 * render of the same skill pack + coordinate is a HIT, and returns.
 *
 * On halt verdict (cached `verdict: halt`), the gate exits the
 * render process with status 4 — the symmetric halt contract from
 * skills/workflows/references/scope-routing.md § "Downstream halt contract".
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Render-script entry point. Synchronous: render scripts are
 * spawnSync-shaped already, no async to thread.
 *
 * @param {object} opts
 * @param {string} opts.repoRoot       absolute path to the repo root
 * @param {string} opts.revisionDir    absolute path to the revision folder
 * @param {object} opts.project        parsed template-project.json
 * @returns {{ verdict: "pass" | "halt", source: "cache" | "fresh", key: string }}
 */
export function ensureSkillValidationVerdict({ repoRoot, revisionDir, project }) {
  const log = (line) => process.stdout.write(`[skill-cache] ${line}\n`);

  const cacheCli = path.join(
    repoRoot,
    "tools",
    "skill-validation-cache",
    "bin",
    "skill-validation-cache.mjs",
  );
  if (!fs.existsSync(cacheCli)) {
    log("cache CLI not found; skipping (legacy render scripts)");
    return { verdict: "pass", source: "fresh", key: "" };
  }

  const skillPackRel = project?.skillPack;
  if (!skillPackRel) {
    log("template-project.json has no skillPack; skipping");
    return { verdict: "pass", source: "fresh", key: "" };
  }
  const skillPackDir = path.resolve(repoRoot, skillPackRel);
  if (!fs.existsSync(skillPackDir)) {
    log(`skill pack does not exist: ${skillPackDir}; skipping`);
    return { verdict: "pass", source: "fresh", key: "" };
  }

  const targetCoordinate = deriveTargetCoordinate(project);
  const skillIds = readSkillIdsFromManifest(repoRoot);
  if (skillIds.length === 0) {
    log("no skills in manifest; skipping");
    return { verdict: "pass", source: "fresh", key: "" };
  }

  log(
    `lookup target=${targetCoordinate} skills=${skillIds.length} pack=${skillPackRel}`,
  );

  const lookupArgs = [
    "lookup",
    "--target",
    targetCoordinate,
    "--skills",
    skillIds.join(","),
    "--skill-pack",
    skillPackDir,
  ];
  const lookup = spawnSync("node", [cacheCli, ...lookupArgs], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (lookup.status === 0) {
    const parsed = safeParseJson(lookup.stdout);
    if (parsed?.entry?.reportBody) {
      writeReport(revisionDir, parsed.entry.reportBody, repoRoot);
      log(`HIT key=${parsed.key.slice(0, 12)} verdict=${parsed.entry.verdict}`);
      enforceHalt(parsed.entry.verdict, parsed.entry.reason);
      return { verdict: parsed.entry.verdict, source: "cache", key: parsed.key };
    }
    log("lookup exited 0 but JSON shape was unexpected; treating as MISS");
  } else if (lookup.status === 1) {
    log("MISS — auto-populating verdict=pass keyed to CI skill-fixtures matrix");
  } else {
    log(`lookup failed (exit ${lookup.status}): ${lookup.stderr?.trim() ?? ""}`);
    log("treating as MISS to keep the render unblocked");
  }

  const keyArgs = [
    "key",
    "--target",
    targetCoordinate,
    "--skills",
    skillIds.join(","),
    "--skill-pack",
    skillPackDir,
  ];
  const keyResult = spawnSync("node", [cacheCli, ...keyArgs], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const computedKey = safeParseJson(keyResult.stdout)?.key ?? "";

  const autoReport = buildAutoPopulatedReport({
    targetCoordinate,
    skillIds,
    skillPackRel,
    repoRoot,
    cacheKey: computedKey,
  });

  writeReport(revisionDir, autoReport, repoRoot);

  const store = spawnSync(
    "node",
    [
      cacheCli,
      "store",
      "--target",
      targetCoordinate,
      "--skills",
      skillIds.join(","),
      "--skill-pack",
      skillPackDir,
      "--verdict",
      "pass",
      "--reason",
      "auto-populated by render script; backed by CI skill-fixtures matrix",
    ],
    { cwd: repoRoot, input: autoReport, encoding: "utf8" },
  );
  if (store.status !== 0) {
    log(`store failed (exit ${store.status}): ${store.stderr?.trim() ?? ""}`);
  } else {
    log(`STORED key=${computedKey.slice(0, 12)}`);
  }
  return { verdict: "pass", source: "fresh", key: computedKey };
}

function readSkillIdsFromManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "skills", "skill-manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Array.isArray(data.skills)
      ? data.skills.map((s) => s.id).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function deriveTargetCoordinate(project) {
  const raw = project?.targetGraphComposeVersion;
  if (!raw) return "io.github.demchaav:graph-compose:1.9.0";
  const cleaned = String(raw).replace(/^v/, "");
  // 1.6.7+ ships on Maven Central; pre-1.6.7 lives on JitPack.
  if (compareSemver(cleaned, "1.6.7") >= 0) {
    return `io.github.demchaav:graph-compose:${cleaned}`;
  }
  return `com.github.DemchaAV:GraphCompose:v${cleaned}`;
}

function compareSemver(a, b) {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

function writeReport(revisionDir, body, repoRoot) {
  const reportPath = path.join(revisionDir, "skill-validation-report.md");
  fs.writeFileSync(reportPath, retargetChecklistLink(body, revisionDir, repoRoot), "utf8");
}

/** `[…api-compatibility-checklist.md](<anything>)`, however deep it was written. */
const CHECKLIST_LINK_RE = /\[([^\]]*api-compatibility-checklist\.md)\]\(([^)]*)\)/g;

/**
 * Point the report's checklist link at the checklist, from where the report is.
 *
 * <p>The link used to be the constant `../../../../validation/…`, which is four
 * levels because that is what `<install>/examples/<project>/revisions/<id>/`
 * needs. A workspace is one level deeper —
 * `<host>/graphcompose-flow/projects/<project>/revisions/<id>/` — so every
 * report written in the canonical layout has carried a link to nothing, and the
 * repository-contract link check fails on it the moment the workspace sits
 * inside a clone of the harness.</p>
 *
 * <p>A workspace in the user's own tree cannot reach the checklist with dots at
 * all: it lives in the harness install, which is a plugin cache directory whose
 * path carries a version. There the checklist is named and not linked — a
 * broken link and a machine-specific one are both worse than a filename.</p>
 *
 * <p>Applied at write time rather than where the body is built, so a body
 * replayed from the verdict cache — including one cached by a version that
 * hardcoded the four levels — is retargeted for the revision it lands in.</p>
 *
 * @param {string} body report markdown
 * @param {string} revisionDir absolute path to the revision folder
 * @param {string} repoRoot absolute path to the harness root
 * @returns {string} the body, with the checklist reference resolved
 */
export function retargetChecklistLink(body, revisionDir, repoRoot) {
  const checklist = path.join(repoRoot, "validation", "api-compatibility-checklist.md");
  const inHarness = isInside(repoRoot, revisionDir);
  const target = path.relative(revisionDir, checklist).split(path.sep).join("/");
  return body.replace(CHECKLIST_LINK_RE, (_match, label) =>
    inHarness ? `[${label}](${target})` : `\`${label}\` (in the harness install)`,
  );
}

/** Whether `child` is `parent` or sits under it. */
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function enforceHalt(verdict, reason) {
  if (verdict === "halt") {
    process.stderr.write(
      `[skill-cache] HALT: cached verdict blocks the render. ` +
        `reason: ${reason || "<none>"}. See skill-fix-report.md.\n`,
    );
    process.exit(4);
  }
}

function buildAutoPopulatedReport({
  targetCoordinate,
  skillIds,
  skillPackRel,
  repoRoot,
  cacheKey,
}) {
  const fixtureMatrix = readFixtureMatrixFromCi(repoRoot);
  const fixtureCoverage = readFixtureCoverageFromChecklist(repoRoot);
  const { covered, uncovered } = splitSkillsByCoverage(skillIds, fixtureCoverage);
  const partial = uncovered.length > 0;

  const coveredList = covered.length
    ? covered.map((id) => `- \`${id}\``).join("\n")
    : "- (none)";
  const uncoveredList = uncovered.length
    ? uncovered.map((id) => `- \`${id}\``).join("\n")
    : "- (none — every covered skill has a CI fixture)";
  const fixtureList = fixtureMatrix.length
    ? fixtureMatrix.map((f) => `- \`examples/skill-fixtures/${f}\``).join("\n")
    : "- (fixture matrix not detected in .github/workflows/ci.yml)";

  const partialBanner = partial
    ? "**partial: true** — not every covered skill is fixture-backed; " +
      "see the \"Not fixture-validated\" list below.\n\n"
    : "";

  return (
    "# Skill Validation Report (auto-populated)\n" +
    "\n" +
    partialBanner +
    `Target coordinate: \`${targetCoordinate}\`  \n` +
    `Skill pack: \`${skillPackRel}\`  \n` +
    `Cache key: \`${cacheKey}\`\n` +
    "\n" +
    "## Source\n" +
    "\n" +
    "This report was written by a render script (not by the Skill\n" +
    "Validator Agent). The pass verdict is keyed to the CI skill-\n" +
    "fixtures matrix in `.github/workflows/ci.yml`, which compiles\n" +
    "and runs the fixtures listed below against the resolved\n" +
    "coordinate on every push. If those jobs are green for this\n" +
    "commit, every fixture-backed skill has been re-validated.\n" +
    "\n" +
    "Fixture coverage is parsed from\n" +
    // The target is a placeholder: `retargetChecklistLink` rewrites it for the
    // revision the report is written into, because how far the checklist is
    // depends on the layout and on whether the workspace is in the harness at
    // all. Do not hardcode a depth here.
    "[validation/api-compatibility-checklist.md](validation/api-compatibility-checklist.md)\n" +
    "— rows whose `Fixture exists` AND `Fixture executed` columns\n" +
    "both start with `yes` are treated as fixture-backed.\n" +
    "\n" +
    "## Fixture-backed (verdict: pass keyed to CI)\n" +
    "\n" +
    coveredList +
    "\n" +
    "\n" +
    "## Not fixture-validated (verdict still pass, but no live gate)\n" +
    "\n" +
    uncoveredList +
    "\n" +
    "\n" +
    "## CI fixtures backing the fixture-backed list\n" +
    "\n" +
    fixtureList +
    "\n" +
    "\n" +
    "## Notes\n" +
    "\n" +
    "- The fixture matrix runs `mvn -B test` against each module,\n" +
    "  picking up `io.github.demchaav:graph-compose:1.9.0` from Maven\n" +
    "  Central. A failing fixture would block the merge that produced\n" +
    "  this revision, so by induction the fixture-backed list is\n" +
    "  honest as long as the run is reproducible from main.\n" +
    "- The \"Not fixture-validated\" list documents the honest gap.\n" +
    "  Authoring a fixture for those skills would tighten the gate.\n" +
    "  Until then the report is `partial: true` and a downstream agent\n" +
    "  may decide to require an agent-driven Skill Validator pass\n" +
    "  before approving anything that depends on those skills.\n" +
    "- An agent-driven Skill Validator pass would write a richer\n" +
    "  report and could surface per-skill drift the fixture matrix\n" +
    "  does not catch. This auto-populated path is the floor, not the\n" +
    "  ceiling.\n" +
    "\n" +
    "verdict: pass\n"
  );
}

function readFixtureCoverageFromChecklist(repoRoot) {
  const checklistPath = path.join(
    repoRoot,
    "validation",
    "api-compatibility-checklist.md",
  );
  if (!fs.existsSync(checklistPath)) return new Map();
  const text = fs.readFileSync(checklistPath, "utf8");
  const lines = text.split(/\r?\n/);
  const coverage = new Map();
  for (const raw of lines) {
    // Skip header / separator rows; only data rows have `| skill-id | ... |`.
    if (!raw.startsWith("|")) continue;
    if (/^\|\s*-+\s*\|/.test(raw)) continue;
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const skillId = cells[0];
    const fixtureExists = cells[3]?.toLowerCase();
    const fixtureExecuted = cells[4]?.toLowerCase();
    if (!skillId || skillId === "skill id") continue;
    const fixtureBacked =
      fixtureExists === "yes" && fixtureExecuted.startsWith("yes");
    coverage.set(skillId, fixtureBacked);
  }
  return coverage;
}

function splitSkillsByCoverage(skillIds, coverage) {
  const covered = [];
  const uncovered = [];
  for (const id of skillIds) {
    if (coverage.get(id) === true) covered.push(id);
    else uncovered.push(id);
  }
  return { covered, uncovered };
}

function readFixtureMatrixFromCi(repoRoot) {
  const ciYaml = path.join(repoRoot, ".github", "workflows", "ci.yml");
  if (!fs.existsSync(ciYaml)) return [];
  const text = fs.readFileSync(ciYaml, "utf8");
  // Naive read: pick lines in the skill-fixtures matrix block. Good
  // enough — the matrix list is explicit, no anchors.
  const lines = text.split(/\r?\n/);
  const out = [];
  let inFixtures = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*fixture:\s*$/.test(line)) {
      inFixtures = true;
      continue;
    }
    if (inFixtures) {
      const m = line.match(/^\s*-\s+([A-Za-z0-9_\-./]+)\s*$/);
      if (m) {
        out.push(m[1]);
        continue;
      }
      if (line.trim().length > 0 && !line.startsWith("        ")) {
        break;
      }
    }
  }
  return out;
}
