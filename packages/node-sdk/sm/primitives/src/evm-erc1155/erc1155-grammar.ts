import { Type } from "@sinclair/typebox";

export const erc1155Grammar = [
    ["to", Type.String()],
    ["from", Type.String()],
    ["tokenId", Type.String()],
    ["amount", Type.String()],
    ["isMint", Type.Boolean()],
    ["isBurn", Type.Boolean()],
    ["operator", Type.String()],
  ] as const;
  