// Midnight seed files (00057 Q13 A; native, no chain): `readSeedFile` / `parseSeedText` accept what
// Night Market's `parseSponsorSeed` accepts — a 32- to 64-byte hex seed (`0x` optional), a BIP-39
// mnemonic, or either on a `WALLET=` / `SEED=` / `MNEMONIC=` line — and the template derives from a
// 64-byte seed the same addresses as Night Market's relay.
//
// Known answers use a THROWAWAY wallet: the published BIP-39 test mnemonic "abandon … about".
// - Its BIP-39 seed (empty passphrase) is the published vector 5eb00bbd…e38e4, and equals
//   @scure/bip39's mnemonicToSeedSync (the library the wallet SDK uses).
// - Its unshielded addresses were derived with Night Market's own code (relay/src/config.ts
//   parseSponsorSeed → relay/src/sponsor/facade.ts deriveSponsorKeys → createKeystore), and with an
//   owner's real 64-byte stagenet seed the template's path gave Night Market's address too (AA 00058
//   L-SEEDS S.1; the seed was never printed).
//
// Run: bun test ./midnight-seeds.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { isDevSeed, parseSeedText, readSeedFile, shieldedAddressFromSeed } from "@solana-midnight-bridge/contracts-midnight/wallets";

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const MNEMONIC_SEED =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";
// Night Market's relay, from the same mnemonic (see above).
const NM_UNSHIELDED = {
  undeployed: "mn_addr_undeployed1dwv2rta0a2skyhrvukaw2q9r2sq6yc4jhj63rf7afxpkrrv6g35q07rgeu",
  stagenet: "mn_addr_stagenet1dwv2rta0a2skyhrvukaw2q9r2sq6yc4jhj63rf7afxpkrrv6g35qz2gd7g",
};

// The unshielded address the template's wallets get from a seed: the engine's buildWalletFacade path
// (HDWallet.fromSeed → account 0 → NightExternal → key 0 → a schnorr keystore), with the packages as
// contracts-midnight and the engine resolve them (Bun's isolated linker: not this package's deps).
const cmDir = path.dirname(Bun.resolveSync("@solana-midnight-bridge/contracts-midnight/wallets", import.meta.dir));
const hdPath = Bun.resolveSync("@midnightntwrk/wallet-sdk-hd", cmDir);
const { HDWallet, Roles } = await import(hdPath);
const enginePath = Bun.resolveSync("@effectstream/midnight-contracts", cmDir);
const { createKeystore } = await import(Bun.resolveSync("@midnightntwrk/wallet-sdk-unshielded-wallet", path.dirname(enginePath)));
function unshieldedAddress(seedHex: string, networkId: string): string {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, "hex"));
  if (hd.type !== "seedOk") throw new Error(`HDWallet.fromSeed: ${hd.type}`);
  const r = hd.hdWallet.selectAccount(0).selectRole(Roles.NightExternal).deriveKeyAt(0);
  hd.hdWallet.clear();
  if (r.type !== "keyDerived") throw new Error(`deriveKeyAt: ${r.type}`);
  return createKeystore({ kind: "schnorr", secret: Uint8Array.from(r.key) }, networkId).getBech32Address().asString();
}

