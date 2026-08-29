import { expect, test } from "bun:test";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolDecoratorType,
  ConfigSyncProtocolType,
} from "../src/mod.ts";

const primitiveConfig = (name = "clock-event") => ({
  name,
  type: "TEST:Event",
  startBlockHeight: 1,
});

test("minimum NTP input materializes literal defaults and samples Date.now once at addNetwork", () => {
  const originalNow = Date.now;
  let calls = 0;
  Date.now = () => {
    calls += 1;
    return 1_725_000_123_456;
  };

  try {
    const afterNetworks = new ConfigBuilder().buildNetworks((builder) =>
      builder.addNetwork({ type: ConfigNetworkType.NTP })
    );

    expect(calls).toBe(1);
    expect(afterNetworks.data.allNetworks?.networks.ntp).toEqual({
      type: ConfigNetworkType.NTP,
      name: "ntp",
      startTime: 1_725_000_123_456,
      blockTimeMS: 1_000,
    });
    expect("servers" in afterNetworks.data.allNetworks!.networks.ntp).toBe(
      false,
    );

    const built = afterNetworks
      .buildSyncProtocols((builder) =>
        builder.addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
      )
      .buildPrimitives((builder) =>
        builder.addPrimitive(
          (protocols) => protocols.ntp,
          () => primitiveConfig(),
        )
      )
      .build();

    expect(calls).toBe(1);
    expect(built.allNetworks.networks.ntp.startTime).toBe(1_725_000_123_456);
  } finally {
    Date.now = originalNow;
  }
});

test("explicit NTP values win unchanged, including zero and servers", () => {
  const servers = ["time-a.example", "time-b.example"];
  const chain = new ConfigBuilder().buildNetworks((builder) =>
    builder.addNetwork({
      type: ConfigNetworkType.NTP,
      name: "custom-clock",
      startTime: 0,
      blockTimeMS: 37,
      servers,
    })
  );

  expect(chain.data.allNetworks?.networks["custom-clock"]).toEqual({
    type: ConfigNetworkType.NTP,
    name: "custom-clock",
    startTime: 0,
    blockTimeMS: 37,
    servers,
  });
});

test("minimum Midnight input defaults only its name and adds no endpoints", () => {
  const chain = new ConfigBuilder().buildNetworks((builder) =>
    builder.addNetwork({
      type: ConfigNetworkType.MIDNIGHT,
      networkId: "stagenet",
    })
  );
  const midnight = chain.data.allNetworks?.networks.midnight;

  expect(midnight).toEqual({
    type: ConfigNetworkType.MIDNIGHT,
    name: "midnight",
    networkId: "stagenet",
  });
  for (const endpoint of ["indexer", "node", "faucet", "proofServer"]) {
    expect(endpoint in midnight!).toBe(false);
  }
});

test("duplicate unnamed NTP networks name the effective key and remedy", () => {
  const builder = new (class extends ConfigBuilder {})();
  expect(() =>
    builder.buildNetworks((networks) =>
      networks
        .addNetwork({ type: ConfigNetworkType.NTP })
        .addNetwork({ type: ConfigNetworkType.NTP })
    )
  ).toThrow(/ntp.*explicit unique name/i);
});

test("duplicate unnamed Midnight networks name the effective key and remedy", () => {
  const builder = new ConfigBuilder();
  expect(() =>
    builder.buildNetworks((networks) =>
      networks
        .addNetwork({
          type: ConfigNetworkType.MIDNIGHT,
          networkId: "stagenet",
        })
        .addNetwork({
          type: ConfigNetworkType.MIDNIGHT,
          networkId: "preview",
        })
    )
  ).toThrow(/midnight.*explicit unique name/i);
});

test("NTP and Midnight polling defaults materialize from their concrete schemas", () => {
  const chain = new ConfigBuilder()
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
            startBlockHeight: 1,
          }),
        )
        .addParallel(
          (networks) => networks.midnight,
          () => ({
            name: "midnight",
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            indexer: "https://indexer.example/graphql",
            startBlockHeight: 9,
          }),
        )
    );

  expect(
    chain.data.syncProtocols?.main.syncProtocol.pollingInterval,
  ).toBe(1_000);
  expect(
    chain.data.syncProtocols?.parallel.midnight.syncProtocol.pollingInterval,
  ).toBe(6_000);
});

