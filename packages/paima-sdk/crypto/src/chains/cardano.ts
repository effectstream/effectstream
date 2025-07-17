import { CardanoAddress, doLog, Signature, TypeboxHelpers } from '@paima/utils';
import type { IVerify } from './IVerify.js';
import { Value } from '@sinclair/typebox/value';

export class CardanoCrypto implements IVerify {
  verifyAddress = (address: string): address is CardanoAddress => {
    return Value.Check(TypeboxHelpers.Cardano.Address, address);
  };
  verifySignature = async (
    userAddress: CardanoAddress,
    message: string,
    sigStruct: Signature
  ): Promise<boolean> => {
    try {
      const [signature, key, ...remainder] = sigStruct.split('+');
      if (!signature || !key || remainder.length > 0) {
        return false;
      }
      const { default: verifyCardanoDataSignature } = await import(
        '@cardano-foundation/cardano-verify-datasignature'
      );
      return verifyCardanoDataSignature.default(signature, key, message, userAddress);
    } catch (err) {
      doLog('[address-validator] error verifying cardano signature:', err);
      return false;
    }
  };
}
