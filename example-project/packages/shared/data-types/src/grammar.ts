import { Type } from "@sinclair/typebox";
import {
  type GrammarDefinition,
  mapPrimitivesToGrammar,
} from "@paimaexample/concise";
import { localhostConfig } from "./config.ts";

export const grammar = {
  //   {"tag":"array","content":[{"tag":"cell","content":{"value":[{"0":1}],"alignment":[{"tag":"atom","value":{"tag":"bytes","length":8}}]}},{"tag":"cell","content":{"value":[{"0":1}],"alignment":[{"tag":"atom","value":{"tag":"bytes","length":20}}]}},{"tag":"cell","content":{"value":[{"0":84,"1":65,"2":146,"3":119,"4":152,"5":1}],"alignment":[{"tag":"atom","value":{"tag":"bytes","length":20}}]}},{"tag":"cell","content":{"value":[{"0":76,"1":101,"2":118,"3":101,"4":108,"5":32,"6":32,"7":32,"8":32,"9":32,"10":32,"11":32,"12":32,"13":32,"14":32,"15":32,"16":32,"17":32,"18":32,"19":32,"20":32,"21":32,"22":32,"23":32,"24":32,"25":32,"26":32,"27":32,"28":32,"29":32,"30":32,"31":32}],"alignment":[{"tag":"atom","value":{"tag":"bytes","length":32}}]}},{"tag":"cell","content":{"value":[{"0":49,"1":32,"2":32,"3":32,"4":32,"5":32,"6":32,"7":32,"8":32,"9":32,"10":32,"11":32,"12":32,"13":32,"14":32,"15":32,"16":32,"17":32,"18":32,"19":32,"20":32,"21":32,"22":32,"23":32,"24":32,"25":32,"26":32,"27":32,"28":32,"29":32,"30":32,"31":32}],"alignment":[{"tag":"atom","value":{"tag":"bytes","length":32}}]}}]}
  "transfer-assets": [
    [
      "payload",
      Type.Object({
        to: Type.String(),
        from: Type.String(),
        tokenId: Type.String(),
        isBurn: Type.Boolean(),
      }),
    ],
  ],
  // "transfer": [
  //   [
  //     "payload",
  //     Type.Object({
  //       to: Type.String(),
  //       from: Type.String(),
  //       tokenId: Type.String(),
  //       isBurn: Type.Boolean(),
  //     }),
  //   ],
  // ],
  // Midnight contract state with proper EncodedStateValue schema
  midnightContractState: [
    [
      "payload",
      Type.Object({
        tag: Type.Literal("array"),
        content: Type.Array(
          Type.Object({
            tag: Type.Literal("cell"),
            content: Type.Object({
              value: Type.Array(
                Type.Record(Type.String(), Type.Number()),
              ),
              alignment: Type.Array(
                Type.Object({
                  tag: Type.Literal("atom"),
                  value: Type.Object({
                    tag: Type.Literal("bytes"),
                    length: Type.Number(),
                  }),
                }),
              ),
            }),
          }),
        ),
      }),
    ],
  ],
  // Auto-generate other primitives, but exclude midnight (we define it explicitly above)
  ...Object.fromEntries(
    Object.entries(mapPrimitivesToGrammar(localhostConfig.primitives))
      .filter(([key]) => key !== "midnightContractState"),
  ),
} as const satisfies GrammarDefinition;

// const foo = mapPrimitivesToGrammar(localhostConfig.primitives);
// localhostConfig.primitives.TransferEvent;
