/**
 * Read and validate an asset-request.json file.
 *
 * The Architecture Mapper agent produces this file alongside
 * architecture-plan.md to enumerate every icon and font role the template
 * needs. The asset-resolver reads it back, downloads icons, validates fonts,
 * and writes the matching assets-manifest.json.
 *
 * Validation is intentionally strict: bad shapes fail loudly so the agent
 * chain catches them before code generation.
 */

import fs from "node:fs/promises";

/**
 * @returns {Promise<{
 *   icons: Array<{token:string, query?:string, iconSet?:string,
 *                  preferredSets?:string[], size?:number, color?:string,
 *                  visual?:boolean}>,
 *   fonts: Array<{role:string, family:string, weights?:number[],
 *                 source?:string}>
 * }>}
 */
export async function readAssetRequest(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`asset-request.json is not valid JSON at ${filePath}: ${cause.message}`);
  }
  if (parsed == null || typeof parsed !== "object") {
    throw new Error(`asset-request.json must be a JSON object at ${filePath}`);
  }

  const icons = Array.isArray(parsed.icons) ? parsed.icons : [];
  const fonts = Array.isArray(parsed.fonts) ? parsed.fonts : [];

  const seenIconTokens = new Set();
  for (const icon of icons) {
    if (!icon || typeof icon !== "object") {
      throw new Error(`icon entry must be an object: ${JSON.stringify(icon)}`);
    }
    if (typeof icon.token !== "string" || icon.token.trim() === "") {
      throw new Error(`icon entry missing "token": ${JSON.stringify(icon)}`);
    }
    if (seenIconTokens.has(icon.token)) {
      throw new Error(`duplicate icon token "${icon.token}"`);
    }
    seenIconTokens.add(icon.token);
    if (icon.iconSet && !icon.iconSet.includes(":")) {
      throw new Error(`icon "${icon.token}": iconSet must be "prefix:name"`);
    }
    if (!icon.iconSet && !icon.query && !icon.token) {
      throw new Error(`icon "${icon.token}": needs iconSet or query`);
    }
  }

  const seenFontRoles = new Set();
  for (const font of fonts) {
    if (!font || typeof font !== "object") {
      throw new Error(`font entry must be an object: ${JSON.stringify(font)}`);
    }
    if (typeof font.role !== "string" || font.role.trim() === "") {
      throw new Error(`font entry missing "role": ${JSON.stringify(font)}`);
    }
    if (seenFontRoles.has(font.role)) {
      throw new Error(`duplicate font role "${font.role}"`);
    }
    seenFontRoles.add(font.role);
    if (typeof font.family !== "string" || font.family.trim() === "") {
      throw new Error(`font "${font.role}": missing "family"`);
    }
  }

  return { icons, fonts };
}
