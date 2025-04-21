import { Type } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../types.ts";
import { NameField, StartStopSlot } from "../../../common.ts";
import { TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseCardanoCarp = NameField.cloneMerge(
  StartStopSlot,
);

// ==========
// Delegation
// ==========

export const PrimitiveCardanoDelegationConfig = PrimitiveConfigBaseCardanoCarp
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoCarpDelegation),
      pools: Type.Array(TypeboxHelpers.Cardano.PoolId),
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });

// =========
// Projected
// =========

export const PrimitiveCardanoProjectedNFTConfig = PrimitiveConfigBaseCardanoCarp
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoCarpProjectedNFT),
      scheduledPrefix: Type.Optional(Type.String()),
    }),
    optional: Type.Object({}),
  });

// ======
// Assets
// ======

export const PrimitiveCardanoDelayedAssetConfig = PrimitiveConfigBaseCardanoCarp
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoCarpDelayedAsset),
      fingerprints: Type.Optional(
        Type.Array(TypeboxHelpers.Cardano.Cip14Fingerprint),
      ),
      policyIds: Type.Optional(Type.Array(TypeboxHelpers.Cardano.PolicyId)),
    }),
    optional: Type.Object({}),
  });

// ========
// Transfer
// ========

export const PrimitiveCardanoTransferConfig = PrimitiveConfigBaseCardanoCarp
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoCarpTransfer),
      credential: TypeboxHelpers.Cardano.Credential,
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });

// =========
// Mint/Burn
// =========

export const PrimitiveCardanoMintBurnConfig = PrimitiveConfigBaseCardanoCarp
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.CardanoCarpMintBurn),
      policyIds: Type.Array(TypeboxHelpers.Cardano.PolicyId),
      scheduledPrefix: Type.String(),
    }),
    optional: Type.Object({}),
  });
