/**
 * scripts/lib/footer-overlap.mjs — is the footer under the body, or through it?
 *
 * A footer is chrome: the engine reserves its band and the body is meant to stop
 * above it. Nothing enforces that. The reservation comes from the page's bottom
 * margin, and a template that sets none runs its last row straight into the page
 * number — which page one almost never shows, because its content ends well
 * above the fold. It is a defect a single-page render is structurally unable to
 * reveal, and one a pixel diff scores as a few overlapping glyphs.
 *
 * Reproduced in a real run by removing one margin: the last row of a
 * continuation page ran 6.1 pt into "Page 1 of 3".
 */

/** The page-enumeration line: the one line on a page whose text is predictable. */
export const PAGE_OF = /page\s+(\d+)\s+of\s+(\d+)/i;

/** Below this clearance the body is not overlapping the footer, but only just. */
export const CROWDING_POINTS = 6;

/**
 * Pages where the body reaches the footer, and pages where it nearly does.
 *
 * The footer is identified by what it says, and everything else on the page is
 * body. Comparing the lowest body line's bottom against the footer's top is then
 * a subtraction rather than a judgement.
 *
 * A page with no recognisable footer contributes nothing: there is no band to
 * overlap, and guessing which line was meant as chrome would invent the defect
 * it claims to find.
 *
 * @param {Array<Array<{text:string,top:number,height:number}>>} pages line boxes per page
 * @returns {Array<{page:number,overlap:boolean,by:number,body:string,footer:string}>}
 */
export function findFooterOverlaps(pages, { crowding = CROWDING_POINTS } = {}) {
  const findings = [];
  for (let page = 0; page < (pages?.length ?? 0); page += 1) {
    const lines = pages[page] ?? [];
    // The LOWEST line that reads like a page number, not the first. Prose can
    // contain the phrase - "continued on page 2 of 3" in a terms block reads
    // exactly like chrome - and taking the first match would make a body line
    // the footer and the real footer a body line below it, inventing an
    // overlap out of a document that has none.
    const candidates = lines.filter((line) => PAGE_OF.test(line.text));
    if (!candidates.length) continue;
    const footer = candidates.reduce((a, b) => (a.top > b.top ? a : b));

    const body = lines.filter((line) => line !== footer);
    if (!body.length) continue;
    const lowest = body.reduce((a, b) => (a.top + a.height > b.top + b.height ? a : b));

    // Positive means the body crossed into the footer's top edge.
    const by = lowest.top + lowest.height - footer.top;
    if (by > 0) {
      findings.push({ page: page + 1, overlap: true, by, body: lowest.text.slice(0, 48), footer: footer.text });
    } else if (-by < crowding) {
      findings.push({ page: page + 1, overlap: false, by, body: lowest.text.slice(0, 48), footer: footer.text });
    }
  }
  return findings;
}
