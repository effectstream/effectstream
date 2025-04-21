import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../types.ts";
import { NameField, StartStopSlot } from "../../../common.ts";

export const PrimitiveConfigBaseCardanoUtxorpc = NameField.cloneMerge(
  StartStopSlot,
);

// ==========
// Delegation
// ==========

export const PrimitiveCardanoUtxorpcMatchTxConfig =
  PrimitiveConfigBaseCardanoUtxorpc
    .cloneMerge({
      required: Type.Object({
        type: Type.Literal(ConfigPrimitiveType.CardanoUtxorpcMatchTx),
        // TODO: add a tx predicate once this is merged: https://github.com/utxorpc/spec/pull/153
        scheduledPrefix: Type.String(),
      }),
      optional: Type.Object({}),
    });
