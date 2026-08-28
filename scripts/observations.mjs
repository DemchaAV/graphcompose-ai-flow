#!/usr/bin/env node
/**
 * scripts/observations.mjs — what we have learned about a GraphCompose line,
 * and whether it is still true.
 *
 *   node scripts/observations.mjs list [--version 2.2] [--json]
 *   node scripts/observations.mjs find <symbol> [--json]
 *   node scripts/observations.mjs show <id>
 *   node scripts/observations.mjs verify [--id <id>] [--version 2.2]
 *   node scripts/observations.mjs promote <id> --into <pack-file>
 *
 * The first acceptance run established three real behaviours of GraphCompose
 * 2.2 — a shape container painting its margin above its box, top-clamping an
 * over-tall child, a row refusing to nest in a row cell — and recorded them in
 * one CV's README. The next run would have paid for them again.
 *
 * An observation is evidence, deliberately NOT a skill. The skill packs are the
 * allow-list an agent authors against, and a behaviour seen once in one
 * document is not that. The path is: record it, let a probe re-confirm it, then
 * promote it on purpose. `verify` is what keeps the middle step honest — it
 * re-runs the probe and compares against the numbers recorded, so a library fix
 * retires an observation instead of leaving it to mislead.
 *
 * Exit codes: 0 fine, 1 an observation no longer holds, 2 usage.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describeWorkspaceLine, installRoot, resolveWorkspace } from "./lib/workspace.mjs";
import { describeArtifact, resolveVersion } from "./lib/version-resolver.mjs";
import {
  loadObservations,
  recordObservation,
  recordVerification,
} from "./lib/observation-store.mjs";

const repoRoot = installRoot();

/**
 * `show` printed a record that could not be trusted here. Distinct from 1 ("no
 * longer holds"), which is a measured verdict — this one means nobody has
 * measured it against this version at all. Matches preflight's 5.
 */
const EXIT_UNVERIFIED = 5;

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/observations.mjs <command> [options]\n\n" +
      "  list [--version <line>] [--json]   what is on record\n" +
      "  show <id>                          one observation in full\n" +
      "                                     exit: 0 trustworthy here | 1 no such id\n" +
      "                                           5 printed, but retired or from another line\n" +
      "  verify [--id <id>] [--record]      re-run the probes and compare\n" +
      "                                     exit: 0 held | 1 changed | 4 not measurable here\n" +
      "                                     --record files the verdict in verifiedAgainst[]\n" +
      "  record <file.json>                 file a new observation in this workspace\n" +
      "                                     exit: 0 written | 1 not a workspace, or not a record\n" +
      "  promote <id> --into <file>         fold a confirmed observation into a skill pack\n\n" +
      "  --root <workspace>                 where records are read from and written to\n" +
      "  --force                            with record: replace an existing id\n" +
      "  --version <line>                   the GraphCompose line to judge against\n" +
      "                                     (default: resolved from the current directory)\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage(2);

const command = argv[0];
const args = {
  id: null,
  version: null,
  json: false,
  into: null,
  positional: null,
  root: null,
  force: false,
  record: false,
  build: null,
};
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") args.json = true;
  else if (a === "--id") args.id = argv[++i];
  else if (a === "--version" || a === "-v") args.version = argv[++i];
  else if (a === "--into") args.into = argv[++i];
  else if (a === "--root") args.root = argv[++i];
  else if (a === "--force") args.force = true;
  else if (a === "--record") args.record = true;
  else if (a === "--build") args.build = argv[++i];
  else if (a.startsWith("--")) {
    process.stderr.write(`[observations] unknown argument: ${a}\n`);
    usage(2);
  } else args.positional = a;
}

// Which workspace's learned records to read, and the only place `record` will
// write. Resolved once so every command sees the same two roots.
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });

