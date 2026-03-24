import { Type } from "@sinclair/typebox";

export const nep245Grammar = [
  ['type', Type.String()],
  ['old_owner_id', Type.String()],
  ['new_owner_id', Type.String()],
  ['token_id', Type.String()],
  ['amount', Type.String()],
  ['isMint', Type.Boolean()],
  ['isBurn', Type.Boolean()],
] as const;
