//import type { AppEvents } from "@effectstream/events";

import type { PreparedQuery } from "@pgtyped/runtime";
import type {
  AddressType,
  PaimaBlockNumber,
  TimestampMs,
  WalletAddress,
} from "@effectstream/utils";
import type { Prando } from "@effectstream/crypto";

// TODO What is AppEvent type?
export type AppEvents = any;

// TODO: replace any
export type BaseStfInput = {
  blockHeight: PaimaBlockNumber;
  blockTimestamp: TimestampMs;
  conciseInput: string;
  accountId?: number;
  signerAddress?: WalletAddress;
  signerAddressType?: AddressType;
  randomGenerator: Prando;
};
export type BaseStfOutput<Events extends AppEvents> = {
  stateTransitions: [PreparedQuery<any, any>, any][];
  events: Events[];
};
