import { Type } from "@sinclair/typebox";

export const erc20Grammar = [
    ['to', Type.String()],
    ['from', Type.String()],
    ['value', Type.String()],
  ] as const;