import { init, start } from "@paima/runtime";
import { main, suspend } from "effection";
import { localhostConfig } from "@example/data-types";
import { withPaimaStaticConfig } from "@paima/config";

main(function* () {
  yield* init();
  console.log("starting node");

  yield* withPaimaStaticConfig(localhostConfig, function* () {
    yield* start(
      [
        // TODO: clean up this code so it's more readable
        {
          networkType: localhostConfig.allNetworks
            .networks[localhostConfig.syncProtocols.main.network].type,
          syncProtocolType:
            localhostConfig.syncProtocols.main.syncProtocol.type,
          syncProtocol: localhostConfig.syncProtocols.main.syncProtocol,
          network: localhostConfig.allNetworks
            .networks[localhostConfig.syncProtocols.main.network],
        },
        ...Object.values(localhostConfig.syncProtocols.parallel).map((
          protocol,
        ) => ({
          networkType: localhostConfig.allNetworks
            .networks[localhostConfig.syncProtocols.main.network].type,
          syncProtocolType: protocol.syncProtocol.type,
          syncProtocol: protocol.syncProtocol,
          network: localhostConfig.allNetworks.networks[protocol.network],
        })),
        // TODO: decorator funnels
      ],
    );
  });

  yield* suspend();
});
