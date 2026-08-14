import type { StaticDecode } from "@sinclair/typebox";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import {
  type CommandTuple,
  type ParamToData,
  generateRawStmInput,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { bitcoinAddressGrammar } from "./bitcoin-grammar.ts";
import { PrimitiveTypeBitcoinAddress } from "../builtin.ts";

type BitcoinDirection = "inputs" | "outputs" | "both";

export class BitcoinAddressPrimitive extends Primitive<
  ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
  typeof bitcoinAddressGrammar
> {
  readonly internalTypeName = PrimitiveTypeBitcoinAddress;
  override grammar = bitcoinAddressGrammar;
  readonly watchAddress: string;
  readonly direction: BitcoinDirection;
  readonly label?: string;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    watchAddress: string;
    direction?: BitcoinDirection;
    label?: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.watchAddress = config.watchAddress;
    this.direction = config.direction ?? "both";
    this.label = config.label;
  }

  override *getPayload(
    _blockNumber: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof bitcoinAddressGrammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;
    const accountingPayload = {
      direction: payload.direction,
      address: payload.address,
      transactionId: payload.transactionId,
      index: payload.index,
      valueSats: payload.valueSats,
      utxoTxid: payload.utxo.txid,
      utxoVout: payload.utxo.vout,
    } as ParamToData<typeof bitcoinAddressGrammar>;
    if (payload.label != null) {
      accountingPayload.label = payload.label;
    }
    const accountingJson = accountingPayload as JsonObject;
    const stateMachinePayload = this.stateMachinePrefix
      ? generateRawStmInput(
        this.grammar,
        this.stateMachinePrefix,
        accountingPayload,
      )
      : null;
    return {
      isBatched: false,
      data: [{
        fromAddressAndType: {
          type: AddressType.NONE,
          address: "0x0",
        },
        accountingPayload: accountingJson,
        stateMachinePayload,
      }],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      watchAddress: this.watchAddress,
      direction: this.direction,
      label: this.label,
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }
}
