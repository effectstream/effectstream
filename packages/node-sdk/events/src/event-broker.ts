import { createServer, type Server } from 'node:net';
import { MqttServer, AuthenticationResult } from '@seriousme/opifex/server';
import type { Context, SockConn, Handlers } from '@seriousme/opifex/server';
import { ENV } from '@effectstream/utils/node-env';

function isLocalhost(addr: string): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('::ffff:127.');
}

function wrapNodeSocket(socket: import('node:net').Socket): SockConn {
  const readable = new ReadableStream<Uint8Array>({
    type: 'bytes',
    start(controller) {
      socket.on('data', (data: Uint8Array) => {
        controller.enqueue(data);
        if ((controller.desiredSize ?? 0) <= 0) socket.pause();
      });
      socket.on('error', (err) => controller.error(err));
      socket.on('end', () => {
        controller.close();
        controller.byobRequest?.respond(0);
      });
    },
    pull: () => { socket.resume(); },
    cancel: () => { socket.end(); },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) { socket.write(chunk); },
    close() { socket.end(); },
    abort() { socket.destroy(); },
  });

  const remoteAddr = {
    hostname: socket.remoteAddress || '',
    port: socket.remotePort || 0,
    transport: 'tcp',
  };

  return { readable, writable, close: () => { if (!socket.closed) socket.end(); }, remoteAddr };
}

type WsConnectionState = {
  controller: ReadableByteStreamController | null;
};

function createWsServer(port: number, mqttServer: MqttServer): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch(req, server) {
      const upgraded = server.upgrade(req, {
        data: { controller: null } satisfies WsConnectionState,
      });
      if (upgraded) return undefined;
      return new Response('MQTT WebSocket endpoint', { status: 200 });
    },
    websocket: {
      binaryType: 'arraybuffer',
      open(ws) {
        const state = ws.data as WsConnectionState;

        const readable = new ReadableStream<Uint8Array>({
          type: 'bytes',
          start(controller) {
            state.controller = controller;
          },
          cancel() { ws.close(); },
        });

        const writable = new WritableStream<Uint8Array>({
          write(chunk) { ws.send(chunk); },
          close() { ws.close(); },
        });

        const sockConn: SockConn = { readable, writable, close: () => ws.close() };
        mqttServer.serve(sockConn);
      },
      message(ws, message) {
        const state = ws.data as WsConnectionState;
        const data = message instanceof ArrayBuffer
          ? new Uint8Array(message)
          : new TextEncoder().encode(message as string);
        state.controller?.enqueue(data);
      },
      close(ws) {
        const state = ws.data as WsConnectionState;
        try { state.controller?.close(); } catch { /* already closed */ }
      },
    },
  });
}

export class EventBroker {
  private mqttServer: MqttServer;
  private tcpServer: Server | null = null;
  private wsServer: ReturnType<typeof Bun.serve> | null = null;

  constructor(private broker: 'effectstream-engine' | 'Batcher') {
    this.checkEnabled();

    const handlers: Handlers = {
      isAuthenticated: () => AuthenticationResult.ok,
      isAuthorizedToPublish: (ctx: Context) => {
        const addr = ctx.mqttConn.remoteAddress;
        if (isLocalhost(addr)) return true;
        console.error('Filtering MQTT publish from non-localhost:', addr);
        return false;
      },
      isAuthorizedToSubscribe: () => true,
    };

    this.mqttServer = new MqttServer({ handlers });
  }

  public createServer(): void {
    void this.start();
  }

  public async start(): Promise<void> {
    const tcpPort = this.getTcpPort();
    const wsPort = this.getWsPort();

    this.tcpServer = createServer((sock) => {
      this.mqttServer.serve(wrapNodeSocket(sock));
    });

    await new Promise<void>((resolve) => {
      this.tcpServer!.on('listening', () => resolve());
      this.tcpServer!.listen(tcpPort, '127.0.0.1');
    });
    console.log(`MQTT TCP Server [${this.broker}] started on port ${tcpPort}`);

    this.wsServer = createWsServer(wsPort, this.mqttServer);
    console.log(`MQTT WS Server [${this.broker}] started on port ${wsPort}`);
  }

  public stop(): void {
    this.tcpServer?.close();
    this.wsServer?.stop(true);
  }

  private checkEnabled(): void {
    if (!ENV.MQTT_BROKER) {
      throw new Error('Local MQTT Broker is disabled.');
    }
  }

  private getTcpPort(): number {
    switch (this.broker) {
      case 'effectstream-engine':
        return ENV.MQTT_ENGINE_BROKER_PORT;
      case 'Batcher':
        return ENV.MQTT_BATCHER_BROKER_PORT;
    }
  }

  private getWsPort(): number {
    switch (this.broker) {
      case 'effectstream-engine':
        return ENV.MQTT_ENGINE_BROKER_WS_PORT;
      case 'Batcher':
        return ENV.MQTT_BATCHER_BROKER_WS_PORT;
    }
  }
}
