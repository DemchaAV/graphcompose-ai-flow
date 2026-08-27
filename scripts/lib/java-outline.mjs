#!/usr/bin/env node
/**
 * scripts/lib/java-outline.mjs — where each thing in a generated template is.
 *
 * ## Why this exists
 *
 * Measured over one create run's whole transcript: `sed` returned 30.3k tokens
 * across 17 calls and `cat` 17.7k across 18, together more than half of every
 * byte the model read back from a tool — while all nine deterministic tools of
 * the harness came to about 20k across ninety calls. The expensive thing was
 * never the diffing or the rendering. It was reading a 1,233-line Java file in
 * slices to find one method.
 *
 * A generated template has a shape the loop already knows: a block of geometry
 * constants at the top and one render method per visible region, which is the
 * harness's own naming rule. That shape is enough to answer "show me
 * renderExperience" without reading the other 1,180 lines.
 *
 * ## What it is not
 *
 * Not a Java parser. It finds declarations by brace balance from a signature
 * line, which is exactly as much as is needed to cut one method out of a file
 * this harness generated. A construct that defeats it — a brace inside a string
 * or a comment on the signature line — is reported as an unbalanced range
 * rather than guessed at, because a method cut off halfway is worse than no
 * method at all.
 */

/** A declaration worth naming: methods, and the constants a template derives from. */
const METHOD = /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*[\w.<>,?\[\]\s]+?\s+(\w+)\s*\([^;{]*\)\s*(?:throws\s+[\w.,\s]+)?\{/;

const FIELD = /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?([\w.<>,?\[\]]+)\s+([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);/;

const CLASS = /^\s*(?:(?:public|private|protected|static|final|abstract|sealed)\s+)*(?:class|interface|record|enum)\s+(\w+)/;

/**
 * Every method in a Java source, with the lines it occupies.
 *
 * @param {string} source
 * @returns {Array<{name:string, line:number, endLine:number, lines:number,
 *                  signature:string, javadocLine:number|null, balanced:boolean}>}
 */
export function methods(source) {
  const lines = source.split(/\r?\n/);
  const found = [];

  for (let i = 0; i < lines.length; i += 1) {
    const hit = METHOD.exec(lines[i]);
    if (!hit) continue;
    // `if (...) {` and friends match the shape of a signature. A declaration is
    // at class level, so anything indented past the body of one is a statement.
    if (/^\s*(if|for|while|switch|catch|try|else|do|return|new)\b/.test(lines[i])) continue;
    // A record's component list is parentheses after a name, which is the same
    // shape. It is a type, and `outline` is a list of methods — reporting
    // `IconAsset` among them sends a reader looking for rendering in a carrier.
    if (CLASS.test(lines[i])) continue;

    const end = closingBrace(lines, i);
    found.push({
      name: hit[1],
      line: i + 1,
      endLine: end.line + 1,
      lines: end.line - i + 1,
      signature: lines[i].trim(),
      javadocLine: javadocStart(lines, i),
      balanced: end.balanced,
    });
  }
  return found;
}

/**
 * The named constants a template derives its geometry from.
 *
 * <p>These are what a correction actually edits — the run that produced this
 * spent three revisions moving one of them — and they are a handful of lines
 * scattered through a header nobody needs the rest of.</p>
 *
 * @param {string} source
 * @returns {Array<{name:string, type:string, value:string, line:number}>}
 */
export function constants(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const hit = FIELD.exec(lines[i]);
    if (!hit) continue;
    out.push({ name: hit[2], type: hit[1], value: hit[3].trim(), line: i + 1 });
  }
  return out;
}

/** The top-level type this file declares, for a caller that wants to name it. */
export function declaredType(source) {
  for (const line of source.split(/\r?\n/)) {
    const hit = CLASS.exec(line);
    if (hit) return hit[1];
  }
  return null;
}

/**
 * Cut one declaration out, with its Javadoc.
 *
 * @param {string} source
 * @param {string} name
 * @param {{context?: number}} [options] extra lines either side
 * @returns {{name:string, line:number, endLine:number, text:string, balanced:boolean}|null}
 */
export function extract(source, name, options = {}) {
  const all = methods(source);
  const hit = all.find((method) => method.name === name);
  if (!hit) return null;

  const lines = source.split(/\r?\n/);
  const context = Math.max(0, options.context ?? 0);
  // The Javadoc is part of the answer: it is where this harness records why a
  // constant has the value it has, and a method read without it invites the
  // next edit to undo the reason.
  const from = Math.max(0, (hit.javadocLine ?? hit.line) - 1 - context);
  const to = Math.min(lines.length, hit.endLine + context);

  return {
    name: hit.name,
    line: from + 1,
    endLine: to,
    balanced: hit.balanced,
    text: lines.slice(from, to).join("\n"),
  };
}

/** Where the Javadoc above a declaration starts, if it has one. */
function javadocStart(lines, at) {
  let i = at - 1;
  while (i >= 0 && /^\s*(@\w+.*)?$/.test(lines[i]) && lines[i].trim() !== "") i -= 1;
  if (i < 0 || !/\*\/\s*$/.test(lines[i])) return null;
  while (i >= 0 && !/^\s*\/\*\*/.test(lines[i])) i -= 1;
  return i < 0 ? null : i + 1;
}

/**
 * Walk to the brace that closes the one opened on `from`.
 *
 * <p>Reports `balanced: false` at end of file rather than returning the last
 * line as if it were the answer: a method cut off halfway reads as complete and
 * is not.</p>
 */
function closingBrace(lines, from) {
  let depth = 0;
  let started = false;
  for (let i = from; i < lines.length; i += 1) {
    for (const char of stripLiterals(lines[i])) {
      if (char === "{") {
        depth += 1;
        started = true;
      } else if (char === "}") {
        depth -= 1;
        if (started && depth === 0) return { line: i, balanced: true };
      }
    }
  }
  return { line: lines.length - 1, balanced: false };
}

/** Braces inside strings, chars and line comments are not structure. */
function stripLiterals(line) {
  return line
    .replace(/\\"/g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)'/g, "''")
    .replace(/\/\/.*$/, "");
}
