import { builtinGrammars } from "@effectstream/sm/grammar";
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

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

  "counter-stm": [["counter", Type.Number()]],

  "transfer-assets": builtinGrammars.evmErc721,
  "transfer-erc20": builtinGrammars.evmErc20,
  "transfer-erc1155": builtinGrammars.evmErc1155,
} as const satisfies GrammarDefinition;
