import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { type JsonObject, Primitive } from "@effectstream/sm";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
  uint8ArrayToHexString,
} from "@effectstream/utils";
import { poolDelegationGrammar } from "./pool-delegation-grammar.ts";
import {
  POOL_DELEGATION_INTERMEDIATE_PREFIX,
  POOL_DELEGATION_VIEW_PREFIX,
  poolDelegationIvm,
} from "./pool-delegation-ivm.ts";
import { PrimitiveTypeCardanoPoolDelegation } from "../builtin.ts";
import { slotToEpoch, stakeCredentialToHex } from "../cardano-utils/cardano-helpers.ts";

type CardanoNetwork = "preview" | "preprod" | "mainnet" | "yaci";

export class CardanoPoolDelegationPrimitive extends Primitive<
  ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  typeof poolDelegationGrammar
> {
  readonly internalTypeName = PrimitiveTypeCardanoPoolDelegation;
  readonly pools: string[];
  readonly network: CardanoNetwork;
  override grammar = poolDelegationGrammar;

  override dynamicTables = poolDelegationIvm;
  override getIntermediatePrefix(): string[] {
    return [POOL_DELEGATION_INTERMEDIATE_PREFIX];
  }
  override getViewPrefix(): string[] {
    return [POOL_DELEGATION_VIEW_PREFIX];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    stateMachinePrefix: string | undefined;
    pools: string[];
    network: CardanoNetwork;
  }) {
    super(config);
    this.pools = config.pools.map((p) => p.toLowerCase());
    this.network = config.network;
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      predicate: { match: { cardano: { has_certificate: true } } },
    } as const;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof poolDelegationGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const tx = primitiveTransactionData.output.payload.tx;
    const absoluteSlot = primitiveTransactionData.syncProtocol.absoluteSlot ?? 0;
    const epoch = slotToEpoch(absoluteSlot, this.network);

    const entries: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: any;
      accountingPayload: JsonObject;
    }[] = [];

    for (const cert of tx.certificates) {
      const c = cert.certificate;
      // Pre-Conway: stakeDelegation; Conway: stakeRegDelegCert, stakeVoteDelegCert
      if (c.case !== "stakeDelegation" && c.case !== "stakeRegDelegCert" && c.case !== "stakeVoteDelegCert") continue;

      const deleg = c.value;
      if (!deleg.stakeCredential) continue;

      const cred = stakeCredentialToHex(deleg.stakeCredential);
      if (!cred) continue;

      const poolKeyhash = uint8ArrayToHexString(deleg.poolKeyhash);

      if (this.pools.length > 0 && !this.pools.includes(poolKeyhash.toLowerCase())) continue;

      const address = cred.hash;
      const pool = poolKeyhash;

      const accountingPayload = { address, pool, epoch };

      const stateMachinePayload: any = this.stateMachinePrefix
        ? generateRawStmInput(this.grammar, this.stateMachinePrefix, {
            address,
            pool,
            epoch: String(epoch),
          })
        : null;

      entries.push({
        fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
        accountingPayload,
        stateMachinePayload,
      });
    }

    return { isBatched: true, data: entries };
  }
}
