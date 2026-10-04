// The Passport bundle (plan 00058 Interfaces D-5, questions Q3 A): the subset of a VERIFIED Night
// Market key volume (`<volume>/account`) the adapter proves `deposit_shielded` with, copied into a
// gitignored directory INSIDE this package (bundle/account), so the compiled account module resolves
// this package's `@midnight-ntwrk/compact-runtime-0.20` (00058 finding F-G1).
//
// import: the volume's `.night-market-keys.json` says VERIFIED, its fingerprint and passport commit
//   (and account source sha256) are the pin's, `keys/deposit_shielded.verifier` hashes to the pin's
//   digest, and the prover key and the ZKIR are there. `bundle.json` records every copied file's
//   sha256.
// verify (every node start, FR-006): bundle.json is the pin's, every file still has its recorded
//   sha256, and the verifier key still is the pinned one. A mismatch → the node refuses to start.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PassportPin } from "./pin.ts";

export const BUNDLE_FILES = [
  "contract/index.js",
  "contract/index.d.ts",
  "contract/index.js.map",
  "compiler/contract-info.json",
  "compiler/contract-manifest.json",
  "zkir/deposit_shielded.zkir",
  "zkir/deposit_shielded.bzkir",
  "keys/deposit_shielded.prover",
  "keys/deposit_shielded.verifier",
] as const;

export const DEFAULT_BUNDLE_DIR = path.resolve(import.meta.dirname!, "bundle/account");
export const BUNDLE_MANIFEST = "bundle.json";
export const BUNDLE_FORMAT = "solana-midnight-bridge.passport-bundle/1";

export class BundleError extends Error {
  override name = "BundleError";
}

const sha256File = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

type VolumeReport = {
  verdict?: string;
  fingerprint?: string;
  build?: { passportCommit?: string; accountSourceSha256?: string };
};

/** Copies the bundle out of a verified key volume's `account` directory. */
export function importBundle(volumeAccountDir: string, pin: PassportPin, bundleDir: string = DEFAULT_BUNDLE_DIR) {
  const src = path.resolve(volumeAccountDir);
  const reportFile = path.join(path.dirname(src), ".night-market-keys.json");
  if (!fs.existsSync(reportFile)) throw new BundleError(`no key-volume report at ${reportFile}`);
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as VolumeReport;
  if (report.verdict !== "VERIFIED") throw new BundleError(`the key volume's verdict is ${JSON.stringify(report.verdict)}, not VERIFIED`);
  if (report.fingerprint !== pin.keySet) throw new BundleError(`the key volume's fingerprint ${report.fingerprint} is not the pinned key set ${pin.keySet}`);
  if (report.build?.passportCommit !== pin.passportCommit) {
    throw new BundleError(`the key volume's passport commit ${report.build?.passportCommit} is not the pinned ${pin.passportCommit}`);
  }
  if (report.build?.accountSourceSha256 !== undefined && report.build.accountSourceSha256 !== pin.accountSourceSha256) {
    throw new BundleError(`the key volume's account source ${report.build.accountSourceSha256} is not the pinned ${pin.accountSourceSha256}`);
  }
  for (const f of BUNDLE_FILES) {
    const p = path.join(src, f);
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) throw new BundleError(`the key volume lacks ${f}`);
  }
  const vk = sha256File(path.join(src, "keys/deposit_shielded.verifier"));
  if (vk !== pin.circuits.deposit_shielded) {
    throw new BundleError(`the key volume's deposit_shielded verifier key is ${vk}, the pin's is ${pin.circuits.deposit_shielded}`);
  }
  const tmp = `${bundleDir}.${process.pid}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  const files: Record<string, string> = {};
  for (const f of BUNDLE_FILES) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(src, f), path.join(tmp, f));
    files[f] = sha256File(path.join(tmp, f));
  }
  const manifest = {
    format: BUNDLE_FORMAT,
    keySet: pin.keySet,
    passportCommit: pin.passportCommit,
    accountSourceSha256: pin.accountSourceSha256,
    importedFrom: src,
    importedAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(path.join(tmp, BUNDLE_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(bundleDir), { recursive: true });
  fs.renameSync(tmp, bundleDir);
  return manifest;
}

/** The start-up check (FR-006). Returns the number of files checked. */
export function verifyBundle(bundleDir: string, pin: PassportPin): { files: number } {
  const mf = path.join(bundleDir, BUNDLE_MANIFEST);
  if (!fs.existsSync(mf)) {
    throw new BundleError(`no Passport bundle at ${bundleDir}: run \`bun run delivery:import-bundle <key-volume>/account\``);
  }
  const m = JSON.parse(fs.readFileSync(mf, "utf8")) as { format?: string; keySet?: string; passportCommit?: string; files?: Record<string, string> };
  if (m.format !== BUNDLE_FORMAT) throw new BundleError(`${mf} is not a Passport bundle manifest`);
  if (m.keySet !== pin.keySet) throw new BundleError(`the bundle is key set ${m.keySet}, the pin is ${pin.keySet}: re-import it`);
  if (m.passportCommit !== pin.passportCommit) throw new BundleError(`the bundle is passport ${m.passportCommit}, the pin is ${pin.passportCommit}: re-import it`);
  for (const f of BUNDLE_FILES) {
    const p = path.join(bundleDir, f);
    if (!fs.existsSync(p)) throw new BundleError(`the bundle lacks ${f}`);
    const sha = sha256File(p);
    if (m.files?.[f] !== sha) throw new BundleError(`the bundle's ${f} changed since it was imported (sha256 ${sha})`);
  }
  const vk = m.files!["keys/deposit_shielded.verifier"];
  if (vk !== pin.circuits.deposit_shielded) {
    throw new BundleError(`the bundle's deposit_shielded verifier key ${vk} is not the pinned ${pin.circuits.deposit_shielded}`);
  }
  return { files: BUNDLE_FILES.length };
}
