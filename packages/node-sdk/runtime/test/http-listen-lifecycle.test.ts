import { expect, test } from "bun:test";
import fastify from "fastify";
import { createServer, type AddressInfo } from "node:net";
import { run, suspend, until } from "effection";
import {
  listenFastifyWithCleanup,
  withFastifyCleanup,
} from "../src/api/http-server.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeServer() {
  const listen = deferred<string>();
  let closeError: unknown;
  let closeRejected = false;
  let closes = 0;
  const server = {
    server: { listening: false },
    listen: () => listen.promise,
    close: async () => {
      closes++;
      server.server.listening = false;
      if (closeRejected) throw closeError;
    },
  };
  return {
    server: server as any,
    listen,
    closes: () => closes,
    setCloseError: (error: unknown) => {
      closeRejected = true;
      closeError = error;
    },
  };
}

const rejectionReasons: Array<{ label: string; value: unknown }> = [
  { label: "undefined", value: undefined },
  { label: "null", value: null },
  { label: "false", value: false },
  { label: "zero", value: 0 },
  { label: "empty string", value: "" },
  { label: "Error", value: new Error("ordinary rejection") },
];

async function captureRejection(promise: PromiseLike<unknown>): Promise<{
  rejected: boolean;
  reason: unknown;
}> {
  return Promise.resolve(promise).then(
    () => ({ rejected: false, reason: undefined }),
    (reason) => ({ rejected: true, reason }),
  );
}

async function freeTcpPort(): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (port > 10_000) return port;
  }
  throw new Error("Unable to acquire a free TCP port above 10000");
}

