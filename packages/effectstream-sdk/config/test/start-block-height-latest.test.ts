// Schema oracle for project 00034 (spec FR-005 / FR-007).
//
// `"latest"` must reach exactly two protocol schemas — NTP main and Midnight
// parallel — and no other. A primitive must be able to omit `startBlockHeight`
// so it can inherit its owning protocol's committed numeric start.
//
// The compile-time half of this oracle (builder input accepts `"latest"`, the
// runtime-facing `SyncProtocolWithNetwork` member stays numeric) lives in
// `builder-semantics.typecheck.ts`, which `bun run typecheck` enforces.

import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "../src/mod.ts";
import {
  mainSyncProtocolTypes,
  parallelSyncProtocolTypes,
} from "../src/schema/sync-protocols/all.ts";

const LATEST_PROTOCOLS: ConfigSyncProtocolType[] = [
  ConfigSyncProtocolType.NTP_MAIN,
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
];

const allSchemas = {
  ...mainSyncProtocolTypes,
  ...parallelSyncProtocolTypes,
} as Record<string, { config: { required: { properties: Record<string, TSchema> } } }>;

function startSchemaFor(type: string): TSchema | undefined {
  return allSchemas[type]?.config.required.properties["startBlockHeight"];
}

describe('"latest" reaches exactly the NTP main and Midnight parallel schemas', () => {
  test.each(LATEST_PROTOCOLS)('%s accepts "latest"', (type) => {
    const schema = startSchemaFor(type);
    expect(schema, `${type} must declare startBlockHeight`).toBeDefined();
    expect(Value.Check(schema!, "latest")).toBe(true);
  });

  test.each(LATEST_PROTOCOLS)("%s still accepts a plain number", (type) => {
    expect(Value.Check(startSchemaFor(type)!, 42)).toBe(true);
  });

  test('every other protocol keeps a numeric-only start', () => {
    const leaked: string[] = [];
    for (const type of Object.keys(allSchemas)) {
      if (LATEST_PROTOCOLS.includes(type as ConfigSyncProtocolType)) continue;
      const schema = startSchemaFor(type);
      // Cardano protocols start from a slot / chain point and declare no
      // startBlockHeight at all — they cannot leak the sentinel either.
      if (schema === undefined) continue;
      if (Value.Check(schema, "latest")) leaked.push(type);
      expect(Value.Check(schema, 7), type).toBe(true);
    }
    expect(leaked).toEqual([]);
  });

  test("the shared numeric start schema is untouched for slot/chain-point protocols", () => {
    expect(
      startSchemaFor(ConfigSyncProtocolType.CARDANO_CARP_PARALLEL),
    ).toBeUndefined();
    expect(
      startSchemaFor(ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL),
    ).toBeUndefined();
  });
});

describe("composed protocol schemas validate a latest start end to end", () => {
  test("NTP main", () => {
    const schema = mainSyncProtocolTypes[ConfigSyncProtocolType.NTP_MAIN]
      .allProperties(true);
    expect(Value.Check(schema, {
      name: "ntp",
      type: ConfigSyncProtocolType.NTP_MAIN,
      startBlockHeight: "latest",
      stopBlockHeight: null,
      pollingInterval: 1_000,
      requestTimeoutMs: 15_000,
      stepSize: 1_000,
      maxBufferedPages: 10,
    })).toBe(true);
  });

  test("Midnight parallel", () => {
    const schema =
      parallelSyncProtocolTypes[ConfigSyncProtocolType.MIDNIGHT_PARALLEL]
        .allProperties(true);
    expect(Value.Check(schema, {
      name: "midnight",
      type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      indexer: "https://indexer.example/graphql",
      startBlockHeight: "latest",
      stopBlockHeight: null,
      pollingInterval: 6_000,
      requestTimeoutMs: 15_000,
      stepSize: 10,
      paginationLimit: 50,
      confirmationDepth: 3,
      delayMs: 20_000,
      maxBufferedPages: 10,
    })).toBe(true);
  });
});

describe("the builder carries a latest start through materialization", () => {
  test('"latest" survives untouched — the runtime resolves it, not the builder', () => {
    const built = new ConfigBuilder()
      .buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP })
          .addNetwork({
            type: ConfigNetworkType.MIDNIGHT,
            networkId: "stagenet",
          })
      )
      .buildSyncProtocols((builder) =>
        builder
          .addMain(
            (networks) => networks.ntp,
            () => ({
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: "latest",
            }),
          )
          .addParallel(
            (networks) => networks.midnight,
            () => ({
              name: "midnight",
              type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
              indexer: "https://indexer.example/graphql",
              startBlockHeight: "latest",
            }),
          )
      )
      .build();

    expect(built.syncProtocols.main.syncProtocol.startBlockHeight).toBe("latest");
    expect(
      built.syncProtocols.parallel.midnight.syncProtocol.startBlockHeight,
    ).toBe("latest");
  });
});

describe("primitive start inheritance (FR-007)", () => {
  const buildWithPrimitive = (
    primitive: Record<string, unknown>,
  ) =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP })
          .addNetwork({
            type: ConfigNetworkType.MIDNIGHT,
            networkId: "stagenet",
          })
      )
      .buildSyncProtocols((builder) =>
        builder
          .addMain(
            (networks) => networks.ntp,
            () => ({
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: "latest",
            }),
          )
          .addParallel(
            (networks) => networks.midnight,
            () => ({
              name: "midnight",
              type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
              indexer: "https://indexer.example/graphql",
              startBlockHeight: "latest",
            }),
          )
      )
      .buildPrimitives((builder) =>
        builder.addPrimitive(
          (protocols) => protocols.midnight,
          () => primitive as { name: string; type: string },
        )
      )
      .build();

  test("a primitive may omit its start height entirely", () => {
    const built = buildWithPrimitive({
      name: "round",
      type: "Midnight:Generic",
      contractAddress: `0x${"a".repeat(64)}`,
    });
    const primitive = built.primitives["round"]!.primitive as Record<
      string,
      unknown
    >;
    expect("startBlockHeight" in primitive).toBe(false);
  });

  test("an explicit primitive start is preserved verbatim", () => {
    const built = buildWithPrimitive({
      name: "round",
      type: "Midnight:Generic",
      contractAddress: `0x${"a".repeat(64)}`,
      startBlockHeight: 17,
    });
    const primitive = built.primitives["round"]!.primitive as Record<
      string,
      unknown
    >;
    expect(primitive["startBlockHeight"]).toBe(17);
  });
});
