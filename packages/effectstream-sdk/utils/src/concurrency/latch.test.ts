import { test, expect } from "bun:test";
import { countdownLatch } from "./latch.ts";
import { run, sleep, spawn } from "effection";

test("countdownLatch - waits for countdown", async () => {
  await run(function* () {
    const { wait, countDown } = countdownLatch(2);
    let done = false;

    yield* spawn(function* () {
      yield* wait();
      done = true;
    });

    yield* sleep(10);
    expect(done).toEqual(false);
    countDown();

    yield* sleep(10);
    expect(done).toEqual(false);
    countDown();

    yield* sleep(10);
    expect(done).toEqual(true);
  });
});

test("countdownLatch - respects timeout", async () => {
    await expect(async () => {
        await run(function* () {
            const { wait } = countdownLatch(1);
            yield* wait(10); // 10ms timeout
        });
    }).toThrow("timeout");
});

test("countdownLatch - no-op if already zero", async () => {
    await run(function* () {
        const { wait, countDown } = countdownLatch(1);
        countDown();
        countDown(); // Should not error

        let done = false;
        yield* spawn(function* () {
            yield* wait();
            done = true;
        });
        yield* sleep(10);
        expect(done).toEqual(true);
    });
});
