import { Type } from "@sinclair/typebox";

export const erc721Grammar = [
    ["to", Type.String()],
    ["from", Type.String()],
    ["tokenId", Type.String()],
    ["isBurn", Type.Boolean()],
  ] as const;
  