/**
 * Whether this record can be trusted as an answer *here*, or only as history.
 *
 * ## The failure this exists to stop
 *
 * `row-cannot-nest-in-row-cell` is marked `retired`, with a note reading "Lifted
 * in 2.2.1". A run pinned to **2.2.1-SNAPSHOT** read that, believed the
 * restriction was gone, authored nested rows, and the layout compiler refused.
 * The retirement cost an authoring pass and a recovery edit — and the note names
 * the very probe (`row-nesting`) that would have settled it in thirty seconds.
 *
 * A snapshot is not its release. `2.2.1-SNAPSHOT` is the line *before* 2.2.1
 * ships, so a fix "in 2.2.1" may or may not be in the jar on this machine. That
 * is the one distinction the reader most needs and is least likely to make.
 *
 * ## Why retirement is gated in both directions
 *
 * A retirement is a claim that behaviour *changed* — strictly stronger than the
 * observation it replaces, and made against one version at one moment. It can be
 * stale (the fix slipped) or premature (measured on a build that never shipped).
 * Either way it is the one confidence level that should never be read as settled
 * without a probe, so `retired` always gates regardless of version.
 *
 * ## Why a same-line version difference does not gate
 *
 * Observations are filed by line for a reason: a 2.2.0 finding is presumptively
 * about 2.2.x. Gating every patch-level difference would fire on seven of the
 * eight records on disk, and a check that cries wolf is a check somebody turns
 * off. Only a *different line* is a mismatch.
 *
 * @returns {{headline: string, detail: string}|null} null when it can be trusted
 */
function unverifiedHere(body, line) {
  const target = resolveTargetVersion();
  const probe = body.minimalReproduction?.probe ?? null;

  // An exact build match settles it, whatever the confidence says. `retired`
  // gates because a retirement is a claim made once against one version — but a
  // record that has actually been re-measured on *this* build is not a claim any
  // more, it is a measurement, and gating it would teach the reader to ignore
  // the gate. The version must match exactly, suffix included: 2.2.1-SNAPSHOT is
  // not 2.2.1, and that distinction is the whole reason this list exists.
  const measuredHere = (body.verifiedAgainst ?? []).find((v) => v.version === target.version);
  // `held` means the probe reproduced what the record CLAIMS. For a confirmed
  // record that settles it. For a retired one it says the opposite of settled:
  // what a retired record claims is the behaviour the retirement calls gone, so
  // reproducing it on this build means the retirement does not apply here. A
  // reader told "trustworthy" would read "fixed in 2.2.1" off a jar that has
  // just been measured not to have the fix — the exact failure the gate exists
  // to stop, arriving through the one path that skips it. So a retired record
  // that still reproduces falls through to the retirement gate below, which
  // then cites the measurement.
  const retiredButLiveHere =
    body.confidence === "retired" && measuredHere?.verdict === "held" ? measuredHere : null;
  if (measuredHere && !retiredButLiveHere) {
    if (measuredHere.verdict === "held") return null;
    return {
      headline: `"${body.id}" was re-measured on ${target.version} and did NOT hold.`,
      detail:
        `Checked ${measuredHere.on}${measuredHere.note ? `: ${measuredHere.note}` : "."}\n\n` +
        `This is a measurement, not a stale note — the behaviour changed. Read the record as ` +
        `history and do not build on it.`,
    };
  }
  const howToSettle = probe
    ? `Settle it here:\n  node scripts/probe.mjs ${probe}${target.line ? ` --version ${target.line}` : ""}\n` +
      `  node scripts/observations.mjs verify --id ${body.id}`
    : `This record names no probe, so it cannot be re-measured automatically.\n` +
      `Confirm it by hand before relying on it, or treat it as history.`;

  if (body.confidence === "retired") {
    const claimed = body.retiredNote?.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] ?? null;
    // The exact trap: the retirement names a release, and this machine is on a
    // pre-release of it.
    const snapshotCaveat =
      claimed && target.version && target.version.startsWith(`${claimed}-`)
        ? `\n\nThis matters here. The note says the behaviour changed in ${claimed}, and this project is ` +
          `pinned to ${target.version} — a snapshot precedes its release, so the change may not be in ` +
          `the jar on this machine.`
        : "";
    // Stronger than the caveat above, because it is a measurement rather than a
    // reading of the version string: the probe ran on this exact build and the
    // retired behaviour was still there.
    const measuredCaveat = retiredButLiveHere
      ? `\n\nThis is not a guess about ${target.version}: the probe was run against it on ` +
        `${retiredButLiveHere.on} and REPRODUCED the behaviour this record describes. The ` +
        `retirement does not apply to the jar this project resolves to. Treat the record as live ` +
        `and the workaround as current.`
      : "";
    return {
      headline: retiredButLiveHere
        ? `"${body.id}" is retired, but this build still shows it.`
        : `"${body.id}" is retired, and a retirement is a claim about a change — not a settled fact.`,
      detail:
        `Recorded against GraphCompose ${body.graphComposeVersion}` +
        (target.version ? `; this project resolves to ${target.version}` : "; this project's version did not resolve") +
        `.${snapshotCaveat}${measuredCaveat}\n\n${howToSettle}`,
    };
  }

  // Measured as changed on some OTHER build. Not the same thing as a
  // measurement here — the "did NOT hold" wording above belongs only to the
  // build actually measured — but a behaviour that differs between two builds
  // of one line is exactly what a reader must not take as settled. The case
  // this covers arrived with the build-aware probe: the LayerStack row escape
  // holds on released 2.2.2 and does not on a local 2.2.1-SNAPSHOT, and before
  // that could be measured the record read as a plain confirmed fact.
  //
  // Scoped to releases on purpose. A SNAPSHOT verdict is a property of one
  // machine's build — the same name is different code elsewhere — so it warns
  // the person who has that build (the exact match above) and nobody else.
  // A release is immutable and shared, so a change measured on one is a fact
  // about the line that everyone reading the record needs.
  const changedElsewhere = (body.verifiedAgainst ?? []).filter(
    (v) => v.verdict === "changed" && !/-SNAPSHOT$/i.test(String(v.version)),
  );
  if (changedElsewhere.length > 0) {
    const builds = changedElsewhere.map((v) => v.version).join(", ");
    return {
      headline: `"${body.id}" does not hold on every build of this line — measured as changed on ${builds}.`,
      detail:
        (target.version
          ? `Nobody has measured it on ${target.version}, which is what this project resolves to. `
          : "This project's version did not resolve, so nothing here says which build you have. ") +
        `A behaviour that differs between two builds of one line is a property of the build, not ` +
        `of the line, and cannot be read off the record.\n\n${howToSettle}`,
    };
  }

  if (target.line && line && target.line !== line) {
    return {
      headline: `"${body.id}" was recorded on the ${line} line, and this project is on ${target.line}.`,
      detail:
        `Behaviour is filed by line because that is the granularity at which it holds. ` +
        `Across lines it is history, not an answer.\n\n${howToSettle}`,
    };
  }

  return null;
}

