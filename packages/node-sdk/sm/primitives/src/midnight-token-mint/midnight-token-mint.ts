import { Primitive } from "../../Primitive.ts";
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
import {
  MIDNIGHT_TOKEN_MINT_INTERMEDIATE_PREFIX,
  MIDNIGHT_TOKEN_MINT_VIEW_PREFIX,
  midnightTokenMintIvm,
} from "./midnight-token-mint-ivm.ts";

/**
 * MidnightTokenMintPrimitive
 *
 * Watches custom token *mints* on the Midnight ledger and maps a token id
 * ("color") back to the contract that minted it — the mapping wallets cannot
 * provide. A contract call's effects record mints as `domain_sep → amount`
 * maps (shielded and unshielded); the token type is
 * `rawTokenType(domain_sep, contract_address)`. The fetcher deserializes each
 * regular transaction with ledger-v8, walks the contract calls, and emits one
 * event per `(tx, call, domainSep, kind)`.
 *
 * The primitive OWNS its registry table: `dynamicTables` declares
 * `primitives.midnight_token_mint_view_<instance>` (maintained by a trigger on
 * effectstream.primitive_accounting), so a consumer gets the registry with
 * only an `.addPrimitive(...)` line — no state-machine handler, grammar entry,
 * or migration. Set `persist: false` in config to skip the owned table on a
 * fresh database (the accounting row is still written; useful when a consumer
 * wants to handle the data itself or skip it) — see the flag's own docs for why
 * it does not tear down a table an earlier run already created.
 *
 * The owned table does NOT replace the state machine: the two paths are
 * independent and run together. Whenever `stateMachinePrefix` is set the
 * primitive still emits an STM input for every mint, exactly as it would
 * without an owned table — the registry is the read model, the STM handler is
 * where app-specific logic lives. Pass `stateMachinePrefix: undefined` to opt
 * out explicitly (the flag is a required config key so the choice is never
 * made by omission).
 *
 * Usage (STM path, in addition to the owned view):
 *   grammar: { myPrefix: builtinGrammars.midnightTokenMint }
 *   stm.addStateTransition("myPrefix", function* (data) {
 *     const { rawTokenType, kind, contractAddress, domainSep, amount, txHash }
 *       = data.parsedInput;
 *     // amount is a decimal string (u64 mints can exceed MAX_SAFE_INTEGER)
 *   });
 *
 * The mint nonce is NOT part of token identity (it only randomizes coin
 * commitments) and is never public for shielded mints, so it is not recorded.
 */
export class MidnightTokenMintPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightTokenMintGrammar
> {
  readonly internalTypeName = PrimitiveTypeMidnightTokenMint;
  override readonly grammar = midnightTokenMintGrammar;

  /**
   * When true (default) the primitive owns + populates its registry table.
   *
   * Only affects whether the DDL is emitted, and the DDL is applied once per
   * instance behind a migration row with no down path — so flipping this to
   * `false` on a database that already ran with `true` leaves the table and its
   * trigger in place, still accumulating. It skips the table on a fresh
   * database; it is not a runtime off switch.
   */
  readonly persist: boolean;

  // Owned table — gated by `persist`. When disabled, no DDL is emitted, so no
  // table/trigger is created and nothing is consolidated (accounting only).
  override dynamicTables = (
    name: string,
    strategy: Parameters<typeof midnightTokenMintIvm>[1],
  ): string | undefined =>
    this.persist ? midnightTokenMintIvm(name, strategy) : undefined;

  override getIntermediatePrefix(): string[] {
    return [MIDNIGHT_TOKEN_MINT_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [MIDNIGHT_TOKEN_MINT_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    // Required key (may be `undefined`) like every other primitive: owning a
    // table is not a reason to skip the STM, so opting out has to be deliberate.
    stateMachinePrefix: string | undefined;
    persist?: boolean;
  }) {
    super(config);
    this.persist = config.persist ?? true;
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
    const p = primitiveTransactionData.output.payload as {
      contractAddress: string;
      domainSep: string;
      rawTokenType: string;
      kind: string;
      amount: string;
      txHash: string;
      entryPoint?: string;
    };

    // Flat accounting payload so the owned-table trigger reads columns via
    // payload->>'field' (matches ERC20/NEP141).
    const accountingPayload: ParamToData<typeof this.grammar> = {
      contractAddress: p.contractAddress,
      domainSep: p.domainSep,
      rawTokenType: p.rawTokenType,
      kind: p.kind,
      amount: p.amount,
      txHash: p.txHash,
      entryPoint: p.entryPoint ?? "",
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
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }
}
