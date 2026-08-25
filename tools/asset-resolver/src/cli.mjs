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
import { pickIcon, formatIconRef, rasterizeSvg } from "./iconify.mjs";
import { cachedDownloadIconSvg } from "./icon-cache.mjs";
import { checkSvgCompatibility } from "./svg-compat.mjs";
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

  // An icon can pass the compatibility check and still lose part of itself: the
  // reader draws no <use>, <image> or <text>, so an icon built from them keeps
  // its geometry and ships missing pieces. That is worse than a rasterised
  // fallback, because nothing fails — it renders slightly wrong, and a few
  // hundred wrong pixels are invisible in a whole-page diff. It was recorded in
  // the manifest and printed once, mid-run, among every other icon's line.
  // Repeat it at the end, where the last thing printed is the thing acted on.
  const degraded = Object.entries(iconResults).filter(([, icon]) => icon.droppedSvgContent);
  if (degraded.length) {
    log(
      `${degraded.length} icon(s) kept as SVG with content the reader will not draw — ` +
        "check these against the reference before trusting them:",
    );
    for (const [token, icon] of degraded) {
      log(`  ${token} (${icon.iconSet}): drops ${icon.droppedSvgContent.join(", ")}`);
    }
  }

  const rasterised = Object.entries(iconResults).filter(([, icon]) => icon.format === "png");
  if (rasterised.length) {
    log(
      `${rasterised.length} icon(s) fell back to PNG: ` +
        rasterised.map(([token, icon]) => `${token} (${icon.fallbackReason})`).join("; "),
    );
  }
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

    // SVG first. GraphCompose draws vector icons directly through
    // SvgIcon.read(...), so rasterising by default threw away the scalable form
    // for every icon in order to survive the rare one it cannot parse. The
    // fallback is kept, and the reason it fired is recorded, because "why is
    // this one a PNG" is otherwise unanswerable later.
    const svg = await cachedDownloadIconSvg(choice.prefix, choice.name, {
      color: iconRequest.color,
    }, { log: (line) => log(line) });
    const compatibility = checkSvgCompatibility(svg.toString("utf8"));

    let format;
    let bytes;
    let fallbackReason = null;
    if (compatibility.compatible) {
      format = "svg";
      bytes = svg;
    } else {
      format = "png";
      fallbackReason = compatibility.reasons.join("; ");
      bytes = await rasterizeSvg(svg, iconRequest.size ?? 64);
    }

    const fileName = `${iconRequest.token}.${format}`;
    const filePath = path.join(iconsDir, fileName);
    await fs.writeFile(filePath, bytes);

    results[iconRequest.token] = {
      iconSet: formatIconRef(choice.prefix, choice.name),
      prefix: choice.prefix,
      name: choice.name,
      file: `assets/icons/${fileName}`,
      format,
      fallbackReason,
      // Only meaningful for a raster: an SVG has no pixel size.
      size: format === "png" ? (iconRequest.size ?? 64) : null,
      pointSize: iconRequest.pointSize ?? 10,
      color: iconRequest.color ?? "#181818",
      pickedBy: choice.source,
      visualHint: visualHint ?? null,
      droppedSvgContent: compatibility.droppedKinds.length ? compatibility.droppedKinds : null,
    };
    log(
      `icon "${iconRequest.token}": ${choice.prefix}:${choice.name} (${choice.source}) -> ${fileName}`
      + (fallbackReason ? `  [rasterised: ${fallbackReason}]` : "")
      + (compatibility.droppedKinds.length ? `  [svg content dropped: ${compatibility.droppedKinds.join(", ")}]` : ""),
    );
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
