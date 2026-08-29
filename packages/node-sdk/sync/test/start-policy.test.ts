// Registry-level oracle for the protocol-owned start policies (project 00034).
//
// Covers the generic contract every definition must honour, the byte-compatible
// Cardano/TEST projections, and the exhaustiveness of `startPolicyRegistry`.
// The NTP and Midnight definitions get their own network-backed suites in
// `ntp-start-policy.test.ts` / `midnight-start-policy.test.ts`.

import { describe, expect, test } from "bun:test";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import {
  numericStartPolicy,
  startPolicyRegistry,
} from "../src/sync-protocols/start-policy.ts";

function entryFor(
  syncProtocolType: ConfigSyncProtocolType,
  syncProtocol: Record<string, unknown>,
  network: Record<string, unknown> = {},
): SyncProtocolWithNetwork {
  return {
    networkType: network["type"] ?? ConfigNetworkType.EVM,
    syncProtocolType,
    syncProtocol: { name: "protocol", ...syncProtocol },
    network,
    primitives: [],
  } as unknown as SyncProtocolWithNetwork;
}

describe("startPolicyRegistry", () => {
  test("covers every sync protocol type exactly once", () => {
    const registryKeys = Object.keys(startPolicyRegistry).sort();
    const protocolTypes = Object.values(ConfigSyncProtocolType).sort();
    expect(registryKeys).toEqual(protocolTypes);
  });

  test("every definition exposes the three protocol-owned operations", () => {
    for (const [type, definition] of Object.entries(startPolicyRegistry)) {
      expect(typeof definition.resolveLatest, type).toBe("function");
      expect(typeof definition.projectImmutable, type).toBe("function");
      expect(typeof definition.applySnapshot, type).toBe("function");
    }
  });

  test("TEST_MAIN and TEST_PARALLEL share one definition", () => {
    expect(startPolicyRegistry[ConfigSyncProtocolType.TEST_PARALLEL]).toBe(
      startPolicyRegistry[ConfigSyncProtocolType.TEST_MAIN],
    );
  });

  test("plain block-height protocols share the numeric definition", () => {
    for (
      const type of [
        ConfigSyncProtocolType.EVM_RPC_PARALLEL,
        ConfigSyncProtocolType.MINA_PARALLEL,
        ConfigSyncProtocolType.AVAIL_PARALLEL,
        ConfigSyncProtocolType.BITCOIN_RPC_PARALLEL,
        ConfigSyncProtocolType.CELESTIA_PARALLEL,
        ConfigSyncProtocolType.NEAR_RPC_PARALLEL,
        ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
      ]
    ) {
      expect(startPolicyRegistry[type], type).toBe(numericStartPolicy);
    }
  });
});

describe("numericStartPolicy", () => {
  const entry = () =>
    entryFor(ConfigSyncProtocolType.EVM_RPC_PARALLEL, { startBlockHeight: 12 });

  test('rejects "latest" — those protocols keep numeric starts (FR-005)', async () => {
    await expect(numericStartPolicy.resolveLatest(entry())).rejects.toThrow(
      /latest/i,
    );
  });

  test("projects an explicit start as a validated field plus restored provenance", () => {
    expect(
      numericStartPolicy.projectImmutable(entry(), {
        startBlockHeight: 12,
        provenance: "explicit",
      }),
    ).toEqual({
      validated: { startBlockHeight: 12 },
      restored: { startBlockHeightProvenance: "explicit" },
    });
  });

  test('projects a configured "latest" start as a restored field', () => {
    const configured = entryFor(ConfigSyncProtocolType.EVM_RPC_PARALLEL, {
      startBlockHeight: "latest",
    });
    expect(
      numericStartPolicy.projectImmutable(configured, {
        startBlockHeight: 900,
        provenance: "latest",
      }),
    ).toEqual({
      validated: {},
      restored: { startBlockHeight: 900, startBlockHeightProvenance: "latest" },
    });
  });

  test("applySnapshot writes the saved numeric start back onto the config", () => {
    const target = entry();
    numericStartPolicy.applySnapshot(target, {
      startBlockHeight: 77,
      startBlockHeightProvenance: "latest",
    });
    expect(
      (target.syncProtocol as unknown as { startBlockHeight: number })
        .startBlockHeight,
    ).toBe(77);
  });

  test("applySnapshot ignores a snapshot without a start", () => {
    const target = entry();
    numericStartPolicy.applySnapshot(target, { unrelated: 1 });
    expect(
      (target.syncProtocol as unknown as { startBlockHeight: number })
        .startBlockHeight,
    ).toBe(12);
  });
});

