import { CryptoManager } from "@paima/crypto";
import type { Signature, WalletAddress } from "@paima/utils";
import type { SyncStateUpdateStream } from "@paima/coroutine";

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
  walletAddress: WalletAddress,
  message: string,
  signature: Signature,
): SyncStateUpdateStream<boolean> {
  if (!walletAddress || !signature) throw new Error("No Signature");
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

      // IMPORATNT: sync generator cannot resolve promises.
      //            so we pass the promise back to generator caller
      //            and resolves the promise for us.
      const [validSignature] = (yield {
        type: "promise",
        promise: validator.verifySignature(
          walletAddress,
          message,
          signature,
        ),
      }) as [boolean];
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