async function bindOnce(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("halt before delayed listen success waits, closes, and cannot late-bind", async () => {
  const fake = fakeServer();
  const task = run(function* () {
    yield* listenFastifyWithCleanup(fake.server, { port: 12_345 });
    yield* suspend();
  });
  void task.catch(() => {});
  const halting = Promise.resolve(task.halt());
  let settled = false;
  void halting.then(() => {
    settled = true;
  });
  await Bun.sleep(5);
  expect(settled).toBe(false);
  fake.server.server.listening = true;
  fake.listen.resolve("http://127.0.0.1:12345");
  await halting;
  expect(fake.closes()).toBe(1);
  expect(fake.server.server.listening).toBe(false);
});

test("halt before delayed listen failure surfaces that failure", async () => {
  const fake = fakeServer();
  const listenError = Object.assign(new Error("occupied"), { code: "EADDRINUSE" });
  const task = run(function* () {
    yield* listenFastifyWithCleanup(fake.server, { port: 12_346 });
  });
  void task.catch(() => {});
  const halting = Promise.resolve(task.halt());
  fake.listen.reject(listenError);
  await expect(halting).rejects.toBe(listenError);
  expect(fake.closes()).toBe(1);
});

test("main-path listen failure is not duplicated when close succeeds", async () => {
  const fake = fakeServer();
  const listenError = new Error("listen failed");
  fake.listen.reject(listenError);
  await expect(Promise.resolve(run(function* () {
    yield* listenFastifyWithCleanup(fake.server, { port: 12_347 });
  }))).rejects.toBe(listenError);
  expect(fake.closes()).toBe(1);
});

test("listen plus close failure aggregates in listen-first order", async () => {
  const fake = fakeServer();
  const listenError = new Error("listen failed");
  const closeError = new Error("close failed");
  fake.server.server.listening = true;
  fake.setCloseError(closeError);
  fake.listen.reject(listenError);
  const error = await run(function* () {
    yield* listenFastifyWithCleanup(fake.server, { port: 12_348 });
  }).catch((value) => value);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([listenError, closeError]);
});

test("successful listen still surfaces close failure", async () => {
  const fake = fakeServer();
  const closeError = new Error("close failed");
  fake.server.server.listening = true;
  fake.setCloseError(closeError);
  fake.listen.resolve("http://127.0.0.1:12349");
  await expect(Promise.resolve(run(function* () {
    yield* listenFastifyWithCleanup(fake.server, { port: 12_349 });
  }))).rejects.toBe(closeError);
});

test.each(rejectionReasons)(
  "listen rejection $label remains structural",
  async ({ value }) => {
    const fake = fakeServer();
    fake.listen.reject(value);
    const result = await captureRejection(run(function* () {
      yield* listenFastifyWithCleanup(fake.server, { port: 12_350 });
    }));
    expect(result.rejected).toBe(true);
    expect(Object.is(result.reason, value)).toBe(true);
    expect(fake.closes()).toBe(1);
  },
);

test.each(rejectionReasons)(
  "close rejection $label remains structural",
  async ({ value }) => {
    const fake = fakeServer();
    fake.server.server.listening = true;
    fake.setCloseError(value);
    fake.listen.resolve("http://127.0.0.1:12351");
    const result = await captureRejection(run(function* () {
      yield* listenFastifyWithCleanup(fake.server, { port: 12_351 });
    }));
    expect(result.rejected).toBe(true);
    expect(Object.is(result.reason, value)).toBe(true);
  },
);

test("undefined listen and close rejections retain ordered aggregate entries", async () => {
  const fake = fakeServer();
  fake.server.server.listening = true;
  fake.setCloseError(undefined);
  fake.listen.reject(undefined);
  const result = await captureRejection(run(function* () {
    yield* listenFastifyWithCleanup(fake.server, { port: 12_352 });
  }));
  expect(result.rejected).toBe(true);
  expect(result.reason).toBeInstanceOf(AggregateError);
  expect((result.reason as AggregateError).errors).toEqual([undefined, undefined]);
});

test("a real Fastify setup failure closes exactly once and preserves the primary error", async () => {
  const server = fastify();
  const setupError = new Error("router setup failed");
  let closes = 0;
  server.addHook("onClose", async () => {
    closes++;
  });

  const result = await captureRejection(run(function* () {
    yield* withFastifyCleanup(server, function* () {
      server.register(async () => {
        throw setupError;
      });
      yield* until(server.ready());
    });
  }));

  expect(result.rejected).toBe(true);
  expect(result.reason).toBe(setupError);
  expect(closes).toBe(1);
  expect(server.server.listening).toBe(false);
});

test("pre-listen setup and close failures aggregate in primary-first order", async () => {
  const fake = fakeServer();
  const setupError = new Error("setup failed");
  const closeError = new Error("close failed");
  fake.setCloseError(closeError);

  const result = await captureRejection(run(function* () {
    yield* withFastifyCleanup(fake.server, function* () {
      throw setupError;
    });
  }));

  expect(result.rejected).toBe(true);
  expect(result.reason).toBeInstanceOf(AggregateError);
  expect((result.reason as AggregateError).errors).toEqual([setupError, closeError]);
  expect(fake.closes()).toBe(1);
});

test("a real Fastify instance is closed exactly once when cancelled before listen", async () => {
  const server = fastify();
  let closes = 0;
  server.addHook("onClose", async () => {
    closes++;
  });
  const task = run(function* () {
    yield* withFastifyCleanup(server, function* () {
      yield* suspend();
    });
  });
  void task.catch(() => {});

  await task.halt();
  expect(closes).toBe(1);
  expect(server.server.listening).toBe(false);
});

test("a real occupied-port rejection closes exactly once and releases Fastify resources", async () => {
  const port = await freeTcpPort();
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(port, "127.0.0.1", resolve);
  });
  const server = fastify();
  let closes = 0;
  server.addHook("onClose", async () => {
    closes++;
  });

  try {
    const result = await captureRejection(run(function* () {
      yield* listenFastifyWithCleanup(server, { port, host: "127.0.0.1" });
    }));
    expect(result.rejected).toBe(true);
    expect((result.reason as NodeJS.ErrnoException).code).toBe("EADDRINUSE");
    expect(closes).toBe(1);
    expect(server.server.listening).toBe(false);
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
  await bindOnce(port);
});

test("a real Fastify listener releases its port before halt settles", async () => {
  const port = await freeTcpPort();
  const server = fastify();
  let closes = 0;
  server.addHook("onClose", async () => {
    closes++;
  });
  const task = run(function* () {
    yield* listenFastifyWithCleanup(server, { port, host: "127.0.0.1" });
    yield* suspend();
  });
  void task.catch(() => {});
  try {
    for (let attempt = 0; attempt < 100 && !server.server.listening; attempt++) {
      await Bun.sleep(2);
    }
    expect(server.server.listening).toBe(true);
    await task.halt();
    expect(server.server.listening).toBe(false);
    expect(closes).toBe(1);
    await bindOnce(port);
  } finally {
    await task.halt().catch(() => {});
    if (server.server.listening) await server.close();
  }
});
