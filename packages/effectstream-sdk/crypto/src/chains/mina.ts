import {
  type MinaAddress,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@effectstream/utils";
import type { IVerify } from "../IVerify.ts";
import type { NetworkId } from "mina-signer";
import { Value } from "@sinclair/typebox/value";
import { default as Client } from "mina-signer";

export class MinaCrypto implements IVerify {
  verifyAddress = (address: WalletAddress): address is MinaAddress => {
    return Value.Check(TypeboxHelpers.Mina.Address, address);
  };
  verifySignature = async (
    userAddress: MinaAddress,
    message: string,
    sigStruct: Signature,
  ): Promise<boolean> => {
    try {
      const [field, scalar, network, ...remainder] = sigStruct.split(";");
      if (!field || !scalar || !network || remainder.length > 0) {
        return false;
      }

      // const Client = (await import("mina-signer")).default;

      const signerClient = new Client({ network: network as NetworkId });

      const verifyBody = {
        data: message,
        publicKey: userAddress,
        signature: { field, scalar },
      };

      const verifyResult = signerClient.verifyMessage(verifyBody);

      return verifyResult;
    } catch (err) {
      console.error("[address-validator] error verifying mina signature:", err);
      return false;
    }
  };
}
