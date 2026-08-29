import {
  ConfigBuilder,
} from "../src/config/builder.ts";
import type { ConfigNetworkMapping } from "../src/schema/network/all.ts";
import { ConfigNetworkType } from "../src/schema/network/types.ts";
import type { ConfigSyncProtocolMapping } from "../src/schema/sync-protocols/all.ts";
import { ConfigSyncProtocolType } from "../src/schema/sync-protocols/types.ts";
import { ConfigSyncProtocolDecoratorType } from "../src/schema/sync-protocols/decorators/types.ts";
import type { SyncProtocolWithNetwork } from "../src/schema/sync-protocols/types.ts";
import type { ValidatePostBuildSyncProtocolBuilderData } from "../src/config/parts/syncProtocols.ts";

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2) ? true
      : false
    : false;
type Assert<T extends true> = T;
type ValuesOfUnion<T> = T extends unknown ? T[keyof T] : never;

// General exported mappings must describe every schema-valid explicit value,
// while the ordinary builder assertions below retain input-sensitive literals.
const _ExportedNtpName: ConfigNetworkMapping[ConfigNetworkType.NTP]["name"] =
  "custom-ntp";
const _ExportedNtpBlockTime: ConfigNetworkMapping[ConfigNetworkType.NTP]["blockTimeMS"] =
  2_500;
const _ExportedNtpPolling: ConfigSyncProtocolMapping[ConfigSyncProtocolType.NTP_MAIN]["pollingInterval"] =
  2_222;
const _ExportedMidnightPolling: ConfigSyncProtocolMapping[ConfigSyncProtocolType.MIDNIGHT_PARALLEL]["pollingInterval"] =
  2_222;
type ExportedNtpWithNetwork = Extract<
  SyncProtocolWithNetwork,
  { syncProtocolType: ConfigSyncProtocolType.NTP_MAIN }
>;
type ExportedMidnightWithNetwork = Extract<
  SyncProtocolWithNetwork,
  { syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL }
>;
const _ExportedNtpWithNetworkPolling: ExportedNtpWithNetwork["syncProtocol"]["pollingInterval"] =
  2_222;
const _ExportedMidnightWithNetworkPolling: ExportedMidnightWithNetwork["syncProtocol"]["pollingInterval"] =
  2_222;

const minimal = new ConfigBuilder()
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
        (networks) => {
          type _NetworkKeys = Assert<
            IsExact<keyof typeof networks, "ntp" | "midnight">
          >;
          type _NtpLiteralName = Assert<
            IsExact<typeof networks.ntp.name, "ntp">
          >;
          type _MidnightLiteralName = Assert<
            IsExact<typeof networks.midnight.name, "midnight">
          >;
          return networks.ntp;
        },
        (_network, deployments) => {
          type _OmittedProtocolDeployments = Assert<
            IsExact<typeof deployments, never>
          >;
          return {
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
            startBlockHeight: 1,
          };
        },
      )
      .addParallel(
        (networks) => networks.midnight,
        (_network, deployments) => {
          type _OmittedParallelDeployments = Assert<
            IsExact<typeof deployments, never>
          >;
          return {
            name: "midnight",
            type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
            indexer: "https://indexer.example/graphql",
            startBlockHeight: 9,
          };
        },
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (protocols) => {
        type _ProtocolKeys = Assert<
          IsExact<keyof typeof protocols, "ntp" | "midnight">
        >;
        const ntp = protocols.ntp;
        const midnight = protocols.midnight;
        type _NtpProtocolName = Assert<
          IsExact<typeof ntp.syncProtocol.name, "ntp">
        >;
        type _MidnightProtocolName = Assert<
          IsExact<typeof midnight.syncProtocol.name, "midnight">
        >;
        return midnight;
      },
      (_network, deployments) => {
        type _OmittedPrimitiveDeployments = Assert<
          IsExact<typeof deployments, never>
        >;
        return {
          name: "round",
          type: "Midnight:Generic",
          startBlockHeight: 9,
        };
      },
    )
  )
  .build();

