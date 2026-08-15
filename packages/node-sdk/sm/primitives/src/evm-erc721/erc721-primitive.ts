import { Value } from "@sinclair/typebox/value";
import { type StaticDecode, Type } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  getEvmEvent,
  type ProtocolPrimitiveMap,
} from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EvmAddress,
  type EffectstreamBlockNumber,
  TypeboxHelpers,
} from "@effectstream/utils";
import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { ERC721_VIEW_PREFIX, erc721Ivm } from "./erc721-ivm.ts";
import { ERC721_INTERMEDIATE_PREFIX } from "./erc721-ivm.ts";
import { erc721 } from "./erc721-abi.ts";
import { erc721Grammar } from "./erc721-grammar.ts";
import { PrimitiveTypeEVMERC721 } from "../builtin.ts";

/**
 * Erc721 Primitive
 *
 * This is a concrete implementation of the Primitive class for ERC721.
 */


  export class Erc721Primitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof erc721Grammar
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeEVMERC721;
  readonly abi = getEvmEvent(erc721.abi, "Transfer(address,address,uint256)");
  override grammar = erc721Grammar;
  readonly contractAddress: EvmAddress;
  // Dynamic table to track the owner of each token.
  override dynamicTables = erc721Ivm;
  override getIntermediatePrefix(): string[] {
    return [ERC721_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [ERC721_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof erc721Grammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { to, from } = primitiveTransactionData.output.payload;
    const toAddr = Value.Decode(TypeboxHelpers.Evm.Address, to.toLowerCase());
    const fromAddr = Value.Decode(
      TypeboxHelpers.Evm.Address,
      from.toLowerCase(),
    );
    const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
    const tokenId = Value.Decode(
      TypeboxHelpers.Uint256,
      primitiveTransactionData.output.payload.tokenId,
    );

    const isBatched = false;
    const accountingPayload: ParamToData<typeof erc721Grammar> = {
      to: toAddr,
      from: fromAddr,
      tokenId: tokenId,
      isBurn: isBurn,
    };
    const stateMachinePayload:
      | StaticDecode<
        CommandTuple<string, typeof this.grammar>
      >
      | null = this.stateMachinePrefix
        ? generateRawStmInput(
          this.grammar,
          this.stateMachinePrefix,
          accountingPayload,
        )
        : null;

    return {
      isBatched,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.NONE,
            address: "0x0",
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.EVM_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
      // TODO This should be optional.
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }
}

// declare module "@effectstream/sm" {
//   interface PrimitiveGlobalDefinitions {
//     Erc721Primitive: typeof Erc721Primitive;
//   }
// }
