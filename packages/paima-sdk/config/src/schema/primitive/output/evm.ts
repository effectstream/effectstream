import { type Satisfies, TypeboxHelpers } from "@paima/utils";
import {
  ConfigPrimitiveType,
  type EvmPrimitivesToSyncProtocol,
} from "../config/types.ts";
import type { AbiType } from "abitype";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "./types.ts";

const mockAbi = "string"; // TODO: add real ABIs later
export const AbiMap = {
  [ConfigPrimitiveType.EvmPaimaL2]: { contract: mockAbi },
  [ConfigPrimitiveType.ERC20]: { contract: mockAbi },
  [ConfigPrimitiveType.ERC721]: { contract: mockAbi, paima: mockAbi },
  [ConfigPrimitiveType.ERC20Deposit]: { contract: mockAbi },
  [ConfigPrimitiveType.ERC1155]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmGeneric]: { contract: mockAbi },
  [ConfigPrimitiveType.ERC6551Registry]: { contract: mockAbi },
  [ConfigPrimitiveType.DynamicEvmPrimitive]: { contract: mockAbi },
} as const satisfies Record<
  keyof typeof EvmPrimitivesToSyncProtocol,
  Record<string, AbiType>
>;

// ========
// Paima L2
// ========

export const PrimitiveEvmPaimaL2Payload = Type.Object({
  // recall: any address is possible because of the batcher mechanism
  realAddress: TypeboxHelpers.WalletAddress(),
  // TODO: this should be Paima concise encoding
  inputData: TypeboxHelpers.UnknownFormat,
  suppliedValue: TypeboxHelpers.Uint256,
  inputNonce: TypeboxHelpers.HexString0x(),
});

export const PrimitiveEvmPaimaL2SyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmPaimaL2),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveEvmPaimaL2Payload,
});

// =====
// ERC20
// =====

export const PrimitiveErc20TransferPayload = Type.Object({
  from: TypeboxHelpers.Evm.Address,
  to: TypeboxHelpers.Evm.Address,
  value: TypeboxHelpers.Uint256,
});

export const PrimitiveErc20TransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.ERC20),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveErc20TransferPayload,
});

export const PrimitiveErc20DepositPayload = Type.Object({
  from: TypeboxHelpers.Evm.Address,
  value: TypeboxHelpers.Uint256,
});

export const PrimitiveErc20DepositSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.ERC20Deposit),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Deposit),
  payload: PrimitiveErc20DepositPayload,
});

// ======
// ERC721
// ======

export const PrimitiveErc721TransferPayload = Type.Object({
  from: TypeboxHelpers.Evm.Address,
  to: TypeboxHelpers.Evm.Address,
  tokenId: TypeboxHelpers.Uint256,
});

export const PrimitiveErc721TransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.ERC721),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveErc721TransferPayload,
});

export const PrimitiveErc721MintPayload = Type.Object({
  tokenId: TypeboxHelpers.Uint256,
  mintData: Type.String(),
  from: TypeboxHelpers.Evm.Address,
});

export const PrimitiveErc721MintSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.ERC721),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Mint),
  payload: PrimitiveErc721MintPayload,
});

// =======
// ERC1155
// =======

export const PrimitiveErc1155TransferPayload = Type.Object({
  operator: TypeboxHelpers.Evm.Address,
  from: TypeboxHelpers.Evm.Address,
  to: TypeboxHelpers.Evm.Address,
  ids: Type.Array(TypeboxHelpers.Uint256), // might have just one entry
  values: Type.Array(TypeboxHelpers.Uint256), // might have just one entry
});

export const PrimitiveErc1155TransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.ERC1155),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveErc1155TransferPayload,
});

// =======
// Generic
// =======

// TODO: should this be a string and/or JsonUnsafeCast?
export const PrimitiveGenericPayload = Type.Any();

export const PrimitiveGenericSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmGeneric),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveGenericPayload,
});

// =======
// ERC6551
// =======

/** Default registry address specified in ERC6551 */
export const ERC6551_REGISTRY_DEFAULT = {
  // ERC6551 has an old version that got adopted by some projects that did not use indexed fields for the logs
  // You can find a version history here: https://github.com/erc6551/reference/releases
  Old: "0x02101dfB77FDE026414827Fdc604ddAF224F0921".toLowerCase(),
  New: "0x000000006551c19487814612e58FE06813775758".toLowerCase(),
};

export const PrimitiveErc6551RegistryPayload = Type.Object({
  accountCreated: TypeboxHelpers.Evm.Address,
  implementation: TypeboxHelpers.Evm.Address,
  chainId: TypeboxHelpers.Uint256,
  tokenContract: TypeboxHelpers.Evm.Address,
  tokenId: TypeboxHelpers.Uint256,
  salt: TypeboxHelpers.Uint256,
});

export const PrimitiveErc6551RegistrySyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.ERC6551Registry),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Registry),
  payload: PrimitiveErc6551RegistryPayload,
});

// =======
// Dynamic
// =======

export const PrimitiveDynamicEvmPrimitiveTarget = Type.Union([
  Type.Object({
    type: Type.Literal(ConfigPrimitiveType.ERC721),
    scheduledPrefix: Type.String(),
    burnScheduledPrefix: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmGeneric),
    abi: TypeboxHelpers.EvmAbiEvent,
    scheduledPrefix: Type.String(),
  }),
]);
export const PrimitiveDynamicEvmPrimitivePayload = Type.Object({
  contractAddress: TypeboxHelpers.Evm.Address,
  targetConfig: PrimitiveDynamicEvmPrimitiveTarget,
});

export const PrimitiveDynamicEvmPrimitiveSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.DynamicEvmPrimitive),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveDynamicEvmPrimitivePayload,
});

// ===
// All
// ===

export const syncProtocolResponsesEvm = [
  PrimitiveEvmPaimaL2SyncProtocolResponse,
  PrimitiveErc20TransferSyncProtocolResponse,
  PrimitiveErc20DepositSyncProtocolResponse,
  PrimitiveErc721TransferSyncProtocolResponse,
  PrimitiveErc721MintSyncProtocolResponse,
  PrimitiveErc1155TransferSyncProtocolResponse,
  PrimitiveGenericSyncProtocolResponse,
  PrimitiveErc6551RegistrySyncProtocolResponse,
  PrimitiveDynamicEvmPrimitiveSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesEvm)[number]>["primitive"]],
  [keyof typeof EvmPrimitivesToSyncProtocol]
>;
