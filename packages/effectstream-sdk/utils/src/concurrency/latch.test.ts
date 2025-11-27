import { assertEquals, assertRejects } from "jsr:@std/assert";
import { countdownLatch } from "./latch.ts";
import { run, sleep, spawn } from "effection";

Deno.test("countdownLatch - waits for countdown", async () => {
  await run(function* () {
    const { wait, countDown } = countdownLatch(2);
    let done = false;

    yield* spawn(function* () {
      yield* wait();
      done = true;
    });

    yield* sleep(10);
    assertEquals(done, false);
    countDown();

    yield* sleep(10);
    assertEquals(done, false);
    countDown();

    yield* sleep(10);
    assertEquals(done, true);
  });
});

Deno.test("countdownLatch - respects timeout", async () => {
    await assertRejects(async () => {
        await run(function* () {
            const { wait } = countdownLatch(1);
            yield* wait(10); // 10ms timeout
        });
    }, Error, "timeout");
});

Deno.test("countdownLatch - no-op if already zero", async () => {
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
        assertEquals(done, true);
    });
});

