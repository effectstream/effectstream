import { test, expect } from "bun:test";
import { Prando } from "./Prando.ts";

test("Prando - Deterministic sequence", () => {
  const seed = 12345;
  const rng1 = new Prando(seed);
  const rng2 = new Prando(seed);

  expect(rng1.next()).toEqual(rng2.next());
  expect(rng1.nextInt(0, 100)).toEqual(rng2.nextInt(0, 100));
  expect(rng1.nextString(5)).toEqual(rng2.nextString(5));
});

test("Prando - Different seeds produce different sequences", () => {
  const rng1 = new Prando(12345);
  const rng2 = new Prando(67890);

  const val1 = rng1.next();
  const val2 = rng2.next();

  if (val1 === val2) {
      expect(rng1.next() === rng2.next()).toEqual(false);
  } else {
      expect(val1 === val2).toEqual(false);
  }
});

test("Prando - Reset works", () => {
    const seed = 98765;
    const rng = new Prando(seed);
    const val1 = rng.next();
    rng.reset();
    const val2 = rng.next();
    expect(val1).toEqual(val2);
});
