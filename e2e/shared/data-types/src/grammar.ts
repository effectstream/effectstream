import {
  availGenericGrammar,
  erc20Grammar,
  erc721Grammar,
  midnightGenericGrammar,
} from "@paima/sm";

import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@paima/concise";

export const paimaL2Grammar = {
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
} as const satisfies GrammarDefinition;

export const grammar = {
  ...paimaL2Grammar,

  // TODO Check if these exist in runtime
  "avail-app-state": availGenericGrammar,
  "midnightContractState": midnightGenericGrammar,
  "transfer-assets": erc721Grammar,
  "transfer-erc20": erc20Grammar,
} as const satisfies GrammarDefinition;
