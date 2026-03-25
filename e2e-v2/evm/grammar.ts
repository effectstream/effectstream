import { builtinGrammars } from "@effectstream/sm/grammar";
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const paimaL2Grammar = {
  add: [
    ["a", Type.Integer()],
    ["b", Type.Integer()],
  ],
  attack: [
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],
  schedule: [
    ["tick", Type.Integer()],
    ["type", Type.Union([Type.Literal("block"), Type.Literal("timestamp")])],
    ["message", Type.String()],
  ],
  throw_error: [],
} as const satisfies GrammarDefinition;

export const grammar = {
  ...paimaL2Grammar,

  "counter-stm": [["counter", Type.Number()]],

  "transfer-assets": builtinGrammars.evmErc721,
  "transfer-erc20": builtinGrammars.evmErc20,
  "transfer-erc1155": builtinGrammars.evmErc1155,
} as const satisfies GrammarDefinition;
