// Deployment files: `<template>/deployments/<name>.json`.
//
// One file per mode holds every address the node, relayer, CLI and tests need,
// split by chain: `{ "solana": {...}, "midnight": {...} }`. Each deploy script
// owns one section and merges it in, keeping the other section untouched
// (the Midnight deploy script, PR-2 T2.2, owns `midnight`). The files hold
// addresses and heights only — never a secret.
import fs from "node:fs";
import path from "node:path";
import { TEMPLATE_ROOT } from "./keys.ts";

export const DEPLOYMENTS_DIR = path.join(TEMPLATE_ROOT, "deployments");

export type SolanaDeployment = {
  /** "localnet" | "devnet" | … — informational. */
  cluster: string;
  /** Redacted (protocol + host only); the real URL comes from the environment. */
  rpcUrl: string;
  programId: string;
  mint: string;
  mintDecimals: number;
  config: string;
  authority: string;
  vault: string;
  operator: string;
  /** The dev/test user that received test tokens, when the script minted some. */
  user?: string;
  /** Sync start: a confirmed slot at or before the Initialize transaction. */
  startSlot: number;
  /**
   * The cluster's genesis hash (base58, `getGenesisHash`), written by
   * init-local.ts and deploy-devnet.ts since 00058. The node refuses to start
   * against an RPC with another genesis; a file without it (older) is accepted
   * with a warning.
   */
  genesisHash?: string;
  signatures: Record<string, string>;
  updatedAt: string;
};

export type DeploymentFile = {
  solana?: SolanaDeployment;
  midnight?: Record<string, unknown>;
  [section: string]: unknown;
};

export function deploymentPath(nameOrPath: string): string {
  if (nameOrPath.includes("/") || nameOrPath.endsWith(".json")) {
    return path.resolve(nameOrPath);
  }
  return path.join(DEPLOYMENTS_DIR, `${nameOrPath}.json`);
}

export function readDeployment(nameOrPath: string): DeploymentFile | null {
  const file = deploymentPath(nameOrPath);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as DeploymentFile;
}

/** Reads the `solana` section, throwing a clear error when it is missing. */
export function requireSolanaDeployment(nameOrPath: string): SolanaDeployment {
  const d = readDeployment(nameOrPath);
  if (!d?.solana) {
    throw new Error(
      `no "solana" section in ${deploymentPath(nameOrPath)}; run init-local.ts (local) or deploy-devnet.ts (live) first`,
    );
  }
  return d.solana;
}

/** Merges one section into the file (atomic rename), keeping the others. */
export function writeDeploymentSection(
  nameOrPath: string,
  section: string,
  value: unknown,
): string {
  const file = deploymentPath(nameOrPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = readDeployment(file) ?? {};
  const next = { ...current, [section]: value };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return file;
}
