import {
  builtinGrammars
} from "@paima/sm/grammar";

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

  // Custom Grammars
  "counter-stm": [["counter", Type.Number()]],

  // TODO Check if these exist in runtime
  "avail-app-state": builtinGrammars.availGeneric,
  "midnightContractState": builtinGrammars.midnightGeneric,
  "transfer-assets": builtinGrammars.evmErc721,
  "transfer-erc20": builtinGrammars.evmErc20,
  "transfer-erc1155": builtinGrammars.evmErc1155,
} as const satisfies GrammarDefinition;
