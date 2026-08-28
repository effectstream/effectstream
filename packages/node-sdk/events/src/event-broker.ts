import { createServer, type Server, type Socket } from 'node:net';
import { MqttServer, AuthenticationResult } from '@seriousme/opifex/server';
import type { Context, SockConn, Handlers } from '@seriousme/opifex/server';
import { ENV } from '@effectstream/utils/node-env';

function isLocalhost(addr: string): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('::ffff:127.');
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function wrapNodeSocket(socket: import('node:net').Socket): SockConn {
  let readableController: ReadableByteStreamController | null = null;
  const closeReadable = (error?: Error) => {
    try {
      if (error) readableController?.error(error);
      else readableController?.close();
    } catch { /* controller already closed */ }
    readableController = null;
  };
  const readable = new ReadableStream<Uint8Array>({
    type: 'bytes',
    start(controller) {
      readableController = controller as ReadableByteStreamController;
      socket.on('data', (data: Uint8Array) => {
        try {
          controller.enqueue(copyBytes(data));
          if ((controller.desiredSize ?? 0) <= 0) socket.pause();
        } catch { /* controller already closed */ }
      });
      socket.on('error', (err) => {
        try { controller.error(err); } catch { /* already closed */ }
      });
      socket.on('end', () => {
        closeReadable(new Error('TCP transport ended'));
      });
      socket.on('close', () => {
        closeReadable(new Error('TCP transport closed'));
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
    transport: 'tcp' as const,
  };

  return {
    readable,
    writable,
    close: () => {
      try { readableController?.enqueue(new Uint8Array([0xe0, 0x00])); } catch {}
      closeReadable();
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

type Outcome = { ok: true } | { ok: false; error: unknown };

type TrackedConnection = {
  sequence: number;
  transport: 'tcp' | 'ws';
  conn: SockConn;
  context?: Context;
  contextFinalization?: Promise<Outcome>;
  outcome: Promise<void>;
};

type ConnectionFailure = {
  sequence: number;
  contextFailed?: boolean;
  contextError?: unknown;
  transportFailed?: boolean;
  transportError?: unknown;
  serveFailed?: boolean;
  serveError?: unknown;
};

function createWsServer(
  port: number,
  serveConnection: (conn: SockConn) => void,
  isStopping: () => boolean,
): ReturnType<typeof Bun.serve> {
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
      open(ws) {
        const state = ws.data as WsConnectionState;

        const readable = new ReadableStream<Uint8Array>({
          type: 'bytes',
          start(controller) {
            state.controller = controller as ReadableByteStreamController;
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
            try { ws.send(copyBytes(chunk)); } catch { /* closed between check and send */ }
          },
          // Opifex closes its writer immediately before SockConn.close(). The
          // latter owns the coordinated readable wake-up and transport close.
          close() {},
        });

        const sockConn: SockConn = {
          readable,
          writable,
          close: () => {
            // Bun's byte-stream controller does not always settle a pending
            // BYOB read when it is only closed. Rejecting the read wakes the
            // Opifex serve loop after Context.close(false) has suppressed the
            // Will and cleared its keepalive timer.
            try { state.controller?.error(new Error('WebSocket transport closed')); } catch { /* already closed */ }
            state.controller = null;
            // Bun 1.3.10's Server.stop(true) does not settle if the upgraded
            // socket was manually closed first. During broker shutdown it owns
            // the force-close; outside shutdown this connection closes itself.
            if (!isStopping()) {
              try { ws.close(); } catch { /* already closed */ }
            }
          },
        };
        serveConnection(sockConn);
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
        state.controller?.enqueue(copyBytes(data));
      },
      close(ws) {
        const state = ws.data as WsConnectionState;
        try { state.controller?.error(new Error('WebSocket transport closed by peer')); } catch { /* already closed */ }
        state.controller = null;
      },
    },
  });
}

export class EventBroker {
  private mqttServer: MqttServer;
  private tcpServer: Server | null = null;
  private wsServer: ReturnType<typeof Bun.serve> | null = null;
  private readonly tcpSockets = new Set<Socket>();
  private readonly connections = new Map<SockConn, TrackedConnection>();
  private readonly connectionFailures = new Map<number, ConnectionFailure>();
  private connectionSequence = 0;
  private state: 'NEW' | 'STARTING' | 'STARTED' | 'STOPPING' | 'STOPPED' = 'NEW';
  private startPromise: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private stopRequested = false;
  private tcpListenOutcome: Promise<Outcome> | null = null;

  constructor(private broker: 'effectstream-engine' | 'Batcher') {
    this.checkEnabled();

    const handlers: Handlers = {
      isAuthenticated: (ctx: Context) => {
        this.registerContext(ctx);
        return AuthenticationResult.ok;
      },
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
    if (this.startPromise && (this.state === 'STARTING' || this.state === 'STARTED')) {
      return this.startPromise;
    }
    if (this.state !== 'NEW') {
      return Promise.reject(new Error(`MQTT server cannot start from state ${this.state}`));
    }
    this.state = 'STARTING';
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    const tcpPort = this.getTcpPort();
    const wsPort = this.getWsPort();

    this.tcpServer = createServer((sock) => {
      this.tcpSockets.add(sock);
      sock.once('close', () => this.tcpSockets.delete(sock));
      this.serveConnection(wrapNodeSocket(sock), 'tcp');
    });

    this.tcpListenOutcome = new Promise<Outcome>((resolve) => {
      let settled = false;
      const finish = (outcome: Outcome) => {
        if (settled) return;
        settled = true;
        this.tcpServer?.removeListener('listening', onListening);
        this.tcpServer?.removeListener('error', onError);
        resolve(outcome);
      };
      const onListening = () => finish({ ok: true });
      const onError = (error: unknown) => finish({ ok: false, error });
      this.tcpServer!.once('listening', onListening);
      this.tcpServer!.once('error', onError);
      try {
        this.tcpServer!.listen(tcpPort, '127.0.0.1');
      } catch (error) {
        finish({ ok: false, error });
      }
    });

    try {
      const tcpOutcome = await this.tcpListenOutcome;
      if (tcpOutcome.ok === false) throw tcpOutcome.error;
      if (this.stopRequested) throw new Error('MQTT server start cancelled by shutdown');
      console.log(`MQTT TCP Server [${this.broker}] started on port ${tcpPort}`);

      this.wsServer = createWsServer(
        wsPort,
        (conn) => this.serveConnection(conn, 'ws'),
        () => this.stopRequested,
      );
      if (this.stopRequested) throw new Error('MQTT server start cancelled by shutdown');
      console.log(`MQTT WS Server [${this.broker}] started on port ${wsPort}`);
      this.state = 'STARTED';
    } catch (startError) {
      const cleanup = await this.captureOutcome(() => this.beginShutdown());
      if (cleanup.ok === false) {
        const cleanupErrors = cleanup.error instanceof AggregateError
          ? cleanup.error.errors
          : [cleanup.error];
        throw new AggregateError(
          [startError, ...cleanupErrors],
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

  private captureOutcome(action: () => unknown): Promise<Outcome> {
    return Promise.resolve().then(action).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    );
  }

  private registerContext(context: Context): void {
    const tracked = this.connections.get(context.conn);
    if (tracked) tracked.context = context;
  }

  private finalizeContext(tracked: TrackedConnection): Promise<Outcome> {
    if (tracked.contextFinalization) return tracked.contextFinalization;
    if (!tracked.context) return Promise.resolve({ ok: true });
    tracked.contextFinalization = this.captureOutcome(
      () => tracked.context!.close(false),
    );
    return tracked.contextFinalization;
  }

  private rememberFailure(
    tracked: TrackedConnection,
    kind: 'context' | 'transport' | 'serve',
    error: unknown,
  ): void {
    const failure = this.connectionFailures.get(tracked.sequence) ?? {
      sequence: tracked.sequence,
    };
    if (kind === 'context') {
      failure.contextFailed = true;
      failure.contextError = error;
    } else if (kind === 'transport') {
      failure.transportFailed = true;
      failure.transportError = error;
    } else {
      failure.serveFailed = true;
      failure.serveError = error;
    }
    this.connectionFailures.set(tracked.sequence, failure);
  }

  private serveConnection(conn: SockConn, transport: 'tcp' | 'ws'): void {
    const tracked: TrackedConnection = {
      sequence: ++this.connectionSequence,
      transport,
      conn,
      outcome: Promise.resolve(),
    };
    this.connections.set(conn, tracked);

    const serveOutcome = this.captureOutcome(() => this.mqttServer.serve(conn));
    tracked.outcome = serveOutcome.then(async (outcome) => {
      const contextOutcome = await this.finalizeContext(tracked);
      if (contextOutcome.ok === false) {
        this.rememberFailure(tracked, 'context', contextOutcome.error);
      }
      if (outcome.ok === false) this.rememberFailure(tracked, 'serve', outcome.error);
      this.connections.delete(conn);
    });
  }

  private async shutdownInternal(): Promise<void> {
    // Coordinate only through the normalized listen outcome. startInternal
    // awaits this cleanup on failure, so waiting on the start Promise here
    // would create a start/shutdown dependency cycle.
    if (this.tcpListenOutcome) await this.tcpListenOutcome;

    let tcpCloseOutcome: Promise<Outcome> | null = null;
    if (this.tcpServer?.listening) {
      tcpCloseOutcome = new Promise<Outcome>((resolve) => {
        let settled = false;
        const finish = (outcome: Outcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        };
        try {
          this.tcpServer!.close((error?: Error) => {
            finish(error === undefined ? { ok: true } : { ok: false, error });
          });
        } catch (error) {
          finish({ ok: false, error });
        }
      });
    }

    const trackedInOrder = [...this.connections.values()]
      .sort((left, right) => left.sequence - right.sequence);
    for (const tracked of trackedInOrder) {
      const outcome = await this.finalizeContext(tracked);
      if (outcome.ok === false) this.rememberFailure(tracked, 'context', outcome.error);
    }

    for (const tracked of trackedInOrder) {
      const outcome = await this.captureOutcome(() => tracked.conn.close());
      if (outcome.ok === false) this.rememberFailure(tracked, 'transport', outcome.error);
    }
    for (const socket of this.tcpSockets) socket.destroy();
    this.tcpSockets.clear();

    const wsOutcomePromise = this.wsServer
      ? this.captureOutcome(() => this.wsServer!.stop(true))
      : Promise.resolve({ ok: true } as Outcome);

    const tcpOutcome = tcpCloseOutcome ? await tcpCloseOutcome : { ok: true } as Outcome;
    // Successful and failed serve wrappers both remove themselves after their
    // captured Context has been finalized. Loop because a connection callback
    // already queued when ingress stopped can register between snapshots.
    while (this.connections.size > 0) {
      await Promise.all([...this.connections.values()].map((tracked) => tracked.outcome));
    }
    const wsOutcome = await wsOutcomePromise;

    const orderedConnectionFailures = [...this.connectionFailures.values()]
      .sort((left, right) => left.sequence - right.sequence);
    const failures: unknown[] = [];
    for (const failure of orderedConnectionFailures) {
      if (failure.contextFailed) failures.push(failure.contextError);
    }
    if (tcpOutcome.ok === false) failures.push(tcpOutcome.error);
    for (const failure of orderedConnectionFailures) {
      if (failure.transportFailed) failures.push(failure.transportError);
    }
    if (wsOutcome.ok === false) failures.push(wsOutcome.error);
    for (const failure of orderedConnectionFailures) {
      if (
        failure.serveFailed &&
        !(failure.contextFailed && Object.is(failure.serveError, failure.contextError))
      ) {
        failures.push(failure.serveError);
      }
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple MQTT resources failed to close');
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
