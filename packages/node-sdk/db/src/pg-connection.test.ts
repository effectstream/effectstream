import { test, expect } from "bun:test";
import {
  acquireDBMutex,
  releaseDBMutex,
  waitUntilFree,
} from "./pg-connection.ts";
import { run, sleep, spawn } from "effection";
import { setEnv } from "@effectstream/utils/runtime";

// Force PGLITE env var to true for testing mutex logic
setEnv("PGLITE", "true");

test("DB Mutex - acquires and releases lock", async () => {
  await run(function* () {
    const lockName = "test-lock";

    yield* acquireDBMutex(lockName);
    let state = waitUntilFree();
    expect(state.db_mutex).toEqual("locked");
    expect(state.running.name).toEqual(lockName);

    releaseDBMutex(lockName);
    state = waitUntilFree();
    expect(state.db_mutex).toEqual("free");
    expect(state.running.name).toEqual("");
  });
});

test("DB Mutex - queues requests", async () => {
  await run(function* () {
    const lock1 = "lock-1";
    const lock2 = "lock-2";

    yield* acquireDBMutex(lock1);

    // Spawn a second task that tries to acquire lock
    let lock2Acquired = false;
    yield* spawn(function* () {
      yield* acquireDBMutex(lock2);
      lock2Acquired = true;
      releaseDBMutex(lock2);
    });

    yield* sleep(50);
    // Lock 2 should be waiting
    expect(lock2Acquired).toEqual(false);
    let state = waitUntilFree();
    expect(state.waiting.length).toEqual(1);
    expect(state.waiting[0].name).toEqual(lock2);

    // Release lock 1
    releaseDBMutex(lock1);

    yield* sleep(50);
    // Lock 2 should now be acquired (and released immediately in this test flow, but let's check flow)
    expect(lock2Acquired).toEqual(true);

    state = waitUntilFree();
    expect(state.db_mutex).toEqual("free");
  });
});

test("DB Mutex - respects priority", async () => {
  await run(function* () {
    const mainLock = "main";
    const lowPrio = "low";
    const highPrio = "high";

    yield* acquireDBMutex(mainLock);

    const acquireOrder: string[] = [];

    yield* spawn(function* () {
      yield* acquireDBMutex(lowPrio, "low");
      acquireOrder.push(lowPrio);
      releaseDBMutex(lowPrio);
    });

    yield* sleep(10);

    yield* spawn(function* () {
        yield* acquireDBMutex(highPrio, "high");
        acquireOrder.push(highPrio);
        releaseDBMutex(highPrio);
    });

    yield* sleep(10);

    let state = waitUntilFree();
    expect(state.waiting.length).toEqual(2);

    releaseDBMutex(mainLock);
    yield* sleep(50);

    // High priority should have been acquired first
    expect(acquireOrder[0]).toEqual(highPrio);
    expect(acquireOrder[1]).toEqual(lowPrio);
  });
});
