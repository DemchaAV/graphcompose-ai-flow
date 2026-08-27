#!/usr/bin/env node
/**
 * scripts/lib/probe-build.mjs — which build a probe measures.
 *
 * <p>A probe is written against a library *line* and run against a library
 * *build*, and until a run needed them apart they were the same thing: the
 * diagnostics pom pinned a release and every probe measured that release,
 * whatever the project under test was compiled from. A run pinned to
 * `2.2.1-SNAPSHOT` asked "does the engine still do this?" and was answered
 * about `2.2.1`, then rewrote a page architecture on the strength of it.</p>
 *
 * <p>Kept apart from the CLI so the decision can be tested without Maven, a
 * JDK and a resolved GraphCompose artifact.</p>
 */

import { versionLine } from "./version-resolver.mjs";

/**
 * Pick the build to measure and the diagnostics line to measure it with.
 *
 * @param {{ requested?: {version: string, source: string}|null,
 *           requestedLine?: string|null,
 *           availableLines?: string[] }} options
 *   `requested` is the build someone asked for — `--build`, or the workspace's
 *   resolved version. `requestedLine` is an explicit `--version`.
 * @returns {{ line: string|null, build: {version: string, source: string}|null,
 *             warning: string|null }}
 */
export function selectBuild({ requested = null, requestedLine = null, availableLines = [] } = {}) {
  const line =
    requestedLine ?? (requested ? versionLine(requested.version) : null) ?? availableLines[0] ?? null;

  if (!requested) return { line, build: null, warning: null };

  const buildLine = versionLine(requested.version);
  if (buildLine === line) return { line, build: requested, warning: null };

  // Answering about a different line would be the same substitution this
  // module exists to stop, one level up: the probe would run, print a number,
  // and the number would be about something else.
  return {
    line,
    build: null,
    warning:
      `${requested.version} is on the ${buildLine ?? "unknown"} line and these probes are ` +
      `written against ${line}; measuring the pom's pin instead`,
  };
}
