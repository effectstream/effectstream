// FR-007: a primitive that omits `startBlockHeight` inherits its owning
// protocol's committed numeric start; an explicit primitive value always wins.
//
// Inheritance is generic — it works for every protocol precisely because
// `validateAndSnapshotConfig` has already committed a numeric boundary by the
// time primitives are constructed (the startup reordering in D4).

import { describe, expect, test } from "bun:test";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { inheritPrimitiveStartHeights } from "../src/main.ts";

function protocolWith(
  startBlockHeight: number | undefined,
  primitives: Record<string, unknown>[],
): SyncProtocolWithNetwork {
  return {
    networkType: ConfigNetworkType.MIDNIGHT,
    syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    syncProtocol: {
      name: "midnight",
      type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      indexer: "https://indexer.example/graphql",
      ...(startBlockHeight === undefined ? {} : { startBlockHeight }),
    },
    network: { name: "midnight", type: ConfigNetworkType.MIDNIGHT },
    primitives: primitives.map((primitive, index) => ({
      id: `primitive-${index}`,
      syncProtocol: "midnight",
      primitive,
    })),
  } as unknown as SyncProtocolWithNetwork;
}

function startsOf(protocol: SyncProtocolWithNetwork): (number | undefined)[] {
  return (protocol.primitives as unknown as {
    primitive: { startBlockHeight?: number };
  }[]).map((entry) => entry.primitive.startBlockHeight);
}

describe("inheritPrimitiveStartHeights", () => {
  test("fills an omitted primitive start from the protocol's committed value", () => {
    const protocol = protocolWith(4_242, [
      { name: "round", type: "Midnight:Generic" },
    ]);

    inheritPrimitiveStartHeights([protocol]);

    expect(startsOf(protocol)).toEqual([4_242]);
  });

  test("an explicit primitive start always wins", () => {
    const protocol = protocolWith(4_242, [
      { name: "round", type: "Midnight:Generic", startBlockHeight: 17 },
    ]);

    inheritPrimitiveStartHeights([protocol]);

    expect(startsOf(protocol)).toEqual([17]);
  });

  test("a primitive start of 0 is explicit, not missing", () => {
    const protocol = protocolWith(4_242, [
      { name: "round", type: "Midnight:Generic", startBlockHeight: 0 },
    ]);

    inheritPrimitiveStartHeights([protocol]);

    expect(startsOf(protocol)).toEqual([0]);
  });

  test("mixed primitives inherit independently", () => {
    const protocol = protocolWith(900, [
      { name: "a", type: "Midnight:Generic" },
      { name: "b", type: "Midnight:Generic", startBlockHeight: 5 },
      { name: "c", type: "Midnight:Generic" },
    ]);

    inheritPrimitiveStartHeights([protocol]);

    expect(startsOf(protocol)).toEqual([900, 5, 900]);
  });

  test("a protocol with no numeric start leaves an explicit primitive alone", () => {
    // Cardano-style protocols start from a slot, not a block height.
    const protocol = protocolWith(undefined, [
      { name: "round", type: "Midnight:Generic", startBlockHeight: 11 },
    ]);

    inheritPrimitiveStartHeights([protocol]);

    expect(startsOf(protocol)).toEqual([11]);
  });

  test("a primitive with nothing to inherit is a clear configuration error", () => {
    const protocol = protocolWith(undefined, [
      { name: "round", type: "Midnight:Generic" },
    ]);

    expect(() => inheritPrimitiveStartHeights([protocol])).toThrow(
      /startBlockHeight[\s\S]*round/,
    );
  });
});
