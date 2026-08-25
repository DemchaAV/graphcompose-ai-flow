/**
 * scripts/lib/page-pairs.mjs — pair a reference's pages with a render's pages.
 *
 * `import-reference` has always rasterised every page of a multi-page source,
 * and until now nothing read past the first one. The diff compared page 1 and
 * stopped; on a two-page CV that left half the document unmeasured, and on a
 * proposal or a book it left almost all of it. The evidence was on disk the
 * whole time: `examples/cv-reference` carries `reference-page-2.png` and its
 * revisions carry `output-page-2.png`, and no revision has ever held a diff
 * between them.
 *
 * Page 1 keeps the names it has always had — `reference.png`, `output.png`,
 * `reference-scaled.png`, `diff.png`. Everything downstream reads those, and a
 * rename would be a migration for no gain. Continuation pages get the
 * `-page-N` suffix the renderer already uses.
 *
 * A page the reference has and the render does not is a finding, not a gap to
 * skip quietly: "the reference has three pages" is a fact about the document
 * being rebuilt, and a render that produces one has not rebuilt it.
 */

import fs from "node:fs";
import path from "node:path";

/** Page 1 is the canonical `reference.png`; the rest carry the suffix. */
export function referencePageFile(referenceDir, page, referenceImage = null) {
  if (page === 1) {
    // `referenceImage` is the project's own answer to "which file is page 1",
    // and it is what every other tool resolves. Only fall back when absent.
    return referenceImage ?? path.join(referenceDir, "reference.png");
  }
  return path.join(referenceDir, `reference-page-${page}.png`);
}

/** The renderer's own naming: page 1 is `output.png`, then `output-page-N.png`. */
export function renderPageFile(revisionDir, page) {
  return page === 1
    ? path.join(revisionDir, "output.png")
    : path.join(revisionDir, `output-page-${page}.png`);
}

/** Where a pass persists what it produced for a page. */
export function scaledPageFile(revisionDir, page) {
  return page === 1
    ? path.join(revisionDir, "reference-scaled.png")
    : path.join(revisionDir, `reference-scaled-page-${page}.png`);
}

export function diffPageFile(revisionDir, page) {
  return page === 1
    ? path.join(revisionDir, "diff.png")
    : path.join(revisionDir, `diff-page-${page}.png`);
}

/**
 * How many pages the reference has, counted from the files that exist rather
 * than from what the manifest claims.
 *
 * `referencePages` in `template-project.json` is a record of the last import,
 * and a project can be edited by hand between imports. Counting the files makes
 * the number true of the folder as it is now.
 */
export function countReferencePages(referenceDir, referenceImage = null) {
  const first = referencePageFile(referenceDir, 1, referenceImage);
  if (!fs.existsSync(first)) return 0;
  let pages = 1;
  while (fs.existsSync(referencePageFile(referenceDir, pages + 1))) pages += 1;
  return pages;
}

/** The same count for a render, from the rasters a render pass wrote. */
export function countRenderPages(revisionDir) {
  if (!fs.existsSync(renderPageFile(revisionDir, 1))) return 0;
  let pages = 1;
  while (fs.existsSync(renderPageFile(revisionDir, pages + 1))) pages += 1;
  return pages;
}

/**
 * The pages to compare, and what is missing on either side.
 *
 * @param {{referenceDir?: string, referenceImage?: string|null, revisionDir: string,
 *          parentDir?: string|null, against?: "reference"|"parent"}} options
 * @returns {{pairs: Array<{page:number, reference:string, render:string,
 *            scaled:string, diff:string}>,
 *            referencePages:number, renderPages:number,
 *            missingFromRender:number[], extraInRender:number[]}}
 */
export function pagePairs({
  referenceDir = null,
  referenceImage = null,
  revisionDir,
  parentDir = null,
  against = "reference",
} = {}) {
  const renderPages = countRenderPages(revisionDir);

  // A parent comparison has no reference folder: the parent's own render is the
  // reference, so the page set is whatever the parent produced.
  const sourcePages =
    against === "parent"
      ? countRenderPages(parentDir ?? "")
      : countReferencePages(referenceDir ?? "", referenceImage);

  const pairs = [];
  const missingFromRender = [];
  for (let page = 1; page <= sourcePages; page += 1) {
    const render = renderPageFile(revisionDir, page);
    if (!fs.existsSync(render)) {
      missingFromRender.push(page);
      continue;
    }
    pairs.push({
      page,
      reference:
        against === "parent"
          ? renderPageFile(parentDir, page)
          : referencePageFile(referenceDir, page, referenceImage),
      render,
      scaled: scaledPageFile(revisionDir, page),
      diff: diffPageFile(revisionDir, page),
    });
  }

  // Pages the render has and the source does not. Not automatically wrong — a
  // document that flows can legitimately run longer than the sample it was
  // rebuilt from — so this is reported, not judged here.
  const extraInRender = [];
  for (let page = sourcePages + 1; page <= renderPages; page += 1) extraInRender.push(page);

  return {
    pairs,
    referencePages: sourcePages,
    renderPages,
    missingFromRender,
    extraInRender,
  };
}
