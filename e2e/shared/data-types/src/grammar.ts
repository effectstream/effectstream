import { Type } from "@sinclair/typebox";
import { type GrammarDefinition, mapPrimitivesToGrammar } from "@paima/concise";
import { localhostConfig } from "./config.ts";
import { PaimaPrimitiveRegistry } from "@e2e/data-types";
// import { PaimaPrimitive } from "@e2e/data-types";

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
  // TODO: How do we get this from the known payload types?
  //       This is a ERC20 transfer.
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
  // Midnight contract state with proper EncodedStateValue schema
  // Auto-generate other primitives, but exclude midnight (we define it explicitly above)
  ...Object.fromEntries(
    Object.entries(mapPrimitivesToGrammar(
      localhostConfig.primitives,
      PaimaPrimitiveRegistry.primitives
    ))
      // .filter(([key]) => key !== "midnightContractState"),
  ),
} as const satisfies GrammarDefinition;

// const foo = mapPrimitivesToGrammar(localhostConfig.primitives);
// localhostConfig.primitives.TransferEvent;
