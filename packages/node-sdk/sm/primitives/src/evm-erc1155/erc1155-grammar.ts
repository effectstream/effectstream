import { Type } from "@sinclair/typebox";

export const erc1155Grammar = [
    ["type", Type.String()],
    ["to", Type.String()],
    ["from", Type.String()],
    ["tokenId", Type.String()],
    ["amount", Type.String()],
    ["isMint", Type.Boolean()],
    ["isBurn", Type.Boolean()],
    ["operator", Type.String()],
  ] as const;
  