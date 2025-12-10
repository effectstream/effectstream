import { assertEquals, assertRejects } from "jsr:@std/assert";
import { retry, tryYield } from "./retry.ts";
import { run, sleep } from "effection";

Deno.test("retry - succeeds immediately", async () => {
  await run(function* () {
    const result = yield* retry(
      function* () { return "success"; },
      (res) => res === "success"
    );
    assertEquals(result, "success");
  });
});

Deno.test("retry - retries until success", async () => {
  await run(function* () {
    let attempts = 0;
    const result = yield* retry(
      function* () {
        attempts++;
        return attempts < 3 ? "fail" : "success";
      },
      (res) => res === "success"
    );
    assertEquals(result, "success");
    assertEquals(attempts, 3);
  });
});

Deno.test("retry - fails after max attempts", async () => {
  await assertRejects(async () => {
    await run(function* () {
      yield* retry(
        function* () { return "fail"; },
        (res) => res === "success",
        undefined,
        2
      );
    });
  }, Error, "Max attempts reached");
});

Deno.test("tryYield - success case", async () => {
    await run(function* () {
        const op = function* () { return 42; };
        const result = yield* tryYield(op());
        assertEquals(result.data, 42);
        assertEquals(result.error, null);
    });
});

Deno.test("tryYield - failure case", async () => {
    await run(function* () {
        const op = function* () { throw new Error("fail"); };
        const result = yield* tryYield(op());
        assertEquals(result.data, null);
        assertEquals(result.error?.message, "fail");
    });
});

