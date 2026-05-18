export type SecurityNamespaceEntry = {
  block_height: number;
  prefixes: string[];
};
export type HistoricalSecurityNamespace = {
  /**
   * Note:
   *
   * @example
   * [{
   *   block_height: 0,
   *   prefixes: ["original-namespace"],
   * }, {
   *   // this entry acts as a transition from "original-namespace" to "new-namespace"
   *   block_height: 100,
   *   prefixes: ["original-namespace", "new-namespace"],
   * }, {
   *   block_height: 200,
   *   prefixes: ["new-namespace"],
   * }]
   */
  read: SecurityNamespaceEntry[] & { block_height: 0; prefixes: string[] };
  /**
   * Which namespace to use when creating new transition
   * This is set to explicitly be able to set which namespace to use during a transition
   */
  write: string;
};
export type SecurityNamespace = string | HistoricalSecurityNamespace;

function getEntry(
  namespace: HistoricalSecurityNamespace,
  currentBlockHeight: number,
): undefined | string[] {
  let highestEntry: SecurityNamespaceEntry | null = null;
  for (const entry of namespace.read) {
    if (
      highestEntry == null || // first entry we see
      entry.block_height > highestEntry?.block_height // new best entry candidate
    ) {
      // ignore future changes
      if (currentBlockHeight >= entry.block_height) {
        highestEntry = entry;
      }
    }
  }
  return highestEntry?.prefixes;
}
export function getReadNamespaces(
  namespace: SecurityNamespace | undefined,
  blockHeight: number,
): (string | null)[] {
  // Apps that never call setSecurityNamespace round-trip with a `null` prefix
  // on both signer and verifier sides — keep that legacy path working.
  if (namespace === undefined) {
    return [null];
  }
  if (typeof namespace === "string") {
    return [namespace];
  }
  const entry = getEntry(namespace, blockHeight);
  if (entry == null) {
    throw new Error(
      `No matching namespace found for blockheight ${blockHeight}`,
    );
  }
  return entry;
}

/**
 * Which namespace to use when creating transactions
 * Note: new transactions are always made using the same constant namespace
 */
export function getWriteNamespace(
  namespace: SecurityNamespace | undefined,
): string | null {
  if (namespace === undefined) {
    return null;
  }
  if (typeof namespace === "string") {
    return namespace;
  }
  return namespace.write;
}
