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
  type CardanoPrimitivesToSyncProtocol,
  ConfigPrimitiveType,
} from "../config/types.ts";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "./types.ts";

// ==========
// Delegation
// ==========

export const PrimitiveCardanoDelegatePayload = Type.Object({
  address: TypeboxHelpers.Cardano.Address,
  pool: TypeboxHelpers.Nullable(TypeboxHelpers.Cardano.PoolId),
  epoch: TypeboxHelpers.EpochNumber(),
});

export const PrimitiveCardanoDelegateSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoDelegation),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Delegate),
  payload: PrimitiveCardanoDelegatePayload,
});

// =============
// Projected NFT
// =============

export const PrimitiveCardanoProjectedNFTPayload = Type.Object({
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

export const PrimitiveCardanoProjectedNFTSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoProjectedNFT),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Projection),
  payload: PrimitiveCardanoProjectedNFTPayload,
});

// =============
// Delayed Asset
// =============

export const PrimitiveCardanoAssetUtxoPayload = Type.Object({
  address: TypeboxHelpers.Cardano.Address,
  txId: TypeboxHelpers.Cardano.TxHash,
  outputIndex: Type.Number(),
  amount: TypeboxHelpers.Nullable(TypeboxHelpers.Cardano.AmountLovelace),
  cip14Fingerprint: TypeboxHelpers.Cardano.Cip14Fingerprint,
  policyId: TypeboxHelpers.Cardano.PolicyId,
  assetName: TypeboxHelpers.Cardano.AssetName,
});

export const PrimitiveCardanoAssetUtxoSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoDelayedAsset),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveCardanoAssetUtxoPayload,
});

// ========
// Transfer
// ========

export const PrimitiveCardanoTransferPayload = Type.Object({
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

export const PrimitiveCardanoTransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoTransfer),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveCardanoTransferPayload,
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

export const PrimitiveCardanoMintBurnPayload = Type.Object({
  txId: TypeboxHelpers.Cardano.TxHash,
  // TODO: I think this is a HexStringNo0x, but not sure
  metadata: TypeboxHelpers.Nullable(Type.String()),
  assets: PolicyIdMap,
  inputAddresses: AddressToAssetAndAmount,
  outputAddresses: AddressToAssetAndAmount,
});

export const PrimitiveCardanoMintBurnSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.CardanoMintBurn),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.MintOrBurn),
  payload: PrimitiveCardanoMintBurnPayload,
});

// ===
// All
// ===

export const syncProtocolResponsesCardano = [
  PrimitiveCardanoDelegateSyncProtocolResponse,
  PrimitiveCardanoProjectedNFTSyncProtocolResponse,
  PrimitiveCardanoAssetUtxoSyncProtocolResponse,
  PrimitiveCardanoTransferSyncProtocolResponse,
  PrimitiveCardanoMintBurnSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesCardano)[number]>["primitive"]],
  [keyof typeof CardanoPrimitivesToSyncProtocol]
>;
