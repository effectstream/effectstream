/**
 * Parses a NEAR Intents Verifier namespaced token ID.
 *
 * Token IDs follow the format: `standard:contract[:localId]`
 * Examples:
 *   "nep141:wrap.near"           → { standard: "nep141", contract: "wrap.near", localId: null }
 *   "nep171:nft.near:token42"    → { standard: "nep171", contract: "nft.near", localId: "token42" }
 *   "nep245:game.near:sword"     → { standard: "nep245", contract: "game.near", localId: "sword" }
 */
export type ParsedTokenId = {
  standard: string;
  contract: string;
  localId: string | null;
};

export function parseIntentTokenId(tokenId: string): ParsedTokenId {
  const firstColon = tokenId.indexOf(":");
  if (firstColon === -1) {
    return { standard: "unknown", contract: tokenId, localId: null };
  }

  const standard = tokenId.slice(0, firstColon);
  const rest = tokenId.slice(firstColon + 1);

  const secondColon = rest.indexOf(":");
  if (secondColon === -1) {
    return { standard, contract: rest, localId: null };
  }

  return {
    standard,
    contract: rest.slice(0, secondColon),
    localId: rest.slice(secondColon + 1),
  };
}

/**
 * Simple glob matcher supporting `*` (matches any characters except `.`)
 * and `**` or trailing `*` (matches everything).
 */
export function matchesGlob(pattern: string, value: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^.]*");
  return new RegExp(`^${regex}$`).test(value);
}
