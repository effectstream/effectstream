import { Type } from "@sinclair/typebox";

export const mctErc1155Grammar = [
    ["from", Type.String()],
    ["midnight_address", Type.String()],
    ["amount", Type.String()],
    ["token_id", Type.String()],
    ["tx_hash", Type.String()],
  ] as const;