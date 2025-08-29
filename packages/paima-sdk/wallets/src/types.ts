export type Hash = string;
import type { WalletAddress } from "@paima/utils";
import type { UserSignature, WalletOption } from "./IProvider.ts";

export type SignFunction = (message: string) => Promise<UserSignature>;

export type QueryValue = string | number | boolean;
export type QueryOptions = Record<string, QueryValue>;

export interface Wallet {
  walletAddress: WalletAddress;
  metadata: WalletOption;
}

interface BatcherPostResponseSuccessful {
  success: true;
  hash: Hash;
}

interface BatcherPostResponseUnsuccessful {
  success: false;
  message: string;
  code?: number;
}

export type BatcherPostResponse =
  | BatcherPostResponseSuccessful
  | BatcherPostResponseUnsuccessful;

interface BatcherTrackResponseCore {
  success: true;
  hash: Hash;
}

interface BatcherTrackResponsePosted extends BatcherTrackResponseCore {
  status: "posted";
  block_height: number;
  transaction_hash: Hash;
}

interface BatcherTrackResponseRejected extends BatcherTrackResponseCore {
  status: "rejected";
  message: string;
}

interface BatcherTrackResponseOther extends BatcherTrackResponseCore {
  status: "accepted" | "validating";
}

export type BatcherTrackResponse =
  | BatcherTrackResponsePosted
  | BatcherTrackResponseRejected
  | BatcherTrackResponseOther;

export type BaseSuccessResponse = {
  success: true;
};

export type PostDataResponse = BaseSuccessResponse & { blockHeight: number };
export type PostDataResponseAsync = BaseSuccessResponse & { hash: string };
