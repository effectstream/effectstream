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
        try {
          controller.enqueue(data);
          if ((controller.desiredSize ?? 0) <= 0) socket.pause();
        } catch { /* controller already closed */ }
      });
      socket.on('error', (err) => {
        try { controller.error(err); } catch { /* already closed */ }
      });
      socket.on('end', () => {
        try { controller.close(); } catch { /* already closed */ }
      });
      socket.on('close', () => {
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    pull: () => { if (!socket.destroyed) socket.resume(); },
    cancel: () => { if (!socket.destroyed) socket.end(); },
  });

  // Bun has a bug in its WritableStream→Node-Writable adapter: chunks queued
  // before close() flush AFTER the internal Node Writable is marked ended,
  // throwing ERR_STREAM_WRITE_AFTER_END from inside the adapter before our
  // user write() callback gets a chance to guard. To avoid this we never
  // explicitly end the socket via WritableStream's close/abort hooks — let
  // the peer's TCP FIN / socket-level error close it naturally. Any remaining
  // queued writes hit a still-open socket and either succeed or fail in our
  // user callback where we can swallow them.
  // TODO: revert to explicit socket.end()/destroy() once Bun fixes the
  // adapter's queue semantics around close.
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (socket.destroyed || socket.writableEnded || socket.closed) return;
      try {
        socket.write(chunk);
      } catch { /* socket closed between check and write */ }
    },
    // Intentionally empty — see comment above.
    close() { /* let the peer / close() field below tear down the socket */ },
    abort() { /* same */ },
  });

  const remoteAddr = {
    hostname: socket.remoteAddress || '',
    port: socket.remotePort || 0,
    transport: 'tcp',
  };

  return {
    readable,
    writable,
    close: () => {
      if (!socket.destroyed && !socket.writableEnded) {
        try { socket.end(); } catch { /* already ended */ }
      }
    },
    remoteAddr,
  };
}

type WsConnectionState = {
  controller: ReadableByteStreamController | null;
};

function createWsServer(port: number, mqttServer: MqttServer): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch(req, server) {
      // MQTT-over-WebSocket (RFC 6455 + MQTT 3.1.1 §6.0): the client sends
      // `Sec-WebSocket-Protocol: mqtt` (or `mqttv3.1`). RFC 6455 requires the
      // server to echo back one of the offered subprotocols, otherwise
      // compliant clients (mqtt.js, paho, etc.) abort the handshake.
      // Without this echo, browser-side MQTT subscriptions silently never
      // connect — and only TCP clients (e.g. our own Opifex TcpClient
      // backend-to-broker connection) keep working.
      const requested = req.headers.get('sec-websocket-protocol');
      const offered = requested?.split(',').map((s) => s.trim()) ?? [];
      const accepted =
        offered.find((p) => p === 'mqtt' || p === 'mqttv3.1') ?? 'mqtt';
      const upgraded = server.upgrade(req, {
        headers: { 'Sec-WebSocket-Protocol': accepted },
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
          cancel() {
            try { ws.close(); } catch { /* already closed */ }
          },
        });

        const writable = new WritableStream<Uint8Array>({
          write(chunk) {
            // Same guard as wrapNodeSocket — peer-initiated close must not
            // crash Opifex's writer.
            if (ws.readyState !== WebSocket.OPEN) return;
            try { ws.send(chunk); } catch { /* closed between check and send */ }
          },
          close() {
            try { ws.close(); } catch { /* already closed */ }
          },
        });

        const sockConn: SockConn = {
          readable,
          writable,
          close: () => {
            try { ws.close(); } catch { /* already closed */ }
          },
        };
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
