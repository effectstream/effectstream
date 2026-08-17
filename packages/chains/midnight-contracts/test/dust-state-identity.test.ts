// A seed-keyed snapshot file must actually belong to that seed's dust wallet.
//
// The file name is `sha256(seed)`, but nothing checked that the snapshot inside
// it came from that seed. Two ways that bites:
//
// - the balancing adapter's injected-wallet path takes a `walletResult` built
//   by someone else and pairs it with the seed the adapter was constructed
//   with. The convention is that they match (e2e builds both from the same
//   seed), but nothing enforced it, and persisting under a mismatched key would
//   hand a different wallet's dust state to a later restore;
// - `DustWallet.restore` rebuilds the wallet from the snapshot's own key, while
//   `wallet.start()` is then called with the seed's dust secret key. A mismatch
//   there is not a clean failure.
//
// The snapshot records `publicKey.publicKey`, and that value is derivable from
// the seed alone, so both sides can be checked. Verified against the SDK
// 2026-08-17: a dust wallet started from seed 0x00…01 serializes exactly the
// publicKey that DustSecretKey.fromSeed(deriveSeedForRole(seed, Roles.Dust))
// produces — the constant below is that measured value, so this test also
// pins the derivation itself. If an SDK upgrade changes it, this fails loudly
// instead of silently disabling persistence.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getDustStatePath, loadDustState, saveDustState } from "../src/dust-state.ts";
import { deriveDustPublicKey } from "../src/get-wallet-info.ts";

const SEED_A = "0000000000000000000000000000000000000000000000000000000000000001";
const SEED_B = "0000000000000000000000000000000000000000000000000000000000000002";
/** Measured from the SDK for SEED_A — see header. */
const SEED_A_DUST_PUBLIC_KEY =
  "11886380015789543296729785856017363359697744265386149017101029008360306658047";

const snapshot = (publicKey: string, offset = "128"): string =>
  JSON.stringify({
    publicKey: { publicKey },
    state: "ab".repeat(64),
    protocolVersion: "0",
    networkId: "preprod",
    offset,
  });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "es00009-dust-identity-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("dust snapshot identity", () => {
  test("the dust public key is derivable from the seed alone", () => {
    expect(deriveDustPublicKey(SEED_A).toString()).toEqual(SEED_A_DUST_PUBLIC_KEY);
    expect(deriveDustPublicKey(SEED_B).toString()).not.toEqual(SEED_A_DUST_PUBLIC_KEY);
  });

  test("a snapshot from another wallet is not loaded for this seed", () => {
    fs.writeFileSync(
      getDustStatePath(dir, "preprod", SEED_A),
      snapshot(deriveDustPublicKey(SEED_B).toString()),
      "utf-8",
    );
    expect(
      loadDustState(dir, "preprod", SEED_A, {
        expectedPublicKey: deriveDustPublicKey(SEED_A).toString(),
      }),
    ).toBeNull();
  });

  test("a snapshot from another wallet is not saved under this seed", () => {
    expect(
      saveDustState(dir, "preprod", SEED_A, snapshot(deriveDustPublicKey(SEED_B).toString()), {
        expectedPublicKey: deriveDustPublicKey(SEED_A).toString(),
      }),
    ).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test("the wallet's own snapshot still round-trips", () => {
    const options = { expectedPublicKey: SEED_A_DUST_PUBLIC_KEY };
    expect(
      saveDustState(dir, "preprod", SEED_A, snapshot(SEED_A_DUST_PUBLIC_KEY), options),
    ).not.toBeNull();
    expect(loadDustState(dir, "preprod", SEED_A, options)).not.toBeNull();
  });

  test("callers that pass no expectation are not gated on identity", () => {
    // The check costs a key derivation, so it stays opt-in at the persistence
    // layer; every caller inside this package opts in.
    saveDustState(dir, "preprod", SEED_A, snapshot(deriveDustPublicKey(SEED_B).toString()));
    expect(loadDustState(dir, "preprod", SEED_A)).not.toBeNull();
  });
});
