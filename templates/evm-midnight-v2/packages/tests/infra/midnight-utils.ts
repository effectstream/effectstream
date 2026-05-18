import path from "path";
import fs from "fs";

const MIDNIGHT_NETWORK_ID = process.env["MIDNIGHT_NETWORK_ID"] || "undeployed";

export function getContractAddressPath(): string | null {
  const base = path.resolve(import.meta.dirname!, "../../../packages/contracts-midnight");
  const candidates = [
    path.join(base, `contract-round-value.${MIDNIGHT_NETWORK_ID}.json`),
    path.join(base, `contract-round-value.${MIDNIGHT_NETWORK_ID.toLowerCase()}.json`),
    path.join(base, "contract-round-value.json"),
    path.join(base, "contract-round-value", `contract-round-value.${MIDNIGHT_NETWORK_ID}.json`),
    path.join(base, "contract-round-value", "contract-round-value.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function getContractAddress(): string | null {
  const found = getContractAddressPath();
  if (!found) return null;
  try {
    const json = JSON.parse(fs.readFileSync(found, "utf-8"));
    return json.contractAddress || null;
  } catch {
    return null;
  }
}
