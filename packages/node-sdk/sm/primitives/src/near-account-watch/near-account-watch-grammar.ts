import { Type } from "@sinclair/typebox";

export const nearAccountWatchGrammar = [
  ['signer_id', Type.String()],
  ['receiver_id', Type.String()],
  ['method_name', Type.String()],
  ['args', Type.String()],
  ['deposit', Type.String()],
  ['status', Type.String()],
] as const;
