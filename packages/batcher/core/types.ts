import { AddressType } from "@effectstream/utils";

export interface DefaultBatcherInput {
  addressType: AddressType;
  input: string;
  signature?: string;
  address: string;
  timestamp: string;
  target?: string; // Optional since by default we will target the PaimaL2 contract
  /**
   * Unique identifier for this input. Assigned server-side if omitted so
   * clients can subscribe to lifecycle events safely.
   */
  inputId?: string;
}