const _InferredNtpAsExported: ConfigSyncProtocolMapping[ConfigSyncProtocolType.NTP_MAIN] =
  minimal.syncProtocols.main.syncProtocol;
const _InferredMidnightAsExported: ConfigSyncProtocolMapping[ConfigSyncProtocolType.MIDNIGHT_PARALLEL] =
  minimal.syncProtocols.parallel.midnight.syncProtocol;

type _NamespaceExactlyUndefined = Assert<
  IsExact<typeof minimal.securityNamespace, undefined>
>;
type _EmptyDeploymentKeys = Assert<
  IsExact<keyof typeof minimal.deployedAddresses, never>
>;
type _FinalNtpName = Assert<
  IsExact<typeof minimal.allNetworks.networks.ntp.name, "ntp">
>;
type _FinalMidnightName = Assert<
  IsExact<typeof minimal.allNetworks.networks.midnight.name, "midnight">
>;
type _NtpBlockTimeDefault = Assert<
  IsExact<typeof minimal.allNetworks.networks.ntp.blockTimeMS, 1_000>
>;
type _NtpPollingDefault = Assert<
  IsExact<typeof minimal.syncProtocols.main.syncProtocol.pollingInterval, 1_000>
>;
type _MidnightPollingDefault = Assert<
  IsExact<
    typeof minimal.syncProtocols.parallel.midnight.syncProtocol.pollingInterval,
    6_000
  >
>;
type ConflictingPollingMain =
  & typeof minimal.syncProtocols.main.syncProtocol
  & { pollingInterval: "not-a-number" };
type _NeverProtocolMemberRejected = Assert<
  IsExact<
    ValidatePostBuildSyncProtocolBuilderData<
      typeof minimal.allNetworks.networks,
      {
        main: {
          network: "ntp";
          syncProtocol: ConflictingPollingMain;
        };
        parallel: {};
        decorators: {};
      }
    >,
    never
  >
>;
type _NeverParallelAggregateRejected = Assert<
  IsExact<
    ValidatePostBuildSyncProtocolBuilderData<
      typeof minimal.allNetworks.networks,
      {
        main: typeof minimal.syncProtocols.main;
        parallel: never;
        decorators: {};
      }
    >,
    never
  >
>;
type _NeverDecoratorAggregateRejected = Assert<
  IsExact<
    ValidatePostBuildSyncProtocolBuilderData<
      typeof minimal.allNetworks.networks,
      {
        main: typeof minimal.syncProtocols.main;
        parallel: {};
        decorators: never;
      }
    >,
    never
  >
>;

const prototypeNamed = new ConfigBuilder()
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
type _PrototypeParallelKey = Assert<
  IsExact<keyof typeof prototypeNamed.data.syncProtocols.parallel, "__proto__">
>;
type _PrototypeDecoratorKey = Assert<
  IsExact<keyof typeof prototypeNamed.data.syncProtocols.decorators, "__proto__">
>;
type _PrototypeParallelName = Assert<
  IsExact<
    typeof prototypeNamed.data.syncProtocols.parallel["__proto__"]["syncProtocol"]["name"],
    "__proto__"
  >
>;
type _PrototypeDecoratorName = Assert<
  IsExact<
    typeof prototypeNamed.data.syncProtocols.decorators["__proto__"]["name"],
    "__proto__"
  >
>;

const maybeNtpName: "maybe-ntp" | undefined = Math.random() > 0.5
  ? "maybe-ntp"
  : undefined;
const maybeNtpBlockTime: 2_500 | undefined = Math.random() > 0.5
  ? 2_500
  : undefined;
const maybeNtpPolling: 2_222 | undefined = Math.random() > 0.5
  ? 2_222
  : undefined;
