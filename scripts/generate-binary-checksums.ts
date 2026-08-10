/**
 * Regenerate the pinned SHA-256 tables for the `packages/binaries/*` wrappers.
 *
 *   bun scripts/generate-binary-checksums.ts               # all packages
 *   bun scripts/generate-binary-checksums.ts bitcoin-core  # one package
 *   bun scripts/generate-binary-checksums.ts --check       # verify, write nothing
 *
 * Replaces the hand-run `shasum -a 256 vendor/bin/<binary>` instruction that
 * used to live in a docblock. That only ever produced a digest for the machine
 * you happened to be on, which is why the tables were incomplete.
 *
 * WHAT IS AND IS NOT PROVEN
 *
 * The wrappers verify the *extracted binary*, because bin-wrapper throws the
 * archive away. Upstream projects publish sums for the *archive*. So where an
 * upstream SHA256SUMS exists this script builds a chain: fetch the archive,
 * check it against the published sum, and only then extract and hash the binary.
 * That makes the recorded digest traceable to something the vendor signed.
 *
 * Where no upstream sums exist, the digest is recorded from whatever this script
 * downloaded. Be clear about what that is worth: it pins the artifact against
 * *later* mutation, and it does not establish that the artifact was good in the
 * first place. Provenance is recorded per entry so a reader can tell the two
 * apart instead of assuming the stronger one.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type Asset = {
  /** Platform key used in the emitted table. Cosmetic: matching is set-based. */
  platform: string;
  url: string;
  /** Basename of the file the wrapper's `.use()` resolves to. */
  binary: string;
};

type PackageSpec = {
  dir: string;
  version: string;
  /** Upstream checksum manifest covering the ARCHIVES, when one is published. */
  sumsUrl?: string;
  assets: Asset[];
};

const BITCOIN = "https://bitcoincore.org/bin/bitcoin-core-28.1";
const LOKI = "https://github.com/grafana/loki/releases/download/v3.5.8";
const ALLOY = "https://github.com/grafana/alloy/releases/download/v1.11.3";

const SPECS: PackageSpec[] = [
  {
    dir: "bitcoin-core",
    version: "28.1",
    sumsUrl: `${BITCOIN}/SHA256SUMS`,
    assets: [
      { platform: "linux-x64", url: `${BITCOIN}/bitcoin-28.1-x86_64-linux-gnu.tar.gz`, binary: "bitcoind" },
      { platform: "linux-arm64", url: `${BITCOIN}/bitcoin-28.1-aarch64-linux-gnu.tar.gz`, binary: "bitcoind" },
      { platform: "darwin-arm64", url: `${BITCOIN}/bitcoin-28.1-arm64-apple-darwin.tar.gz`, binary: "bitcoind" },
      { platform: "darwin-x64", url: `${BITCOIN}/bitcoin-28.1-x86_64-apple-darwin.tar.gz`, binary: "bitcoind" },
    ],
  },
  {
    dir: "grafana-loki",
    version: "3.5.8",
    sumsUrl: `${LOKI}/SHA256SUMS`,
    assets: [
      { platform: "linux-x64", url: `${LOKI}/loki-linux-amd64.zip`, binary: "loki-linux-amd64" },
      { platform: "linux-arm64", url: `${LOKI}/loki-linux-arm64.zip`, binary: "loki-linux-arm64" },
      { platform: "darwin-x64", url: `${LOKI}/loki-darwin-amd64.zip`, binary: "loki-darwin-amd64" },
      { platform: "darwin-arm64", url: `${LOKI}/loki-darwin-arm64.zip`, binary: "loki-darwin-arm64" },
      { platform: "win32-x64", url: `${LOKI}/loki-windows-amd64.exe.zip`, binary: "loki-windows-amd64.exe" },
    ],
  },
  {
    dir: "grafana-alloy",
    version: "1.11.3",
    sumsUrl: `${ALLOY}/SHA256SUMS`,
    assets: [
      { platform: "linux-x64", url: `${ALLOY}/alloy-linux-amd64.zip`, binary: "alloy-linux-amd64" },
      { platform: "linux-arm64", url: `${ALLOY}/alloy-linux-arm64.zip`, binary: "alloy-linux-arm64" },
      { platform: "darwin-x64", url: `${ALLOY}/alloy-darwin-amd64.zip`, binary: "alloy-darwin-amd64" },
      { platform: "darwin-arm64", url: `${ALLOY}/alloy-darwin-arm64.zip`, binary: "alloy-darwin-arm64" },
      { platform: "win32-x64", url: `${ALLOY}/alloy-windows-amd64.exe.zip`, binary: "alloy-windows-amd64.exe" },
    ],
  },
];

const ROOT = path.resolve(import.meta.dirname, "..");
const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

/**
 * Archives are cached by filename so a re-run after one bad asset does not
 * re-download the other gigabyte. Override with BINARY_CHECKSUM_CACHE.
 * Integrity does not depend on the cache being honest: a cached file still has
 * to match the upstream sum, and where there is no upstream sum the digest is
 * only ever claimed as self-recorded.
 */
const CACHE_DIR = process.env.BINARY_CHECKSUM_CACHE ??
  path.join(tmpdir(), "effectstream-binary-checksums");

