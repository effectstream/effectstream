# Randomness

Randomness is essential for creating engaging and unpredictable games—from dice rolls and loot drops to critical hit chances. However, in a deterministic system like Paima Engine, standard functions like `Math.random()` are strictly forbidden.

### The Challenge: Deterministic Randomness

A core requirement of any State Transition Function (STF) is that it must be **deterministic**. Given the same input, it must always produce the exact same output. Standard randomness functions are the opposite of this; they are designed to be unpredictable and will produce different results every time they are run.

If two different Paima nodes running your game's STF got different results from a random number generator, their states would diverge, breaking the consensus of the entire system.

Paima Engine solves this by providing a secure, deterministic, and replayable source of randomness that is safe to use within your STFs.

### The Paima Randomness Model

Paima's solution is built on two key components:

1.  **A Deterministic Block Seed**: For every block, the Paima Engine generates a unique, deterministic seed. This seed is derived from on-chain data from that block (such as the blocks hashes). Because this data is the same for every node, the resulting seed is also the same.
2.  **The `Prando` Class**: This is a powerful **Pseudo-Random Number Generator (PRNG)**. A PRNG is an algorithm that takes a starting **seed** and produces a sequence of numbers that appear random, but are in fact completely predictable if you know the seed.

### Using Randomness in Your STF

You do not need to create a `Prando` instance yourself. The Paima Engine automatically initializes one for you using the current block's seed and provides it directly in the `data` object of your STF.

```ts
// In your state-machine.ts
stm.addStateTransition(
  "attack",
  function* (data) {
    // The randomGenerator is ready to use.
    const { randomGenerator } = data;

    // Use it to generate deterministic random numbers.
    const diceRoll = randomGenerator.nextInt(1, 6);

    // ... your logic
  },
);
```

#### Common Use Cases

The `randomGenerator` object has several convenient methods for common game mechanics.

**Generating a Dice Roll (`nextInt`)**
To get a random integer within an inclusive range.

```ts
// Returns a random integer between 1 and 6 (inclusive).
const diceRoll = randomGenerator.nextInt(1, 6);
```

**Picking from a Loot Table (`nextArrayItem`)**
To randomly select an element from an array.

```ts
const lootTable = ['sword', 'shield', 'potion'];
const droppedItem = randomGenerator.nextArrayItem(lootTable);
```

**Calculating a Probability (`next`)**
To check for a chance-based event, like a critical hit. The `next()` method returns a float between 0 and 1.

```ts
const CRITICAL_HIT_CHANCE = 0.20; // 20% chance

const chance = randomGenerator.next(); // e.g., returns 0.153
if (chance < CRITICAL_HIT_CHANCE) {
  // It's a critical hit!
}
```

### How `Prando` Works: A Deeper Look

It is crucial to understand that the `Prando` class is **stateful**.

Each time you call a method like `nextInt()`, it performs two actions:
1.  It generates a number based on its current internal state.
2.  It updates its internal state so the *next* call will produce a different number.

This means that the **order** in which you call randomness functions matters. The sequence of numbers is deterministic, but calling the same function twice in a row will not produce the same result.

**Example:**
```ts
// Inside an STF...
const firstRoll = randomGenerator.nextInt(1, 6);  // Let's say this returns 4
const secondRoll = randomGenerator.nextInt(1, 6); // This will return the NEXT number in the sequence, e.g., 2.
```

Because of this, you must ensure that your logic calls the randomness functions in the same order for all possible code paths to maintain determinism.
