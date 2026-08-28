import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
  type HistoricalSecurityNamespace,
  type MainSyncProtocolConfig,
  toSyncProtocolWithNetwork,
} from "../src/mod.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;

type TestProtocolWithoutPolling = {
  name: "test-main";
  type: ConfigSyncProtocolType.TEST_MAIN;
  startBlockHeight: 1;
};
type _UnrelatedPollingStaysRequired = Expect<
  Equal<
    TestProtocolWithoutPolling extends MainSyncProtocolConfig<false> ? true
      : false,
    false
  >
>;

const canonical = new ConfigBuilder()
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
          startBlockHeight: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (protocols) => protocols.midnight,
      () => ({
        name: "round",
        type: "Midnight:Generic",
        startBlockHeight: 1,
      }),
    )
  )
  .build();

type NetworkKeys = keyof typeof canonical.allNetworks.networks;
type _NetworkKeysStayLiteral = Expect<
  Equal<NetworkKeys, "ntp" | "midnight">
>;

const ntpName: "ntp" = canonical.allNetworks.networks.ntp.name;
const midnightName: "midnight" =
  canonical.allNetworks.networks.midnight.name;
const ntpBlockTime: 1_000 = canonical.allNetworks.networks.ntp.blockTimeMS;
const ntpPolling: 1_000 =
  canonical.syncProtocols.main.syncProtocol.pollingInterval;
const midnightPolling: 6_000 =
  canonical.syncProtocols.parallel.midnight.syncProtocol.pollingInterval;
const midnightIndexer: string =
  canonical.syncProtocols.parallel.midnight.syncProtocol.indexer;
const noNamespace: undefined = canonical.securityNamespace;
const emptyDeployments: Record<string, never> = canonical.deployedAddresses;
const syncInfo = toSyncProtocolWithNetwork(canonical);

void ntpName;
void midnightName;
void ntpBlockTime;
void ntpPolling;
void midnightPolling;
void midnightIndexer;
void noNamespace;
void emptyDeployments;
void syncInfo;

new ConfigBuilder().buildNetworks((builder) =>
  // @ts-expect-error Midnight always requires an explicit networkId.
  builder.addNetwork({ type: ConfigNetworkType.MIDNIGHT })
);

new ConfigBuilder()
  .setNamespace((builder) => builder.setSecurityNamespace("legacy-explicit"))
  .buildNetworks((builder) =>
    builder.addNetwork({
      name: "clock",
      type: ConfigNetworkType.NTP,
      startTime: 0,
      blockTimeMS: 2_000,
    })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder.addMain(
      (networks) => networks.clock,
      () => ({
        name: "main",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: 1,
        pollingInterval: 2_000,
      }),
    )
  );

const historicalNamespace = {
  read: Object.assign(
    [{ block_height: 0, prefixes: ["legacy"] }],
    { block_height: 0 as const, prefixes: ["legacy"] },
  ),
  write: "current",
} satisfies HistoricalSecurityNamespace;

new ConfigBuilder()
  .setNamespace((builder) =>
    builder.setSecurityNamespace(historicalNamespace)
  )
  .buildNetworks((builder) =>
    builder.addNetwork({ type: ConfigNetworkType.NTP })
  );
