import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  upsertCounterState,
  insertCounterEvent,
  getCounterByAuthority,
} from "@solana-starter/database";
import { grammar } from "./grammar.ts";
import { COUNTER_PROGRAM_ID } from "@solana-starter/contracts-solana/program-id";

// Must match the `msg!` prefix in programs/counter/src/lib.rs.
const COUNTER_LOG_PREFIX = "EFFECTSTREAM_COUNTER";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("solana-program-log", function* (data) {
  const { parsedInput, blockHeight } = data;
  const { slot, programId, logMessages } = parsedInput;

  // Safety check; the primitive already filters to this program.
  if (programId !== COUNTER_PROGRAM_ID) return;

  for (const raw of logMessages) {
    const parsed = parseCounterLog(raw);
    if (!parsed) continue;

    const { authority, value } = parsed;

    // Read the previous value to record kind/delta on the event row.
    const previous = yield* World.resolve(getCounterByAuthority, {
      authority,
    });
    // bigint throughout: the on-chain counter is a u64, so Number() would stop
    // indexing (parseCounterLog rejects unsafe integers) past 2^53.
    const priorValue = previous.length > 0 ? BigInt(previous[0].value) : 0n;
    const delta = value - priorValue;
    const kind: "increment" | "reset" =
      value === 0n && priorValue !== 0n ? "reset" : "increment";

    yield* World.resolve(
      upsertCounterState,
      {
        authority,
        value,
        slot: BigInt(slot),
        block_height: blockHeight,
      },
    );

    yield* World.resolve(
      insertCounterEvent,
      {
        authority,
        value,
        slot: BigInt(slot),
        block_height: blockHeight,
        kind,
        delta,
      },
    );
  }
});

// Parses `EFFECTSTREAM_COUNTER|<authority>|<value>|<slot>`, returning null for
// anything else. `msg!` prefixes log lines with "Program log: " on the wire.
function parseCounterLog(
  raw: string,
): { authority: string; value: number; slot: number } | null {
  const line = raw.startsWith("Program log: ")
    ? raw.slice("Program log: ".length)
    : raw;
  if (!line.startsWith(COUNTER_LOG_PREFIX + "|")) return null;
  const parts = line.split("|"); // [PREFIX, authority, value, slot]
  if (parts.length !== 4) return null;
  const authority = parts[1];
  let value: bigint;
  try {
    value = BigInt(parts[2]); // u64 on chain — must not go through Number()
  } catch {
    return null;
  }
  const slot = Number(parts[3]);
  if (!Number.isSafeInteger(slot)) return null;
  return { authority, value, slot };
}

export const appStateTransitions: StartConfigAppStateTransitions =
  function* (
    _blockHeight: number,
    input: BaseStfInput,
  ): SyncStateUpdateStream<void> {
    yield* stm.processInput(input);
  };
