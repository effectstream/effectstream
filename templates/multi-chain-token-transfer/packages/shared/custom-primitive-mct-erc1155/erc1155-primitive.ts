import { Value } from "@sinclair/typebox/value";
import type { StaticDecode } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  getEvmEvent,
  type ProtocolPrimitiveMap,
} from "@paimaexample/config";
import {
  type AddressAndType,
  AddressType,
  type EvmAddress,
  type PaimaBlockNumber,
  TypeboxHelpers,
} from "@paimaexample/utils";
import { type JsonObject, PaimaPrimitive } from "@paimaexample/sm";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@paimaexample/concise";
import type { StateUpdateStream } from "@paimaexample/coroutine";
import { mct_erc1155 } from "@multi-chain-transfer/evm-contracts";
import { mctErc1155Grammar } from "./erc1155-grammar.ts";

/**
 * Erc721 Primitive
 *
 * This is a concrete implementation of the PaimaPrimitive class for ERC721.
 */

const PrimitiveTypeEVMMCTERC1155 = "EVM:MCT_ERC1155" as const;


export class MCTErc1155Primitive extends PaimaPrimitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof mctErc1155Grammar
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeEVMMCTERC1155;
  readonly abi = getEvmEvent(mct_erc1155.abi, "TransferToMidnight(address,string,uint256,uint256,string)");
  override grammar = mctErc1155Grammar;
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
    _: PaimaBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof mctErc1155Grammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { from, midnight_address, amount, token_id, tx_hash } = primitiveTransactionData.output.payload;
    const fromAddr = Value.Decode(
      TypeboxHelpers.Evm.Address,
      from.toLowerCase(),
    );
    const amountParsed = Value.Decode(
      TypeboxHelpers.Uint256,
      amount,
    );
    const tokenIdParsed = Value.Decode(
      TypeboxHelpers.Uint256,
      token_id,
    );

    const isBatched = false;
    const accountingPayload: ParamToData<typeof mctErc1155Grammar> = {
      midnight_address: midnight_address,
      from: fromAddr,
      amount: amountParsed,
      token_id: tokenIdParsed,
      tx_hash: tx_hash,
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
