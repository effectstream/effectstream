import { Primitive } from "@effectstream/sm";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeMidnightTokenMint } from "../builtin.ts";
import { midnightTokenMintGrammar } from "./midnight-token-mint-grammar.ts";

/**
 * MidnightTokenMintPrimitive
 *
 * Watches custom token *mints* on the Midnight ledger. A contract call's
 * effects record minted tokens as `domain_sep → amount` maps (shielded and
 * unshielded), and the resulting token type ("color") is derived as
 * `rawTokenType(domain_sep, contract_address)` — so this primitive is the
 * only way for a consumer to map a wallet-visible token id back to the
 * contract that minted it. The fetcher deserializes each regular
 * transaction's raw bytes with ledger-v8, walks the contract calls, and
 * emits one state-machine input per `(tx, call, domainSep, kind)` — only
 * for effects that actually applied on chain (failed segments roll back).
 *
 * The mint nonce is NOT part of token identity (it only randomizes coin
 * commitments) and is never public for shielded mints, so it is not part
 * of the payload.
 *
 * Usage:
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { payload } = data.parsedInput;
 *     // payload = { txHash, contractAddress, domainSep, rawTokenType,
 *     //             kind: "shielded" | "unshielded", amount, entryPoint }
 *     // amount is a decimal string (u64 mints can exceed MAX_SAFE_INTEGER)
 *   });
 */
export class MidnightTokenMintPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightTokenMintGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightTokenMint;
  override readonly grammar = midnightTokenMintGrammar;

  override dynamicTables = undefined;
  override getIntermediatePrefix(): string[] {
    return [];
  }
  override getViewPrefix(): string[] {
    return [];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string;
  }) {
    super(config);
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.MIDNIGHT_PARALLEL
    >,
  ): SyncStateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof midnightTokenMintGrammar>>
        | null;
      accountingPayload: ParamToData<typeof midnightTokenMintGrammar>;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;

    const accountingPayload: ParamToData<typeof this.grammar> = {
      payload,
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
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }
}
