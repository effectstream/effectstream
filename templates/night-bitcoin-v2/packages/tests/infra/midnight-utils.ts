import path from "path";
import fs from "fs";

const MIDNIGHT_NETWORK_ID = process.env["MIDNIGHT_NETWORK_ID"] || "undeployed";

const CONTRACT_NAMES = ["erc7683", "unshielded-erc20"] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export function getContractsBaseDir(): string {
  return path.resolve(import.meta.dirname!, "../../../packages/contracts-midnight");
}

export function getContractAddressPath(contractName: ContractName): string | null {
  const base = getContractsBaseDir();
  const candidates = [
    path.join(base, `${contractName}.${MIDNIGHT_NETWORK_ID}.json`),
    path.join(base, `${contractName}.${MIDNIGHT_NETWORK_ID.toLowerCase()}.json`),
    path.join(base, `${contractName}.json`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function getContractAddress(contractName: ContractName): string | null {
  const found = getContractAddressPath(contractName);
  if (!found) return null;
  try {
    const json = JSON.parse(fs.readFileSync(found, "utf-8"));
    return json.contractAddress || null;
  } catch {
    return null;
  }
}

export function listContractNames(): readonly ContractName[] {
  return CONTRACT_NAMES;
}