describe("Cardano definitions keep today's projections byte-compatible", () => {
  test("CARP projects and restores startSlot only", () => {
    const definition =
      startPolicyRegistry[ConfigSyncProtocolType.CARDANO_CARP_PARALLEL];
    const entry = entryFor(
      ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
      { startSlot: 4321 },
      { type: ConfigNetworkType.CARDANO },
    );

    expect(
      definition.projectImmutable(entry, {
        startBlockHeight: 0,
        provenance: "explicit",
      }),
    ).toEqual({ validated: { startSlot: 4321 }, restored: {} });

    definition.applySnapshot(entry, { startSlot: 11 });
    expect((entry.syncProtocol as unknown as { startSlot: number }).startSlot)
      .toBe(11);
  });

  test("UTXOrpc projects and restores startChainPoint only", () => {
    const definition =
      startPolicyRegistry[ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL];
    const point = { slot: 5, hash: "0xdead" };
    const entry = entryFor(
      ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
      { startChainPoint: point },
      { type: ConfigNetworkType.CARDANO },
    );

    expect(
      definition.projectImmutable(entry, {
        startBlockHeight: 0,
        provenance: "explicit",
      }),
    ).toEqual({ validated: { startChainPoint: point }, restored: {} });

    definition.applySnapshot(entry, { startChainPoint: "origin" });
    expect(
      (entry.syncProtocol as unknown as { startChainPoint: unknown })
        .startChainPoint,
    ).toBe("origin");
  });

  test('neither Cardano definition resolves "latest"', async () => {
    for (
      const type of [
        ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
        ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
      ]
    ) {
      await expect(
        startPolicyRegistry[type].resolveLatest(
          entryFor(type, {}, { type: ConfigNetworkType.CARDANO }),
        ),
      ).rejects.toThrow(/latest/i);
    }
  });
});

describe("TEST definition", () => {
  const definition = startPolicyRegistry[ConfigSyncProtocolType.TEST_MAIN];
  const testEntry = () =>
    entryFor(
      ConfigSyncProtocolType.TEST_MAIN,
      { startBlockHeight: 3 },
      { type: ConfigNetworkType.TEST, startTime: 1_000, blockTimeMS: 10 },
    );

  test("keeps the arithmetic network fields validated alongside the start", () => {
    expect(
      definition.projectImmutable(testEntry(), {
        startBlockHeight: 3,
        provenance: "explicit",
      }),
    ).toEqual({
      validated: { startTime: 1_000, blockTimeMS: 10, startBlockHeight: 3 },
      restored: { startBlockHeightProvenance: "explicit" },
    });
  });

  test("applySnapshot restores the saved network fields (closing the override gap)", () => {
    const entry = testEntry();
    definition.applySnapshot(entry, {
      startTime: 42,
      blockTimeMS: 250,
      startBlockHeight: 9,
    });
    expect(entry.network).toMatchObject({ startTime: 42, blockTimeMS: 250 });
    expect(
      (entry.syncProtocol as unknown as { startBlockHeight: number })
        .startBlockHeight,
    ).toBe(9);
  });

  test('does not resolve "latest"', async () => {
    await expect(definition.resolveLatest(testEntry())).rejects.toThrow(
      /latest/i,
    );
  });
});
