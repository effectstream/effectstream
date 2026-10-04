#!/usr/bin/env bun
// bun run delivery:import-bundle <key-volume>/account [--out <bundle dir>]
// Copies the Passport bundle (plan 00058 D-5) out of a VERIFIED Night Market key volume, after
// checking it against pin/passport-account.pin.json. The default output is bundle/account in this
// package (gitignored): the compiled account module must sit where it resolves this package's
// @midnight-ntwrk/compact-runtime-0.20.
import { importBundle, DEFAULT_BUNDLE_DIR, BundleError } from "../bundle.ts";
import { loadPin } from "../pin.ts";

const [, , src, ...rest] = process.argv;
if (!src) {
  console.error("usage: bun run delivery:import-bundle <key-volume>/account [--out <dir>]");
  process.exit(64);
}
const oi = rest.indexOf("--out");
const out = oi >= 0 ? rest[oi + 1]! : DEFAULT_BUNDLE_DIR;
try {
  const m = importBundle(src, loadPin(), out);
  console.log(`imported the Passport bundle (key set ${m.keySet}, passport ${m.passportCommit}, ${Object.keys(m.files).length} files) into ${out}`);
} catch (e) {
  console.error(`error: ${e instanceof BundleError ? e.message : String(e)}`);
  process.exit(1);
}
