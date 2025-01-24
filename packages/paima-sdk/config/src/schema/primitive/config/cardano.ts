import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "./types.ts";
import { NameField, StartStopSlot } from "../../common.ts";
import { TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseCardano = NameField.cloneMerge(
  StartStopSlot,
);

// ==========
// Delegation
// ==========

export const PrimitiveCardanoDelegationConfig = PrimitiveConfigBaseCardano
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoDelegation),
      pools: Type.Array(TypeboxHelpers.Cardano.PoolId),
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });

// ======
// Assets
// ======

export const PrimitiveCardanoProjectedNFTConfig = PrimitiveConfigBaseCardano
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoProjectedNFT),
      scheduledPrefix: Type.Optional(Type.String()),
    }),
    optional: Type.Object({}),
  });

export const PrimitiveCardanoDelayedAssetConfig = PrimitiveConfigBaseCardano
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoDelayedAsset),
      fingerprints: Type.Optional(
        Type.Array(TypeboxHelpers.Cardano.Cip14Fingerprint),
      ),
      policyIds: Type.Optional(Type.Array(TypeboxHelpers.Cardano.PolicyId)),
    }),
    optional: Type.Object({}),
  });

export const PrimitiveCardanoTransferConfig = PrimitiveConfigBaseCardano
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoTransfer),
      credential: TypeboxHelpers.Cardano.Credential,
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });

export const PrimitiveCardanoMintBurnConfig = PrimitiveConfigBaseCardano
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoMintBurn),
      policyIds: Type.Array(TypeboxHelpers.Cardano.PolicyId),
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });
