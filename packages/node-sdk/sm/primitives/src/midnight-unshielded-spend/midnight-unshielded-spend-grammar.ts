import { Type } from "@sinclair/typebox";

export const midnightUnshieldedSpendGrammar = [
  [
    "payload",
    Type.Object({
      /** Bech32m owner address of the spent UTXO */
      owner: Type.String(),
      /** Hex-encoded hash of the intent that CREATED the spent UTXO */
      intentHash: Type.String(),
      /** Output index within the creating intent's offer */
      outputIndex: Type.Number(),
      /** u128 value as a decimal string */
      value: Type.String(),
      /** Hex-encoded serialized token type */
      tokenType: Type.String(),
      /** Hash of the spending transaction */
      txHash: Type.String(),
    }),
  ],
] as const;
