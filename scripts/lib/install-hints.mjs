/**
 * scripts/lib/install-hints.mjs — the command that installs a tool this machine
 * does not have.
 *
 * ## Why a hint and not an install
 *
 * `setup` cannot install a JDK, Maven or ImageMagick: they are system packages,
 * and installing them means a package manager and, on most machines, elevation.
 * A setup script that quietly does that to someone's machine has overstepped.
 *
 * What it can do is stop sending people to a documentation page for a line they
 * are going to copy anyway. "Install the missing tools and re-run" is a step
 * with a single right answer per platform, and printing that answer costs
 * nothing.
 *
 * The commands are suggestions, not promises: a machine may use Chocolatey,
 * Nix, SDKMAN or a distro whose package is named something else. They are the
 * default answer for the platform, and being wrong on an unusual machine costs
 * one failed command — which is strictly less than the page it replaces.
 *
 * Kept apart from `setup.mjs` because that file runs on import, and a mapping
 * worth getting right is worth testing without spawning a process.
 */

/**
 * Per tool, the command for each platform family.
 *
 * `linux` stands in for Debian and Ubuntu, which is what the dev container and
 * every CI runner here use. A distro with a different package manager gets the
 * apt line and the sense to translate it.
 */
const COMMANDS = Object.freeze({
  java: {
    win32: "winget install Microsoft.OpenJDK.21",
    darwin: "brew install openjdk@21",
    linux: "sudo apt-get install -y openjdk-21-jdk",
  },
  maven: {
    win32: "winget install Apache.Maven",
    darwin: "brew install maven",
    linux: "sudo apt-get install -y maven",
  },
  imagemagick: {
    win32: "winget install ImageMagick.ImageMagick",
    darwin: "brew install imagemagick",
    linux: "sudo apt-get install -y imagemagick",
  },
  node: {
    win32: "winget install OpenJS.NodeJS.LTS",
    darwin: "brew install node@20",
    // Debian's own node is usually older than 20, so this one names the source
    // rather than a package that would install the wrong major.
    linux: "see https://nodejs.org/en/download — Debian's packaged node is often older than 20",
  },
});

/**
 * How to install `tool` on `platform`.
 *
 * @param {string} tool one of `java`, `maven`, `imagemagick`, `node`
 *   (case-insensitive; "Java" and "ImageMagick" are how the caller prints them)
 * @param {string} [platform] a `process.platform` value; anything that is not
 *   `win32` or `darwin` is treated as Debian-shaped
 * @returns {string|null} the command, or null when nothing sensible can be said
 */
export function installHint(tool, platform = process.platform) {
  const key = String(tool ?? "").toLowerCase().replace(/[\s._-]/g, "");
  const perPlatform = COMMANDS[key];
  if (!perPlatform) return null;
  return perPlatform[platform] ?? perPlatform.linux;
}

/** Every tool this module knows a command for. */
export function knownTools() {
  return Object.keys(COMMANDS);
}
