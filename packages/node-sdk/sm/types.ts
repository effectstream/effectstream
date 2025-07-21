//import type { AppEvents } from "@paima/events";

import type { PreparedQuery } from "npm:@pgtyped/runtime@2.4.2";

// TODO What is AppEvent type?
export type AppEvents = any;

// TODO: replace any
export type BaseStfInput = {
  blockHeight: number;
  blockTimestamp: number;
  conciseInput: string;
  userAddress?: `0x${string}`;
  userId?: number;
  chain: {
    // TODO: Should this be the complete Paima Block?
    blockNumber: number;
    transactionHash: string;
  };
};
export type BaseStfOutput<Events extends AppEvents> = {
  stateTransitions: [PreparedQuery<any, any>, any][];
  events: Events[];
};
