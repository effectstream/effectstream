import { Type } from "@sinclair/typebox";

export const nep141Grammar = [
  ['old_owner_id', Type.String()],
  ['new_owner_id', Type.String()],
  ['amount', Type.String()],
] as const;
