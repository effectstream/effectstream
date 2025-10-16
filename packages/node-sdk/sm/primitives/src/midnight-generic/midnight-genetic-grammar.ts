import { Type } from "@sinclair/typebox";

export const midnightGenericGrammar = [
    [
      "payload",
      Type.Recursive((Self) =>
        Type.Union([
          Type.Object({
            tag: Type.Literal("cell"),
            content: Self,
          }),
          Type.Object({
            tag: Type.Literal("array"),
            content: Type.Array(Self),
          }),
          Type.Object({
            tag: Type.Literal('map'),
            content: Type.Union([
              Type.Object({}),
              Type.Array(Type.Tuple([Type.Any(), Type.Any()])),
            ]),
          }),
          Type.Object({
            value: Type.Array(Type.Record(Type.String(), Type.Number())),
            alignment: Type.Array(Self),
          }),
          Type.Object({
            tag: Type.Literal("atom"),
            value: Self,
          }),
          Type.Object({
            tag: Type.Literal("bytes"),
            length: Type.Number(),
          }),
          Type.Object({
            tag: Type.Optional(Type.Literal("null")),
          }),
        ])
      ),
    ],
  ] as const;