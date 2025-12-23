import AedesModule, { type Client, type PublishPacket } from "aedes";
import type { Server } from "aedes-server-factory";
import { createServer } from "aedes-server-factory";
import ip from "ip";
import { Buffer } from "node:buffer";

function isLocalhost(ipAddress: string | undefined): boolean {
  if (!ipAddress) return false;
  try {
    if (ip.isV4Format(ipAddress)) {
      return ip.cidrSubnet("127.0.0.0/8").contains(ipAddress);
    }
    if (ip.isV6Format(ipAddress)) {
      const localhostRange = ip.cidrSubnet("::1/128");
      const mappedRange = ip.cidrSubnet("::ffff:127.0.0.0/104");
      return localhostRange.contains(ipAddress) || mappedRange.contains(ipAddress);
    }
  } catch {
    // ignore malformed addresses
  }
  return false;
}

function extractRemoteAddress(client: Client | null): string | undefined {
  // Deno currently hides remoteAddr behind symbols on the socket instance.
  // This mirrors the workaround we already use inside the event-broker package.
  const socket = client?.req?.socket;
  if (!socket) return undefined;
  const symbols = Object.getOwnPropertySymbols(socket);
  const handleSymbol = symbols.find((symbol) => symbol.toString() === "Symbol(kHandle)");
  if (!handleSymbol) return undefined;
  const socketHandle = (socket as any)[handleSymbol];
  const innerSymbols = Object.getOwnPropertySymbols(socketHandle ?? {});
  const streamBaseSymbol = innerSymbols.find((symbol) =>
    symbol.toString() === "Symbol(kStreamBaseField)"
  );
  if (!streamBaseSymbol) return undefined;
  const remoteAddr = socketHandle?.[streamBaseSymbol]?.remoteAddr;
  return remoteAddr?.hostname;
}

export interface BatcherMqttServerOptions {
  host: string;
  port: number;
  retainLastMessage: boolean;
}

type AedesConstructor = typeof import("aedes")["default"];
type BrokerInstance = InstanceType<AedesConstructor>;
type AedesFactory = (opts?: ConstructorParameters<AedesConstructor>[0]) => BrokerInstance;

const createAedesInstance: AedesFactory = (() => {
  const moduleWithDefault = AedesModule as unknown as {
    default?: AedesFactory;
  };
  if (typeof moduleWithDefault.default === "function") {
    return moduleWithDefault.default;
  }
  return AedesModule as unknown as AedesFactory;
})();

function stringifyPayload(payload: unknown): string {
  return JSON.stringify(
    payload,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
  );
}

export class BatcherMqttServer {
  private broker: BrokerInstance | null = null;
  private server: Server | null = null;

  constructor(private readonly options: BatcherMqttServerOptions) {}

  async start(): Promise<void> {
    if (this.server) return;

    this.broker = createAedesInstance();
    this.broker.authorizePublish = (
      client: Client | null,
      packet: PublishPacket,
      callback: (error?: Error | null) => void,
    ): void => {
      if (isLocalhost(extractRemoteAddress(client))) {
        callback(null);
        return;
      }

      console.error(
        `[MQTT] Rejected publish from non-localhost origin for topic ${packet.topic}`,
      );
      callback(new Error("MQTT publish restricted to localhost"));
    };

    this.server = createServer(this.broker, { ws: true });
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.options.port, this.options.host, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(
            `📡 Batcher MQTT broker listening on mqtt://${this.options.host}:${this.options.port}`,
          );
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (this.broker) {
      await new Promise<void>((resolve) => {
        this.broker!.close(() => {
          resolve();
        });
      });
    }
    
    this.server = null;
    this.broker = null;
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    if (!this.broker) return;
    const packet: PublishPacket = {
      cmd: "publish",
      topic,
      payload: Buffer.from(stringifyPayload(payload)),
      qos: 0,
      dup: false,
      retain: this.options.retainLastMessage,
    };
    await new Promise<void>((resolve, reject) => {
      this.broker!.publish(packet, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

