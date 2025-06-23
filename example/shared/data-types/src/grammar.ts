import { Type } from "@sinclair/typebox";
import { type GrammarDefinition, mapPrimitivesToGrammar } from "@paima/concise";
import { localhostConfig } from "./config.ts";

export const grammar = {
  attack: [
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],
  transfer: [
    [
      "payload",
      Type.Object({
        to: Type.String(),
        from: Type.String(),
        value: Type.String(),
      }),
    ],
  ],
  switchMap: [["mapId", Type.String()]],
  ...mapPrimitivesToGrammar(localhostConfig.primitives),
} as const satisfies GrammarDefinition;

// const foo = mapPrimitivesToGrammar(localhostConfig.primitives);
// localhostConfig.primitives.TransferEvent;