test("explicit NTP and Midnight polling intervals win unchanged", () => {
  const chain = new ConfigBuilder()
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
            startBlockHeight: 1,
            pollingInterval: 321,
          }),
        )
        .addParallel(
          (networks) => networks.midnight,
          () => ({
            name: "midnight",
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            indexer: "https://indexer.example/graphql",
            startBlockHeight: 9,
            pollingInterval: 654,
          }),
        )
    );

  expect(
    chain.data.syncProtocols?.main.syncProtocol.pollingInterval,
  ).toBe(321);
  expect(
    chain.data.syncProtocols?.parallel.midnight.syncProtocol.pollingInterval,
  ).toBe(654);
});

for (const branch of ["defaulted", "defined"] as const) {
  test(`maybe-undefined NTP network inputs materialize the ${branch} branch`, () => {
    const name: "maybe-ntp" | undefined = branch === "defined"
      ? "maybe-ntp"
      : undefined;
    const blockTimeMS: 2_500 | undefined = branch === "defined"
      ? 2_500
      : undefined;
    const chain = new ConfigBuilder().buildNetworks((builder) =>
      builder.addNetwork({
        type: ConfigNetworkType.NTP,
        name,
        blockTimeMS,
      })
    );
    const effectiveName = branch === "defined" ? "maybe-ntp" : "ntp";

    expect(Object.keys(chain.data.allNetworks!.networks)).toEqual([
      effectiveName,
    ]);
    expect(chain.data.allNetworks!.networks[effectiveName]).toMatchObject({
      name: effectiveName,
      blockTimeMS: branch === "defined" ? 2_500 : 1_000,
    });
  });

  test(`maybe-undefined polling inputs materialize the ${branch} branch`, () => {
    const ntpPolling: 2_222 | undefined = branch === "defined"
      ? 2_222
      : undefined;
    const midnightPolling: 3_333 | undefined = branch === "defined"
      ? 3_333
      : undefined;
    const chain = new ConfigBuilder()
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
              name: "ntp-maybe",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 1,
              pollingInterval: ntpPolling,
            }),
          )
          .addParallel(
            (networks) => networks.midnight,
            () => ({
              name: "midnight-maybe",
              type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
              indexer: "https://indexer.example/graphql",
              startBlockHeight: 9,
              pollingInterval: midnightPolling,
            }),
          )
      );

    expect(chain.data.syncProtocols!.main.syncProtocol.pollingInterval).toBe(
      branch === "defined" ? 2_222 : 1_000,
    );
    expect(
      chain.data.syncProtocols!.parallel["midnight-maybe"].syncProtocol
        .pollingInterval,
    ).toBe(branch === "defined" ? 3_333 : 6_000);
  });
}

