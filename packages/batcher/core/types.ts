import { AddressType } from "@paima/utils";

export interface DefaultBatcherInput {
  addressType: AddressType;
  input: string;
  signature?: string;
  address: string;
  timestamp: string;
  target?: string; // Optional since by default we will target the PaimaL2 contract
}
