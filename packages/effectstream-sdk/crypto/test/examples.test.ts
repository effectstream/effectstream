// Examples copied verbatim from README.md. If you change one, change both.

import { test, expect } from "bun:test";
import { AddressType } from "@effectstream/utils";
import { CryptoManager, Prando } from "../src/mod.ts";

test("README: CryptoManager.getCryptoManager exposes verifySignature for EVM", () => {
  const evm = CryptoManager.getCryptoManager(AddressType.EVM);
  expect(typeof evm.verifySignature).toBe("function");
  expect(typeof evm.verifyAddress).toBe("function");
});

test("README: verifyAddress recognises a well-formed EVM address", () => {
  const evm = CryptoManager.getCryptoManager(AddressType.EVM);
  expect(evm.verifyAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(
    true,
  );
});

test("README: Prando with same seed produces the same sequence", () => {
  const blockHash = "0xdeadbeef";
  const rng = new Prando(blockHash);
  const roll = rng.nextInt(1, 6);

  const replay = new Prando(blockHash);
  expect(replay.nextInt(1, 6)).toBe(roll);
});

test("README: every supported chain returns an IVerify", () => {
  for (
    const t of [
      AddressType.EVM,
      AddressType.CARDANO,
      AddressType.POLKADOT,
      AddressType.ALGORAND,
      AddressType.MINA,
      AddressType.MIDNIGHT,
      AddressType.SOLANA,
    ]
  ) {
    const mgr = CryptoManager.getCryptoManager(t);
    expect(typeof mgr.verifySignature).toBe("function");
  }
});
