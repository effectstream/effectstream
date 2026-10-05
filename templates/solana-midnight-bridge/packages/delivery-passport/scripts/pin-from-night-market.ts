#!/usr/bin/env bun
// Generates pin/passport-account.pin.json (plan 00058 Interfaces D-4) from a Night Market checkout:
//   bun scripts/pin-from-night-market.ts <night-market-dir> [--commit <sha>]
// It reads packages/core/src/passport/pinned-account-keys.ts (the circuits Night Market's accounts
// carry, with the SHA-256 of each verifier key, the key-set fingerprint and the passport commit)
// and deploy/key-volume/build.sh (the account source sha256 the key job compiles). It REFUSES when
// the pin file's sha256 is not the one recorded below: a changed key set is a deliberate re-pin
// (update EXPECTED_SOURCE_SHA256 and record why in the 00058 plan); accounts of the old key set
// then become `not-a-passport-account`.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const EXPECTED_SOURCE_SHA256 = "ca17f0654b435129e84a3fa02f17cd146b6bdcf1151a173836d9e8345c005da7";
const SOURCE_FILE = "packages/core/src/passport/pinned-account-keys.ts";
const OUT = path.resolve(import.meta.dirname!, "../pin/passport-account.pin.json");

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun scripts/pin-from-night-market.ts <night-market-dir> [--commit <sha>]");
  process.exit(64);
}
const ci = process.argv.indexOf("--commit");
const git = (...a: string[]) => {
  const r = spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const head = git("rev-parse", "HEAD");
const commit = ci >= 0 ? process.argv[ci + 1]! : head;
if (git("rev-parse", `${commit}^{tree}`) !== git("rev-parse", "HEAD^{tree}")) {
  throw new Error(`--commit ${commit} is not the checkout's tree (HEAD ${head})`);
}
if (git("status", "--porcelain", "--", SOURCE_FILE) !== "") throw new Error(`${SOURCE_FILE} has local changes`);

const src = fs.readFileSync(path.join(dir, SOURCE_FILE));
const sha = createHash("sha256").update(src).digest("hex");
if (sha !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`${SOURCE_FILE} has sha256 ${sha}, not the pinned ${EXPECTED_SOURCE_SHA256}: a key-set change is a deliberate re-pin`);
}
const text = src.toString("utf8");
const one = (re: RegExp, what: string) => {
  const m = re.exec(text);
  if (!m) throw new Error(`no ${what} in ${SOURCE_FILE}`);
  return m[1]!;
};
const keySet = one(/keySet:\s*'([0-9a-f]{64})'/, "keySet");
const passportCommit = one(/passportCommit:\s*'([0-9a-f]{40})'/, "passportCommit");
const block = one(/circuits:\s*\{([\s\S]*?)\}/, "circuits");
const circuits: Record<string, string> = {};
for (const m of block.matchAll(/([a-z_0-9]+):\s*'([0-9a-f]{64})'/g)) circuits[m[1]!] = m[2]!;
if (Object.keys(circuits).length === 0) throw new Error("no circuits parsed");
const buildSh = fs.readFileSync(path.join(dir, "deploy/key-volume/build.sh"), "utf8");
const accountSourceSha256 = /ACCOUNT_PIN="\$\{KEYS_ACCOUNT_SOURCE_SHA256:-([0-9a-f]{64})\}"/.exec(buildSh)?.[1];
if (!accountSourceSha256) throw new Error("no ACCOUNT_PIN in deploy/key-volume/build.sh");

const pin = {
  source: { repo: "acedward/solana-night-market", commit, file: SOURCE_FILE, sha256: sha },
  keySet,
  passportCommit,
  accountSourceSha256,
  circuits: Object.fromEntries(Object.entries(circuits).sort(([a], [b]) => (a < b ? -1 : 1))),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pin, null, 2) + "\n");
console.log(`wrote ${OUT}: key set ${keySet}, passport ${passportCommit}, ${Object.keys(circuits).length} circuits`);
