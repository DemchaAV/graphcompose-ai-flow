/**
 * scripts/lib/pdf-links.mjs — read the link annotations back out of a rendered
 * PDF.
 *
 * A link that exists in the data but not in the render is invisible: the text
 * still shows, the colour still shows, the underline still shows, and the pixel
 * diff is zero. Only a reader clicking it finds out. Both acceptance runs
 * shipped exactly that — see `docs/link-integrity.md` — so this is the one
 * property of a render that has to be read from the file rather than looked at.
 *
 * No dependency: a PDF's link annotations are `/Subtype /Link` dictionaries
 * carrying `/A << /URI (...) >>`, and they live either in the raw file or in a
 * Flate-compressed object stream, both of which node can read on its own.
 *
 * This is a reader, not a parser. It does not resolve the object graph, so it
 * cannot say WHICH text carries a link — only which targets the document
 * contains. That is enough for the question being asked ("did the href in the
 * data survive into the PDF?") and keeps it immune to how the writer chose to
 * lay the objects out.
 */

import fs from "node:fs";
import zlib from "node:zlib";

const STREAM = Buffer.from("stream");
const ENDSTREAM = Buffer.from("endstream");

/**
 * Every byte range of the file worth searching: the file itself, plus each
 * Flate stream inflated. Streams that are not Flate (or are damaged) are
 * skipped — a stream we cannot read is a stream that holds no evidence, not an
 * error.
 */
function searchableChunks(buf) {
  const chunks = [buf];
  let cursor = 0;
  for (;;) {
    const hit = buf.indexOf(STREAM, cursor);
    if (hit === -1) break;
    // "endstream" contains "stream"; stepping over the keyword rather than the
    // match is what keeps the walk aligned to real stream starts.
    if (hit >= 3 && buf.toString("latin1", hit - 3, hit) === "end") {
      cursor = hit + STREAM.length;
      continue;
    }
    let start = hit + STREAM.length;
    if (buf[start] === 0x0d) start += 1;
    if (buf[start] === 0x0a) start += 1;
    const end = buf.indexOf(ENDSTREAM, start);
    if (end === -1) break;
    try {
      chunks.push(zlib.inflateSync(buf.subarray(start, end)));
    } catch {
      /* not Flate, or truncated — nothing to read here */
    }
    cursor = end + ENDSTREAM.length;
  }
  return chunks;
}

/** PDF literal string: balanced parens, backslash escapes, octal escapes. */
function readLiteralString(text, openIndex) {
  let depth = 1;
  let out = "";
  for (let i = openIndex + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      const next = text[i + 1];
      if (next === undefined) break;
      if (next >= "0" && next <= "7") {
        let octal = "";
        let j = i + 1;
        while (j < text.length && octal.length < 3 && text[j] >= "0" && text[j] <= "7") {
          octal += text[j];
          j += 1;
        }
        out += String.fromCharCode(parseInt(octal, 8));
        i = j - 1;
        continue;
      }
      const mapped = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[next];
      out += mapped ?? next;
      i += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { value: out, end: i };
    }
    out += ch;
  }
  return { value: out, end: text.length };
}

/** PDF hex string: <68747470…>, two hex digits per byte, odd tail padded with 0. */
function readHexString(text, openIndex) {
  const close = text.indexOf(">", openIndex);
  if (close === -1) return { value: "", end: text.length };
  const hex = text.slice(openIndex + 1, close).replace(/[^0-9A-Fa-f]/g, "");
  const padded = hex.length % 2 ? `${hex}0` : hex;
  let out = "";
  for (let i = 0; i < padded.length; i += 2) {
    out += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16));
  }
  return { value: out, end: close };
}

function collectUris(text, into) {
  const key = /\/URI\s*/g;
  let unreadable = 0;
  let match;
  while ((match = key.exec(text)) !== null) {
    const at = match.index + match[0].length;
    const opener = text[at];
    if (opener === "(") {
      const { value, end } = readLiteralString(text, at);
      if (value) into.add(value);
      else unreadable += 1;
      key.lastIndex = end;
    } else if (opener === "<") {
      const { value, end } = readHexString(text, at);
      if (value) into.add(value);
      else unreadable += 1;
      key.lastIndex = end;
    } else if (opener === "/") {
      // `<< /Type /Action /S /URI /URI (target) >>` — the first /URI names the
      // action subtype, the second carries the target. A name here is the
      // former: expected, and not a target at all.
      continue;
    } else if (opener >= "0" && opener <= "9") {
      // An indirect reference, which needs the object graph to resolve. Rare in
      // practice, and counted rather than guessed at so a caller never reports
      // a target it simply could not read as one the render is missing.
      unreadable += 1;
    }
  }
  return unreadable;
}

/**
 * Read a rendered PDF's outbound links.
 *
 * @returns {{uris: string[], linkAnnotations: number, unreadableTargets: number}}
 *   `uris` is deduplicated and in file order; `linkAnnotations` counts
 *   `/Subtype /Link` dictionaries, which can exceed the number of distinct
 *   URIs when one target is linked from several places.
 */
export function readPdfLinks(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const chunks = searchableChunks(buf);

  const uris = new Set();
  let linkAnnotations = 0;
  let unreadableTargets = 0;
  for (const chunk of chunks) {
    const text = chunk.toString("latin1");
    linkAnnotations += (text.match(/\/Subtype\s*\/Link\b/g) || []).length;
    unreadableTargets += collectUris(text, uris);
  }

  return { uris: [...uris], linkAnnotations, unreadableTargets };
}

/**
 * Does this document contain `target`?
 *
 * Compared with the tolerance a PDF writer earns and no more: case-insensitive
 * scheme and host, and an optional trailing slash. A different path is a
 * different link.
 */
export function containsTarget(uris, target) {
  const normalize = (s) => s.trim().replace(/\/+$/, "").toLowerCase();
  const wanted = normalize(target);
  return uris.some((u) => normalize(u) === wanted);
}
