import { Type } from "@sinclair/typebox";

export const transferGrammar = [
  ["txId", Type.String()],
  ["metadata", Type.String()],
  [
    "inputCredentials",
    Type.String({
      deprecated: true,
      description:
        "Deprecated: JSON array of raw verification keys. Use signerKeyHashes.",
    }),
  ],
  ["outputs", Type.String()],
  // The default lets state machines parse historical four-field tuples.
  [
    "signerKeyHashes",
    Type.String({
      default: "[]",
      description: "JSON array of Cardano verification key hashes.",
    }),
  ],
] as const;
