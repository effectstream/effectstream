import { Type } from "@sinclair/typebox";
import type { StaticDecode } from "@sinclair/typebox";
import { ConfigPrimitiveType } from "../types.ts";
import { NameField, StartStopBlockheight } from "../../../common.ts";
import { type MergeIntersects, TypeboxHelpers } from "@paima/utils";

export const PrimitiveConfigBaseEvm = NameField.cloneMerge(
  StartStopBlockheight,
);

// ========
// Paima L2
// ========

export const PrimitiveEvmPaimaL2Config = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcPaimaL2),
    contractAddress: TypeboxHelpers.Evm.Address,
  }),
  optional: Type.Object({}),
});

// =====
// ERC20
// =====

export const PrimitiveErc20Config = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcERC20),
    contractAddress: TypeboxHelpers.Evm.Address,
  }),
  optional: Type.Object({}),
});

export const PrimitiveErc20DepositConfig = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcERC20Deposit),
    contractAddress: TypeboxHelpers.Evm.Address,
    scheduledPrefix: Type.String(),
    depositAddress: TypeboxHelpers.Evm.Address,
  }),
  optional: Type.Object({}),
});

// ======
// ERC721
// ======

export const PrimitiveErc721Config = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcERC721),
    contractAddress: TypeboxHelpers.Evm.Address,
    scheduledPrefix: Type.String(),
    burnScheduledPrefix: Type.Optional(Type.String()),
  }),
  optional: Type.Object({}),
});
export type TPrimitiveErc721Config = MergeIntersects<
  StaticDecode<ReturnType<typeof PrimitiveErc721Config.allProperties<true>>>
>;

// =======
// ERC1155
// =======

export const PrimitiveErc1155Config = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcERC1155),
    contractAddress: TypeboxHelpers.Evm.Address,
    scheduledPrefix: Type.Optional(Type.String()),
    burnScheduledPrefix: Type.Optional(Type.String()),
  }),
  optional: Type.Object({}),
});

// =======
// Generic
// =======

export const PrimitiveEvmGenericConfig = PrimitiveConfigBaseEvm.cloneMerge({
  required: Type.Object({
    type: Type.Literal(ConfigPrimitiveType.EvmRpcGeneric),
    contractAddress: TypeboxHelpers.Evm.Address,
    abi: TypeboxHelpers.EvmAbiEvent,
    scheduledPrefix: Type.String(),
  }),
  optional: Type.Object({}),
});
export type TPrimitiveEvmGenericConfig = MergeIntersects<
  StaticDecode<ReturnType<typeof PrimitiveEvmGenericConfig.allProperties<true>>>
>;

// =======
// ERC6551
// =======

export const PrimitiveErc6551RegistryConfig = PrimitiveConfigBaseEvm.cloneMerge(
  {
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.EvmRpcERC6551Registry),
      contractAddress: Type.Optional(TypeboxHelpers.Evm.Address),
      implementation: Type.Optional(TypeboxHelpers.Evm.Address),
      tokenContract: Type.Optional(TypeboxHelpers.Evm.Address),
      tokenId: Type.Optional(TypeboxHelpers.Uint256),
      salt: Type.Optional(TypeboxHelpers.Uint256),
    }),
    optional: Type.Object({}),
  },
);

// =======
// Dynamic
// =======

export const PrimitiveDynamicEvmPrimitiveConfig = PrimitiveConfigBaseEvm
  .cloneMerge({
    required: Type.Object({
      type: Type.Literal(ConfigPrimitiveType.EvmRpcDynamicPrimitive),
      contractAddress: TypeboxHelpers.Evm.Address,
      abi: TypeboxHelpers.EvmAbiEvent,
      targetConfig: Type.Union([
        Type.Omit(PrimitiveErc721Config.allProperties(false), [
          "name",
          "startBlockHeight",
          "stopBlockHeight",
          "contractAddress",
        ]),
        Type.Omit(PrimitiveEvmGenericConfig.allProperties(false), [
          "name",
          "startBlockHeight",
          "stopBlockHeight",
          "contractAddress",
        ]),
      ]),
      dynamicFields: Type.Object({
        contractAddress: TypeboxHelpers.Evm.Address,
      }),
    }),
    optional: Type.Object({}),
  });
export type TPrimitiveDynamicEvmPrimitiveConfig = MergeIntersects<
  StaticDecode<
    ReturnType<typeof PrimitiveDynamicEvmPrimitiveConfig.allProperties<true>>
  >
>;
export type PrimitiveDynamicEvmTargetType =
  TPrimitiveDynamicEvmPrimitiveConfig["targetConfig"]["type"];
