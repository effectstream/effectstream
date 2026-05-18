export type OfferFilesPrivateState = {
  // No private state fields required for this contract
};

export const witnesses = {
  print: (
    { privateState }: { privateState: OfferFilesPrivateState },
    n: bigint,
  ): [OfferFilesPrivateState, bigint] => {
    console.log("[offer-files witness] print:", n);
    return [privateState, n];
  },
};
