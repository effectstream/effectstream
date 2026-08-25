import { describe, expect, test } from "bun:test";

import { MidnightFetcher } from "../src/sync-protocols/midnight/fetcher.ts";
import { decodeTokenMints } from "../src/sync-protocols/midnight/mint-decoder.ts";
import { decodeZswapEvent } from "../src/sync-protocols/midnight/zswap-decoder.ts";

const FIXTURE_NAMES = [
  "fund-genesis-to-alice",
  "fund-alice-to-bob-with-shielded-input",
  "counter-deploy",
  "counter-increment",
  "counter-mint-shielded",
  "counter-mint-unshielded",
] as const;

type Fixture = {
  name: string;
  purpose: string;
  block: {
    hash: string;
    height: number;
    protocolVersion: number;
    timestamp: number;
    parent: { hash: string };
  };
  transaction: {
    hash: string;
    protocolVersion: number;
    raw: string;
    contractActions: { address: string }[];
    unshieldedSpentOutputs: UnshieldedOutput[];
    unshieldedCreatedOutputs: UnshieldedOutput[];
    zswapLedgerEvents: {
      id: number;
      raw: string;
      maxId: number;
      protocolVersion: number;
      expected: ReturnType<typeof decodeZswapEvent>;
    }[];
    zswapMerkleTreeRoot: string;
    transactionResult: {
      status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILURE";
      segments?: { id: number; success: boolean }[] | null;
    };
  };
  expectedTokenMints: ReturnType<typeof decodeTokenMints>;
};

type UnshieldedOutput = {
  intentHash: string;
  outputIndex: number;
  owner: string;
  value: string;
  tokenType: string;
};

const fixtures = await Promise.all(
  FIXTURE_NAMES.map((name) =>
    Bun.file(`${import.meta.dir}/fixtures/midnight-rc4/${name}.json`).json() as Promise<Fixture>
  ),
);

const fetcher = Object.create(MidnightFetcher.prototype) as MidnightFetcher;

function blockOf(fixture: Fixture): any {
  return {
    block: {
      ...fixture.block,
      transactions: [fixture.transaction],
    },
  };
}

function entry(type: string, name: string, extra: object = {}): any {
  return {
    syncProtocol: "midnight-rc4-fixture",
    primitive: { type, name, ...extra },
  };
}

