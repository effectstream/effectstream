import { Type } from "@sinclair/typebox";

export const nep171Grammar = [
  ['old_owner_id', Type.String()],
  ['new_owner_id', Type.String()],
  ['token_id', Type.String()],
  ['isBurn', Type.Boolean()],
] as const;
