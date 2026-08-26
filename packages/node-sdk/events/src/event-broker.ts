import { createServer, type Server, type Socket } from 'node:net';
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

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (socket.destroyed) return;
      try {
        socket.write(chunk);
      } catch { /* socket closed between check and write */ }
    },
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
        // Bun delivers binary WS frames as Buffer/Uint8Array (NOT ArrayBuffer)
        // — `binaryType: 'arraybuffer'` only affects the client-side WebSocket
        // API, not Bun.serve. If we test `instanceof ArrayBuffer` first, binary
        // frames fall through to a string path that replaces every non-UTF-8
        // byte with U+FFFD (3 bytes `EF BF BD`), corrupting MQTT packets that
        // start with 0x82 (SUBSCRIBE) etc. Check Uint8Array first.
        let data: Uint8Array;
        if (typeof message === 'string') {
          data = new TextEncoder().encode(message);
        } else if (message instanceof Uint8Array) {
          data = message;
        } else {
          data = new Uint8Array(message as ArrayBuffer);
        }
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
  private readonly tcpSockets = new Set<Socket>();
  private state: 'NEW' | 'STARTING' | 'STARTED' | 'STOPPING' | 'STOPPED' = 'NEW';
  private startPromise: Promise<void> | null = null;
  private startSettled = false;
  private shutdownPromise: Promise<void> | null = null;
  private stopRequested = false;
  private tcpListenOutcome: Promise<{ ok: true } | { ok: false; error: unknown }> | null = null;

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
    void this.start().catch((error) => {
      console.error(`MQTT server [${this.broker}] failed to start:`, error);
    });
  }

  public start(): Promise<void> {
    if (this.startPromise && !this.startSettled) return this.startPromise;
    if (this.state === 'STARTED' && this.startPromise) return this.startPromise;
    if (this.state !== 'NEW') {
      return Promise.reject(new Error(`MQTT server cannot start from state ${this.state}`));
    }
    this.state = 'STARTING';
    this.startPromise = this.startInternal().finally(() => {
      this.startSettled = true;
    });
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    const tcpPort = this.getTcpPort();
    const wsPort = this.getWsPort();

    this.tcpServer = createServer((sock) => {
      this.tcpSockets.add(sock);
      sock.once('close', () => this.tcpSockets.delete(sock));
      this.mqttServer.serve(wrapNodeSocket(sock));
    });

    this.tcpListenOutcome = new Promise((resolve) => {
      const onListening = () => {
        this.tcpServer?.removeListener('error', onError);
        resolve({ ok: true });
      };
      const onError = (error: unknown) => {
        this.tcpServer?.removeListener('listening', onListening);
        resolve({ ok: false, error });
      };
      this.tcpServer!.once('listening', onListening);
      this.tcpServer!.once('error', onError);
      try {
        this.tcpServer!.listen(tcpPort, '127.0.0.1');
      } catch (error) {
        this.tcpServer!.removeListener('listening', onListening);
        this.tcpServer!.removeListener('error', onError);
        resolve({ ok: false, error });
      }
    });

    try {
      const tcpOutcome = await this.tcpListenOutcome;
      if ('error' in tcpOutcome) throw tcpOutcome.error;
      if (this.stopRequested) throw new Error('MQTT server start cancelled by shutdown');
      console.log(`MQTT TCP Server [${this.broker}] started on port ${tcpPort}`);

      this.wsServer = createWsServer(wsPort, this.mqttServer);
      if (this.stopRequested) throw new Error('MQTT server start cancelled by shutdown');
      console.log(`MQTT WS Server [${this.broker}] started on port ${wsPort}`);
      this.state = 'STARTED';
    } catch (startError) {
      let shutdownError: unknown;
      let shutdownRejected = false;
      try {
        await this.beginShutdown();
      } catch (error) {
        shutdownRejected = true;
        shutdownError = error;
      }
      if (shutdownRejected) {
        throw new AggregateError(
          [startError, shutdownError],
          'MQTT start and partial shutdown both failed',
        );
      }
      throw startError;
    }
  }

  public stop(): void {
    void this.shutdown().catch((error) => {
      console.error(`MQTT server [${this.broker}] failed to stop:`, error);
    });
  }

  public shutdown(): Promise<void> {
    return this.beginShutdown();
  }

  private beginShutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.stopRequested = true;
    this.state = 'STOPPING';
    this.shutdownPromise = this.shutdownInternal().then(
      () => {
        this.state = 'STOPPED';
      },
      (error) => {
        this.state = 'STOPPED';
        throw error;
      },
    );
    return this.shutdownPromise;
  }

  private async shutdownInternal(): Promise<void> {
    // If TCP bind is in flight, wait for its normalized outcome. startInternal
    // never waits on this shutdown Promise, so this coordination cannot cycle.
    if (this.tcpListenOutcome) await this.tcpListenOutcome;

    const failures: unknown[] = [];
    for (const socket of this.tcpSockets) socket.destroy();
    this.tcpSockets.clear();

    if (this.tcpServer?.listening) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.tcpServer!.close((error) => error ? reject(error) : resolve());
        });
      } catch (error) {
        failures.push(error);
      }
    }

    if (this.wsServer) {
      try {
        await this.wsServer.stop(true);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple MQTT transports failed to close');
    }
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
