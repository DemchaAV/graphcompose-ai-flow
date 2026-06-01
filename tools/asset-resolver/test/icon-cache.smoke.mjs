#!/usr/bin/env node
/**
 * Smoke test for tools/asset-resolver/src/icon-cache.mjs.
 *
 * Uses a synthetic Iconify download by injecting a temp cache root.
 * We do NOT call the real Iconify HTTP API in the smoke — we cover
 * just the cache layer's correctness: hit/miss, hash determinism,
 * key sensitivity to size/color, and atomic write.
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { _internal, statsForCacheRoot } from "../src/icon-cache.mjs";

const { hashIcon, readCacheEntry, writeCacheEntry } = _internal;

async function main() {
  const cacheRoot = await fs.mkdtemp(path.join(tmpdir(), "iconcache-smoke-"));
  console.log(`smoke: temp cache root = ${cacheRoot}`);

  // 1. hashIcon — deterministic over the four key fields
  const a = hashIcon("mdi", "phone", { size: 64, color: "#181818" });
  const b = hashIcon("mdi", "phone", { size: 64, color: "#181818" });
  assert.equal(a, b, "same inputs must hash to the same key");
  assert.match(a, /^[0-9a-f]{64}$/, "hash must be 64-char hex sha256");
  console.log(`smoke: hash determinism = ok (${a.slice(0, 12)}...)`);

  // 2. size shifts the key
  const c = hashIcon("mdi", "phone", { size: 96, color: "#181818" });
  assert.notEqual(a, c, "different size must yield different key");
  console.log("smoke: size sensitivity = ok");

  // 3. color shifts the key
  const d = hashIcon("mdi", "phone", { size: 64, color: "#ffffff" });
  assert.notEqual(a, d, "different color must yield different key");
  console.log("smoke: color sensitivity = ok");

  // 4. different prefix or name shifts the key
  const e = hashIcon("tabler", "phone", { size: 64, color: "#181818" });
  assert.notEqual(a, e, "different prefix must yield different key");
  const f = hashIcon("mdi", "email", { size: 64, color: "#181818" });
  assert.notEqual(a, f, "different name must yield different key");
  console.log("smoke: prefix/name sensitivity = ok");

  // 5. readCacheEntry returns null on miss
  const miss = await readCacheEntry(cacheRoot, a);
  assert.equal(miss, null, "missing entry must return null");
  console.log("smoke: miss returns null = ok");

  // 6. writeCacheEntry stores, readCacheEntry returns the bytes
  const payload = Buffer.from("FAKE-PNG-BYTES");
  await writeCacheEntry(cacheRoot, a, payload);
  const hit = await readCacheEntry(cacheRoot, a);
  assert.ok(hit, "hit must return a buffer");
  assert.equal(hit.toString(), "FAKE-PNG-BYTES");
  console.log("smoke: store/hit round-trip = ok");

  // 7. statsForCacheRoot counts entries and bytes
  const stats = await statsForCacheRoot(cacheRoot);
  assert.equal(stats.entries, 1);
  assert.equal(stats.bytes, payload.length);
  console.log(`smoke: stats = ${stats.entries} entry, ${stats.bytes} bytes (ok)`);

  // 8. atomic write: no .tmp.<pid> files left behind
  const names = await fs.readdir(cacheRoot);
  const stale = names.filter((n) => n.includes(".tmp."));
  assert.equal(stale.length, 0, `no tmp files should remain: ${stale.join(",")}`);
  console.log("smoke: atomic write leaves no tmp = ok");

  // 9. statsForCacheRoot on empty / missing dir
  const missingDir = path.join(cacheRoot, "does-not-exist");
  const emptyStats = await statsForCacheRoot(missingDir);
  assert.equal(emptyStats.entries, 0);
  assert.equal(emptyStats.bytes, 0);
  console.log("smoke: stats on missing dir = ok");

  await fs.rm(cacheRoot, { recursive: true, force: true });
  console.log("smoke: PASS");
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

void createHash;
