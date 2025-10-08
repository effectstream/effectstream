import { Type } from "@sinclair/typebox";

export const midnightGenericGrammar = [
    [
      "payload",
      // As type is unknown, we use a recursive wrapper with a "payload" key.
      Type.Recursive((Self) =>
        Type.Union([
          Type.Object({
            tag: Type.Literal("null"),
          }),
          Type.Object({
            tag: Type.Literal("cell"),
            content: Self,
          }),
          Type.Object({
            tag: Type.Literal("array"),
            content: Type.Array(Self),
          }),
          Type.Object({
            tag: Type.Literal("map"),
            content: Type.Array(Type.Tuple([Type.Any(), Type.Any()])),
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
        ])
      ),
    ],
  ] as const;