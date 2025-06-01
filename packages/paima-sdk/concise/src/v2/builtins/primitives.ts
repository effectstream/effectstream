import {
  type MergeIntersects,
  pick,
  pickAll,
  type RemoveNeverEntries,
  type UnionToIntersection,
} from "@paima/utils";
import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  PrimitiveCardanoCarpDelegationPayload,
  PrimitiveCardanoCarpMintBurnPayload,
  PrimitiveCardanoCarpProjectedNFTPayload,
  PrimitiveCardanoCarpTransferPayload,
  PrimitiveEvmRpcErc1155TransferPayload,
  PrimitiveEvmRpcErc721MintPayload,
  PrimitiveEvmRpcErc721TransferPayload,
  PrimitiveEvmRpcGenericPayload,
  PrimitiveMidnightContractStatePayload,
  PrimitiveMinaActionPayload,
  PrimitiveMinaEventPayload,
} from "@paima/config";
import type { PrimitiveConfig } from "@paima/config";
import { generatePrecompile } from "@paima/precompile";

export const CardanoCarpMintBurnPrecompile = generatePrecompile(
  `${ConfigSyncProtocolType.CARDANO_CARP_PARALLEL}-${ConfigPrimitiveType.CardanoCarpMintBurn}-${ConfigPrimitivePayloadType.MintOrBurn}`,
);
export const CardanoCarpTransferPrecompile = generatePrecompile(
  `${ConfigSyncProtocolType.CARDANO_CARP_PARALLEL}-${ConfigPrimitiveType.CardanoCarpTransfer}-${ConfigPrimitivePayloadType.Transfer}`,
);

/**
 * Builtins where the prefix is user-determined
 */
export const BuiltinTransitions = {
  [ConfigPrimitiveType.EvmRpcERC20]: {},
  [ConfigPrimitiveType.EvmRpcERC721]: {
    mintScheduledPrefix: pickAll(["from", "tokenId", "mintData"]).from(
      PrimitiveEvmRpcErc721MintPayload,
    ),
    burnScheduledPrefix: [
      ["owner", PrimitiveEvmRpcErc721TransferPayload.properties.from],
      ...pick(["tokenId"]).from(PrimitiveEvmRpcErc721MintPayload),
    ],
  },
  [ConfigPrimitiveType.EvmRpcERC1155]: {
    scheduledPrefix: pickAll(["operator", "from", "to", "ids", "values"]).from(
      PrimitiveEvmRpcErc1155TransferPayload,
    ),
    burnScheduledPrefix: pick(["operator", "from", "ids", "values"]).from(
      PrimitiveEvmRpcErc1155TransferPayload,
    ),
  },
  [ConfigPrimitiveType.EvmRpcERC6551Registry]: {},
  [ConfigPrimitiveType.EvmRpcDynamicPrimitive]: {},
  [ConfigPrimitiveType.EvmRpcGeneric]: {
    scheduledPrefix: [["payload", PrimitiveEvmRpcGenericPayload]],
  },
  [ConfigPrimitiveType.CardanoCarpDelegation]: {
    scheduledPrefix: pickAll(["address", "pool", "epoch"]).from(
      PrimitiveCardanoCarpDelegationPayload,
    ),
  },
  [ConfigPrimitiveType.CardanoCarpProjectedNFT]: {
    scheduledPrefix: [
      ...pick([
        "ownerAddress",
        "previousTxHash",
        "previousTxOutputIndex",
        "policyId",
        "assetName",
        "amount",
        "status",
        "forHowLong",
      ]).from(PrimitiveCardanoCarpProjectedNFTPayload),
      [
        "currentTxHash",
        PrimitiveCardanoCarpProjectedNFTPayload.properties.actionTxId,
      ],
      [
        "currentOutputIndex",
        PrimitiveCardanoCarpProjectedNFTPayload.properties.actionOutputIndex,
      ],
    ],
  },
  [ConfigPrimitiveType.CardanoCarpDelayedAsset]: {},
  [ConfigPrimitiveType.CardanoCarpTransfer]: {
    scheduledPrefix: pickAll([
      "txId",
      "rawTx",
      "inputCredentials",
      "outputs",
      "metadata",
    ]).from(
      PrimitiveCardanoCarpTransferPayload,
    ),
  },
  [ConfigPrimitiveType.CardanoCarpMintBurn]: {
    scheduledPrefix: pickAll([
      "txId",
      "metadata",
      "assets",
      "inputAddresses",
      "outputAddresses",
    ]).from(PrimitiveCardanoCarpMintBurnPayload),
  },
  [ConfigPrimitiveType.CardanoUtxorpcMatchTx]: {}, // TODO
  [ConfigPrimitiveType.MinaEventGeneric]: {
    scheduledPrefix: [["payload", PrimitiveMinaEventPayload]],
  },
  [ConfigPrimitiveType.MinaActionGeneric]: {
    scheduledPrefix: [["payload", PrimitiveMinaActionPayload]],
  },
  [ConfigPrimitiveType.MidnightContractState]: {
    scheduledPrefix: [["payload", PrimitiveMidnightContractStatePayload]],
  },
} as const;

