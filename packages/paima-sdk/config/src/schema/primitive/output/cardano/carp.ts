import { ProjectedNftStatus } from "@dcspark/carp-client";
import {
  type CardanoAmountLovelace,
  type CardanoAssetName,
  type CardanoCredential,
  type CardanoPolicyId,
  type Satisfies,
  TypeboxHelpers,
} from "@paima/utils";
import {
  type CardanoCarpPrimitivesToSyncProtocol,
  ConfigPrimitiveType,
} from "../../config/types.ts";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "../types.ts";

// ==========
// Delegation
// ==========

export const PrimitiveCardanoCarpDelegationPayload = Type.Object({
  address: TypeboxHelpers.Cardano.Address,
  pool: TypeboxHelpers.Nullable(TypeboxHelpers.Cardano.PoolId),
  epoch: TypeboxHelpers.EpochNumber(),
});

export const PrimitiveCardanoCarpDelegationSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpDelegation),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Delegate),
  payload: PrimitiveCardanoCarpDelegationPayload,
});

// =============
// Projected NFT
// =============

export const PrimitiveCardanoCarpProjectedNFTPayload = Type.Object({
  ownerAddress: TypeboxHelpers.Nullable(TypeboxHelpers.Cardano.Address),
  actionTxId: TypeboxHelpers.Cardano.TxHash,
  actionOutputIndex: TypeboxHelpers.Nullable(Type.Number()),
  previousTxHash: TypeboxHelpers.Nullable(TypeboxHelpers.Cardano.TxHash),
  previousTxOutputIndex: TypeboxHelpers.Nullable(Type.Number()),
  policyId: TypeboxHelpers.Cardano.PolicyId,
  assetName: TypeboxHelpers.Cardano.AssetName,
  amount: TypeboxHelpers.Cardano.AmountLovelace,
  status: Type.Enum(ProjectedNftStatus),
  plutusDatum: TypeboxHelpers.HexStringNo0x(),
  forHowLong: TypeboxHelpers.Nullable(TypeboxHelpers.TimestampMsStr),
});

export const PrimitiveCardanoCarpProjectedNFTSyncProtocolResponse = Type.Object(
  {
    primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpProjectedNFT),
    payloadType: Type.Literal(ConfigPrimitivePayloadType.Projection),
    payload: PrimitiveCardanoCarpProjectedNFTPayload,
  },
);

// =============
// Delayed Asset
// =============

export const PrimitiveCardanoCarpAssetUtxoPayload = Type.Object({
  address: TypeboxHelpers.Cardano.Address,
  txId: TypeboxHelpers.Cardano.TxHash,
  outputIndex: Type.Number(),
  amount: TypeboxHelpers.Nullable(TypeboxHelpers.Cardano.AmountLovelace),
  cip14Fingerprint: TypeboxHelpers.Cardano.Cip14Fingerprint,
  policyId: TypeboxHelpers.Cardano.PolicyId,
  assetName: TypeboxHelpers.Cardano.AssetName,
  spent: Type.Boolean(),
});

export const PrimitiveCardanoCarpAssetUtxoSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpDelayedAsset),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveCardanoCarpAssetUtxoPayload,
});

// ========
// Transfer
// ========

export const PrimitiveCardanoCarpTransferPayload = Type.Object({
  txId: TypeboxHelpers.Cardano.TxHash,
  // TODO: I think this is a HexStringNo0x, but not sure
  rawTx: Type.String(),
  inputCredentials: Type.Array(TypeboxHelpers.Cardano.Credential),
  outputs: Type.Array(
    Type.Object({
      asset: TypeboxHelpers.Nullable(
        Type.Object({
          policyId: TypeboxHelpers.Cardano.PolicyId,
          assetName: TypeboxHelpers.Cardano.AssetName,
        }),
      ),
      amount: TypeboxHelpers.Cardano.AmountLovelace,
    }),
  ),
  // TODO: I think this is a HexStringNo0x, but not sure
  metadata: TypeboxHelpers.Nullable(Type.String()),
});

export const PrimitiveCardanoCarpTransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpTransfer),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveCardanoCarpTransferPayload,
});

// =========
// Mint/Burn
// =========

export const AssetMap = Type.Unsafe<
  { [assetName: CardanoAssetName]: CardanoAmountLovelace }
>(
  Type.Record(TypeboxHelpers.Cardano.AssetName, Type.String()),
);
export const PolicyIdMap = Type.Unsafe<
  { [policyId: CardanoPolicyId]: Static<typeof AssetMap> }
>(
  Type.Record(TypeboxHelpers.Cardano.PolicyId, AssetMap),
);
export const AssetIdentifier = Type.Object({
  policyId: TypeboxHelpers.Cardano.PolicyId,
  assetName: TypeboxHelpers.Cardano.AssetName,
});
export const AssetAndAmount = Type.Intersect([
  AssetIdentifier,
  Type.Object({ amount: TypeboxHelpers.Cardano.AmountLovelace }),
]);
export const AddressToAssetAndAmount = Type.Unsafe<{
  [address: CardanoCredential]: Static<typeof AssetAndAmount>[];
}>(Type.Record(TypeboxHelpers.Cardano.Credential, Type.Array(AssetAndAmount)));

export const PrimitiveCardanoCarpMintBurnPayload = Type.Object({
  txId: TypeboxHelpers.Cardano.TxHash,
  // TODO: I think this is a HexStringNo0x, but not sure
  metadata: TypeboxHelpers.Nullable(Type.String()),
  assets: PolicyIdMap,
  inputAddresses: AddressToAssetAndAmount,
  outputAddresses: AddressToAssetAndAmount,
});

export const PrimitiveCardanoCarpMintBurnSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoCarpMintBurn),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.MintOrBurn),
  payload: PrimitiveCardanoCarpMintBurnPayload,
});

// ===
// All
// ===

export const syncProtocolResponsesCardanoCarp = [
  PrimitiveCardanoCarpDelegationSyncProtocolResponse,
  PrimitiveCardanoCarpProjectedNFTSyncProtocolResponse,
  PrimitiveCardanoCarpAssetUtxoSyncProtocolResponse,
  PrimitiveCardanoCarpTransferSyncProtocolResponse,
  PrimitiveCardanoCarpMintBurnSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesCardanoCarp)[number]>["primitive"]],
  [keyof typeof CardanoCarpPrimitivesToSyncProtocol]
>;
