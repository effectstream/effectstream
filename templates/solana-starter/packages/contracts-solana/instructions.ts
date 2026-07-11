// Client-side instruction builders for the counter program. Mirror the Rust
// functions in programs/counter/src/lib.rs — the byte layout (discriminant +
// little-endian u64) is part of the program's wire format, so keep in sync.
import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  COUNTER_PROGRAM_ID,
  DISCRIMINANT_INCREMENT,
  DISCRIMINANT_RESET,
  COUNTER_SEED,
} from "./program-id.ts";

export function findCounterAddress(
  authority: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [COUNTER_SEED, authority.toBuffer()],
    new PublicKey(COUNTER_PROGRAM_ID),
  );
}

// Account order must match process_instruction in programs/counter/src/lib.rs:
//   authority (signer) · counter (PDA) · payer (signer, funds rent) · system program
// `payer` is the batcher's fee-payer, so the user pays nothing — not even rent.
function counterKeys(authority: PublicKey, counter: PublicKey, payer: PublicKey) {
  return [
    { pubkey: authority, isSigner: true, isWritable: false },
    { pubkey: counter, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
}

export function createIncrementInstruction(
  authority: PublicKey,
  amount: bigint | number,
  payer: PublicKey,
): TransactionInstruction {
  const [counter] = findCounterAddress(authority);
  const data = Buffer.alloc(9);
  data[0] = DISCRIMINANT_INCREMENT;
  // Manual little-endian u64 write — the browser Buffer polyfill lacks
  // writeBigUInt64LE, so write the bytes ourselves (works in Node + browser).
  const value = BigInt(amount);
  for (let i = 0; i < 8; i++) {
    data[1 + i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return new TransactionInstruction({
    programId: new PublicKey(COUNTER_PROGRAM_ID),
    keys: counterKeys(authority, counter, payer),
    data,
  });
}

export function createResetInstruction(
  authority: PublicKey,
  payer: PublicKey,
): TransactionInstruction {
  const [counter] = findCounterAddress(authority);
  return new TransactionInstruction({
    programId: new PublicKey(COUNTER_PROGRAM_ID),
    keys: counterKeys(authority, counter, payer),
    data: Buffer.from([DISCRIMINANT_RESET]),
  });
}