/**
 * Recall: some primitives can trigger multiple different state transitions
 *         similarly, some primitive have optional prefixes
 *         therefore, we have to replace zero to potentially multiple keys (with different names)
 *
 * Trick to solve this:
 * 1. Iterate every key in the primitive to see if it matches name in the BuiltinTransitions entry
 *    ex: { displayName: 'myPrimitive', schedulePrefix: 'foo' } will result
 *       1. match on `schedulePrefix`
 *       2. return `never` on `displayName` as there is no matching name
 * 2. Remove all the `never` entries
 */
type ReplacePrefixKey<T extends PrimitiveConfig, TransitionEntry> = T extends
  PrimitiveConfig ? RemoveNeverEntries<
    {
      // for each key key in the primtive, check if it's
      [K in keyof T as T[K] & string]: TransitionEntry extends
        Record<K, infer GrammarEntry> ? GrammarEntry
        : never;
    }
  >
  : never;

/**
 * See if there are any entries in BuiltinTransitions for this primitive
 * if so, add in any prefix required
 */
type MapPrimitivesToTuplesReturn<T extends PrimitiveConfig> = T["type"] extends
  keyof typeof BuiltinTransitions
  ? ReplacePrefixKey<T, (typeof BuiltinTransitions)[T["type"]]>
  : never;

/**
 * Use BuiltinTransitions as a template for constructing the state transition entries
 *
 * ex: if the user specifies `schedulePrefix: 'foo'` for an ConfigPrimitiveType.ERC721,
 *     then the result will be a transition `foo: BuiltinTransitions[ConfigPrimitiveType.ERC721][schedulePrefix]`
 */
export type PrimitivesToGrammar<
  T extends Record<string, { primitive: PrimitiveConfig }>,
> = MergeIntersects<
  UnionToIntersection<
    {
      [K in keyof T]: MapPrimitivesToTuplesReturn<T[K]["primitive"]>;
    }[keyof T]
  >
>;

/**
 * Adds adds a state transition based off the user-provided prefix in their configuration
 */
export function mapPrimitivesToGrammar<
  T extends Record<string, { primitive: PrimitiveConfig }>,
>(
  primitives: T,
): PrimitivesToGrammar<T> {
  const result = {} as Record<string, any>;
  for (const { primitive } of Object.values(primitives)) {
    if (!(primitive.type in BuiltinTransitions)) {
      continue;
    }
    const transitions =
      BuiltinTransitions[primitive.type as keyof typeof BuiltinTransitions];
    for (
      const transition of Object.keys(
        transitions,
      ) as (keyof typeof transitions)[]
    ) {
      // filter out optional prefixes that the user did not define
      if (transition in primitive) {
        result[primitive[transition]] = transitions[transition];
      }
    }
  }
  return result as PrimitivesToGrammar<T>;
}
