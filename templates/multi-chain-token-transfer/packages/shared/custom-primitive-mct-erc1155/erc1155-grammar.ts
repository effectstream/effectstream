import { Type } from "@sinclair/typebox";

export const mctErc1155Grammar = [
    ["from", Type.String()],
    ["midnight_address", Type.String()],
    ["amount", Type.String()],
  ] as const;
  