const maybeNtpNetworks = new ConfigBuilder().buildNetworks((builder) =>
  builder.addNetwork({
    type: ConfigNetworkType.NTP,
    name: maybeNtpName,
    blockTimeMS: maybeNtpBlockTime,
  })
);
type MaybeNtpMap = NonNullable<
  typeof maybeNtpNetworks.data.allNetworks
>["networks"];
type MaybeNtpNetwork = ValuesOfUnion<MaybeNtpMap>;
type _MaybeNtpNameBranches = Assert<
  IsExact<MaybeNtpNetwork["name"], "ntp" | "maybe-ntp">
>;
type _MaybeNtpBlockTimeBranches = Assert<
  IsExact<MaybeNtpNetwork["blockTimeMS"], 1_000 | 2_500>
>;

const maybeNtpFullChain = maybeNtpNetworks.buildSyncProtocols((builder) =>
  builder.addMain(
    (networks) =>
      "maybe-ntp" in networks ? networks["maybe-ntp"] : networks.ntp,
    () => ({
      name: "maybe-ntp-protocol",
      type: ConfigSyncProtocolType.NTP_MAIN,
      startBlockHeight: 1,
      pollingInterval: maybeNtpPolling,
    }),
  )
);
type _MaybeNtpPollingBranches = Assert<
  IsExact<
    typeof maybeNtpFullChain.data.syncProtocols.main.syncProtocol.pollingInterval,
    1_000 | 2_222
  >
>;

const optionalNtpInput: {
  readonly type: ConfigNetworkType.NTP;
  readonly name?: "optional-ntp";
  readonly blockTimeMS?: 2_750;
} = { type: ConfigNetworkType.NTP };
const optionalNtpNetworks = new ConfigBuilder().buildNetworks((builder) =>
  builder.addNetwork(optionalNtpInput)
);
type OptionalNtpNetwork = ValuesOfUnion<
  NonNullable<typeof optionalNtpNetworks.data.allNetworks>["networks"]
>;
type _OptionalNtpNameBranches = Assert<
  IsExact<OptionalNtpNetwork["name"], "ntp" | "optional-ntp">
>;
type _OptionalNtpBlockTimeBranches = Assert<
  IsExact<OptionalNtpNetwork["blockTimeMS"], 1_000 | 2_750>
>;

const maybeMidnightPolling: 3_333 | undefined = Math.random() > 0.5
  ? 3_333
  : undefined;
const maybeMidnightProtocol = new ConfigBuilder()
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
          name: "midnight-maybe",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          indexer: "https://indexer.example/graphql",
          startBlockHeight: 9,
          pollingInterval: maybeMidnightPolling,
        }),
      )
  );
type _MaybeMidnightPollingBranches = Assert<
  IsExact<
    typeof maybeMidnightProtocol.data.syncProtocols.parallel["midnight-maybe"]["syncProtocol"]["pollingInterval"],
    6_000 | 3_333
  >
>;

const explicitEmpty = new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder.addMain(
      (networks) => networks.ntp,
      (_network, deployments) => {
        type _ExplicitEmptyProtocolDeployments = Assert<
          IsExact<typeof deployments, never>
        >;
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
        type _ExplicitEmptyPrimitiveDeployments = Assert<
          IsExact<typeof deployments, never>
        >;
        return {
          name: "clock",
          type: "NTP:Clock",
          startBlockHeight: 1,
        };
      },
    )
  )
  .build();

type _ExplicitEmptyDeploymentKeys = Assert<
  IsExact<keyof typeof explicitEmpty.deployedAddresses, never>
>;

