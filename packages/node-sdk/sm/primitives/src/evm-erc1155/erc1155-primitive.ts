import { Value } from "@sinclair/typebox/value";
import type { StaticDecode } from "@sinclair/typebox";
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
import { ERC1155_VIEW_PREFIX, erc1155Ivm } from "./erc1155-ivm.ts";
import { ERC1155_INTERMEDIATE_PREFIX } from "./erc1155-ivm.ts";
import { erc1155 } from "./erc1155-abi.ts";
import { erc1155Grammar } from "./erc1155-grammar.ts";
import { PrimitiveTypeEVMERC1155 } from "../builtin.ts";

/**
 * Erc721 Primitive
 *
 * This is a concrete implementation of the Primitive class for ERC721.
 */

export class Erc1155Primitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof erc1155Grammar
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeEVMERC1155;
  readonly abi = [
    getEvmEvent(
      erc1155.abi,
      "TransferSingle(address,address,address,uint256,uint256)"
    ),
    getEvmEvent(
      erc1155.abi,
      "TransferBatch(address,address,address,uint256[],uint256[])"
    ),
  ];
  override grammar = erc1155Grammar;
  readonly contractAddress: EvmAddress;
  // Dynamic table to track the owner of each token.
  override dynamicTables = erc1155Ivm;
  override getIntermediatePrefix(): string[] {
    return [ERC1155_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [ERC1155_VIEW_PREFIX];
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
      config.contractAddress
    );
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<
        CommandTuple<string, typeof erc1155Grammar>
      > | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const abiFunctionName = primitiveTransactionData.output.payloadType;
    const data: {
      isBatched: boolean;
      data: {
        fromAddressAndType: AddressAndType;
        stateMachinePayload: StaticDecode<
          CommandTuple<string, typeof erc1155Grammar>
        > | null;
        accountingPayload: JsonObject;
      }[];
    } = {
      isBatched: false,
      data: [],
    };

    switch (abiFunctionName) {
      case "TransferSingle": {
        const { operator, from, to, id, value } =
          primitiveTransactionData.output.payload;
        const toAddr = Value.Decode(
          TypeboxHelpers.Evm.Address,
          to.toLowerCase()
        );
        const operatorAddr = Value.Decode(
          TypeboxHelpers.Evm.Address,
          operator.toLowerCase()
        );
        const fromAddr = Value.Decode(
          TypeboxHelpers.Evm.Address,
          from.toLowerCase()
        );
        const isBurn = Boolean(
          toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g)
        );
        const isMint = Boolean(
          fromAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g)
        );
        const tokenId = Value.Decode(TypeboxHelpers.Uint256, id);
        const amount = Value.Decode(TypeboxHelpers.Uint256, value);

        const accountingPayload: ParamToData<typeof erc1155Grammar> = {
          type: abiFunctionName,
          to: toAddr,
          from: fromAddr,
          tokenId: tokenId,
          amount: amount,
          isBurn: isBurn,
          isMint: isMint,
          operator: operatorAddr,
        };
        const stateMachinePayload: StaticDecode<
          CommandTuple<string, typeof this.grammar>
        > | null = this.stateMachinePrefix
          ? generateRawStmInput(
              this.grammar,
              this.stateMachinePrefix,
              accountingPayload
            )
          : null;

        data.data.push({
          fromAddressAndType: {
            type: AddressType.NONE,
            address: "0x0",
          },
          accountingPayload,
          stateMachinePayload,
        });
        break;
      }
      case "TransferBatch": {
        // inputs":[
        //   {"name":"operator","type":"address","indexed":true,"internalType":"address"},
        //   {"name":"from","type":"address","indexed":true,"internalType":"address"},
        //   {"name":"to","type":"address","indexed":true,"internalType":"address"},
        //   {"name":"ids","type":"uint256[]","indexed":false,"internalType":"uint256[]"},
        //   {"name":"values","type":"uint256[]","indexed":false,"internalType":"uint256[]"}
        // ]
        data.isBatched = true;
        const { operator, from, to, ids, values } =
          primitiveTransactionData.output.payload;
        const toAddr = Value.Decode(
          TypeboxHelpers.Evm.Address,
          to.toLowerCase()
        );
        const operatorAddr = Value.Decode(
          TypeboxHelpers.Evm.Address,
          operator.toLowerCase()
        );
        const fromAddr = Value.Decode(
          TypeboxHelpers.Evm.Address,
          from.toLowerCase()
        );
        const isBurn = Boolean(
          toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g)
        );
        const isMint = Boolean(
          fromAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g)
        );

        const itemsCount = ids.length;
        for (let i = 0; i < itemsCount; i++) {
          const tokenId = Value.Decode(TypeboxHelpers.Uint256, ids[i]);
          const amount = Value.Decode(TypeboxHelpers.Uint256, values[i]);

          const accountingPayload: ParamToData<typeof erc1155Grammar> = {
            type: abiFunctionName,
            to: toAddr,
            from: fromAddr,
            tokenId: tokenId,
            amount: amount,
            isBurn: isBurn,
            isMint: isMint,
            operator: operatorAddr,
          };
          const stateMachinePayload: StaticDecode<
            CommandTuple<string, typeof this.grammar>
          > | null = this.stateMachinePrefix
            ? generateRawStmInput(
                this.grammar,
                this.stateMachinePrefix,
                accountingPayload
              )
            : null;

          data.data.push({
            fromAddressAndType: {
              type: AddressType.NONE,
              address: "0x0",
            },
            accountingPayload,
            stateMachinePayload,
          });
        }
        break;
      }
      default:
        throw new Error(`Unknown ABI function name: ${abiFunctionName}`);
    }

    return data;
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.EVM_RPC_PARALLEL] {
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
