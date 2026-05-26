import { Type } from "@sinclair/typebox";

export const projectedNftGrammar = [
  ["ownerAddress", Type.String()],
  ["previousTxId", Type.String()],
  ["previousOutputIndex", Type.String()],
  ["currentTxId", Type.String()],
  ["currentOutputIndex", Type.String()],
  ["policyId", Type.String()],
  ["assetName", Type.String()],
  ["status", Type.String()],
  ["forHowLong", Type.String()],
] as const;