test("forged main and parallel callback results are rejected before entering ConfigBuilder", () => {
  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({ type: ConfigNetworkType.NTP })
      )
      .buildSyncProtocols(((builder: any) => {
        const valid = builder.addMain(
          (networks: any) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        ).build();
        return {
          build: () => ({
            ...valid,
            main: Object.assign({}, valid.main, { network: "ghost" }),
          }),
        };
      }) as any)
  ).toThrow(/supplied SyncProtocolBuilder/i);

  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({ type: ConfigNetworkType.NTP })
      )
      .buildSyncProtocols(((builder: any) => {
        const configured = builder.addMain(
          (networks: any) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        );
        Object.assign(configured.data.main, { network: "same-builder-ghost" });
        return configured;
      }) as any)
  ).toThrow(/invalid sync protocol builder result at main/i);

  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP })
          .addNetwork({
            name: "test",
            type: ConfigNetworkType.TEST,
            startTime: 0,
            blockTimeMS: 10,
          })
      )
      .buildSyncProtocols(((builder: any) => {
        const valid = builder
          .addMain(
            (networks: any) => networks.ntp,
            () => ({
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 1,
            }),
          )
          .addParallel(
            (networks: any) => networks.test,
            () => ({
              name: "test",
              type: ConfigSyncProtocolType.TEST_PARALLEL,
              startBlockHeight: 1,
              pollingInterval: 100,
              events: [],
            }),
          )
          .build();
        return {
          build: () => ({
            ...valid,
            parallel: {
              ...valid.parallel,
              test: Object.assign({}, valid.parallel.test, { network: "ntp" }),
            },
          }),
        };
      }) as any)
  ).toThrow(/supplied SyncProtocolBuilder/i);

  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder
          .addNetwork({ type: ConfigNetworkType.NTP })
          .addNetwork({
            name: "test",
            type: ConfigNetworkType.TEST,
            startTime: 0,
            blockTimeMS: 10,
          })
      )
      .buildSyncProtocols(((builder: any) => {
        const configured = builder
          .addMain(
            (networks: any) => networks.ntp,
            () => ({
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 1,
            }),
          )
          .addParallel(
            (networks: any) => networks.test,
            () => ({
              name: "test",
              type: ConfigSyncProtocolType.TEST_PARALLEL,
              startBlockHeight: 1,
              pollingInterval: 100,
              events: [],
            }),
          );
        Object.assign(configured.data.parallel.test, { network: "ntp" });
        return configured;
      }) as any)
  ).toThrow(/invalid sync protocol builder result at parallel\.test/i);

  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({ type: ConfigNetworkType.NTP })
      )
      .buildSyncProtocols((builder) => {
        const configured = builder.addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        );
        Object.assign(configured.data, { parallel: [] });
        return configured;
      })
  ).toThrow(/invalid sync protocol builder result collections/i);

  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({ type: ConfigNetworkType.NTP })
      )
      .buildSyncProtocols((builder) => {
        const configured = builder.addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        );
        Object.assign(configured.data.main!.syncProtocol, {
          pollingInterval: "not-a-number",
        });
        return configured;
      })
  ).toThrow(/invalid sync protocol builder result at main/i);
});

test("__proto__ parallel and decorator names materialize as enumerable own keys", () => {
  const chain = new ConfigBuilder()
    .buildNetworks((builder) =>
      builder
        .addNetwork({ type: ConfigNetworkType.NTP })
        .addNetwork({
          name: "test",
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 10,
        })
    )
    .buildSyncProtocols((builder) =>
      builder
        .addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
        .addParallel(
          (networks) => networks.test,
          () => ({
            name: "__proto__",
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 100,
            events: [],
          }),
        )
        .addDecorator(
          (networks) => networks.test,
          () => ({
            name: "__proto__",
            type: ConfigSyncProtocolDecoratorType.EMULATED,
            blockTimeMs: 100,
          }),
        )
    );
  const parallel = chain.data.syncProtocols!.parallel;
  const decorators = chain.data.syncProtocols!.decorators;

  expect(Object.hasOwn(parallel, "__proto__")).toBe(true);
  expect(Object.keys(parallel)).toEqual(["__proto__"]);
  expect(parallel["__proto__"].syncProtocol.name).toBe("__proto__");
  expect(Object.hasOwn(decorators, "__proto__")).toBe(true);
  expect(Object.keys(decorators)).toEqual(["__proto__"]);
  expect(decorators["__proto__"].name).toBe("__proto__");

  let selectedProtocol: unknown;
  const built = chain
    .buildPrimitives((builder) =>
      builder.addPrimitive(
        (protocols) => {
          selectedProtocol = protocols["__proto__"];
          return protocols["__proto__"];
        },
        () => primitiveConfig("prototype-key-primitive"),
      )
    )
    .build();
  expect(selectedProtocol).toBe(parallel["__proto__"]);
  expect(built.primitives["prototype-key-primitive"].syncProtocol).toBe(
    "__proto__",
  );
  expect(JSON.parse(JSON.stringify(parallel))["__proto__"].syncProtocol.name)
    .toBe("__proto__");
});

