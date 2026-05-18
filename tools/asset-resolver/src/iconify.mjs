/**
 * Iconify HTTP API client.
 *
 * Iconify serves SVG at:
 *   GET /search?query=<q>&limit=<n>&prefixes=<csv>            -> JSON
 *   GET /<prefix>/<name>.svg?color=<hex>&height=<h>           -> SVG bytes
 *
 * PDFBox (the GraphCompose backend) does not render SVG, so this client
 * downloads SVG from Iconify and rasterizes it to PNG using ImageMagick's
 * `magick` CLI. ImageMagick is a robust, widely-available SVG rasterizer
 * and avoids pulling in npm-side image libraries.
 *
 * The client is otherwise small and dependency-free; it uses the global
 * fetch available in Node >= 18. Returned objects use a stable shape that
 * the CLI persists into assets-manifest.json.
 */

import { spawn } from "node:child_process";

const API_ROOT = "https://api.iconify.design";
const MAGICK_BINARY = process.env.MAGICK_BINARY || "magick";

/**
 * Pick a single icon for a token by following the request's preferredSets in
 * order, falling back to a free-form search if none of those sets contain a
 * matching name.
 *
 * @param {object} request                      asset-request icon entry
 * @param {string} request.token                 stable token id used by the template (e.g. "phone")
 * @param {string} [request.query]               iconify search query; defaults to the token
 * @param {string} [request.iconSet]             explicit "<prefix>:<name>" override; skips search
 * @param {string[]} [request.preferredSets]     prefix priority list (e.g. ["mdi","tabler","lucide"])
 * @returns {Promise<{prefix:string,name:string,source:"explicit"|"preferred"|"search"}>}
 */
export async function pickIcon(request) {
  if (request.iconSet) {
    const { prefix, name } = parseIconSet(request.iconSet);
    return { prefix, name, source: "explicit" };
  }

  const query = (request.query || request.token || "").trim();
  if (!query) {
    throw new Error(`icon request ${JSON.stringify(request)} has no query/token`);
  }

  const preferred = Array.isArray(request.preferredSets) && request.preferredSets.length > 0
    ? request.preferredSets
    : ["mdi", "tabler", "lucide", "material-symbols", "ph"];

  const preferredResult = await searchIconify(query, preferred, 50);
  const fromPreferred = pickFromPreferred(preferredResult, preferred);
  if (fromPreferred) {
    return { ...fromPreferred, source: "preferred" };
  }

  const broadResult = await searchIconify(query, [], 10);
  if (broadResult.icons.length === 0) {
    throw new Error(`iconify search returned no results for query "${query}"`);
  }
  const first = parseIconSet(broadResult.icons[0]);
  return { prefix: first.prefix, name: first.name, source: "search" };
}

/**
 * Download an SVG from Iconify and rasterize it to a PNG.
 *
 * @param {string} prefix    icon set prefix (e.g. "mdi")
 * @param {string} name      icon name within the set
 * @param {object} options   render options
 * @param {number} [options.size]   pixel height/width of the output PNG; default 64
 * @param {string} [options.color]  hex color, with or without leading #
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function downloadIconPng(prefix, name, options = {}) {
  const size = options.size ?? 64;
  const rawColor = (options.color || "#181818").replace(/^#/, "");
  const url = `${API_ROOT}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`
    + `?color=%23${rawColor}&height=${size * 4}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iconify GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  const svg = Buffer.from(await response.arrayBuffer());
  if (svg.length === 0) {
    throw new Error(`iconify returned empty body for ${prefix}:${name}`);
  }
  return rasterizeSvgWithImageMagick(svg, size);
}

/**
 * Convert SVG bytes to a PNG buffer using ImageMagick's `magick` CLI.
 *
 * Reads SVG from stdin (svg:-) and writes PNG to stdout (png:-) so no
 * temporary files are created. The PNG keeps a transparent background and
 * is rendered at the requested pixel size.
 */
function rasterizeSvgWithImageMagick(svgBytes, size) {
  return new Promise((resolve, reject) => {
    const args = [
      "svg:-",
      "-background", "none",
      "-resize", `${size}x${size}`,
      "-depth", "8",
      "png:-",
    ];
    let stdout = Buffer.alloc(0);
    let stderr = "";
    let child;
    try {
      child = spawn(MAGICK_BINARY, args);
    } catch (cause) {
      reject(magickMissingError(cause));
      return;
    }
    child.stdout.on("data", (chunk) => { stdout = Buffer.concat([stdout, chunk]); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (cause) => {
      if (cause.code === "ENOENT") {
        reject(magickMissingError(cause));
      } else {
        reject(cause);
      }
    });
    child.on("close", (code) => {
      if (code === 0 && stdout.length > 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ImageMagick ${MAGICK_BINARY} ${args.join(" ")} `
          + `exited with code ${code}. stderr: ${stderr.trim()}`));
      }
    });
    child.stdin.end(svgBytes);
  });
}

function magickMissingError(cause) {
  return new Error(
    `Could not run "${MAGICK_BINARY}" to rasterize Iconify SVGs. `
    + `Install ImageMagick from https://imagemagick.org/script/download.php `
    + `or set MAGICK_BINARY=<path> to the magick binary. Underlying error: ${cause.message}`,
  );
}

async function searchIconify(query, prefixes, limit) {
  const url = new URL(`${API_ROOT}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  if (prefixes && prefixes.length > 0) {
    url.searchParams.set("prefixes", prefixes.join(","));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iconify search GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return {
    icons: Array.isArray(body.icons) ? body.icons : [],
    total: typeof body.total === "number" ? body.total : 0,
  };
}

function pickFromPreferred(searchResult, preferred) {
  for (const wantedPrefix of preferred) {
    for (const entry of searchResult.icons) {
      const parsed = parseIconSet(entry);
      if (parsed.prefix === wantedPrefix) {
        return parsed;
      }
    }
  }
  return null;
}

function parseIconSet(value) {
  if (!value || !value.includes(":")) {
    throw new Error(`iconify icon identifier must look like "prefix:name", got "${value}"`);
  }
  const [prefix, ...rest] = value.split(":");
  const name = rest.join(":");
  if (!prefix || !name) {
    throw new Error(`iconify icon identifier "${value}" is incomplete`);
  }
  return { prefix, name };
}

/**
 * Public string form of an icon identifier, useful for manifests and logs.
 */
export function formatIconRef(prefix, name) {
  return `${prefix}:${name}`;
}
