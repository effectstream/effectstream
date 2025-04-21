import { Type } from "@sinclair/typebox";
import { type GrammarDefinition, mapPrimitivesToGrammar } from "@paima/concise";
import { localhostConfig } from "./config.ts";

export const grammar = {
  attack: [
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],
  switchMap: [["mapId", Type.String()]],
  ...mapPrimitivesToGrammar(localhostConfig.primitives),
} as const satisfies GrammarDefinition;

// const foo = mapPrimitivesToGrammar(localhostConfig.primitives);
// localhostConfig.primitives.TransferEvent;