const nonempty = new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  .buildDeployments((builder) =>
    builder.addDeployment(
      (networks) => networks.ntp,
      () => ({ clock: "0xclock" }),
    )
  )
  .buildSyncProtocols((builder) =>
    builder.addMain(
      (networks) => networks.ntp,
      (_network, deployments) => {
        type _ExactProtocolDeployments = Assert<
          IsExact<typeof deployments, { readonly clock: "0xclock" }>
        >;
        return {
          name: "ntp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: deployments.clock === "0xclock" ? 1 : 0,
        };
      },
    )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (protocols) => protocols.ntp,
      (_network, deployments) => {
        type _ExactPrimitiveDeployments = Assert<
          IsExact<typeof deployments, { readonly clock: "0xclock" }>
        >;
        return {
          name: "clock",
          type: "NTP:Clock",
          startBlockHeight: deployments.clock === "0xclock" ? 1 : 0,
        };
      },
    )
  )
  .build();

type _ExactFinalDeployments = Assert<
  IsExact<
    typeof nonempty.deployedAddresses.ntp,
    { readonly clock: "0xclock" }
  >
>;

const explicitLegacy = new ConfigBuilder()
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
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder.addMain(
      (networks) => networks["legacy-clock"],
      () => ({
        name: "legacy-ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
        pollingInterval: 2_222,
      }),
    )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (protocols) => protocols["legacy-ntp"],
      () => ({
        name: "legacy",
        type: "NTP:Clock",
        startBlockHeight: 1,
      }),
    )
  )
  .build();

type _ExplicitNamespace = Assert<
  IsExact<typeof explicitLegacy.securityNamespace, "legacy-app">
>;

new ConfigBuilder().buildNetworks((builder) =>
  // @ts-expect-error Midnight networkId remains required.
  builder.addNetwork({ type: ConfigNetworkType.MIDNIGHT })
);

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
    // @ts-expect-error the invalid fluent result is rejected at the top boundary.
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
        // @ts-expect-error Midnight indexer remains required.
        () => ({
          name: "midnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 9,
        }),
      )
  );

const conditionalMainNetwork = Math.random() > 0.5
  ? {
    name: "conditional-main",
    type: ConfigNetworkType.NTP,
    startTime: 0,
    blockTimeMS: 10,
  } as const
  : {
    name: "conditional-main",
    type: ConfigNetworkType.TEST,
    startTime: 0,
    blockTimeMS: 10,
  } as const;