describe("Midnight rc.4 protocolVersion 2000000 regression corpus", () => {
  test("retains finalized funding and deploy/call provenance", () => {
    expect(fixtures.map((fixture) => [
      fixture.name,
      fixture.block.height,
      fixture.block.hash,
      fixture.transaction.hash,
    ])).toEqual([
      ["fund-genesis-to-alice", 45, "8987d1fa694d0caabe68a2c34ec8135fd1e8adb250752cefcbc96a69dd4aae70", "490def5ca76143ef2c67af5665de25fa8eaeb76e98c6e2ab35b90441f0fe6fbc"],
      ["fund-alice-to-bob-with-shielded-input", 72, "19f0c4f5d7d3347814754e44f8bae37348590cf5eb364b074d05593881e16c52", "2f29a5919f8b805251165889eb25f0ae4d356344e9468f08cff7316c382cb311"],
      ["counter-deploy", 234, "d8aba57120dc61c9606cd5f6e9c1b8f4f2c100a47db85fe44a78a31432cc8fcd", "1dac099bfd8f42f26fd911a036bab2993af9a6242f5aaf7411434db92c4a8f9e"],
      ["counter-increment", 239, "663f17a0b33794252f8d3158680f222f98cd109765ad6dc773c91fdcac009080", "3c5cf6006b85bbd6fb88c9f900abb25a9e409d642f01cdcb5dac93dafd56c3af"],
      ["counter-mint-shielded", 247, "4e9157d8cfc0daffca5ad7b27ca83a9fc8ced6f9c609c5af1c8fb5803c52b2c9", "16005a2328950dd914bd2ef2c10838cd033f9ff802ed4047cf6ffedcd4a40818"],
      ["counter-mint-unshielded", 254, "62eb5ec099a26ae0e9084b77b22d832eae4dd10c18f314b8154095496656cffb", "c570f6400d6799fe4934ac70b931430e68f255d4220a922954e7b4c4cff12d70"],
    ]);
    for (const fixture of fixtures) {
      expect(fixture.block.protocolVersion).toBe(2_000_000);
      expect(fixture.transaction.protocolVersion).toBe(2_000_000);
      expect(fixture.transaction.raw.length).toBeGreaterThan(10_000);
      for (const event of fixture.transaction.zswapLedgerEvents) {
        expect(event.protocolVersion).toBe(2_000_000);
        expect(event.raw.startsWith("6d69646e696768743a6576656e745b7631345d3a")).toBeTrue();
      }
    }
  });

  test("ledger-v9 decodes every raw zswap event and both funding nullifiers", () => {
    const events = fixtures.flatMap((fixture) => fixture.transaction.zswapLedgerEvents);
    expect(events).toHaveLength(7);
    for (const event of events) {
      expect(decodeZswapEvent(event.raw)).toEqual(event.expected);
    }
    expect(
      events.map((event) => event.expected).filter((event) => event.kind === "nullifier"),
    ).toEqual([
      {
        kind: "nullifier",
        nullifier: "f10812363f45b4e69972d2f01fca22af4f15fa272e8bc6923d98a598f7046944",
        txHash: "490def5ca76143ef2c67af5665de25fa8eaeb76e98c6e2ab35b90441f0fe6fbc",
        logicalSegment: 0,
      },
      {
        kind: "nullifier",
        nullifier: "279a3ca0245affac570af313472a0a6efa4874760378f58375559aafa821ba00",
        txHash: "2f29a5919f8b805251165889eb25f0ae4d356344e9468f08cff7316c382cb311",
        logicalSegment: 0,
      },
    ]);
  });

  test("fetcher emits all decoded nullifier and commitment primitives", () => {
    const outputs = fixtures.flatMap((fixture) =>
      fetcher.fetchZswapEvents(
        fixture.block.height,
        entry("Midnight:NullifierAndCommitment", "zswap", { capture: "both" }),
        blockOf(fixture),
      )
    );
    expect(outputs).toHaveLength(7);
    expect(outputs.map((output: any) => output.output.payload)).toEqual(
      fixtures.flatMap((fixture) =>
        fixture.transaction.zswapLedgerEvents.map((event) => ({
          ...event.expected,
          eventId: event.id,
        }))
      ),
    );
  });

  test("fetcher preserves unshielded spends and creates", () => {
    const spends = fixtures.flatMap((fixture) =>
      fetcher.fetchUnshieldedSpends(
        fixture.block.height,
        entry("Midnight:UnshieldedSpend", "spends"),
        blockOf(fixture),
      )
    );
    const creates = fixtures.flatMap((fixture) =>
      fetcher.fetchUnshieldedCreates(
        fixture.block.height,
        entry("Midnight:UnshieldedCreate", "creates"),
        blockOf(fixture),
      )
    );

    expect(spends.map((output: any) => [
      output.syncProtocol.transactionHash,
      output.output.payload.value,
    ])).toEqual([
      ["490def5ca76143ef2c67af5665de25fa8eaeb76e98c6e2ab35b90441f0fe6fbc", "50000000000000"],
      ["2f29a5919f8b805251165889eb25f0ae4d356344e9468f08cff7316c382cb311", "10000000000000"],
    ]);
    expect(creates.map((output: any) => [
      output.syncProtocol.transactionHash,
      output.output.payload.value,
      output.output.payload.tokenType,
    ])).toEqual([
      ["490def5ca76143ef2c67af5665de25fa8eaeb76e98c6e2ab35b90441f0fe6fbc", "10000000000000", "0".repeat(64)],
      ["490def5ca76143ef2c67af5665de25fa8eaeb76e98c6e2ab35b90441f0fe6fbc", "40000000000000", "0".repeat(64)],
      ["2f29a5919f8b805251165889eb25f0ae4d356344e9468f08cff7316c382cb311", "1000000", "0".repeat(64)],
      ["2f29a5919f8b805251165889eb25f0ae4d356344e9468f08cff7316c382cb311", "9999999000000", "0".repeat(64)],
      ["c570f6400d6799fe4934ac70b931430e68f255d4220a922954e7b4c4cff12d70", "1000000", "ca03317e975b4148b7f6f4513d051f40d9d589f123e9dee3cc3e22bf69410357"],
    ]);
  });

  test("fetcher emits each indexed zswap root", () => {
    const outputs = fixtures.flatMap((fixture) =>
      fetcher.fetchZswapRoots(
        fixture.block.height,
        entry("Midnight:ZswapRoot", "root"),
        blockOf(fixture),
      )
    );
    expect(outputs.map((output: any) => output.output.payload.root)).toEqual([
      "73f6f9984bd127b16af3dca1ffda8f7a7689d846b246c607748fb74bc0b7337a22",
      "7339f5435fa37476c54e3095c6cefaa7e3ad8d60bb42ec9367a6d7d73ee2a7940f",
      "739e04ceb9281e1c1802460e2bf1226b023763fa7fc35495715fea8a05e526db45",
      "739e04ceb9281e1c1802460e2bf1226b023763fa7fc35495715fea8a05e526db45",
      "7342acc92554fe542e87d2281d24741f2a58f644db807dd50fba1a1b4f3ef33e70",
      "7342acc92554fe542e87d2281d24741f2a58f644db807dd50fba1a1b4f3ef33e70",
    ]);
  });

  test("ledger-v9 and fetcher decode the real shielded and unshielded mints", () => {
    for (const fixture of fixtures) {
      expect(
        decodeTokenMints(fixture.transaction.raw, fixture.transaction.transactionResult),
      ).toEqual(fixture.expectedTokenMints);
    }

    const outputs = fixtures.flatMap((fixture) =>
      fetcher.fetchTokenMints(
        fixture.block.height,
        entry("Midnight:TokenMint", "mints"),
        blockOf(fixture),
      )
    );
    expect(outputs.map((output: any) => output.output.payload)).toEqual([
      {
        contractAddress: "3f9b35fec2b6f7a069ee41999217ef90fda0ecbcb05d054549242650cbce1a63",
        domainSep: "d4".repeat(32),
        rawTokenType: "6bcabd711a426fb3d9d09be6ad2846ad8099ca63623d97e32a5dfc043f8887ff",
        kind: "shielded",
        amount: "1000000",
        entryPoint: "mint_shielded",
        txHash: "16005a2328950dd914bd2ef2c10838cd033f9ff802ed4047cf6ffedcd4a40818",
      },
      {
        contractAddress: "3f9b35fec2b6f7a069ee41999217ef90fda0ecbcb05d054549242650cbce1a63",
        domainSep: "e5".repeat(32),
        rawTokenType: "ca03317e975b4148b7f6f4513d051f40d9d589f123e9dee3cc3e22bf69410357",
        kind: "unshielded",
        amount: "1000000",
        entryPoint: "mint_unshielded",
        txHash: "c570f6400d6799fe4934ac70b931430e68f255d4220a922954e7b4c4cff12d70",
      },
    ]);
  });
});
