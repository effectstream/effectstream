import { CryptoManager } from "@effectstream/crypto";
import { AddressType, Signature, WalletAddress } from "@effectstream/utils";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";

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
  signature: Signature
): SyncStateUpdateStream<boolean> {
  if (!walletAddress || !signature) throw new Error("No Signature");
  const cryptoManager = CryptoManager.getCryptoManager(addressType);

  try {
    if (!cryptoManager.verifyAddress(walletAddress)) {
      console.error(`Invalid Address for ${walletAddress} : ${message}`);
      throw new Error(`Invalid Address for ${walletAddress} : ${message}`);
    }

    const validSignature = yield* World.promise(
      cryptoManager.verifySignature(walletAddress, message, signature)
    );
    if (validSignature) {
      console.log(`Valid Signature for ${walletAddress} : ${message}`);
      return true;
    } else {
      throw new Error(`Invalid Signature for ${walletAddress} : ${message}`);
    }
  } catch (error) {
    console.log(
      `Error verifying signature for ${walletAddress} : ${message} : ${String(
        error
      )}`
    );
    return false;
  }
}

