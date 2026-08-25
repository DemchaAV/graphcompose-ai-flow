/**
 * scripts/lib/data-spec.mjs — where a revision's content lives.
 *
 * Shared by every check that has to compare what a document says against what
 * it was given: link integrity, document integrity. The resolution order is the
 * render runtime's, so a checker never disagrees with the renderer about which
 * file is the data.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * The revision's data spec, or null when the project ships its content inline.
 *
 * `render.dataFileName: null` is meaningful and not the same as absent: it says
 * the Java carries the data, so there is nothing on disk to compare against.
 */
export function findDataFile(projectDir, revisionDir) {
  const projectFile = path.join(projectDir, "template-project.json");
  if (fs.existsSync(projectFile)) {
    try {
      const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
      const configured = project.render?.dataFileName;
      if (configured === null) return null;
      const name = configured ?? `${project.docKind || "doc"}-data.json`;
      const candidate = path.join(revisionDir, name);
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* an unreadable project file falls through to the scan */
    }
  }
  if (!fs.existsSync(revisionDir)) return null;
  const found = fs
    .readdirSync(revisionDir)
    .filter((f) => f.endsWith("-data.json"))
    .sort();
  return found.length ? path.join(revisionDir, found[0]) : null;
}

/**
 * Every string in the data that should be findable in the rendered document.
 *
 * Deliberately narrow. A target (`href`), an asset path and a colour are inputs
 * to the render, not text it draws, and demanding they appear would make the
 * check cry wolf. What is left is content: names, descriptions, line items —
 * the things whose absence from a page means something went missing.
 *
 * @returns {Array<{at: string, value: string}>}
 */
export function contentStrings(root, { minLength = 6 } = {}) {
  const NOT_CONTENT = /^(href|url|uri|link|linkTo|target|file|image|icon|font|color|colour|id|type|format)$/i;
  const LOOKS_LIKE_PATH = /^(assets|data)\//;
  const LOOKS_LIKE_COLOUR = /^#[0-9a-f]{3,8}$/i;

  const out = [];
  const walk = (node, trail, key) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${trail}[${i}]`, key));
      return;
    }
    if (typeof node === "string") {
      if (key && NOT_CONTENT.test(key)) return;
      if (LOOKS_LIKE_PATH.test(node) || LOOKS_LIKE_COLOUR.test(node)) return;
      if (node.trim().length < minLength) return;
      if (!/[A-Za-z]/.test(node)) return;
      out.push({ at: trail, value: node });
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const childKey of Object.keys(node)) {
      walk(node[childKey], trail ? `${trail}.${childKey}` : childKey, childKey);
    }
  };
  walk(root, "", null);
  return out;
}

/**
 * Compare document text and data text on equal terms.
 *
 * Whitespace is removed entirely rather than collapsed, because a design uses
 * it as a visual device and a PDF extraction reports what the design did.
 * A letter-spaced heading comes back as "S O F T W A R E   E N G I N E E R";
 * collapsing runs leaves "s o f t w a r e e n g i n e e r", which still does
 * not contain "software engineer", and a real CV scored thirty-seven pieces of
 * missing content that were all plainly on the page. Line wrapping does the
 * same thing at the other end of a value.
 *
 * The cost is that word boundaries stop mattering, so a match can in principle
 * straddle two unrelated values. That is the right trade for the question being
 * asked: this is a presence check — did anything get lost — and a false match
 * is a missed defect, while a false miss is a defect reported against a
 * document that is fine, which is how a check stops being read.
 */
export const normalizeText = (text) => String(text ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * Is this value present in the document, allowing for how PDFs come back?
 *
 * Exact matching does not survive contact with a real render. A subset font's
 * ToUnicode map need not cover its ligatures, and in a measured CV "Software"
 * extracted as "So[ware" and "Optimized" as "Op?mized" — the content was
 * plainly on the page and an exact check called thirty-seven values missing.
 * An en dash came back as a replacement character.
 *
 * So presence is judged by words rather than by the whole string: a ligature
 * damages one word, not the sentence around it. Short words are ignored because
 * they match by accident, and the threshold is high enough that a value which is
 * genuinely absent cannot reach it — a lost line item shares no words with the
 * page it fell off.
 *
 * @param {string} value              the data's version
 * @param {string} normalizedDocument the document text, already normalized
 */
export function valueAppears(value, normalizedDocument, { threshold = 0.7 } = {}) {
  const tokens = String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);

  // Nothing long enough to be distinctive: fall back to the whole value, which
  // for a short string is exactly what should be looked for.
  if (tokens.length === 0) return normalizedDocument.includes(normalizeText(value));

  const found = tokens.filter((token) => tokenAppears(token, normalizedDocument)).length;
  return found / tokens.length >= threshold;
}

/**
 * Ligature digraphs a subset font may not map back to characters.
 *
 * Measured, not guessed: in one real CV every word the check called missing
 * contained one of these — optimiza(ti)on, migra(ti)on, communica(ti)on,
 * founda(ti)on, cer(ti)fied, pla(tf)orm, TechSolu(ti)ons — and each extracted
 * with a replacement character where the pair should be. Stripping the pair
 * from the token and the punctuation from the document brings the two back into
 * agreement without pretending the extraction was clean.
 */
const LIGATURES = ["ti", "tf", "ff", "fi", "fl", "ffi", "ffl"];

function tokenAppears(token, normalizedDocument) {
  if (normalizedDocument.includes(token)) return true;
  // The document with its damage removed, compared against the token with the
  // pair that caused the damage removed.
  const undamaged = normalizedDocument.replace(/[^a-z0-9]/g, "");
  for (const ligature of LIGATURES) {
    if (!token.includes(ligature)) continue;
    if (undamaged.includes(token.split(ligature).join(""))) return true;
  }
  return false;
}
