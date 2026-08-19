// MUST stay first: it sets the flag @polkadot/util reads while loading.
import "@effectstream/utils/polkadot-esm-cjs-warning";
import {
  type Signature,
  type SubstrateAddress,
  TypeboxHelpers,
} from "@effectstream/utils/types";
import type { IVerify } from "../IVerify.ts";
import { Value } from "@sinclair/typebox/value";
import { cryptoWaitReady, decodeAddress, signatureVerify } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import type { WalletAddress } from "@effectstream/utils/types";

export class PolkadotCrypto implements IVerify {
  verifyAddress = (address: string): address is SubstrateAddress => {
    return Value.Check(TypeboxHelpers.Substrate.Address, address);
  };
  verifySignature = async (
    userAddress: SubstrateAddress,
    message: string,
    signature: Signature,
  ): Promise<boolean> => {
    try {
      // const { cryptoWaitReady, decodeAddress, signatureVerify } = await import(
      //   "@polkadot/util-crypto"
      // );
      // const { u8aToHex } = await import("@polkadot/util");
      await cryptoWaitReady();
      const publicKey = decodeAddress(userAddress);
      const hexPublicKey = u8aToHex(publicKey);
      return signatureVerify(message, signature, hexPublicKey).isValid;
    } catch (err) {
      console.error(
        "[address-validator] error verifying polkadot signature:",
        err,
      );
      return false;
    }
  };

  decodeAddress(address: WalletAddress): WalletAddress{
    return Value.Decode(TypeboxHelpers.Polkadot.Address, address);
  }
}
