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
import { solanaTokenAccountGrammar } from "./solana-token-account-grammar.ts";
import { PrimitiveTypeSolanaTokenAccount } from "../builtin.ts";

/**
 * Built-in primitive: tracks the SPL token balance of a watched token account per
 * slot, derived from a transaction's `meta.postTokenBalances` by
 * `SolanaFetcher.readPrimitives`.
 *
 * Narrowed by any combination of `mint`, `owner` and `tokenAccount`; at least one
 * must be set. `tokenProgramId` optionally pins it to classic SPL Token or to
 * Token-2022 rather than accepting both.
 *
 * KNOWN LIMITATION — this reports post-state balances only, matching
 * SOLANA:AccountBalance. A token account that is *closed* appears in
 * `preTokenBalances` and is absent from `postTokenBalances`, so closure produces no
 * event rather than a zero one. Emitting a pre/post delta would cover it and is a
 * deliberate non-goal here; see the Solana chain docs.
 */
export class SolanaTokenAccountPrimitive extends Primitive<
  ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
  typeof solanaTokenAccountGrammar
> {
  readonly internalTypeName = PrimitiveTypeSolanaTokenAccount;
  override grammar = solanaTokenAccountGrammar;
  readonly mint: string | undefined;
  readonly owner: string | undefined;
  readonly tokenAccount: string | undefined;
  readonly tokenProgramId: string | undefined;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    mint?: string;
    owner?: string;
    tokenAccount?: string;
    tokenProgramId?: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    // Rejected here rather than in the fetcher because this is the earliest point
    // it can be caught: an entry with no filter at all would match every token
    // balance in every transaction, which is never what was meant.
    if (
      config.mint == null && config.owner == null && config.tokenAccount == null
    ) {
      throw new Error(
        `[${PrimitiveTypeSolanaTokenAccount}] "${config.instanceName}" needs at least one of ` +
          `mint, owner or tokenAccount. Without a filter it would match every token balance on chain.`,
      );
    }
    this.mint = config.mint;
    this.owner = config.owner;
    this.tokenAccount = config.tokenAccount;
    this.tokenProgramId = config.tokenProgramId;
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
        | StaticDecode<CommandTuple<string, typeof solanaTokenAccountGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload as {
      tokenAccount?: string;
      mint?: string;
      owner?: string;
      amount?: string;
      decimals?: number;
      slot?: number;
    };

    const accountingPayload: ParamToData<typeof solanaTokenAccountGrammar> = {
      tokenAccount: String(payload.tokenAccount ?? ""),
      mint: String(payload.mint ?? this.mint ?? ""),
      // `owner` is optional in the RPC's token balance record, so it can genuinely
      // be absent. Empty string rather than a thrown error: the balance itself is
      // still valid state, and the grammar requires a string.
      owner: String(payload.owner ?? this.owner ?? ""),
      amount: String(payload.amount ?? "0"),
      decimals: Number(payload.decimals ?? 0),
      slot: Number(payload.slot ?? 0),
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
          // The owner is the party whose holdings changed, so it is the meaningful
          // actor. Falls back to the token account when the RPC omitted the owner.
          fromAddressAndType: {
            type: AddressType.SOLANA,
            address: accountingPayload.owner || accountingPayload.tokenAccount,
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
      mint: this.mint,
      owner: this.owner,
      tokenAccount: this.tokenAccount,
      tokenProgramId: this.tokenProgramId,
      // Both names on purpose. Every other builtin emits only `scheduledPrefix`,
      // which the `Primitive` constructor does not read — so a config round-tripped
      // through getConfig() silently loses its state-machine routing. Emitting
      // `stateMachinePrefix` too makes this primitive survive that trip, and
      // `scheduledPrefix` stays for anything still reading the deprecated name.
      stateMachinePrefix: this.stateMachinePrefix,
      scheduledPrefix: this.stateMachinePrefix,
    } as ProtocolPrimitiveMap[ConfigSyncProtocolType.SOLANA_RPC_PARALLEL];
  }
}
