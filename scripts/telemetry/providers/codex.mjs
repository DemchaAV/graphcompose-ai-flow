#!/usr/bin/env node
/**
 * scripts/telemetry/providers/codex.mjs — token accounting for Codex.
 *
 * **Not implemented.** It is here as a named seam, not as a stub pretending to
 * work: the split between host-independent and host-specific already exists in
 * core.mjs, and this is the file the Codex half goes in when someone has a
 * Codex session to read.
 *
 * The clocks and the counters need nothing from this file. Time comes from the
 * checkpoints a host's hooks write, and revisions, renders and reviews are
 * derived from the workspace. Only token accounting is host-specific, because
 * only the host knows where its transcript is and what is in it.
 *
 * Reporting zeros would be worse than reporting nothing: a run that looks free
 * invites exactly the wrong conclusion. So this returns nulls and says why.
 */

import { emptyUsage } from "../core.mjs";

export function readUsage() {
  return {
    usage: emptyUsage(),
    sidechainUsage: emptyUsage(),
    firstAt: null,
    lastAt: null,
    unavailable: "Codex token accounting is not implemented; timings and counters are still exact.",
  };
}

export function sessionStart() {
  return null;
}

export const provider = {
  name: "codex",
  implemented: false,
  readUsage,
  sessionStart,
};
