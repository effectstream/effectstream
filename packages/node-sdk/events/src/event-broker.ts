import Aedes from 'aedes';
import type { Server } from 'aedes-server-factory';
import { createServer } from "aedes-server-factory";
import ip from "ip";
import { ENV } from "@effectstream/utils/node-env";

const localhostIPv4Range = ip.cidrSubnet('127.0.0.0/8');
const localhostIPv6Range = ip.cidrSubnet('::1/128');
const ipv4MappedIPv6LocalhostRange = ip.cidrSubnet('::ffff:127.0.0.0/104');

function isLocalhost(ipAddress: string | undefined): boolean {
  // note: this only detects simple cases (ex: you're not mapping different hostnames to localhost)
  if (!ipAddress) return false;
  try {
    const isV4 = ip.isV4Format(ipAddress);
    if (isV4 && localhostIPv4Range.contains(ipAddress)) return true;
    // NOTE v4 addresses like 192.168.1.100 are detected as an IPV6 address 
    //     and the *.contains(ipAddress) checks give false positives.
    const isV6 = ip.isV6Format(ipAddress);
    if (!isV4 && isV6 && localhostIPv6Range.contains(ipAddress)) return true;
    if (!isV4 && isV6 && ipv4MappedIPv6LocalhostRange.contains(ipAddress)) return true;
  } catch {
    /* ignore - format errors throw if invalid IP */
  }
  return false;
}

/*
 * This class implements a local MQTT Broker.
 */
export class EventBroker {
  constructor(private broker: 'effectstream-engine' | 'Batcher') {}
  private static aedes: Aedes.default | null = null;
  private static server: Server | null = null;
  /*
   * Get & Init Server Singleton
   */
  public createServer(): Server {
    this.checkEnabled();
    if (EventBroker.server) return EventBroker.server;

    EventBroker.aedes = Aedes.createBroker();
    EventBroker.aedes.authorizePublish = (
      client,
      packet,
      callback
    ): void => {
      // We need to allow only localhost to publish.
      
      // NOTE: Using deno `client?.req?.socket?.remoteAddress` is undefined.
      //       This was defined correctly when using node.js runtime.
      // 
      // This is a workaround for the following issue:
      // https://github.com/denoland/deno/issues/30707
      //
      // In https://github.com/denoland/deno/pull/20120 these new fields were added:
      // Symbol(kHandle) and Symbol(kStreamBaseField).
      //
      // client.req.socket[Symbol(kHandle)][Symbol(kStreamBaseField)] = { 
      //   remoteAddr: { hostname: '127.0.0.1' },
      //   localAddr: { hostname: '127.0.0.1' },
      // }
      // This remoteAddr is correctly defined.
      //
      let remoteAddr: string | undefined;
      let symbolKStreamBaseField: symbol | undefined;
      const symbolKHandle = Object.getOwnPropertySymbols(
        client?.req?.socket ?? {}
      ).find((symbol) => symbol.toString() === 'Symbol(kHandle)');

      if (symbolKHandle) {
        symbolKStreamBaseField = Object.getOwnPropertySymbols(
          (client?.req?.socket as any)[symbolKHandle]
        ).find((symbol) => symbol.toString() === 'Symbol(kStreamBaseField)');
      }

      if (symbolKStreamBaseField) {
        remoteAddr = (
          (client?.req?.socket as any)[symbolKHandle as any][
            symbolKStreamBaseField as any
          ].remoteAddr as any
        ).hostname;
      }

      /**
       * to avoid players injecting commands into the Paima Engine node
       * ex: publishing node/block/200 to try and make the node think block 200 got created
       * we only allow receiving messages that come from localhost
       *
       * recall: Paima Engine node is just one client connecting to this broker
       * note: there is no good way to different other localhost process from the Paima Engine node
       *       as they are all just localhost processes connecting to this broker
       *       so this localhost check could be stricter, but this should be sufficient
       */
      if (isLocalhost(remoteAddr)) {
        return callback(null);
      }

      // for some reason, mqtt-cli requires this topic
      // https://github.com/Anasnew99/mqtt-cli/blob/29ba08e66da397bdab16723c93b59ecb51d2da3e/src/index.ts#L158
      if (packet.topic === '/ping_req_sys') {
        return callback(null);
      }

      console.error('Filtering message from non-localhost');
      callback(new Error('Messages must come from localhost'));
    };

    EventBroker.server = createServer(EventBroker.aedes, {
      ws: true,
    });

    // WEBSOCKET PROTOCOL SERVER
    EventBroker.server.listen(this.getPort(), () =>
      console.log("MQTT-WS Server Started at PORT " + this.getPort())
    );
    return EventBroker.server;
  }

  private checkEnabled(): void {
    if (!ENV.MQTT_BROKER) {
      throw new Error('Local MQTT Broker is disabled.');
    }
  }

  private getPort(): number {
    switch (this.broker) {
      // TODO: use env vars without duplicating default here
    case 'effectstream-engine': {
        return ENV.MQTT_ENGINE_BROKER_PORT;
      }
      case 'Batcher': {
        return ENV.MQTT_BATCHER_BROKER_PORT;
      }
    }
    throw new Error('Unknown engine');
  }
}
