// Examples for the README. The runtime that executes these yields lives
// in @effectstream/runtime; here we mock the executor and check the
// generator-protocol contract.

import { test, expect } from "bun:test";
import { World } from "../src/mod.ts";

test("README: World.resolve yields a [queryIR, input] tuple", () => {
  // Mock a pgtyped PreparedQuery — only `queryIR` matters for the protocol.
  const getUser = { queryIR: { name: "getUser" } } as any;

  const gen = World.resolve(getUser, { id: 1 });
  const first = gen.next();
  expect(first.done).toBe(false);
  expect(first.value).toEqual([{ name: "getUser" }, { id: 1 }] as any);

  // The runtime would feed the rows back in via .next(rows).
  const done = gen.next([{ id: 1, balance: 100 }]);
  expect(done.done).toBe(true);
  expect(done.value).toEqual([{ id: 1, balance: 100 }] as any);
});

test("README: World.promise yields a { type: 'promise', promise } envelope", async () => {
  const gen = World.promise(Promise.resolve("hello"));
  const first = gen.next();
  expect(first.done).toBe(false);
  expect((first.value as any).type).toBe("promise");

  // Runtime would await the promise and feed back [value].
  const done = gen.next(["hello"] as any);
  expect(done.done).toBe(true);
  expect(done.value).toBe("hello");
});

test("README: a state-transition generator composes World.resolve via yield*", () => {
  const getUser = { queryIR: { name: "getUser" } } as any;
  const updateBalance = { queryIR: { name: "updateBalance" } } as any;

  function* spend(amount: number) {
    const [user]: any = yield* World.resolve(getUser, { id: 1 });
    if (user.balance < amount) return { ok: false } as const;
    yield* World.resolve(updateBalance, {
      id: user.id,
      balance: user.balance - amount,
    });
    return { ok: true } as const;
  }

  const gen = spend(30);
  expect(gen.next().value).toEqual([{ name: "getUser" }, { id: 1 }] as any);
  // Feed back a user with enough balance.
  expect(gen.next([{ id: 1, balance: 100 }]).value).toEqual(
    [{ name: "updateBalance" }, { id: 1, balance: 70 }] as any,
  );
  const final = gen.next([]);
  expect(final.done).toBe(true);
  expect(final.value).toEqual({ ok: true });
});
