/**
 * scripts/lib/table-header-gaps.mjs — a header that went missing mid-table.
 *
 * `TableBuilder.repeatHeader()` brings a header back on every page THAT TABLE
 * reaches. It says nothing about pages the table is not on, and the check that
 * read it as "every page of the document" failed a real two-table proposal
 * three times over: the investment table only reaches page 3, so pages 1 and 2
 * were reported for not carrying a header belonging to a table that is not on
 * them, and the timeline header matched 2 of its 4 tokens on page 1 from prose
 * alone. Three findings, none of them real, on a document whose pagination was
 * working.
 *
 * A gap is the one thing that is unambiguous. A header present on page N and
 * again on page N+2 but missing between them means the table spans all three
 * and lost its header in the middle — a continuation page of unlabelled columns,
 * which is a document defect and a zero-pixel one. A header that has not started
 * yet, or has already ended, tells us nothing at all, and this says nothing
 * about it.
 */

/** Share of a label's words that must appear for the header to count as present. */
export const PRESENT_AT = 0.7;

/** Words short enough to collide with ordinary prose are not evidence. */
const MIN_TOKEN = 4;

/** The words of a region label that are worth matching on. */
export function labelTokens(label) {
  return String(label ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= MIN_TOKEN);
}

/**
 * Pages a header is missing from while its table demonstrably continues.
 *
 * @param {{regions: Array<object>, pages: string[],
 *          normalize?: (text: string) => string}} input
 * @returns {Array<{region: string, label: string, page: number, spans: [number, number]}>}
 */
export function findHeaderGaps({ regions = [], pages = [], normalize = (t) => String(t).toLowerCase() } = {}) {
  const gaps = [];
  for (const region of regions) {
    if (region.role !== "table-header") continue;
    const tokens = labelTokens(region.label);
    if (!tokens.length) continue;

    const carries = pages.map((pageText) => {
      const normalized = normalize(pageText);
      return tokens.filter((token) => normalized.includes(token)).length / tokens.length >= PRESENT_AT;
    });

    const first = carries.indexOf(true);
    const last = carries.lastIndexOf(true);
    // Never seen, or seen on exactly one page: there is no span to have a gap in.
    if (first < 0 || last === first) continue;

    for (let page = first + 1; page < last; page += 1) {
      if (carries[page]) continue;
      gaps.push({
        region: region.id,
        label: region.label,
        page: page + 1,
        spans: [first + 1, last + 1],
      });
    }
  }
  return gaps;
}
