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
      // Bun's byte-stream controller does not always settle a pending BYOB
      // read when it is only closed. Erroring it wakes the Opifex serve loop
      // without fabricating inbound protocol bytes (a forged DISCONNECT would
      // be parsed as genuine peer input if Opifex ever closes while the
      // context is still connected, silently suppressing its Will).
      closeReadable(new Error('TCP transport closed by broker'));
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
  timerFinalization?: Promise<Outcome>;
  transportFinalization?: Promise<Outcome>;
  outcome: Promise<void>;
};

type ConnectionFailure = {
  sequence: number;
  contextFailed?: boolean;
  contextError?: unknown;
  timerFailed?: boolean;
  timerError?: unknown;
  transportFailed?: boolean;
  transportError?: unknown;
  serveFailed?: boolean;
  serveError?: unknown;
};

function createWsServer(
  port: number,
  serveConnection: (conn: SockConn) => void,
  isStopping: () => boolean,
  trackSocket: (ws: unknown) => void,
  releaseSocket: (ws: unknown) => void,
): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch(req, server) {
      if (isStopping()) {
        return new Response('MQTT WebSocket endpoint is stopping', { status: 503 });
      }
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
        // Track every upgraded socket that is not already closed so shutdown
        // can observe transport completion directly (see the stop(true) race
        // in shutdownInternal).
        if ((ws as { readyState: number }).readyState !== WebSocket.CLOSED) {
          trackSocket(ws);
        }
        if (isStopping()) {
          // Server.stop(true) owns the close once STOPPING has been claimed.
          // Manually closing an upgraded socket while Bun is force-stopping it
          // can strand the stop Promise on Bun 1.3.10.
          return;
        }
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
            // Opifex hands over a freshly encoded per-packet buffer and Bun
            // serializes synchronously, so no defensive copy is needed here.
            try { ws.send(chunk); } catch { /* closed between check and send */ }
          },
          // Opifex closes its writer immediately before SockConn.close(),
          // which owns waking the readable side and closing the transport.
          close() {},
        });

        const sockConn: SockConn = {
          readable,
          writable,
          close: () => {
            // Bun's byte-stream controller does not always settle a pending
            // BYOB read when it is only closed. Rejecting the read wakes the
            // Opifex serve loop after the cached peer- or broker-owned Context
            // close mode has performed its routing and initial timer cleanup.
            try { state.controller?.error(new Error('WebSocket transport closed')); } catch { /* already closed */ }
            state.controller = null;
            // Outside shutdown the evicted peer must actually be disconnected
            // (clientId takeover, keepalive timeout, rejected CONNECT), or the
            // stale client keeps a live socket whose frames are silently
            // dropped. During shutdown Bun 1.3.10's Server.stop(true) owns the
            // force-close instead: manually closing an upgraded socket while
            // Bun is force-stopping can strand the stop Promise.
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
        releaseSocket(ws);
      },
    },
  });
}

export class EventBroker {
  private mqttServer: MqttServer;
  private tcpServer: Server | null = null;
  private wsServer: ReturnType<typeof Bun.serve> | null = null;
  private readonly tcpSockets = new Set<Socket>();
  private readonly wsLiveSockets = new Set<unknown>();
  private readonly wsDrainWaiters: Array<() => void> = [];
  private readonly connections = new Map<SockConn, TrackedConnection>();
  private readonly connectionFailures = new Map<number, ConnectionFailure>();
  private connectionSequence = 0;
  private startPromise: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private tcpListenOutcome: Promise<Outcome> | null = null;
  private tcpErrorObserver: ((error: unknown) => void) | null = null;
  private readonly tcpRuntimeErrors: unknown[] = [];
  private droppedTcpRuntimeErrors = 0;
  private droppedConnectionFailures = 0;
  // Failure records are retained until shutdown aggregates them; the cap keeps
  // a long-lived broker's memory bounded (each dropped record is still logged
  // at occurrence and surfaces as one summary error at shutdown).
  private static readonly MAX_RETAINED_CLEANUP_FAILURES = 128;

