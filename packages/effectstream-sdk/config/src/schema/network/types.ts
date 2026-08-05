export enum ConfigNetworkType {
  NTP = "ntp",
  EVM = "evm",
  CARDANO = "cardano",
  MINA = "mina",
  ALGORAND = "algorand",
  /** generic substrate network */
  SUBSTRATE = "substrate",
  AVAIL = "avail",
  MIDNIGHT = "midnight",
  BITCOIN = "bitcoin",
  CELESTIA = "celestia",
  NEAR = "near",
  SOLANA = "solana",
  /**
   * Synthetic, fully in-memory chain used for deterministic tests.
   * Blocks are computed arithmetically (no RPC). Excluded from publishing.
   * See packages/node-sdk/sync/src/sync-protocols/test/.
   */
  TEST = "test",
}
