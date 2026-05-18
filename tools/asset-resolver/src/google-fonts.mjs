/**
 * Google Fonts resolver.
 *
 * GraphCompose 1.6 already bundles a selected set of Google Fonts under the
 * classpath (see com.demcha.compose.font.DefaultFonts). For those families the
 * resolver only verifies the FontName exists; no download is required and the
 * template registers them through DefaultFonts/FontLibrary directly.
 *
 * For families not bundled in GraphCompose the resolver flags them with a
 * "manual_drop_required" status so the template author can drop TTFs into
 * assets/fonts/ explicitly. The flow does not silently fail.
 */

/**
 * Names that GraphCompose 1.6.0 bundles via DefaultFonts.googleFamilies() and
 * the matching FontName.* enum constants. Keep in sync with
 * graphcompose/src/main/java/com/demcha/compose/font/DefaultFonts.java.
 */
export const GRAPHCOMPOSE_BUNDLED_GOOGLE_FAMILIES = Object.freeze({
  "lato":               "LATO",
  "pt sans":            "PT_SANS",
  "pt serif":           "PT_SERIF",
  "fira sans":          "FIRA_SANS",
  "ubuntu":             "UBUNTU",
  "alegreya sans":      "ALEGREYA_SANS",
  "carlito":            "CARLITO",
  "poppins":            "POPPINS",
  "barlow":             "BARLOW",
  "barlow condensed":   "BARLOW_CONDENSED",
  "asap condensed":     "ASAP_CONDENSED",
  "arsenal":            "ARSENAL",
  "ibm plex serif":     "IBM_PLEX_SERIF",
  "ibm plex mono":      "IBM_PLEX_MONO",
  "crimson text":       "CRIMSON_TEXT",
  "spectral":           "SPECTRAL",
  "zilla slab":         "ZILLA_SLAB",
  "gentium plus":       "GENTIUM_PLUS",
  "tinos":              "TINOS",
  "cousine":            "COUSINE",
  "fira sans condensed":"FIRA_SANS_CONDENSED",
  "kanit":              "KANIT",
  "volkhov":            "VOLKHOV",
  "taviraj":            "TAVIRAJ",
  "trirong":            "TRIRONG",
  "sarabun":            "SARABUN",
  "prompt":             "PROMPT",
  "andika":             "ANDIKA",
  "bai jamjuree":       "BAI_JAMJUREE",
});

/**
 * Standard14 PDF families, always available without registration.
 */
export const STANDARD14_FAMILIES = Object.freeze({
  "helvetica":    "HELVETICA",
  "times":        "TIMES_ROMAN",
  "times roman":  "TIMES_ROMAN",
  "courier":      "COURIER",
});

/**
 * Resolve a single font role.
 *
 * @param {object} fontRequest                  asset-request font entry
 * @param {string} fontRequest.role             stable role id (e.g. "body", "heading")
 * @param {string} fontRequest.family           Google Fonts family name (e.g. "Poppins")
 * @param {number[]} [fontRequest.weights]      requested weights, e.g. [400, 700]
 * @param {("graphcompose-bundled"|"google-fonts"|"standard14")} [fontRequest.source]
 *        - graphcompose-bundled: verify the family is in DefaultFonts.googleFamilies()
 *        - standard14: verify the family is one of the standard 14 PDF fonts
 *        - google-fonts: family must be dropped in manually for non-bundled fonts
 *
 * @returns {{role:string, family:string, fontName:string|null, weights:number[],
 *            source:string, status:"ok"|"manual_drop_required",
 *            registration:"default-fonts"|"standard14"|"file-resource"|null,
 *            notes?:string}}
 */
export function resolveFontRole(fontRequest) {
  const role = fontRequest.role;
  const family = (fontRequest.family || "").trim();
  const weights = Array.isArray(fontRequest.weights) && fontRequest.weights.length > 0
    ? [...fontRequest.weights]
    : [400, 700];
  const source = fontRequest.source || autoSource(family);

  if (!role) {
    throw new Error(`font request ${JSON.stringify(fontRequest)} is missing "role"`);
  }
  if (!family) {
    throw new Error(`font request for role "${role}" is missing "family"`);
  }

  const lowerFamily = family.toLowerCase();

  if (source === "standard14") {
    const fontName = STANDARD14_FAMILIES[lowerFamily];
    if (!fontName) {
      return failure(role, family, weights, source,
        `family "${family}" is not one of the standard 14 PDF base fonts`);
    }
    return {
      role,
      family,
      fontName,
      weights,
      source,
      status: "ok",
      registration: "standard14",
    };
  }

  if (source === "graphcompose-bundled") {
    const fontName = GRAPHCOMPOSE_BUNDLED_GOOGLE_FAMILIES[lowerFamily];
    if (!fontName) {
      return failure(role, family, weights, source,
        `family "${family}" is not bundled in GraphCompose 1.6 DefaultFonts; `
        + `pick a bundled family from DefaultFonts.googleFamilies() or set `
        + `source="google-fonts" and drop TTF files in assets/fonts/`);
    }
    return {
      role,
      family,
      fontName,
      weights,
      source,
      status: "ok",
      registration: "default-fonts",
    };
  }

  if (source === "google-fonts") {
    return {
      role,
      family,
      fontName: null,
      weights,
      source,
      status: "manual_drop_required",
      registration: "file-resource",
      notes: `download TTF for "${family}" weights ${weights.join(",")} and drop into assets/fonts/. `
        + `Template must register via FontFamilyDefinition.files(...).`,
    };
  }

  throw new Error(`unknown font source "${source}" for role "${role}"`);
}

/**
 * Best-guess source when the request omits it: prefer the cheapest registration.
 */
function autoSource(family) {
  const lower = family.toLowerCase();
  if (STANDARD14_FAMILIES[lower]) return "standard14";
  if (GRAPHCOMPOSE_BUNDLED_GOOGLE_FAMILIES[lower]) return "graphcompose-bundled";
  return "google-fonts";
}

function failure(role, family, weights, source, message) {
  return {
    role,
    family,
    fontName: null,
    weights,
    source,
    status: "manual_drop_required",
    registration: null,
    notes: message,
  };
}
