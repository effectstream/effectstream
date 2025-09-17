import { erc20Grammar, erc721Grammar, midnightGenericGrammar } from "@e2e/my-primitives";

import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@paima/concise";

export const grammar = {
  schedule: [
    ["tick", Type.Integer()],
    [
      "type",
      Type.Union([
        Type.Literal("block"),
        Type.Literal("timestamp"),
      ]),
    ],
    ["message", Type.String()],
  ],
  attack: [
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],
  throw_error: [],
  switchMap: [["mapId", Type.String()]],

  // TODO Check if these exist in runtime 
  'midnightContractState': midnightGenericGrammar,
  'transfer-assets': erc721Grammar,
  'transfer-erc20': erc20Grammar,
} as const satisfies GrammarDefinition;
