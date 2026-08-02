import { Type } from "@sinclair/typebox";

export const midnightUnshieldedCreateGrammar = [
  [
    "payload",
    Type.Object({
      /** Bech32m owner address of the created UTXO */
      owner: Type.String(),
      /** Hex-encoded hash of the creating intent */
      intentHash: Type.String(),
      /** Output index within the creating intent's offer */
      outputIndex: Type.Number(),
      /** u128 value as a decimal string */
      value: Type.String(),
      /** Hex-encoded serialized token type */
      tokenType: Type.String(),
      /** Hash of the creating transaction */
      txHash: Type.String(),
    }),
  ],
] as const;