  constructor(private broker: 'effectstream-engine' | 'Batcher') {
    this.checkEnabled();

    const handlers: Handlers = {
      isAuthenticated: (ctx: Context) => {
        if (this.isStopping()) {
          // A CONNECT racing shutdown must not register a session: Opifex
          // calls this hook before ctx.connect(), so refusing here makes it
          // send CONNACK serverUnavailable and close the context itself.
          return AuthenticationResult.serverUnavailable;
        }
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
    if (this.shutdownPromise) {
      return Promise.reject(new Error('MQTT server cannot start after shutdown'));
    }
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  private isStopping(): boolean {
    return this.shutdownPromise !== null;
  }

  private releaseWsSocket(ws: unknown): void {
    this.wsLiveSockets.delete(ws);
    if (this.wsLiveSockets.size === 0) {
      for (const waiter of this.wsDrainWaiters.splice(0)) waiter();
    }
  }

  private wsSocketsDrained(): Promise<void> {
    if (this.wsLiveSockets.size === 0) return Promise.resolve();
    return new Promise((resolve) => { this.wsDrainWaiters.push(resolve); });
  }

  private async startInternal(): Promise<void> {
    const tcpPort = this.getTcpPort();
    const wsPort = this.getWsPort();

    this.tcpServer = createServer((sock) => {
      if (this.isStopping()) {
        sock.destroy();
        return;
      }
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
        if (outcome.ok === false) {
          this.tcpServer?.removeListener('error', onError);
          if (this.tcpErrorObserver === onError) this.tcpErrorObserver = null;
        }
        resolve(outcome);
      };
      const onListening = () => finish({ ok: true });
      const onError = (error: unknown) => {
        if (!settled) {
          finish({ ok: false, error });
          return;
        }
        console.error(`MQTT server [${this.broker}] TCP listener runtime error:`, error);
        if (this.tcpRuntimeErrors.length < EventBroker.MAX_RETAINED_CLEANUP_FAILURES) {
          this.tcpRuntimeErrors.push(error);
        } else {
          this.droppedTcpRuntimeErrors++;
        }
      };
      this.tcpErrorObserver = onError;
      this.tcpServer!.once('listening', onListening);
      this.tcpServer!.on('error', onError);
      try {
        this.tcpServer!.listen(tcpPort, '127.0.0.1');
      } catch (error) {
        finish({ ok: false, error });
      }
    });

    try {
      const tcpOutcome = await this.tcpListenOutcome;
      if (tcpOutcome.ok === false) throw tcpOutcome.error;
      if (this.isStopping()) throw new Error('MQTT server start cancelled by shutdown');
      console.log(`MQTT TCP Server [${this.broker}] started on port ${tcpPort}`);

      this.wsServer = createWsServer(
        wsPort,
        (conn) => this.serveConnection(conn, 'ws'),
        () => this.isStopping(),
        (ws) => this.wsLiveSockets.add(ws),
        (ws) => this.releaseWsSocket(ws),
      );
      if (this.isStopping()) throw new Error('MQTT server start cancelled by shutdown');
      console.log(`MQTT WS Server [${this.broker}] started on port ${wsPort}`);
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
    // Assigning the cached Promise claims STOPPING for every isStopping()
    // reader before any other statement runs. Context.close(false) then clears
    // the currently armed keepalive before shutdownInternal's first await; the
    // independent post-serve timer boundary catches any later handler reset.
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.shutdownPromise = promise;
    for (const tracked of [...this.connections.values()]
      .sort((left, right) => left.sequence - right.sequence)) {
      void this.finalizeContext(tracked, false);
    }
    this.shutdownInternal().then(resolve, reject);
    return promise;
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

  private finalizeContext(
    tracked: TrackedConnection,
    executeWill: boolean,
  ): Promise<Outcome> {
    if (tracked.contextFinalization) return tracked.contextFinalization;
    if (!tracked.context) return Promise.resolve({ ok: true });
    const { promise, resolve } = Promise.withResolvers<Outcome>();
    tracked.contextFinalization = promise;
    try {
      // close() must be invoked synchronously here so the first shutdown call
      // clears visible keepalive timers before its first asynchronous boundary.
      Promise.resolve(tracked.context.close(executeWill)).then(
        () => resolve({ ok: true }),
        (error) => resolve({ ok: false, error }),
      );
    } catch (error) {
      resolve({ ok: false, error });
    }
    return promise;
  }

  private finalizeTimer(tracked: TrackedConnection): Promise<Outcome> {
    if (tracked.timerFinalization) return tracked.timerFinalization;
    if (!tracked.context) return Promise.resolve({ ok: true });
    tracked.timerFinalization = this.captureOutcome(
      () => tracked.context!.timer?.clear(),
    );
    return tracked.timerFinalization;
  }

  private finalizeTransport(tracked: TrackedConnection): Promise<Outcome> {
    if (tracked.transportFinalization) return tracked.transportFinalization;
    tracked.transportFinalization = this.captureOutcome(() => tracked.conn.close());
    return tracked.transportFinalization;
  }

  private rememberFailure(
    tracked: TrackedConnection,
    kind: 'context' | 'timer' | 'transport' | 'serve',
    error: unknown,
  ): void {
    console.error(
      `MQTT server [${this.broker}] connection ${tracked.sequence} ${kind} cleanup failed:`,
      error,
    );
    const existing = this.connectionFailures.get(tracked.sequence);
    if (
      !existing &&
      this.connectionFailures.size >= EventBroker.MAX_RETAINED_CLEANUP_FAILURES
    ) {
      this.droppedConnectionFailures++;
      return;
    }
    const failure = existing ?? { sequence: tracked.sequence };
    if (kind === 'context') {
      failure.contextFailed = true;
      failure.contextError = error;
    } else if (kind === 'timer') {
      failure.timerFailed = true;
      failure.timerError = error;
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
    if (this.isStopping()) {
      try { conn.close(); } catch { /* late connection was never admitted */ }
      return;
    }
    const tracked: TrackedConnection = {
      sequence: ++this.connectionSequence,
      transport,
      conn,
      outcome: Promise.resolve(),
    };
    this.connections.set(conn, tracked);

    const serveOutcome = this.captureOutcome(() => this.mqttServer.serve(conn));
    tracked.outcome = serveOutcome.then(async (outcome) => {
      const contextOutcome = await this.finalizeContext(tracked, !this.isStopping());
      if (contextOutcome.ok === false) {
        this.rememberFailure(tracked, 'context', contextOutcome.error);
      }
      const timerOutcome = await this.finalizeTimer(tracked);
      if (timerOutcome.ok === false) {
        this.rememberFailure(tracked, 'timer', timerOutcome.error);
      }
      if (outcome.ok === false) this.rememberFailure(tracked, 'serve', outcome.error);
      this.connections.delete(conn);
    });
  }

  private async drainConnections(): Promise<void> {
    while (this.connections.size > 0 || this.tcpSockets.size > 0) {
      const trackedInOrder = [...this.connections.values()]
        .sort((left, right) => left.sequence - right.sequence);
      for (const tracked of trackedInOrder) {
        const outcome = await this.finalizeContext(tracked, false);
        if (outcome.ok === false) this.rememberFailure(tracked, 'context', outcome.error);
      }
      for (const tracked of trackedInOrder) {
        const outcome = await this.finalizeTransport(tracked);
        if (outcome.ok === false) this.rememberFailure(tracked, 'transport', outcome.error);
      }

      const sockets = [...this.tcpSockets];
      const socketClosures = sockets.map((socket) => socket.destroyed
        ? Promise.resolve()
        : new Promise<void>((resolve) => socket.once('close', () => resolve())));
      for (const socket of sockets) socket.destroy();
      await Promise.all([
        ...trackedInOrder.map((tracked) => tracked.outcome),
        ...socketClosures,
      ]);
      for (const socket of sockets) this.tcpSockets.delete(socket);
    }
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

    const wsOutcomePromise = this.wsServer
      ? this.captureOutcome(() => {
        // Bun (verified on 1.3.10 and 1.3.11) never settles stop(true)'s
        // Promise once any upgraded socket was closed server-side (a runtime
        // eviction), even though it still force-closes remaining sockets and
        // releases the listener. Transport completion is therefore also
        // observed directly through the per-socket close callbacks; a stop
        // failure that arrives after the drain signal wins is still observed
        // so it cannot become an unhandled rejection.
        const stopping = Promise.resolve(this.wsServer!.stop(true));
        stopping.catch(() => { /* observed via the race or superseded by the drain signal */ });
        return Promise.race([stopping, this.wsSocketsDrained()]);
      })
      : Promise.resolve({ ok: true } as Outcome);

    await this.drainConnections();
    const tcpOutcome = tcpCloseOutcome ? await tcpCloseOutcome : { ok: true } as Outcome;
    const wsOutcome = await wsOutcomePromise;
    // Listener settlement closes the admission boundary. Repeat the ownership
    // drain afterward so callbacks queued at that boundary cannot escape a
    // one-time connection/task snapshot.
    await this.drainConnections();
    if (this.tcpErrorObserver) {
      this.tcpServer?.removeListener('error', this.tcpErrorObserver);
      this.tcpErrorObserver = null;
    }

    const orderedConnectionFailures = [...this.connectionFailures.values()]
      .sort((left, right) => left.sequence - right.sequence);
    const failures: unknown[] = [...this.tcpRuntimeErrors];
    if (this.droppedTcpRuntimeErrors > 0) {
      failures.push(new Error(
        `${this.droppedTcpRuntimeErrors} additional TCP listener runtime errors were logged at occurrence and dropped`,
      ));
    }
    for (const failure of orderedConnectionFailures) {
      if (failure.contextFailed) failures.push(failure.contextError);
      if (failure.timerFailed) failures.push(failure.timerError);
    }
    if (tcpOutcome.ok === false) failures.push(tcpOutcome.error);
    for (const failure of orderedConnectionFailures) {
      if (failure.transportFailed) failures.push(failure.transportError);
    }
    if (wsOutcome.ok === false) failures.push(wsOutcome.error);
    for (const failure of orderedConnectionFailures) {
      if (failure.serveFailed) failures.push(failure.serveError);
    }
    if (this.droppedConnectionFailures > 0) {
      failures.push(new Error(
        `${this.droppedConnectionFailures} additional connection cleanup failures were logged at occurrence and dropped`,
      ));
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
