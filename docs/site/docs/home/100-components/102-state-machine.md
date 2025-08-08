# State Machine

This is the main component where logic and rules are processed.
This runs in the `Paima Engine Node`

In the examples the file is named `state-machine.ts` and contains `state-transition` functions that are executed each time the corresponding `event prefix` defined in the `grammar` is called. E.g., Each time a ERC721 Token es Minted, or a [PaimaL2 Event](../100-components/104-paima-l2-contract.md) is sent.

```ts
stm.addStateTransition(
  "transfer",
  function* (data) {
    const { to, from, value } = data.parsedInput.payload;
    yield* World.resolve(insertStateMachineInput, {
      inputs: `transfer ${value} from ${from} to ${to}`,
      block_height: data.blockHeight,
    });
    return;
  },
);
```

> IMPORTANT These functions MUST be deterministic. Therefore they should not use `Math.random()`, `new Date()`, do external API calls, or any function that might give different results on different times or machines.    
