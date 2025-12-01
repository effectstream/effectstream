import { assertEquals } from "jsr:@std/assert";
import {
  acquireDBMutex,
  releaseDBMutex,
  waitUntilFree,
} from "./pg-connection.ts";
import { run, sleep, spawn } from "effection";

// Force PGLITE env var to true for testing mutex logic
Deno.env.set("PGLITE", "true");

Deno.test("DB Mutex - acquires and releases lock", async () => {
  await run(function* () {
    const lockName = "test-lock";
    
    yield* acquireDBMutex(lockName);
    let state = waitUntilFree();
    assertEquals(state.db_mutex, "locked");
    assertEquals(state.running.name, lockName);
    
    releaseDBMutex(lockName);
    state = waitUntilFree();
    assertEquals(state.db_mutex, "free");
    assertEquals(state.running.name, "");
  });
});

Deno.test("DB Mutex - queues requests", async () => {
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
    assertEquals(lock2Acquired, false);
    let state = waitUntilFree();
    assertEquals(state.waiting.length, 1);
    assertEquals(state.waiting[0].name, lock2);
    
    // Release lock 1
    releaseDBMutex(lock1);
    
    yield* sleep(50);
    // Lock 2 should now be acquired (and released immediately in this test flow, but let's check flow)
    assertEquals(lock2Acquired, true);
    
    state = waitUntilFree();
    assertEquals(state.db_mutex, "free");
  });
});

Deno.test("DB Mutex - respects priority", async () => {
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
    assertEquals(state.waiting.length, 2);
    
    releaseDBMutex(mainLock);
    yield* sleep(50);
    
    // High priority should have been acquired first
    assertEquals(acquireOrder[0], highPrio);
    assertEquals(acquireOrder[1], lowPrio);
  });
});

