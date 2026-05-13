export type MidnightLedgerSnapshot = {
  tokenMintCount: bigint;
  swapCompletionCount: bigint;
  lastCompletedSwapId: bigint;
  lastCompletionRef: string;
  lastMintTokenColor: string;
  lastMintAmount: bigint;
};

// Note: offer-blob parsing lives in mip-zswap-offer now.
// Use deserializeOffer() / validateOffer() from that package.

export function normalizeHex32(value: string): string {
  const clean = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(clean)) {
    throw new Error("tokenColorHex must be a hex string");
  }
  if (clean.length > 64) {
    throw new Error("tokenColorHex must be 32 bytes (64 hex chars)");
  }
  return `0x${clean.padStart(64, "0")}`;
}

export function extractMidnightLedgerSnapshot(
  payload: unknown,
): MidnightLedgerSnapshot | null {
  const root = toRecord(payload);
  if (!root) return null;

  const tokenMintCount = toBigIntDeep(root, ["tokenMintCount", "token_mint_count"]);
  const swapCompletionCount = toBigIntDeep(root, [
    "swapCompletionCount",
    "swap_completion_count",
  ]);
  const lastCompletedSwapId = toBigIntDeep(root, [
    "lastCompletedSwapId",
    "last_completed_swap_id",
  ]);
  const lastCompletionRef = toStringDeep(root, [
    "lastCompletionRef",
    "last_completion_ref",
  ]);
  const lastMintTokenColor = toStringDeep(root, [
    "lastMintTokenColor",
    "last_mint_token_color",
  ]);
  const lastMintAmount = toBigIntDeep(root, ["lastMintAmount", "last_mint_amount"]);

  if (
    tokenMintCount === null ||
    swapCompletionCount === null ||
    lastCompletedSwapId === null ||
    lastCompletionRef === null ||
    lastMintTokenColor === null ||
    lastMintAmount === null
  ) {
    return null;
  }

  return {
    tokenMintCount,
    swapCompletionCount,
    lastCompletedSwapId,
    lastCompletionRef,
    lastMintTokenColor,
    lastMintAmount,
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toBigIntDeep(
  root: Record<string, unknown>,
  candidateKeys: string[],
): bigint | null {
  const found = findDeep(root, candidateKeys);
  if (found === null || found === undefined) return null;
  if (typeof found === "bigint") return found;
  if (typeof found === "number" && Number.isFinite(found)) return BigInt(found);
  if (typeof found === "string" && found.trim().length > 0) {
    try {
      return BigInt(found);
    } catch {
      return null;
    }
  }
  return null;
}

function toStringDeep(
  root: Record<string, unknown>,
  candidateKeys: string[],
): string | null {
  const found = findDeep(root, candidateKeys);
  if (typeof found === "string") return found;
  if (found instanceof Uint8Array) return `0x${toHex(found)}`;
  return null;
}

function findDeep(
  value: unknown,
  candidateKeys: string[],
): unknown | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of candidateKeys) {
    if (key in record) return record[key];
  }

  for (const nested of Object.values(record)) {
    if (!nested || typeof nested !== "object") continue;
    const result = findDeep(nested, candidateKeys);
    if (result !== null && result !== undefined) return result;
  }
  return null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildCompletionRefAsync(swapId: number): Promise<string> {
  const source = new TextEncoder().encode(`zswap:${swapId}:${Date.now()}`);
  const digest = await crypto.subtle.digest("SHA-256", source);
  return `0x${toHex(new Uint8Array(digest))}`;
}