new ConfigBuilder()
  .buildNetworks((builder) => builder.addNetwork(conditionalMainNetwork))
  .buildSyncProtocols((builder) =>
    // @ts-expect-error NTP-only main is invalid for the possible TEST branch.
    builder.addMain(
      (networks) => networks["conditional-main"],
      () => ({
        name: "conditional-main",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    )
  );

const conditionalParallelNetwork = Math.random() > 0.5
  ? {
    name: "conditional-parallel",
    type: ConfigNetworkType.NTP,
    startTime: 0,
    blockTimeMS: 10,
  } as const
  : {
    name: "conditional-parallel",
    type: ConfigNetworkType.TEST,
    startTime: 0,
    blockTimeMS: 10,
  } as const;
new ConfigBuilder()
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        type: ConfigNetworkType.NTP,
        name: "parallel-clock",
        startTime: 0,
        blockTimeMS: 10,
      })
      .addNetwork(conditionalParallelNetwork)
  )
  .buildSyncProtocols((builder) =>
    // @ts-expect-error TEST-only parallel is invalid for the possible NTP branch.
    builder
      .addMain(
        (networks) => networks["parallel-clock"],
        () => ({
          name: "parallel-clock",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: 1,
        }),
      )
      .addParallel(
        (networks) => networks["conditional-parallel"],
        () => ({
          name: "conditional-parallel",
          type: ConfigSyncProtocolType.TEST_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 100,
          events: [],
        }),
      )
  );

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  // @ts-expect-error conflicting Object.assign network overlays are invalid.
  .buildSyncProtocols((builder) => {
    const valid = builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    ).build();
    return {
      build: () => ({
        ...valid,
        main: Object.assign({}, valid.main, { network: "assign-ghost" }),
      }),
    };
  });

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder
      .addNetwork({ type: ConfigNetworkType.NTP })
      .addNetwork({
        name: "assign-test",
        type: ConfigNetworkType.TEST,
        startTime: 0,
        blockTimeMS: 10,
      })
  )
  // @ts-expect-error conflicting Object.assign parallel overlays are invalid.
  .buildSyncProtocols((builder) => {
    const valid = builder
      .addMain(
        (networks) => networks.ntp,
        () => ({
          name: "ntp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: 1,
        }),
      )
      .addParallel(
        (networks) => networks["assign-test"],
        () => ({
          name: "assign-test",
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
          "assign-test": Object.assign({}, valid.parallel["assign-test"], {
            network: "ntp",
          }),
        },
      }),
    };
  });

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  // @ts-expect-error explicit never members cannot vacuously validate.
  .buildSyncProtocols((_builder) => {
    function impossible(): never {
      throw new Error("type-only impossible value");
    }
    return {
      build: () => ({
        main: {
          network: impossible(),
          syncProtocol: impossible(),
        },
        parallel: {},
        decorators: {},
      }),
    };
  });

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  // @ts-expect-error a fabricated result cannot select an unbuilt network.
  .buildSyncProtocols((builder) => {
    const valid = builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    ).build();
    return {
      build: () => ({
        ...valid,
        main: { ...valid.main, network: "ghost" },
      }),
    };
  });

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  // @ts-expect-error supplied fields must retain their schema-defined types.
  .buildSyncProtocols((builder) => {
    const valid = builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    ).build();
    return {
      build: () => ({
        ...valid,
        main: {
          ...valid.main,
          syncProtocol: {
            ...valid.main.syncProtocol,
            pollingInterval: "bad",
          },
        },
      }),
    };
  });

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
  // @ts-expect-error the protocol discriminator must match its built network.
  .buildSyncProtocols((builder) => {
    const valid = builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    ).build();
    return {
      build: () => ({
        ...valid,
        main: { ...valid.main, network: "test" },
      }),
    };
  });

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  // @ts-expect-error a fabricated result cannot use an unknown protocol type.
  .buildSyncProtocols((builder) => {
    const valid = builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    ).build();
    return {
      build: () => ({
        ...valid,
        main: {
          ...valid.main,
          syncProtocol: { ...valid.main.syncProtocol, type: "not-real" },
        },
      }),
    };
  });

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  )
  // @ts-expect-error a fabricated result must contain every materialized field.
  .buildSyncProtocols((builder) => {
    const valid = builder.addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
      }),
    ).build();
    return {
      build: () => ({
        ...valid,
        main: {
          ...valid.main,
          syncProtocol: {
            name: "ntp",
            type: ConfigSyncProtocolType.NTP_MAIN,
          },
        },
      }),
    };
  });

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
      // @ts-expect-error polling remains required for unrelated TEST protocols.
      () => ({
        name: "test",
        type: ConfigSyncProtocolType.TEST_MAIN,
        startBlockHeight: 1,
      }),
    )
  );

new ConfigBuilder()
  .buildNetworks((builder) =>
    builder
      .addNetwork({ type: ConfigNetworkType.NTP })
      .addNetwork({
        name: "evm",
        type: ConfigNetworkType.EVM,
        chainId: 31_337,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
      })
  )
  .buildSyncProtocols((builder) =>
    // @ts-expect-error the invalid fluent result is rejected at the top boundary.
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
        (networks) => networks.evm,
        // @ts-expect-error polling remains required for unrelated EVM protocols.
        () => ({
          name: "evm",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          startBlockHeight: 1,
          chainUri: "http://127.0.0.1:8545",
          confirmationDepth: 1,
        }),
      )
  );

void minimal;
void explicitEmpty;
void nonempty;
void explicitLegacy;
void maybeNtpFullChain;
void optionalNtpNetworks;
void maybeMidnightProtocol;
