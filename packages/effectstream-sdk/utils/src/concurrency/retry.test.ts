import { test, expect } from "bun:test";
import { retry, tryYield } from "./retry.ts";
import { run } from "effection";

test("retry - succeeds immediately", async () => {
  await run(function* () {
    const result = yield* retry(
      function* () { return "success"; },
      (res) => res === "success"
    );
    expect(result).toEqual("success");
  });
});

test("retry - retries until success", async () => {
  await run(function* () {
    let attempts = 0;
    const result = yield* retry(
      function* () {
        attempts++;
        return attempts < 3 ? "fail" : "success";
      },
      (res) => res === "success"
    );
    expect(result).toEqual("success");
    expect(attempts).toEqual(3);
  });
});

test("retry - fails after max attempts", async () => {
  await expect(async () => {
    await run(function* () {
      yield* retry(
        function* () { return "fail"; },
        (res) => res === "success",
        undefined,
        2
      );
    });
  }).toThrow("Max attempts reached");
});

test("tryYield - success case", async () => {
    await run(function* () {
        const op = function* () { return 42; };
        const result = yield* tryYield(op());
        expect(result.data).toEqual(42);
        expect(result.error).toEqual(null);
    });
});

test("tryYield - failure case", async () => {
    await run(function* () {
        const op = function* () { throw new Error("fail"); };
        const result = yield* tryYield(op());
        expect(result.data).toEqual(null);
        expect(result.error?.message).toEqual("fail");
    });
});
