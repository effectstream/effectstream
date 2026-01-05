import {
    type MidnightAddress,
    type MidnightSignature,
    type Signature,
    TypeboxHelpers,
    type WalletAddress,
  } from "@effectstream/utils";
  import type { IVerify } from "../IVerify.ts";
  import { Value } from "@sinclair/typebox/value";
  
  export class MidnightCrypto implements IVerify {
    isMidnightSignature = (signature: Signature): signature is MidnightSignature => {
      return Value.Check(TypeboxHelpers.Midnight.Signature, signature);
    };
    verifyAddress = (address: WalletAddress): address is MidnightAddress => {
      return Value.Check(TypeboxHelpers.Midnight.Address, address);
    };
    verifySignature = async (
      signerAddress: WalletAddress,
      message: string,
      signature: Signature,
    ): Promise<boolean> => {
      try {
        if (this.verifyAddress(signerAddress) && this.isMidnightSignature(signature)) {
          console.log("TODO: MIDNIGHT SIGNATURE NYI:", {signerAddress, message, signature});
          return false;
        }
      } catch {
        // do nothing, error messages are expected if the signature is invalid
      }
      return false;
    };

    decodeAddress(address: WalletAddress): WalletAddress{
      return Value.Decode(TypeboxHelpers.Midnight.Address, address);
    }
  }
  