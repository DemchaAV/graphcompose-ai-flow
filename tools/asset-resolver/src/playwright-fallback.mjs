/**
 * Optional Playwright-driven visual fallback for icon selection.
 *
 * When the request marks an icon with "visual: true" the resolver tries to
 * open https://icon-sets.iconify.design/?query=... in a headless browser,
 * capture a screenshot, and emit it next to the icon manifest so the model
 * (or a human reviewer) can choose by sight.
 *
 * Playwright is an OPTIONAL peer dependency. If `playwright` is not installed
 * the fallback is skipped with a clear log line. The flow keeps working from
 * the HTTP API path.
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * @param {object} iconRequest      icon asset-request entry
 * @param {string} outputDirectory   directory to drop the screenshot in
 * @param {(message:string)=>void} log
 * @returns {Promise<{enabled:boolean, screenshot?:string, suggested?:string}>}
 */
export async function visualSelectIcon(iconRequest, outputDirectory, log) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    log(`playwright not installed; skipping visual fallback for icon "${iconRequest.token}". `
      + `Install with: npm i -D playwright && npx playwright install chromium`);
    return { enabled: false };
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const query = encodeURIComponent(iconRequest.query || iconRequest.token);
    await page.goto(`https://icon-sets.iconify.design/?query=${query}`, { waitUntil: "networkidle" });

    await fs.mkdir(outputDirectory, { recursive: true });
    const screenshot = path.join(outputDirectory, `${iconRequest.token}-search.png`);
    await page.screenshot({ path: screenshot, fullPage: false });

    const suggested = await page.evaluate(() => {
      const first = document.querySelector("[data-icon]");
      return first ? first.getAttribute("data-icon") : null;
    });

    log(`playwright visual fallback: screenshot=${screenshot}, suggested=${suggested ?? "(none)"}`);
    return { enabled: true, screenshot, suggested: suggested ?? undefined };
  } finally {
    await browser.close();
  }
}
