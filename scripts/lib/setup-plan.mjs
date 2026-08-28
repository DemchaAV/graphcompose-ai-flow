/**
 * scripts/lib/setup-plan.mjs — should this run build the tools it is missing?
 *
 * ## Why a decision, and not just a call
 *
 * `preflight` has known since v0.6.5 which tools ship as source and are not
 * built here, and it recommended `npm run setup` as the first thing to do. A
 * recommendation is still a step someone has to take, and the whole reason
 * `preflight` exists is to remove steps that have a single right answer. So it
 * runs setup itself — but only when running it is the right answer, which is
 * not always.
 *
 * Two cases where it is not, and they are the same distinction the tool report
 * already draws:
 *
 *   - **Nothing is unbuilt.** `setup` reinstalls and rebuilds every Node tool
 *     unconditionally, so running it on a ready tree spends a minute to change
 *     nothing.
 *   - **The run is about to stop anyway.** An unsupported GraphCompose line or
 *     a directory that is not a GraphCompose project ends the run a few lines
 *     later. Building first spends a full `npm ci` and a Maven package to
 *     answer a question the caller is not going to get to ask.
 *   - **The toolchain is incomplete.** `setup` checks Node, npm, Java and Maven
 *     before it builds anything and stops if one is missing. Firing it at a
 *     machine with no JDK produces a failure that reads as "setup is broken"
 *     when the real answer is "install a JDK" — the same wrong-advice-delivered-
 *     confidently that split `unbuilt` from `absent` in the first place.
 *
 * Kept apart from `preflight.mjs` because a decision worth making is a decision
 * worth testing, and this one is pure.
 */

/** What `setup` verifies before it builds anything, and cannot install itself. */
const TOOLCHAIN = Object.freeze(["java", "maven"]);

/**
 * Whether to build now, and what to say when not.
 *
 * @param {{needsSetup?: boolean, unbuilt?: string[], absent?: string[]}} tools
 *   the report from `preflight`'s `describeTools()`
 * @param {{optedOut?: boolean, runWillStop?: string|null}} [options]
 *   `--no-setup` was passed; `runWillStop` names why this run ends regardless
 * @returns {{run: boolean, reason: string, blockedBy: string[]}}
 */
export function planSetup(tools, options = {}) {
  const absent = tools?.absent ?? [];
  const unbuilt = tools?.unbuilt ?? [];

  if (options.optedOut) {
    return { run: false, reason: "--no-setup", blockedBy: [] };
  }
  if (options.runWillStop) {
    return {
      run: false,
      reason: `${options.runWillStop}, so this run stops before the tools are needed`,
      blockedBy: [],
    };
  }
  if (!tools?.needsSetup) {
    return { run: false, reason: "everything that ships as source is built", blockedBy: [] };
  }

  // ImageMagick is deliberately not in this list. The gates need it; `setup`
  // never looks at it and would build the tools perfectly well without it.
  const blockedBy = TOOLCHAIN.filter((name) => absent.includes(name));
  if (blockedBy.length > 0) {
    return {
      run: false,
      reason:
        `setup checks the whole toolchain before it builds and would stop at ${blockedBy.join(", ")}; ` +
        `install ${blockedBy.length === 1 ? "it" : "them"} first`,
      blockedBy,
    };
  }

  return { run: true, reason: `${unbuilt.join(", ")} ship as source and are not built here`, blockedBy: [] };
}
