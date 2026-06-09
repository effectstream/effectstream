export type MidnightLedgerFn = (state: unknown) => unknown;

export type MidnightContractStateDeserializer = {
  deserialize: (bytes: Uint8Array) => { data: { state: unknown } };
};

/**
 * Build a sync-safe ledger parser for raw transaction contract state hex.
 *
 * Pass `ContractState` from the app's `@midnight-ntwrk/compact-runtime` so the
 * deserialized `StateValue` matches the WASM module used by generated
 * `contract.ledger()` helpers (required when @effectstream/sync resolves
 * dependencies from a different node_modules tree than the app template).
 */
export function midnightLedgerFromTxStateHex(
  ledger: MidnightLedgerFn,
  contractState: MidnightContractStateDeserializer,
): (rawHexState: string) => Record<string, unknown> {
  return (rawHexState: string) => {
    const byteState = new Uint8Array(
      rawHexState.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    const stateValue = contractState.deserialize(byteState).data.state;
    return ledger(stateValue) as Record<string, unknown>;
  };
}