test("constructor-like parallel and decorator names remain valid own keys", () => {
  const chain = new ConfigBuilder()
    .buildNetworks((builder) =>
      builder
        .addNetwork({ type: ConfigNetworkType.NTP })
        .addNetwork({
          name: "test",
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 10,
        })
    )
    .buildSyncProtocols((builder) =>
      builder
        .addMain(
          (networks) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
        .addParallel(
          (networks) => networks.test,
          () => ({
            name: "constructor",
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 100,
            events: [],
          }),
        )
        .addDecorator(
          (networks) => networks.test,
          () => ({
            name: "toString",
            type: ConfigSyncProtocolDecoratorType.EMULATED,
            blockTimeMs: 100,
          }),
        )
    );

  expect(Object.keys(chain.data.syncProtocols!.parallel)).toEqual([
    "constructor",
  ]);
  expect(Object.keys(chain.data.syncProtocols!.decorators)).toEqual([
    "toString",
  ]);
  expect(Object.hasOwn(chain.data.syncProtocols!.parallel, "constructor")).toBe(
    true,
  );
  expect(Object.hasOwn(chain.data.syncProtocols!.decorators, "toString")).toBe(
    true,
  );
});

test("prototype-sensitive network names remain deterministically rejected", () => {
  for (const name of ["__proto__", "constructor"] as const) {
    expect(() =>
      new ConfigBuilder().buildNetworks((builder) =>
        builder.addNetwork({
          name,
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 10,
        })
      )
    ).toThrow(/explicit unique name/i);
  }
});

const buildWithInheritedStateMutation = (
  mutate: (configured: any) => void,
): void => {
  new ConfigBuilder()
    .buildNetworks((builder) =>
      builder
        .addNetwork({ type: ConfigNetworkType.NTP })
        .addNetwork({
          name: "test",
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 10,
        })
    )
    .buildSyncProtocols(((builder: any) => {
      const configured = builder
        .addMain(
          (networks: any) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
        .addParallel(
          (networks: any) => networks.test,
          () => ({
            name: "test",
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 100,
            events: [],
          }),
        )
        .addDecorator(
          (networks: any) => networks.test,
          () => ({
            name: "emulated",
            type: ConfigSyncProtocolDecoratorType.EMULATED,
            blockTimeMs: 100,
          }),
        );
      mutate(configured);
      return configured;
    }) as any);
};

const inheritedStateCases: ReadonlyArray<{
  name: string;
  mutate: (configured: any) => void;
  expected: RegExp;
}> = [
  {
    name: "inherited main.network",
    mutate: (configured) => {
      const main = configured.data.main;
      const network = main.network;
      delete main.network;
      Object.setPrototypeOf(main, { network });
    },
    expected: /invalid sync protocol builder result at main/i,
  },
  {
    name: "inherited main protocol fields",
    mutate: (configured) => {
      configured.data.main.syncProtocol = Object.create(
        configured.data.main.syncProtocol,
      );
    },
    expected: /invalid sync protocol builder result at main/i,
  },
  {
    name: "prototype-only parallel entry",
    mutate: (configured) => {
      const entry = configured.data.parallel.test;
      delete configured.data.parallel.test;
      Object.setPrototypeOf(configured.data.parallel, { test: entry });
    },
    expected: /invalid sync protocol builder result collections/i,
  },
  {
    name: "prototype-only decorator",
    mutate: (configured) => {
      const protocol = configured.data.decorators.emulated;
      delete configured.data.decorators.emulated;
      Object.setPrototypeOf(configured.data.decorators, { emulated: protocol });
    },
    expected: /invalid sync protocol builder result collections/i,
  },
  {
    name: "prototype-backed top-level result",
    mutate: (configured) => {
      Object.setPrototypeOf(configured.data, { inherited: true });
    },
    expected: /invalid sync protocol builder result/i,
  },
  {
    name: "prototype-backed networks container",
    mutate: (configured) => {
      Object.setPrototypeOf(configured.networks.networks, { inherited: true });
    },
    expected: /invalid sync protocol builder result/i,
  },
];

for (const inheritedCase of inheritedStateCases) {
  test(`${inheritedCase.name} is rejected before ConfigBuilder storage`, () => {
    expect(() => buildWithInheritedStateMutation(inheritedCase.mutate)).toThrow(
      inheritedCase.expected,
    );
  });
}

test("null-prototype sync-protocol records remain valid", () => {
  const toNullRecord = (value: Record<string, any>): Record<string, any> =>
    Object.assign(Object.create(null), value);
  const chain = new ConfigBuilder()
    .buildNetworks((builder) =>
      builder
        .addNetwork({ type: ConfigNetworkType.NTP })
        .addNetwork({
          name: "test",
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 10,
        })
    )
    .buildSyncProtocols(((builder: any) => {
      const configured = builder
        .addMain(
          (networks: any) => networks.ntp,
          () => ({
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          }),
        )
        .addParallel(
          (networks: any) => networks.test,
          () => ({
            name: "test",
            type: ConfigSyncProtocolType.TEST_PARALLEL,
            startBlockHeight: 1,
            pollingInterval: 100,
            events: [],
          }),
        )
        .addDecorator(
          (networks: any) => networks.test,
          () => ({
            name: "emulated",
            type: ConfigSyncProtocolDecoratorType.EMULATED,
            blockTimeMs: 100,
          }),
        );
      const data = configured.data;
      data.main = toNullRecord({
        network: data.main.network,
        syncProtocol: toNullRecord({ ...data.main.syncProtocol }),
      });
      const parallelEntry = data.parallel.test;
      data.parallel = toNullRecord({
        test: toNullRecord({
          network: parallelEntry.network,
          syncProtocol: toNullRecord({ ...parallelEntry.syncProtocol }),
        }),
      });
      data.decorators = toNullRecord({
        emulated: toNullRecord({ ...data.decorators.emulated }),
      });
      configured.networks.networks = toNullRecord({
        ...configured.networks.networks,
      });
      return configured;
    }) as any);

  expect(Object.getPrototypeOf(chain.data.syncProtocols!.main)).toBeNull();
  expect(Object.getPrototypeOf(chain.data.syncProtocols!.parallel)).toBeNull();
  expect(Object.getPrototypeOf(chain.data.syncProtocols!.decorators)).toBeNull();
  expect(Object.keys(chain.data.syncProtocols!.parallel)).toEqual(["test"]);
  expect(Object.keys(chain.data.syncProtocols!.decorators)).toEqual([
    "emulated",
  ]);
});

test("unrelated TEST polling remains required and is never defaulted", () => {
  const explicit = new ConfigBuilder()
    .buildNetworks((builder) =>
      builder.addNetwork({
        name: "test",
        type: ConfigNetworkType.TEST,
        startTime: 0,
        blockTimeMS: 10,
      })
    )
    .buildSyncProtocols((builder) =>
      builder.addMain(
        (networks) => networks.test,
        () => ({
          name: "test",
          type: ConfigSyncProtocolType.TEST_MAIN,
          startBlockHeight: 1,
          pollingInterval: 777,
        }),
      )
    );

  expect(explicit.data.syncProtocols?.main.syncProtocol.pollingInterval).toBe(
    777,
  );
  expect(() =>
    new ConfigBuilder()
      .buildNetworks((builder) =>
        builder.addNetwork({
          name: "test",
          type: ConfigNetworkType.TEST,
          startTime: 0,
          blockTimeMS: 10,
        })
      )
      .buildSyncProtocols((builder) =>
        builder.addMain(
          (networks) => networks.test,
          () => ({
            name: "test-no-default",
            type: ConfigSyncProtocolType.TEST_MAIN,
            startBlockHeight: 1,
          }),
        )
      )
  ).toThrow(/invalid sync protocol builder result at main/i);
});

for (const deploymentStage of ["omitted", "explicit-empty"] as const) {
  test(`${deploymentStage} deployments give equivalent callbacks and final empty state`, () => {
    let syncCallbackDeployments: unknown = Symbol("unset");
    let primitiveCallbackDeployments: unknown = Symbol("unset");

    let chain: any = new ConfigBuilder().buildNetworks((builder) =>
      builder.addNetwork({ type: ConfigNetworkType.NTP })
    );
    if (deploymentStage === "explicit-empty") {
      chain = chain.buildDeployments((builder: any) => builder);
    }

    const built = chain
      .buildSyncProtocols((builder: any) =>
        builder.addMain(
          (networks: any) => networks.ntp,
          (_network: any, deployments: unknown) => {
            syncCallbackDeployments = deployments;
            return {
              name: "ntp",
              type: ConfigSyncProtocolType.NTP_MAIN,
              startBlockHeight: 1,
            };
          },
        )
      )
      .buildPrimitives((builder: any) =>
        builder.addPrimitive(
          (protocols: any) => protocols.ntp,
          (_network: any, deployments: unknown) => {
            primitiveCallbackDeployments = deployments;
            return primitiveConfig(`${deploymentStage}-primitive`);
          },
        )
      )
      .build();

    expect(syncCallbackDeployments).toBeUndefined();
    expect(primitiveCallbackDeployments).toBeUndefined();
    expect(built.deployedAddresses).toEqual({});
  });
}

test("nonempty deployments retain exact content and identity through callbacks and final state", () => {
  let syncCallbackDeployments: unknown;
  let primitiveCallbackDeployments: unknown;

  const built = new ConfigBuilder()
    .buildNetworks((builder) =>
      builder.addNetwork({ type: ConfigNetworkType.NTP })
    )
    .buildDeployments((builder) =>
      builder.addDeployment(
        (networks) => networks.ntp,
        () => ({ clock: "0xclock", registry: "0xregistry" }),
      )
    )
    .buildSyncProtocols((builder) =>
      builder.addMain(
        (networks) => networks.ntp,
        (_network, deployments) => {
          syncCallbackDeployments = deployments;
          return {
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          };
        },
      )
    )
    .buildPrimitives((builder) =>
      builder.addPrimitive(
        (protocols) => protocols.ntp,
        (_network, deployments) => {
          primitiveCallbackDeployments = deployments;
          return primitiveConfig("nonempty-primitive");
        },
      )
    )
    .build();

  expect(syncCallbackDeployments).toEqual({
    clock: "0xclock",
    registry: "0xregistry",
  });
  expect(primitiveCallbackDeployments).toBe(syncCallbackDeployments);
  expect(built.deployedAddresses.ntp).toBe(syncCallbackDeployments);
});

test("networks can flow directly to protocols and namespace remains undefined", () => {
  const built = new ConfigBuilder()
    .buildNetworks((builder) =>
      builder.addNetwork({ type: ConfigNetworkType.NTP })
    )
    .buildSyncProtocols((builder) =>
      builder.addMain(
        (networks) => networks.ntp,
        () => ({
          name: "ntp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: 1,
        }),
      )
    )
    .buildPrimitives((builder) =>
      builder.addPrimitive(
        (protocols) => protocols.ntp,
        () => primitiveConfig("direct-primitive"),
      )
    )
    .build();

  expect(built.securityNamespace).toBeUndefined();
  expect(built.deployedAddresses).toEqual({});
  expect(built.syncProtocols.main.network).toBe("ntp");
});

test("fully explicit legacy chain preserves namespace, deployments, and values", () => {
  const built = new ConfigBuilder()
    .setNamespace((builder) => builder.setSecurityNamespace("legacy-app"))
    .buildNetworks((builder) =>
      builder.addNetwork({
        type: ConfigNetworkType.NTP,
        name: "legacy-clock",
        startTime: 0,
        blockTimeMS: 2_500,
        servers: ["legacy.example"],
      })
    )
    .buildDeployments((builder) =>
      builder.addDeployment(
        (networks) => networks["legacy-clock"],
        () => ({ clock: "0xlegacy" }),
      )
    )
    .buildSyncProtocols((builder) =>
      builder.addMain(
        (networks) => networks["legacy-clock"],
        (_network, deployments) => ({
          name: "legacy-ntp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: deployments.clock === "0xlegacy" ? 1 : 0,
          pollingInterval: 2_222,
          stepSize: 17,
        }),
      )
    )
    .buildPrimitives((builder) =>
      builder.addPrimitive(
        (protocols) => protocols["legacy-ntp"],
        (_network, deployments) =>
          primitiveConfig(deployments.clock === "0xlegacy" ? "legacy" : "bad"),
      )
    )
    .build();

  expect(built.securityNamespace).toBe("legacy-app");
  expect(built.allNetworks.networks["legacy-clock"]).toEqual({
    type: ConfigNetworkType.NTP,
    name: "legacy-clock",
    startTime: 0,
    blockTimeMS: 2_500,
    servers: ["legacy.example"],
  });
  expect(built.deployedAddresses).toEqual({
    "legacy-clock": { clock: "0xlegacy" },
  });
  expect(built.syncProtocols.main.syncProtocol).toMatchObject({
    name: "legacy-ntp",
    pollingInterval: 2_222,
    stepSize: 17,
  });
  expect(built.primitives.legacy.primitive.name).toBe("legacy");
});
