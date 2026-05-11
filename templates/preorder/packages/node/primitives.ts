import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import { getEvmEvent } from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EvmAddress,
  type EffectstreamBlockNumber,
  TypeboxHelpers,
  type StaticDecode,
} from "@effectstream/utils";
import { type JsonObject, Primitive } from "@effectstream/sm";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";

const buyItemsAbi = [
  {
    type: "event" as const,
    name: "BuyItems" as const,
    inputs: [
      { name: "receiver", type: "address", indexed: true, internalType: "address" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "paymentToken", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "referrer", type: "address", indexed: false, internalType: "address" },
      { name: "itemsIds", type: "uint256[]", indexed: false, internalType: "uint256[]" },
      { name: "itemsQuantities", type: "uint256[]", indexed: false, internalType: "uint256[]" },
    ],
    anonymous: false,
  },
] as const;

export const buyItemsGrammar = [
  ["receiver", Type.String()],
  ["buyer", Type.String()],
  ["paymentToken", Type.String()],
  ["amount", Type.String()],
  ["referrer", Type.String()],
  ["itemsIds", Type.String()],
  ["itemsQuantities", Type.String()],
] as const;

export class BuyItemsPrimitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof buyItemsGrammar
> {
  readonly internalTypeName = "EVM:BUY-ITEMS";
  readonly abi: ReturnType<typeof getEvmEvent> = getEvmEvent(
    buyItemsAbi,
    "BuyItems(address,address,address,uint256,address,uint256[],uint256[])",
  );
  override grammar = buyItemsGrammar;
  readonly contractAddress: EvmAddress;

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
        | StaticDecode<CommandTuple<string, typeof buyItemsGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;
    const receiver = String(payload.receiver).toLowerCase();
    const buyer = String(payload.buyer).toLowerCase();
    const paymentToken = String(payload.paymentToken).toLowerCase();
    const amount = String(payload.amount);
    const referrer = String(payload.referrer).toLowerCase();
    const itemsIds = JSON.stringify(
      Array.isArray(payload.itemsIds)
        ? payload.itemsIds.map(String)
        : [String(payload.itemsIds)],
    );
    const itemsQuantities = JSON.stringify(
      Array.isArray(payload.itemsQuantities)
        ? payload.itemsQuantities.map(String)
        : [String(payload.itemsQuantities)],
    );

    const accountingPayload: ParamToData<typeof buyItemsGrammar> = {
      receiver,
      buyer,
      paymentToken,
      amount,
      referrer,
      itemsIds,
      itemsQuantities,
    };

    const stateMachinePayload:
      | StaticDecode<CommandTuple<string, typeof this.grammar>>
      | null = this.stateMachinePrefix
        ? generateRawStmInput(
          this.grammar,
          this.stateMachinePrefix,
          accountingPayload,
        )
        : null;

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.EVM,
            address: Value.Decode(
              TypeboxHelpers.Evm.Address,
              buyer,
            ),
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
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }

  override getIntermediatePrefix(): string[] {
    return [];
  }

  override getViewPrefix(): string[] {
    return [];
  }

  override getDynamicTables = (_name: string): string | undefined => {
    return undefined;
  };
}
