import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import type { BaseStfInput } from "@effectstream/sm";
import {
  upsertEligibleVoter,
  upsertProposal,
  upsertVoteTally,
} from "@zk-cardano/database";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";

const stm = new Stm<typeof grammar, {}>(grammar);

function toNumber(value: any): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function mapLookup(map: any, key: number): any {
  if (!map) return undefined;
  if (typeof map.member === 'function' && typeof map.lookup === 'function') {
    try {
      if (map.member(BigInt(key))) return map.lookup(BigInt(key));
      return undefined;
    } catch { /* fall through to plain object access */ }
  }
  if (String(key) in map) return map[String(key)];
  return undefined;
}

stm.addStateTransition(
  "cardano-pool-delegation",
  function* (data) {
    console.log("[STM:cardano-delegation] raw parsedInput:", JSON.stringify(data.parsedInput, null, 2));

    const { address, pool, epoch } = data.parsedInput as {
      address: string;
      pool: string;
      epoch: string;
    };

    if (!address || !pool) {
      console.log("[STM:cardano-delegation] missing address or pool, skipping");
      return;
    }

    try {
      console.log(`[STM:cardano-delegation] about to upsert: staking_credential=${address}, pool=${pool}, epoch=${Number(epoch)}, block_height=${data.blockHeight}`);
      yield* World.resolve(upsertEligibleVoter, {
        staking_credential: address,
        pool,
        epoch: Number(epoch),
        block_height: data.blockHeight,
      });
      console.log(`[STM:cardano-delegation] upserted voter: ${address} -> pool ${pool}`);
    } catch (error) {
      console.error("[STM:cardano-delegation] Database error:", error);
    }
  },
);

stm.addStateTransition(
  "midnightBallotState",
  function* (data) {
    console.log("[STM:midnight-ballot] raw parsedInput:", JSON.stringify(data.parsedInput, null, 2));

    const payload = data.parsedInput.payload;
    if (!payload) {
      console.log("[STM:midnight-ballot] no payload, skipping");
      return;
    }

    try {
      const proposalCount = toNumber(payload.proposal_count);
      if (proposalCount === 0) {
        console.log("[STM:midnight-ballot] no proposals yet");
        return;
      }

      const yesCount = toNumber(payload.tally_yes);
      const noCount = toNumber(payload.tally_no);

      for (let i = 1; i <= proposalCount; i++) {
        const active = mapLookup(payload.proposal_active, i) ?? true;
        const title = mapLookup(payload.proposal_text, i) ?? null;

        yield* World.resolve(upsertProposal, {
          id: i,
          title: title != null ? String(title) : null,
          active: Boolean(active),
          block_height: data.blockHeight,
        });

        yield* World.resolve(upsertVoteTally, {
          proposal_id: i,
          yes_count: yesCount,
          no_count: noCount,
          block_height: data.blockHeight,
        });
      }

      console.log(`[STM:midnight-ballot] synced ${proposalCount} proposals (yes=${yesCount}, no=${noCount})`);
    } catch (error) {
      console.error("[STM:midnight-ballot] Error:", error);
    }
  },
);

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