/**
 * The GraphCompose this call is about, resolved the same way preflight resolves
 * it. Unresolved is reported as unresolved: a version check that invents a
 * target would gate on a guess, which is the failure mode inverted rather than
 * fixed.
 */
function resolveTargetVersion() {
  if (args.version) return { line: args.version, version: null };
  try {
    const resolved = resolveVersion({ projectDir: process.cwd(), install: repoRoot });
    return { line: resolved.line ?? null, version: resolved.version ?? null };
  } catch {
    return { line: null, version: null };
  }
}

/**
 * Every observation visible from here: what this workspace has learned, then
 * what the pack shipped. Two roots rather than one because the install tree is
 * a plugin version's payload — replaced wholesale on upgrade — and a finding
 * written into it does not survive the next release. One already did not.
 */
function load(version = null) {
  try {
    return loadObservations({ workspace, install: repoRoot, version });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (command === "record") {
  const file = args.positional;
  if (!file) usage(2);

  let body;
  try {
    body = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (cause) {
    process.stderr.write(`[observations] cannot read ${file}: ${cause.message}\n`);
    process.exit(1);
  }

  try {
    const written = recordObservation({ workspace, install: repoRoot, body, force: args.force });
    const banner = describeWorkspaceLine(workspace);
    if (banner) process.stdout.write(`${banner}\n`);
    process.stdout.write(
      `[observations] ${written.replaced ? "replaced" : "recorded"} ${body.id} ` +
        `(${body.graphComposeVersion}) -> ${written.file}\n` +
        (body.confidence === "confirmed"
          ? ""
          : `  confidence is ${body.confidence}: a reader will be told so, and \`verify\` is what` +
            " turns it into a measurement\n"),
    );
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (command === "list") {
  const all = load(args.version);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(all.map((o) => o.body), null, 2)}\n`);
    process.exit(0);
  }
  if (all.length === 0) {
    process.stdout.write("[observations] nothing on record\n");
    process.exit(0);
  }
  for (const { body, origin, shadows } of all) {
    const state = body.promotedTo ? `promoted -> ${body.promotedTo}` : body.confidence;
    // Where it came from is part of how much it is worth: a record this
    // workspace measured on this machine's build outranks a shipped one, and a
    // shipped one outlives the workspace. Saying neither leaves the reader to
    // guess which of two disagreeing records they are looking at.
    const source = origin === "workspace" ? "learned here" : "shipped";
    process.stdout.write(`  ${body.id}\n    ${body.graphComposeVersion} · ${state} · ${source}\n`);
    if (shadows) process.stdout.write(`    (stands in front of the shipped ${body.id})\n`);
    process.stdout.write(`    ${body.observedBehaviour.split(". ")[0]}.\n\n`);
  }
  process.exit(0);
}

if (command === "find") {
  // The lookup an agent actually has in hand: it is about to write
  // `DocumentTableCell.node(...)` and wants to know whether that call has a
  // history. Searching by id would need the answer to ask the question.
  const term = (args.positional ?? "").trim();
  if (!term) usage(2);
  const needle = term.toLowerCase();
  const hits = load(args.version).filter(({ body }) => {
    const haystack = [
      body.id,
      body.observedBehaviour,
      body.workaround ?? "",
      ...(body.api ?? []),
    ]
      .join(" ")
      .toLowerCase();
    // A bare symbol matches its qualified form and the other way round, so
    // "node", "DocumentTableCell.node" and "DocumentTableCell" all land.
    return haystack.includes(needle) || needle.split(".").some((part) => part.length > 3 && haystack.includes(part.toLowerCase()));
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ query: term, found: hits.length > 0, observations: hits.map((h) => h.body) }, null, 2)}\n`);
    process.exit(hits.length ? 0 : 3);
  }
  if (!hits.length) {
    process.stdout.write(`[observations] nothing on record about "${term}"\n`);
    process.exit(3);
  }
  for (const { body } of hits) {
    const defect = body.engineDefect?.isDefect ? "  ENGINE DEFECT" : "";
    process.stdout.write(`  ${body.id}  (${body.graphComposeVersion} · ${body.confidence}${defect})\n`);
    process.stdout.write(`    ${body.observedBehaviour.split(". ")[0]}.\n`);
    if (body.workaround) process.stdout.write(`    do instead: ${body.workaround.split(". ")[0]}.\n`);
    process.stdout.write(`    full: node scripts/observations.mjs show ${body.id}\n\n`);
  }
  process.exit(0);
}

if (command === "show") {
  const id = args.positional ?? args.id;
  if (!id) usage(2);
  const found = load().find((o) => o.body.id === id);
  if (!found) {
    process.stderr.write(`[observations] no observation with id "${id}"\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(found.body, null, 2)}\n`);

  // The record is printed either way — this is a signal, not a refusal. A reader
  // who wants the text still gets the text; what changes is that a caller
  // branching on the exit code cannot mistake "recorded once" for "true here".
  const doubt = unverifiedHere(found.body, found.line);
  if (!doubt) process.exit(0);
  process.stderr.write(`\n${"-".repeat(64)}\n[observations] ${doubt.headline}\n\n${doubt.detail}\n`);
  process.exit(EXIT_UNVERIFIED);
}

if (command === "verify") {
  const subjects = load(args.version).filter((o) => !args.id || o.body.id === args.id);
  if (subjects.length === 0) {
    process.stderr.write("[observations] nothing to verify\n");
    process.exit(args.id ? 1 : 0);
  }

  let stale = 0;
  let returned = 0;
  let unchecked = 0;
  /**
   * What this machine measured, filed against the build it measured on.
   * `verifiedAgainst[]` shipped a release ago and nothing ever wrote it, so
   * `show`'s gate was reading a field that was empty on every record.
   */
  const remember = (subject, verdict, measured, note) => {
    if (!args.record) return;
    // The build the probe reported, not one resolved separately here. The probe
    // is what ran against the classpath; anything else is a second opinion
    // about which version was on it, and that gap is the whole failure.
    const target = { version: measured ?? null };
    if (!target.version) {
      console.error("         the probe named no build, so there is nothing to file the verdict against");
      return;
    }
    // Which build that version string named here. For a release it is
    // decoration; for a SNAPSHOT it is the difference between a measurement and
    // a rumour, because the same name is different code on another machine.
    const artifact = describeArtifact({ version: target.version, hash: true });
    const identity = artifact?.jar
      ? {
          build: {
            sha1: artifact.sha1,
            bytes: artifact.jar.bytes,
            modified: artifact.jar.modified,
            origin: artifact.origin,
          },
        }
      : {};

    try {
      const written = recordVerification({
        workspace,
        install: repoRoot,
        subject,
        entry: {
          version: target.version,
          on: new Date().toISOString().slice(0, 10),
          verdict,
          ...(note ? { note } : {}),
          ...identity,
        },
      });
      console.log(
        `         recorded ${verdict} against ${target.version}` +
          `${written.copied ? " (copied into this workspace)" : ""}`,
      );
    } catch (error) {
      console.error(`         could not record the verdict: ${error.message}`);
    }
  };

  for (const subject of subjects) {
    const { body, file } = subject;
    const probe = body.minimalReproduction?.probe;
    if (!probe) {
      // An observation with no probe cannot be re-confirmed. That is a real
      // gap, not a pass.
      console.error(`  FAIL ${body.id}: no probe, so nothing can re-confirm it`);
      stale += 1;
      continue;
    }
    const line = body.graphComposeVersion.split(".").slice(0, 2).join(".");
    const run = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "scripts", "probe.mjs"),
        probe,
        "--version",
        line,
        ...(args.build ? ["--build", args.build] : []),
        "--json",
      ],
      { encoding: "utf8" },
    );
    if (run.status !== 0) {
      // The probe exists and could not run — a JDK, Maven and a compiled
      // diagnostics module are what it needs, and a machine without them knows
      // nothing about this record either way. Calling that "no longer holds"
      // reports a library change that was never measured, and on a CI job with
      // no toolchain it reported one for every observation on file.
      console.error(`  ????  ${body.id}: probe "${probe}" could not run here`);
      unchecked += 1;
      continue;
    }

    let result;
    try {
      result = JSON.parse(run.stdout);
    } catch {
      console.error(`  FAIL ${body.id}: probe "${probe}" printed something unparseable`);
      stale += 1;
      continue;
    }

    const differences = compare(body.probeResult ?? {}, result);

    // A retired observation is a record of something that STOPPED being true.
    // Demanding that it still hold is backwards: what is worth knowing about it
    // is the opposite — if the probe starts agreeing with it again, a behaviour
    // came back and the note explaining the retirement is now wrong.
    if (body.confidence === "retired") {
      if (differences.length === 0) {
        returned += 1;
        console.error(
          `  BACK ${body.id}: retired, but the probe agrees with it again — ` +
            `either it was retired in error or the behaviour returned`,
        );
        // A retirement is the claim most worth filing a build against, and this
        // branch used to `continue` before `remember` was ever reached — so
        // `--record` silently wrote nothing for exactly the record whose
        // build history decides whether a reader can trust the retirement. The
        // verdict means what it means everywhere else: `held` is "the probe
        // reproduced what this record claims", which on a retired record is the
        // interesting answer, not the boring one.
        remember(subject, "held", result.graphComposeVersion, "retired, but this build still shows it");
      } else {
        console.log(`  ret  ${body.id} (${probe}) — retired, and still not true`);
        remember(subject, "changed", result.graphComposeVersion, differences.join("; "));
      }
      continue;
    }

    if (differences.length === 0) {
      console.log(`  ok   ${body.id} (${probe})`);
      remember(subject, "held", result.graphComposeVersion);
    } else {
      stale += 1;
      console.error(`  FAIL ${body.id}: the probe no longer agrees with what was recorded`);
      for (const d of differences) console.error(`         ${d}`);
      remember(subject, "changed", result.graphComposeVersion, differences.join("; "));
      console.error(`         If the library changed, set confidence to "retired" in ${path.basename(file)}`);
    }
  }

  // Every subject lands in exactly one bucket, so the sentence cannot contradict
  // itself. It used to read "7 of 5 no longer hold", because a record that could
  // not be checked was counted as stale while the denominator excluded retired
  // ones.
  const retired = retiredCount(subjects);
  const checked = subjects.length - unchecked;
  const held = checked - stale - retired + Math.min(retired, unchecked);
  const summary = [
    // Nothing to say about holding when nothing was measured.
    checked === 0 ? null : stale === 0 ? `${Math.max(0, held)} observation(s) still hold` : `${stale} no longer hold`,
    retired ? `${retired} retired` : null,
    unchecked ? `${unchecked} could not be checked here` : null,
    returned ? `${returned} retired but true again` : null,
  ].filter(Boolean).join(", ");
  console.log(`[observations] ${summary}`);
  if (unchecked) {
    console.log(
      "[observations] a probe needs a JDK, Maven and the diagnostics module for its line; " +
        "nothing above was measured on this machine",
    );
  }
  // Three states, three codes, because a caller reads the code and not the
  // prose. Returning 0 for "nothing could be measured" would mean the same
  // thing as "measured, and it holds" — which is the vacuous pass this whole
  // command exists to prevent elsewhere.
  //
  //   0  everything that could be checked held, or is retired and still false
  //   1  something measured no longer holds, or a retired behaviour returned
  //   4  nothing could be measured here; this machine has no verdict to give
  if (stale > 0 || returned > 0) process.exit(1);
  process.exit(checked === 0 ? 4 : 0);
}

