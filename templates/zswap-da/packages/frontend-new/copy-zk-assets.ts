// Stage every ZK asset the BROWSER prover needs into public/ (Vite copies it
// into dist/ at build, and `vite preview` serves it).
//
// Two kinds of keys are needed for in-browser proving:
//   1. CONTRACT circuit keys — mint_shielded / mint_unshielded / incrementNoun.
//      Compiled into contracts-midnight/.../src/managed/{keys,zkir}.
//   2. zswap + dust PRIMITIVE keys — output / spend / sign. A shielded mint
//      creates a zswap `output`, and midnight-js's FetchZkConfigProvider fetches
//      `keys/midnight/zswap/output.{prover,verifier}` + `zkir/midnight/zswap/
//      output.bzkir` from the app origin. These are NOT emitted by `compact`;
//      they live in the Midnight ZK-params cache the proof server populates
//      (`~/.cache/midnight/zk-params/{zswap,dust}/<version>/`). Without them the
//      browser mint dies with `GET /keys/midnight/zswap/output.prover 404` —
//      FetchZkConfigProvider throws on a non-200 and there is no proof-server
//      fallback for primitive keys.
//
// The primitive copy is best-effort: if the cache is absent (e.g. CI that never
// ran the proof server) we warn and continue — only in-browser proving needs it.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(here, "public");
const CONTRACT_MANAGED = resolve(here, "../contracts-midnight/contract-offer-files/src/managed");

// 1. Contract circuit keys/zkir (fresh each run).
rmSync(join(PUBLIC, "keys"), { recursive: true, force: true });
rmSync(join(PUBLIC, "zkir"), { recursive: true, force: true });
cpSync(join(CONTRACT_MANAGED, "keys"), join(PUBLIC, "keys"), { recursive: true });
cpSync(join(CONTRACT_MANAGED, "zkir"), join(PUBLIC, "zkir"), { recursive: true });
console.log("[copy-zk-assets] contract keys/zkir copied");

// 2. zswap + dust primitive keys from the Midnight ZK-params cache.
const cacheRoot =
  process.env["MIDNIGHT_ZK_PARAMS_DIR"] ||
  process.env["MIDNIGHT_PARAMS_DIR"] ||
  join(homedir(), ".cache", "midnight", "zk-params");

// Highest numeric version dir under <cacheRoot>/<family>/.
function latestVersion(family: string): string | null {
  const dir = join(cacheRoot, family);
  if (!existsSync(dir)) return null;
  const versions = readdirSync(dir)
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .sort((a, b) => b - a);
  return versions.length ? String(versions[0]) : null;
}

function copyPrimitive(family: "zswap" | "dust", circuits: string[]): boolean {
  const v = latestVersion(family);
  if (!v) return false;
  const src = join(cacheRoot, family, v);
  mkdirSync(join(PUBLIC, "keys", "midnight", family), { recursive: true });
  mkdirSync(join(PUBLIC, "zkir", "midnight", family), { recursive: true });
  let copied = 0;
  for (const c of circuits) {
    for (const [ext, sub] of [[".prover", "keys"], [".verifier", "keys"], [".bzkir", "zkir"]] as const) {
      const from = join(src, `${c}${ext}`);
      if (existsSync(from)) {
        cpSync(from, join(PUBLIC, sub, "midnight", family, `${c}${ext}`));
        copied++;
      }
    }
  }
  console.log(`[copy-zk-assets] ${family} primitive keys copied from ${family}/${v} (${copied} files)`);
  return copied > 0;
}

const okZswap = copyPrimitive("zswap", ["output", "spend", "sign"]);
const okDust = copyPrimitive("dust", ["spend"]);
if (!okZswap || !okDust) {
  console.warn(
    `[copy-zk-assets] WARNING: Midnight ZK-params not found under ${cacheRoot} ` +
      `(zswap=${okZswap}, dust=${okDust}). In-browser minting/swaps will 404 on ` +
      `keys/midnight/zswap/*. Run the proof server once to populate the cache, ` +
      `or set MIDNIGHT_ZK_PARAMS_DIR.`,
  );
}
