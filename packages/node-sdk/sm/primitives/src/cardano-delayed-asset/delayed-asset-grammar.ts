import { Type } from "@sinclair/typebox";

export const delayedAssetGrammar = [
  ["address", Type.String()],
  ["txId", Type.String()],
  ["outputIndex", Type.String()],
  ["cip14Fingerprint", Type.String()],
  ["amount", Type.String()],
  ["policyId", Type.String()],
  ["assetName", Type.String()],
] as const;
