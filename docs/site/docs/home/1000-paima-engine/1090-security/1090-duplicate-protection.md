---
id: duplicate-protection
title: Duplicate Protection in Paima L2
slug: /paima-engine/duplicate-protection
sidebar_label: Duplicate Protection
---

# Replay Protection in Paima L2 (v2)

## Why Replay Protection is Essential

Replay protection is a critical security mechanism that prevents malicious
actors from resubmitting valid user inputs to cause unintended side effects.
Without proper replay protection, an attacker could:

- **Duplicate transactions**: Resubmit a valid move or transaction multiple
  times to drain user funds or manipulate game state
- **Cross-chain replays**: Take a valid signature from one chain/context and
  replay it on another
- **Time-shifted attacks**: Reuse old valid transactions at inappropriate times
  when they might have different effects

In blockchain gaming and applications, this protection is especially important
because:

- Game moves often have economic consequences (spending tokens, making trades,
  etc.)
- Users expect their signed actions to execute exactly once unless they
  explicitly choose to repeat them
- Malicious replay attacks could completely break game balance and user trust

Paima Engine implements comprehensive replay protection across all input methods
(batched, direct, and scheduled) to ensure each user action is processed exactly
once in its intended context.

## What you need to send

- Batched inputs (via the batcher HTTP API)
  - Include a millisecond timestamp and a signature over the batcher message
    that contains your input and timestamp.
  - The engine enforces a 24-hour validity window on this timestamp.

- Direct (non-batched) inputs (on-chain)
  - No off-chain signature or timestamp required.

- Scheduled inputs
  - No nonce or signature required; scheduled items are executed atomically with
    their deletion.

## How validation and deduplication work

- Batched inputs
  - Signature check: the batcher validates `userSignature` against the exact
    message built from `millisecondTimestamp`, `userAddress`, and `gameInput`.
  - 24-hour validity window: the engine checks that `millisecondTimestamp` is
    within 24 hours of the Paima block time; otherwise the input is discarded.
  - Nonce and duplicate check: the engine computes
    - nonce = `hash(userAddress + gameInput + millisecondTimestamp)`
    - If the nonce is already in the `nonces` table, the input is skipped as a
      duplicate; otherwise it's inserted and processed.

- Direct (non-batched) inputs
  - Nonce and duplicate check: the engine computes
    - nonce = `hash(String(blockHeight) + userAddress + gameInput)`
    - Deduplication is same-block: two identical submissions in different blocks
      intentionally produce different nonces.
    - If they are sent on the same block and have identical content, they will
      have the same nonce and only the first one will be processed (the
      duplicate will be skipped).

- Scheduled inputs
  - Processed atomically with their deletion; no user-provided nonce needed.

## What gets stored

- `nonces` table
  - `nonce` (primary key): keccak256 as 0x… string
  - `block_height`: Paima block height where it was processed
- Each input is processed only if its nonce is not already present.

## Quick checklist

- Batched:
  - Build and sign the exact batcher message (timestamp, address, input).
  - Use a timestamp within 24 hours of the block time.
  - Post the same strings you signed.

- Direct:
  - Call the contract with your input hex.
  - Dedup is same-block: identical inputs in the same block dedup; across blocks
    they're distinct.

- Scheduled:
  - No nonce required; engine prevents replays via atomic execution.

Reference (v1 background):
[Replay protection](https://docs.paimastudios.com/home/state-machine/direct-write/replay-protection/).
