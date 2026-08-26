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
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { solanaAccountBalanceGrammar } from "./solana-account-balance-grammar.ts";
import { PrimitiveTypeSolanaAccountBalance } from "../builtin.ts";

/**
 * Built-in primitive: tracks the lamport balance of a watched `address` per
 * slot (derived from a transaction's postBalances by SolanaFetcher.readPrimitives).
 */
export class SolanaAccountBalancePrimitive extends Primitive<
  ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
  typeof solanaAccountBalanceGrammar
> {
  readonly internalTypeName = PrimitiveTypeSolanaAccountBalance;
  override grammar = solanaAccountBalanceGrammar;
  readonly address: string;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    address: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.address = config.address;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof solanaAccountBalanceGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as {
      address?: string;
      lamports?: number;
      slot?: number;
    };
    const address = String(payload.address ?? this.address);
    const lamports = Number(payload.lamports ?? 0);
    const slot = Number(payload.slot ?? 0);

    const accountingPayload: ParamToData<typeof solanaAccountBalanceGrammar> = {
      address,
      lamports,
      slot,
    };

    const stateMachinePayload = this.stateMachinePrefix
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
            type: AddressType.SOLANA,
            address,
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      address: this.address,
      scheduledPrefix: this.stateMachinePrefix,
    } as ProtocolPrimitiveMap[ConfigSyncProtocolType.SOLANA_RPC_PARALLEL];
  }
}
