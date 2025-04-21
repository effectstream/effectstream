import { type Satisfies, TypeboxHelpers } from "@paima/utils";
import {
  ConfigPrimitiveType,
  type EvmPrimitivesToSyncProtocol,
} from "../../config/types.ts";
import type { AbiType } from "abitype";
import { type Static, Type } from "@sinclair/typebox";
import { ConfigPrimitivePayloadType } from "../types.ts";

const mockAbi = "string"; // TODO: add real ABIs later
export const AbiMap = {
  [ConfigPrimitiveType.EvmRpcPaimaL2]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmRpcERC20]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmRpcERC721]: { contract: mockAbi, paima: mockAbi },
  [ConfigPrimitiveType.EvmRpcERC20Deposit]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmRpcERC1155]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmRpcGeneric]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmRpcERC6551Registry]: { contract: mockAbi },
  [ConfigPrimitiveType.EvmRpcDynamicPrimitive]: { contract: mockAbi },
} as const satisfies Record<
  keyof typeof EvmPrimitivesToSyncProtocol,
  Record<string, AbiType>
>;

// ========
// Paima L2
// ========

export const PrimitiveEvmRpcPaimaL2Payload = Type.Object({
  // recall: any address is possible because of the batcher mechanism
  realAddress: TypeboxHelpers.WalletAddress(),
  // TODO: this should be Paima concise encoding
  inputData: TypeboxHelpers.UnknownFormat,
  suppliedValue: TypeboxHelpers.Uint256,
  inputNonce: TypeboxHelpers.HexString0x(),
});

export const PrimitiveEvmRpcPaimaL2SyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcPaimaL2),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveEvmRpcPaimaL2Payload,
});

// =====
// ERC20
// =====

export const PrimitiveEvmRpcErc20TransferPayload = Type.Object({
  from: TypeboxHelpers.Evm.Address,
  to: TypeboxHelpers.Evm.Address,
  value: TypeboxHelpers.Uint256,
});

export const PrimitiveEvmRpcErc20TransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC20),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveEvmRpcErc20TransferPayload,
});

export const PrimitiveEvmRpcErc20DepositPayload = Type.Object({
  from: TypeboxHelpers.Evm.Address,
  value: TypeboxHelpers.Uint256,
});

export const PrimitiveEvmRpcErc20DepositSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC20Deposit),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Deposit),
  payload: PrimitiveEvmRpcErc20DepositPayload,
});

// ======
// ERC721
// ======

export const PrimitiveEvmRpcErc721TransferPayload = Type.Object({
  from: TypeboxHelpers.Evm.Address,
  to: TypeboxHelpers.Evm.Address,
  tokenId: TypeboxHelpers.Uint256,
});

export const PrimitiveEvmRpcErc721TransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC721),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveEvmRpcErc721TransferPayload,
});

export const PrimitiveEvmRpcErc721MintPayload = Type.Object({
  tokenId: TypeboxHelpers.Uint256,
  mintData: Type.String(),
  from: TypeboxHelpers.Evm.Address,
});

export const PrimitiveEvmRpcErc721MintSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC721),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Mint),
  payload: PrimitiveEvmRpcErc721MintPayload,
});

// =======
// ERC1155
// =======

export const PrimitiveEvmRpcErc1155TransferPayload = Type.Object({
  operator: TypeboxHelpers.Evm.Address,
  from: TypeboxHelpers.Evm.Address,
  to: TypeboxHelpers.Evm.Address,
  ids: Type.Array(TypeboxHelpers.Uint256), // might have just one entry
  values: Type.Array(TypeboxHelpers.Uint256), // might have just one entry
});

export const PrimitiveEvmRpcErc1155TransferSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC1155),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Transfer),
  payload: PrimitiveEvmRpcErc1155TransferPayload,
});

// =======
// Generic
// =======

// TODO: should this be a string and/or JsonUnsafeCast?
export const PrimitiveEvmRpcGenericPayload = Type.Any();

export const PrimitiveEvmRpcGenericSyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcGeneric),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
  payload: PrimitiveEvmRpcGenericPayload,
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

export const PrimitiveEvmRpcErc6551RegistryPayload = Type.Object({
  accountCreated: TypeboxHelpers.Evm.Address,
  implementation: TypeboxHelpers.Evm.Address,
  chainId: TypeboxHelpers.Uint256,
  tokenContract: TypeboxHelpers.Evm.Address,
  tokenId: TypeboxHelpers.Uint256,
  salt: TypeboxHelpers.Uint256,
});

export const PrimitiveEvmRpcErc6551RegistrySyncProtocolResponse = Type.Object({
  primitive: Type.Literal(ConfigPrimitiveType.EvmRpcERC6551Registry),
  payloadType: Type.Literal(ConfigPrimitivePayloadType.Registry),
  payload: PrimitiveEvmRpcErc6551RegistryPayload,
});

// =======
// Dynamic
// =======

export const PrimitiveEvmRpcDynamicPrimitiveTarget = Type.Union([
  Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcERC721),
    scheduledPrefix: Type.String(),
    burnScheduledPrefix: Type.Optional(Type.String()),
  }),
  Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcGeneric),
    abi: TypeboxHelpers.EvmAbiEvent,
    scheduledPrefix: Type.String(),
  }),
]);
export const PrimitiveEvmRpcDynamicPrimitivePayload = Type.Object({
  contractAddress: TypeboxHelpers.Evm.Address,
  targetConfig: PrimitiveEvmRpcDynamicPrimitiveTarget,
});

export const PrimitiveEvmRpcDynamicPrimitiveSyncProtocolResponse = Type
  .Object({
    primitive: Type.Literal(ConfigPrimitiveType.EvmRpcDynamicPrimitive),
    payloadType: Type.Literal(ConfigPrimitivePayloadType.Event),
    payload: PrimitiveEvmRpcDynamicPrimitivePayload,
  });

// ===
// All
// ===

export const syncProtocolResponsesEvmRpc = [
  PrimitiveEvmRpcPaimaL2SyncProtocolResponse,
  PrimitiveEvmRpcErc20TransferSyncProtocolResponse,
  PrimitiveEvmRpcErc20DepositSyncProtocolResponse,
  PrimitiveEvmRpcErc721TransferSyncProtocolResponse,
  PrimitiveEvmRpcErc721MintSyncProtocolResponse,
  PrimitiveEvmRpcErc1155TransferSyncProtocolResponse,
  PrimitiveEvmRpcGenericSyncProtocolResponse,
  PrimitiveEvmRpcErc6551RegistrySyncProtocolResponse,
  PrimitiveEvmRpcDynamicPrimitiveSyncProtocolResponse,
] as const;
true satisfies Satisfies<
  [Static<(typeof syncProtocolResponsesEvmRpc)[number]>["primitive"]],
  [keyof typeof EvmPrimitivesToSyncProtocol]
>;
