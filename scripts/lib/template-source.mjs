#!/usr/bin/env node
/**
 * scripts/lib/template-source.mjs — which file in a revision IS the template?
 *
 * A revision holds one template. It has two possible names, for a reason that
 * has nothing to do with the flow: the flow writes `generated-template.java`,
 * and an IDE renames it to `<PublicClass>.java` the moment anyone opens it,
 * because Java wants the file named after the class. Three places already
 * accommodate both — the render-runner pom's `<condition>` (written by
 * `scaffold-runner.mjs`), `render-runtime.mjs` (which parses that pom back out),
 * and `publish-template.mjs` — and all three agree that the canonical name wins
 * when both exist.
 *
 * What none of them did was mention the loser. Both files can sit in a revision
 * indefinitely, one of them read by nothing.
 *
 * That is not hypothetical. A create run on Gemini Flash wrote both names into
 * every revision and applied each edit twice, by hand, for four revisions. The
 * compiler read `GeneratedInvoiceTemplate.java` the whole time; every edit to
 * `generated-template.java` was spent on a file no build opened. Half a loop's
 * editing budget, and the only thing that would have told it was a directory
 * listing nobody had a reason to read.
 *
 * The waste is the smaller half. Two files that are supposed to be one drift:
 * the same run left revision-002's copy edited and revision-003's untouched at
 * the same moment. Once they differ, the render measures one and the review is
 * written against whichever the agent happened to have open — and every gate
 * downstream is comparing a document to a description of a different one.
 *
 * So: one function, used by the callers that resolve the name, which also says
 * what it is ignoring and whether that copy has already diverged.
 */

import fs from "node:fs";
import path from "node:path";

/** The name the flow writes. The pom's `else` branch, and the fallback here. */
export const FLOW_TEMPLATE_NAME = "generated-template.java";

/**
 * Compare two Java sources for practical identity.
 *
 * Line endings only: a checkout on Windows and a heredoc on the same machine
 * disagree about CRLF and agree about everything that renders, so comparing raw
 * bytes would report drift on every revision touched by two tools. Anything
 * beyond that — whitespace, ordering, the class name itself — is a real
 * difference between two files that are supposed to be one file.
 */
function sameSource(a, b) {
  const read = (f) => {
    try {
      return fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    } catch {
      return null;
    }
  };
  const left = read(a);
  const right = read(b);
  return left !== null && right !== null && left === right;
}

/**
 * Resolve a revision's template source, and report the copies nothing reads.
 *
 * Precedence is the pom's, deliberately: canonical first, flow name second. A
 * caller that resolved a different file than this returns is a caller that has
 * drifted from the build, which is the bug this module exists to make visible
 * rather than a case to be lenient about.
 *
 * @param {object} options
 * @param {string} options.revisionDir the revision folder
 * @param {string|null} [options.canonicalName] the public class's simple name,
 *   without `.java`, when the project declares one
 * @returns {{
 *   file: string|null, name: string|null,
 *   candidates: string[],
 *   ignored: Array<{file: string, name: string, divergent: boolean}>,
 *   divergent: boolean,
 * }} `file` is null when the revision holds no template yet — the ordinary
 *   state before the first authoring pass, not a fault.
 */
export function resolveTemplateSource({ revisionDir, canonicalName = null }) {
  const names = [];
  if (typeof canonicalName === "string" && canonicalName.trim() !== "") {
    names.push(`${canonicalName.trim().split(".").pop()}.java`);
  }
  names.push(FLOW_TEMPLATE_NAME);

  const present = names
    .map((name) => ({ name, file: path.join(revisionDir, name) }))
    .filter((c) => fs.existsSync(c.file));

  const [chosen, ...rest] = present;
  const ignored = rest.map((c) => ({
    file: c.file,
    name: c.name,
    divergent: !sameSource(chosen.file, c.file),
  }));

  return {
    file: chosen?.file ?? null,
    name: chosen?.name ?? null,
    candidates: names,
    ignored,
    divergent: ignored.some((c) => c.divergent),
  };
}

/**
 * One line for a human, or null when there is nothing to say.
 *
 * Phrased around what it costs rather than what it is: "there are two files" is
 * a fact an agent can read and carry on editing both, which is exactly what
 * happened. "Edits to it are not compiled" is an instruction.
 */
export function describeIgnoredCopies(resolved) {
  if (!resolved?.ignored?.length) return null;
  const names = resolved.ignored.map((c) => c.name).join(", ");
  const plural = resolved.ignored.length > 1 ? "copies" : "a copy";
  return resolved.divergent
    ? `${names} sits beside ${resolved.name} and DIFFERS from it — the build reads ${resolved.name}, `
      + `so the render measures that one and any edit to the other is both lost and a second truth. `
      + `Delete it, or move the change into ${resolved.name}`
    : `${names} is ${plural} of ${resolved.name} that the build never reads — edits to it are not `
      + `compiled. Delete it and keep ${resolved.name}`;
}