describe("parseSeedText: the accepted forms", () => {
  test("a 32-byte hex seed is unchanged (0x and case are normalised)", () => {
    const s = "ab".repeat(32);
    expect(parseSeedText(s)).toBe(s);
    expect(parseSeedText(`0x${s.toUpperCase()}\n`)).toBe(s);
    expect(parseSeedText("0".repeat(63) + "1")).toBe("0".repeat(63) + "1"); // a dev seed is still a dev seed
    expect(isDevSeed(parseSeedText("0".repeat(63) + "2"))).toBe(true);
  });

  test("a 64-byte hex seed (Lace, the shared test wallets) is accepted as is, and so is 0x", () => {
    expect(parseSeedText(MNEMONIC_SEED)).toBe(MNEMONIC_SEED);
    expect(parseSeedText(`0x${MNEMONIC_SEED.toUpperCase()}`)).toBe(MNEMONIC_SEED);
    expect(parseSeedText("cd".repeat(48))).toBe("cd".repeat(48)); // 48 bytes: between, like parseSponsorSeed
  });

  test("a BIP-39 mnemonic becomes its BIP-39 seed (empty passphrase): the published vector and @scure/bip39", async () => {
    expect(parseSeedText(MNEMONIC)).toBe(MNEMONIC_SEED);
    expect(parseSeedText(`  ${MNEMONIC.toUpperCase().split(" ").join("   ")}\n`)).toBe(MNEMONIC_SEED);
    const bip39 = await import(Bun.resolveSync("@scure/bip39", path.dirname(hdPath)));
    expect(Buffer.from(bip39.mnemonicToSeedSync(MNEMONIC, "")).toString("hex")).toBe(MNEMONIC_SEED);
    // 24 words (a different mnemonic, the second published 24-word vector's words).
    const m24 = Array(23).fill("abandon").concat("art").join(" ");
    expect(parseSeedText(m24)).toBe(Buffer.from(bip39.mnemonicToSeedSync(m24, "")).toString("hex"));
  });

  test("WALLET= / SEED= / MNEMONIC= lines (export, quotes, other lines around them)", () => {
    expect(parseSeedText(`WALLET=${MNEMONIC_SEED}\n`)).toBe(MNEMONIC_SEED);
    expect(parseSeedText(`# a test wallet\nNAME=temporary\nexport SEED='0x${"ab".repeat(32)}'\n`)).toBe("ab".repeat(32));
    expect(parseSeedText(`MNEMONIC="${MNEMONIC}"`)).toBe(MNEMONIC_SEED);
  });

  test("anything else is refused with a clear message that never contains the value", () => {
    const secretish = "ab".repeat(31) + "a"; // 63 hex characters
    for (const [text, msg] of [
      [secretish, /32 to 64 bytes/],
      ["ab".repeat(65), /32 to 64 bytes/],
      ["abc".repeat(29), /an even number/], // 87 hex characters
      ["", /hex seed .* BIP-39 mnemonic/],
      ["not a seed at all", /hex seed .* BIP-39 mnemonic/],
      [Array(11).fill("abandon").join(" "), /hex seed .* BIP-39 mnemonic/],
      [Array(12).fill("abandon").join(" "), /not a valid BIP-39 mnemonic/], // bad checksum
      [Array(11).fill("abandon").concat("zzzz").join(" "), /not a valid BIP-39 mnemonic/], // not in the wordlist
      ["WALLET=", /hex seed .* BIP-39 mnemonic/],
    ] as const) {
      let err: Error | null = null;
      try {
        parseSeedText(text);
      } catch (e) {
        err = e as Error;
      }
      expect(err?.message ?? "no error").toMatch(msg);
      if (text.length > 8) expect(err!.message).not.toContain(text);
    }
  });
});

describe("a 64-byte seed derives Night Market's addresses (known answer, throwaway wallet)", () => {
  test("the template's HD path gives the address Night Market's relay derives, on both networks", () => {
    const seed = parseSeedText(MNEMONIC);
    expect(unshieldedAddress(seed, "undeployed")).toBe(NM_UNSHIELDED.undeployed);
    expect(unshieldedAddress(seed, "stagenet")).toBe(NM_UNSHIELDED.stagenet);
    // The same seed given as 128 hex, or on a WALLET= line, is the same wallet.
    expect(unshieldedAddress(parseSeedText(`WALLET=0x${MNEMONIC_SEED}`), "stagenet")).toBe(NM_UNSHIELDED.stagenet);
  });

  test("the shielded address comes from the same seed (and differs from a truncated 32-byte one)", () => {
    const seed = parseSeedText(MNEMONIC);
    expect(shieldedAddressFromSeed(seed, "stagenet")).toBe(
      "mn_shield-addr_stagenet1ywxc2p9986usecc9xert79afzq4m9x35u62sx0a4e2tc5w6mta5ulwhc432vhrlpnvygfep3pxcdt8tgzfstesrm6tf7hjc5jgpl20g0u5qrc",
    );
    expect(shieldedAddressFromSeed(seed.slice(0, 64), "stagenet")).not.toBe(shieldedAddressFromSeed(seed, "stagenet"));
  });
});

describe("readSeedFile: the file forms, with the permission rules unchanged", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "seeds-test-"));
    fs.chmodSync(dir, 0o700);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name: string, text: string, mode = 0o600) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, text, { mode });
    fs.chmodSync(f, mode);
    return f;
  };

  test("64-hex, 128-hex, a mnemonic and a WALLET= line are read; the error names the file, not the value", () => {
    expect(readSeedFile(write("a.seed", "ab".repeat(32) + "\n"))).toBe("ab".repeat(32));
    expect(readSeedFile(write("b.seed", MNEMONIC_SEED + "\n"))).toBe(MNEMONIC_SEED);
    expect(readSeedFile(write("c.seed", MNEMONIC + "\n"))).toBe(MNEMONIC_SEED);
    expect(readSeedFile(write("d.env", `WALLET=${MNEMONIC_SEED}\n`))).toBe(MNEMONIC_SEED);
    const bad = write("e.seed", "ab".repeat(20));
    expect(() => readSeedFile(bad)).toThrow(new RegExp(`seed file ${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: a hex seed must be 32 to 64 bytes`));
  });

  test("a file readable by group/other is still refused", () => {
    const f = write("g.seed", MNEMONIC_SEED, 0o644);
    expect(() => readSeedFile(f)).toThrow(/group\/other/);
  });
});
