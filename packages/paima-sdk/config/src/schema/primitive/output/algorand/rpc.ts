import type { Satisfies } from "@paima/utils";
import type { Static } from "@sinclair/typebox";
import type { AlgorandPrimitivesToSyncProtocol } from "../../config/types.ts";

// ===
// All
// ===

export const syncProtocolResponsesAlgorand = [] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesAlgorand)[number]>["primitive"]],
  [keyof typeof AlgorandPrimitivesToSyncProtocol]
>;
