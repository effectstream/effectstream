export type BallotPrivateState = {
  secretKey: Uint8Array;
};

export function createWitnesses(secretKey: Uint8Array) {
  return {
    private$secret_key(context: { privateState: BallotPrivateState }): [BallotPrivateState, Uint8Array] {
      return [context.privateState, secretKey];
    },
  };
}