/** How many of these are on record as no longer true. */
function retiredCount(list) {
  return list.filter(({ body }) => body.confidence === "retired").length;
}

if (command === "promote") {
  const id = args.positional ?? args.id;
  if (!id || !args.into) usage(2);
  const found = load().find((o) => o.body.id === id);
  if (!found) {
    process.stderr.write(`[observations] no observation with id "${id}"\n`);
    process.exit(1);
  }
  // Promotion is the step that turns evidence into something an agent will
  // treat as the API contract, so it is gated on the probe agreeing right now,
  // not on what was recorded when someone was confident.
  if (found.body.confidence !== "confirmed") {
    process.stderr.write(
      `[observations] "${id}" is ${found.body.confidence}, not confirmed. ` +
        "Only a confirmed observation may be promoted — run verify first.\n",
    );
    process.exit(1);
  }
  // Appending twice duplicates the section, and nothing noticed: promote
  // checked confidence but not whether this had already been promoted.
  if (found.body.promotedTo) {
    process.stderr.write(
      `[observations] "${id}" was already promoted to ${found.body.promotedTo}. ` +
        "Edit that file, or clear promotedTo first if it was removed.\n",
    );
    process.exit(1);
  }

  const target = path.isAbsolute(args.into) ? args.into : path.join(repoRoot, args.into);
  if (!fs.existsSync(target)) {
    process.stderr.write(`[observations] no such skill file: ${target}\n`);
    process.exit(1);
  }
  // A target outside the repository records a promotedTo like
  // "../../../Users/..." — meaningless to anyone else, and unresolvable from a
  // different machine.
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    process.stderr.write(
      `[observations] ${target} is outside this harness. Promote into a skill pack ` +
        "under skills/, so the record points somewhere every reader has.\n",
    );
    process.exit(1);
  }

  // Verify last, because it compiles and runs a probe. Everything above is
  // decidable from disk — unknown id, not confirmed, already promoted, target
  // missing or outside the harness — and a typo in --into should not cost a
  // Maven build to discover.
  const verify = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "observations.mjs"), "verify", "--id", id],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (verify.status !== 0) {
    process.stderr.write(`[observations] verify failed; "${id}" was not promoted\n`);
    process.exit(1);
  }

  const block = renderForSkill(found.body);
  fs.appendFileSync(target, block, "utf8");
  found.body.promotedTo = path.relative(repoRoot, target).split(path.sep).join("/");
  fs.writeFileSync(found.file, `${JSON.stringify(found.body, null, 2)}\n`, "utf8");

  console.log(`[observations] appended "${id}" to ${found.body.promotedTo}`);
  console.log("[observations] read what was written — a generated paragraph is a draft, not a skill.");
  process.exit(0);
}

