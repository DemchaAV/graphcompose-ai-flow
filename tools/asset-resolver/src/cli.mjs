#!/usr/bin/env node
/**
 * asset-resolver CLI.
 *
 * Usage:
 *   node tools/asset-resolver/src/cli.mjs \
 *     --request   examples/cv-reference/revisions/revision-003/asset-request.json \
 *     --revision  examples/cv-reference/revisions/revision-003 \
 *     [--playwright]
 *
 * Reads asset-request.json, downloads icons from iconify.design into
 * <revision>/assets/icons/, validates fonts against the GraphCompose bundled
 * Google fonts list (or marks them for manual drop), and writes
 * <revision>/assets-manifest.json. The manifest is the only artifact the
 * Template Coder agent reads when wiring icons and fonts into the generated
 * template.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readAssetRequest } from "./plan-reader.mjs";
import { pickIcon, downloadIconPng, formatIconRef } from "./iconify.mjs";
import { resolveFontRole } from "./google-fonts.mjs";
import { visualSelectIcon } from "./playwright-fallback.mjs";

const SCRIPT = fileURLToPath(import.meta.url);

main(process.argv.slice(2)).catch((error) => {
  console.error(`[asset-resolver] ${error.message}`);
  process.exitCode = 1;
});

async function main(argv) {
  const flags = parseFlags(argv);
  const revisionDir = path.resolve(requireFlag(flags, "revision"));
  const requestPath = flags.request
    ? path.resolve(flags.request)
    : path.join(revisionDir, "asset-request.json");

  const log = (message) => process.stdout.write(`[asset-resolver] ${message}\n`);

  log(`reading request: ${requestPath}`);
  const request = await readAssetRequest(requestPath);
  log(`request: ${request.icons.length} icon(s), ${request.fonts.length} font role(s)`);

  const assetsDir = path.join(revisionDir, "assets");
  const iconsDir = path.join(assetsDir, "icons");
  const fontsDir = path.join(assetsDir, "fonts");
  await fs.mkdir(iconsDir, { recursive: true });
  await fs.mkdir(fontsDir, { recursive: true });

  const iconResults = await resolveIcons(request.icons, iconsDir, flags.playwright === true, log);
  const fontResults = resolveFonts(request.fonts, log);

  const manifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    revisionDir: path.relative(repoRoot(), revisionDir).split(path.sep).join("/"),
    icons: iconResults,
    fonts: fontResults,
  };

  const manifestPath = path.join(revisionDir, "assets-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  log(`manifest written: ${manifestPath}`);
}

async function resolveIcons(iconRequests, iconsDir, useVisual, log) {
  const results = {};
  for (const iconRequest of iconRequests) {
    log(`icon "${iconRequest.token}": resolving...`);
    let visualHint;
    if (useVisual && iconRequest.visual) {
      const visualResult = await visualSelectIcon(iconRequest, iconsDir, log);
      if (visualResult.enabled && visualResult.suggested) {
        visualHint = visualResult.suggested;
      }
    }

    const lookupRequest = visualHint
      ? { ...iconRequest, iconSet: visualHint }
      : iconRequest;
    const choice = await pickIcon(lookupRequest);
    const png = await downloadIconPng(choice.prefix, choice.name, {
      size: iconRequest.size,
      color: iconRequest.color,
    });
    const fileName = `${iconRequest.token}.png`;
    const filePath = path.join(iconsDir, fileName);
    await fs.writeFile(filePath, png);

    results[iconRequest.token] = {
      iconSet: formatIconRef(choice.prefix, choice.name),
      prefix: choice.prefix,
      name: choice.name,
      file: `assets/icons/${fileName}`,
      size: iconRequest.size ?? 64,
      pointSize: iconRequest.pointSize ?? 10,
      color: iconRequest.color ?? "#181818",
      pickedBy: choice.source,
      visualHint: visualHint ?? null,
    };
    log(`icon "${iconRequest.token}": ${choice.prefix}:${choice.name} (${choice.source}) -> ${fileName}`);
  }
  return results;
}

function resolveFonts(fontRequests, log) {
  const results = {};
  for (const fontRequest of fontRequests) {
    const resolved = resolveFontRole(fontRequest);
    results[resolved.role] = resolved;
    if (resolved.status === "ok") {
      log(`font "${resolved.role}": ${resolved.family} (${resolved.registration}) -> FontName.${resolved.fontName}`);
    } else {
      log(`font "${resolved.role}": ${resolved.family} - ${resolved.status}: ${resolved.notes ?? ""}`);
    }
  }
  return results;
}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }
    flags[name] = next;
    index += 1;
  }
  return flags;
}

function requireFlag(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true || value === "") {
    throw new Error(`required flag --${name} was not provided`);
  }
  return value;
}

function repoRoot() {
  return path.resolve(path.dirname(SCRIPT), "..", "..", "..");
}
