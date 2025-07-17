import type { FastFlavor } from "@coderspirit/nominal";

/**
 * TODO: remove any instance of this in the codebase
 * Note: often this is uncertainty between HexString0x and HexStringNo0x
 */
export type UnknownFormat = string;

export type URI = FastFlavor<string, "Uri">;

export type Caip2 = FastFlavor<string, "Caip2">;
/**
 * TODO: probably best to make this more granular to different cryptographic schemes
 *       esp. since some return 0x and others don't
 */
export type EvmSignature = FastFlavor<HexString0x, "EvmSignature">;
export type GenericSignature = FastFlavor<string, "OtherSignature">;
export type Signature =
  | EvmSignature
  | GenericSignature;

export type VersionString = `${number}.${number}.${number}`;

// TODO: should probably differentiate between block numbers of different networks
//       and maybe even Paima block number / emulated block number
export type BlockNumber = FastFlavor<number, "BlockNumber">;
/**
 * recall: slots may be empty, so absolute slot number is not usually equal to block number
 */
export type AbsoluteSlotNumber = FastFlavor<number, "AbsoluteSlotNumber">;
export type RelativeSlotNumber = FastFlavor<number, "RelativeSlotNumber">;
export type EpochNumber = FastFlavor<number, "EpochNumber">;

// don't make it a flavor so it can easily be assigned to/from flavors
export type HexString0x = `0x${string}`;
export type HexStringNo0x = FastFlavor<string, "HexStringNo0x">;
export type Base64String = FastFlavor<string, "Base64String">;

// TODO: change these to brands later
export type IntervalMs = FastFlavor<number, "IntervalMs">;
export type IntervalSec = FastFlavor<number, "IntervalSec">;
export type TimestampMs = FastFlavor<number, "TimestampMs">;
export type TimestampMsStr = FastFlavor<string, "TimestampMsStr">;
export type TimestampSec = FastFlavor<number, "TimestampSec">;
export type TimestampIso8601 = FastFlavor<string, "TimestampIso8601">;

export type AlgorandBlockHash = FastFlavor<UnknownFormat, "AlgorandBlockHash">;
export type AlgorandTxHash = FastFlavor<UnknownFormat, "AlgorandTxHash">;
// TODO: this is close to /^[A-Z2-7]{58}$/
export type AlgorandAddress = FastFlavor<string, "AlgorandAddress">;

export type AvailBlockHash = FastFlavor<UnknownFormat, "AvailBlockHash">;
export type AvailTxHash = FastFlavor<UnknownFormat, "AvailTxHash">;
export type AvailAddress = SubstrateAddress;

export type CardanoBlockHash = FastFlavor<string, "CardanoBlockHash">;
export type CardanoTxHash = FastFlavor<string, "CardanoTxHash">;
// TODO: bech32 string
export type CardanoAddress = FastFlavor<string, "CardanoAddress">;
export type CardanoCredential = FastFlavor<string, "CardanoCredential">;
export type CardanoPolicyId = FastFlavor<string, "CardanoPolicyId">;
export type CardanoAssetName = FastFlavor<string, "CardanoAssetName">;
export type CardanoCip14Fingerprint = FastFlavor<
  string,
  "CardanoCip14Fingerprint"
>;
export type CardanoPoolId = FastFlavor<string, "CardanoPoolId">;
export type CardanoAmountLovelace = FastFlavor<string, "CardanoAmountLovelace">;

export type EvmBlockHash = FastFlavor<HexString0x, "EvmBlockHash">;
export type EvmTxHash = FastFlavor<HexString0x, "EvmTxHash">;
export type EvmAddress = FastFlavor<HexString0x, "EvmAddress">;
export type EvmSelector = FastFlavor<HexString0x, "EvmSelector">;
export type Evm4ByteSelector = FastFlavor<HexString0x, "Evm4ByteSelector">;

export type MidnightBlockHash = FastFlavor<HexString0x, "MidnightBlockHash">;
export type MidnightTxHash = FastFlavor<HexString0x, "MidnightTxHash">;
export type MidnightAddress = FastFlavor<string, "MidnightAddress">;

export type MinaBlockHash = FastFlavor<UnknownFormat, "MinaBlockHash">;
export type MinaTxHash = FastFlavor<UnknownFormat, "MinaTxHash">;
export type MinaAddress = FastFlavor<string, "MinaAddress">;

// TODO: close to the regex /^[1-9A-HJ-NP-Za-km-z]{47,48}$/
export type SubstrateAddress = FastFlavor<string, "SubstrateAddress">;

export type WalletAddress =
  | AlgorandAddress
  | AvailAddress
  | SubstrateAddress
  | CardanoAddress
  | EvmAddress
  | MidnightAddress
  | MinaAddress;

/**
 * TODO: probably best to make this more granular to different cryptographic schemes
 */
export type EvmPrivateKey = FastFlavor<HexString0x, "EvmPrivateKey">;
export type GenericPrivateKey = FastFlavor<string, "GenericPrivateKey">;
export type PrivateKey =
  | EvmPrivateKey
  | GenericPrivateKey;

export type EvmRpcPageJson = FastFlavor<string, "EvmRpcPageJson">;
export type CarpCursorJson = FastFlavor<string, "CarpCursorJson">;
export type MidnightEncodedStateJson = FastFlavor<
  string,
  "MidnightEncodedStateJson"
>;
