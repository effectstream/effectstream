import { CryptoManager } from "@effectstream/crypto";
import { AddressType, Signature, WalletAddress } from "@effectstream/utils";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { assertNever } from "assert-never";

/**
 * Verify a signature for a given wallet address and message.
 * This function tries all the supported crypto managers, and returns true if any of them
 * verifies the signature.
 *
 * This function can only be used in the Paima Engine process-blocks,
 * as it yields the promise back to the generator caller.
 *
 * @param walletAddress - The wallet address to verify the signature for.
 * @param message - The message to verify the signature for.
 * @param signature - The signature to verify.
 * @returns True if the signature is valid, false otherwise.
 */
export function* verifySignature(
  addressType: AddressType,
  walletAddress: WalletAddress,
  message: string,
  signature: Signature,
): SyncStateUpdateStream<boolean> {
  if (!walletAddress || !signature) throw new Error("No Signature");

  switch (addressType) {
    case AddressType.NONE:
      throw new Error("Invalid address type: " + addressType);
    case AddressType.EVM:
      break;
    case AddressType.CARDANO:
    case AddressType.SUBSTRATE:
    case AddressType.AVAIL:
    case AddressType.ALGORAND:
    case AddressType.MINA:
    case AddressType.MIDNIGHT:
    case AddressType.POLKADOT:
      // TODO Implement the signature verification for the other address types
      throw new Error("NYI address type: " + addressType);
    default:
      assertNever(addressType);
  }

  // TODO: Add other chains here.
  const WALLET_VALIDATORS = [
    CryptoManager.Evm(),
    // CryptoManager.Cardano(),
    // CryptoManager.Algorand(),
    // CryptoManager.Polkadot(),
  ];
  for (const validator of WALLET_VALIDATORS) {
    try {
      if (!validator.verifyAddress(walletAddress)) continue;

      // IMPORTANT: sync generator cannot resolve promises.
      //            so we pass the promise back to generator caller
      //            and resolves the promise for us.
      const validSignature = yield* World.promise(validator.verifySignature(
        walletAddress,
        message,
        signature,
      ));
      if (validSignature) {
        return true;
      }
    } catch {
      // do nothing, some validators throw errors if the signature is invalid
    }
  }
  console.error(`Invalid Signature for ${walletAddress} : ${message}`);
  return false;
}