process.stderr.write(`[observations] unknown command: ${command}\n`);
usage(2);

// ----------------------------------------------------------------- helpers ---

/**
 * Compare recorded numbers against a fresh probe run. Only keys the observation
 * actually recorded are checked: a probe growing a new field is not a
 * regression, and a probe losing one is.
 */
function compare(recorded, fresh) {
  const differences = [];
  for (const [key, expected] of Object.entries(recorded)) {
    const actual = findKey(fresh, key);
    if (actual === undefined) {
      differences.push(`${key}: recorded ${JSON.stringify(expected)}, the probe no longer reports it`);
    } else if (!equal(expected, actual)) {
      differences.push(`${key}: recorded ${JSON.stringify(expected)}, probe says ${JSON.stringify(actual)}`);
    }
  }
  return differences;
}

/** Probe output nests; an observation records the leaf it cares about. */
function findKey(node, key) {
  if (node === null || typeof node !== "object") return undefined;
  if (Object.hasOwn(node, key)) return node[key];
  for (const value of Object.values(node)) {
    const hit = findKey(value, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function equal(expected, actual) {
  if (typeof expected === "number" && typeof actual === "number") {
    // Measurements, not identities: a hundredth of a point is not a change.
    return Math.abs(expected - actual) <= 0.05;
  }
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.includes(expected) || expected.includes(actual);
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    // Without this an array fell through to `===`, which compares references
    // and is false for two distinct arrays however identical their contents.
    // Any observation recording a list — "these node kinds lose their content" —
    // could therefore never verify, and would report a change on every run.
    // Order matters: probe output is deterministic, so a reordering is a
    // difference worth seeing.
    return expected.length === actual.length && expected.every((item, i) => equal(item, actual[i]));
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    // The same reference-comparison bug the array branch above exists to fix.
    // A probe reporting a grouped measurement — `{atSize10: 1.0, atSize20: 1.0}`
    // — recorded it faithfully and then failed verification for ever, printing
    // two identical objects side by side as though they differed.
    //
    // Key ORDER is not a difference here, unlike an array's. These come back
    // from Java maps through JSON, where the order is the serialiser's business
    // and not a measurement; treating a reshuffle as a change would make the
    // check fire on nothing.
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    return expectedKeys.length === actualKeys.length
      && expectedKeys.every((key, i) => key === actualKeys[i])
      && expectedKeys.every((key) => equal(expected[key], actual[key]));
  }
  return expected === actual;
}

/** An object literal, not an array and not null — the shape a JSON map arrives as. */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderForSkill(observation) {
  const lines = [
    "",
    `### ${observation.id}`,
    "",
    observation.observedBehaviour,
    "",
    `Confirmed against GraphCompose ${observation.graphComposeVersion} by the ` +
      `\`${observation.minimalReproduction.probe}\` probe:`,
    "",
    "```bash",
    observation.minimalReproduction.command ??
      `node scripts/probe.mjs ${observation.minimalReproduction.probe}`,
    "```",
    "",
  ];
  if (observation.workaround) lines.push(`**What to do instead.** ${observation.workaround}`, "");
  return lines.join("\n");
}
