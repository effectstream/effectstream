import { assertEquals } from "jsr:@std/assert";
import { Prando } from "./Prando.ts";

Deno.test("Prando - Deterministic sequence", () => {
  const seed = 12345;
  const rng1 = new Prando(seed);
  const rng2 = new Prando(seed);

  assertEquals(rng1.next(), rng2.next());
  assertEquals(rng1.nextInt(0, 100), rng2.nextInt(0, 100));
  assertEquals(rng1.nextString(5), rng2.nextString(5));
});

Deno.test("Prando - Different seeds produce different sequences", () => {
  const rng1 = new Prando(12345);
  const rng2 = new Prando(67890);

  const val1 = rng1.next();
  const val2 = rng2.next();
  
  if (val1 === val2) {
      assertEquals(rng1.next() === rng2.next(), false);
  } else {
      assertEquals(val1 === val2, false);
  }
});

Deno.test("Prando - Reset works", () => {
    const seed = 98765;
    const rng = new Prando(seed);
    const val1 = rng.next();
    rng.reset();
    const val2 = rng.next();
    assertEquals(val1, val2);
});