async function fetchArchive(url: string, name: string): Promise<Uint8Array> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, name);
  if (existsSync(cached)) {
    console.log(`  (cached) ${name}`);
    return new Uint8Array(readFileSync(cached));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  // A truncated transfer must not reach the cache. These assets are large enough
  // that an interrupted download is a realistic event, and a partial archive can
  // still look structurally valid (a cut-short zip keeps a readable header), so
  // "it extracted" is not evidence of completeness.
  const declared = res.headers.get("content-length");
  if (declared && Number(declared) !== bytes.byteLength) {
    throw new Error(
      `truncated download for ${name}: got ${bytes.byteLength} bytes, ` +
        `content-length said ${declared}`,
    );
  }

  // Write to a sibling then rename, so an interrupted run cannot leave a partial
  // file under the real name for the next run to trust.
  const part = `${cached}.part`;
  writeFileSync(part, bytes);
  renameSync(part, cached);
  return bytes;
}

/** Fetch and parse a `<digest>  <filename>` manifest into a lookup. */
async function fetchSums(url: string): Promise<Map<string, string>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sums fetch failed ${res.status} for ${url}`);
  const map = new Map<string, string>();
  for (const line of (await res.text()).split("\n")) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (m) map.set(m[2]!, m[1]!.toLowerCase());
  }
  return map;
}

/** Extract with the system tool, then locate the target by basename. */
function extractAndHash(archive: string, binary: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "binchk-"));
  try {
    const isZip = archive.endsWith(".zip");
    const cmd = isZip
      ? ["unzip", "-qo", archive, "-d", dir]
      : ["tar", "-xzf", archive, "-C", dir];
    const proc = Bun.spawnSync(cmd);
    if (!proc.success) {
      throw new Error(`extract failed: ${new TextDecoder().decode(proc.stderr)}`);
    }
    // Found by basename rather than a fixed path: archives differ in whether
    // they carry a top-level version directory, and bin-wrapper's strip depth
    // is not something we should be re-deriving here.
    const found = Bun.spawnSync(["find", dir, "-type", "f", "-name", binary]);
    const hit = new TextDecoder().decode(found.stdout).split("\n")[0]?.trim();
    if (!hit) throw new Error(`binary '${binary}' not found in ${archive}`);
    return sha256(readFileSync(hit));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function processPackage(spec: PackageSpec, check: boolean) {
  console.log(`\n=== ${spec.dir} v${spec.version} ===`);
  const sums = spec.sumsUrl ? await fetchSums(spec.sumsUrl) : undefined;
  if (spec.sumsUrl) {
    console.log(`  upstream sums: ${sums!.size} entries from ${spec.sumsUrl}`);
  } else {
    console.log(`  upstream sums: none published, digests are self-recorded`);
  }

  const checksums: Record<string, string> = {};
  const provenance: Record<string, string> = {};

  for (const asset of spec.assets) {
    const name = path.basename(new URL(asset.url).pathname);
    const bytes = await fetchArchive(asset.url, name);
    const archiveDigest = sha256(bytes);

    let prov = "self-recorded";
    const want = sums?.get(name);
    if (want) {
      if (want !== archiveDigest) {
        throw new Error(
          `ARCHIVE MISMATCH for ${name}\n  upstream ${want}\n  got      ${archiveDigest}`,
        );
      }
      prov = "upstream-verified";
    } else if (sums) {
      console.log(`  ! ${name}: no line in upstream sums, falling back to self-recorded`);
    }

    const tmp = path.join(mkdtempSync(path.join(tmpdir(), "binchk-ar-")), name);
    writeFileSync(tmp, bytes);
    try {
      const digest = extractAndHash(tmp, asset.binary);
      checksums[asset.platform] = digest;
      provenance[asset.platform] = prov;
      console.log(`  ${asset.platform.padEnd(14)} ${digest}  (${prov})`);
    } finally {
      rmSync(path.dirname(tmp), { recursive: true, force: true });
    }
  }

  const target = path.join(ROOT, "packages/binaries", spec.dir, "checksums.js");
  const body = renderModule(spec, checksums, provenance);

  if (check) {
    const current = await Bun.file(target).text().catch(() => "");
    if (current.trim() !== body.trim()) {
      console.error(`  DRIFT: ${target} does not match the live artifacts`);
      process.exitCode = 1;
    } else {
      console.log(`  up to date`);
    }
    return;
  }
  writeFileSync(target, body);
  console.log(`  wrote ${path.relative(ROOT, target)}`);
}

function renderModule(
  spec: PackageSpec,
  checksums: Record<string, string>,
  provenance: Record<string, string>,
): string {
  const rows = Object.entries(checksums)
    .map(([k, v]) => `  '${k}': '${v}',`)
    .join("\n");
  const provRows = Object.entries(provenance)
    .map(([k, v]) => `  '${k}': '${v}',`)
    .join("\n");
  return `// GENERATED FILE. Do not edit by hand.
// Regenerate with: bun scripts/generate-binary-checksums.ts ${spec.dir}
//
// SHA-256 of the extracted binary in each pinned v${spec.version} asset.
//
// 'upstream-verified' means the archive this digest came from matched the
// checksum the vendor publishes, so the digest is traceable to the vendor.
// 'self-recorded' means no upstream manifest was available: the digest pins the
// artifact against later mutation but does not attest that it was ever good.
export const CHECKSUM_VERSION = '${spec.version}';

export const CHECKSUMS = {
${rows}
};

export const CHECKSUM_PROVENANCE = {
${provRows}
};
`;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const only = args.filter((a) => !a.startsWith("--"));
const selected = only.length
  ? SPECS.filter((s) => only.includes(s.dir))
  : SPECS;

if (selected.length === 0) {
  console.error(`No matching package. Known: ${SPECS.map((s) => s.dir).join(", ")}`);
  process.exit(1);
}

for (const spec of selected) {
  await processPackage(spec, check);
}
console.log("\ndone");
