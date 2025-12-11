import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  accountMessages,
  type BuiltinGrammar,
  type BuiltinGrammarPrefix,
  type ParseInputResult,
} from "@effectstream/concise";
import {
  getAccountById,
  getAddressByAccountId,
  getAddressByAddress,
  type IGetAddressByAddressResult,
  newAccount,
  newAddressWithId,
  removeAddressAccount,
  updateAddressAccount,
  updatePrimaryAddress,
} from "@effectstream/db";
import {
  AddressType,
  type Signature,
  TypeboxHelpers,
  type WalletAddress,
} from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";
import { CryptoManager } from "@effectstream/crypto";

/**
 * These messages come from unparsed sources, as the payload is a string format.
 */
const formatWalletAddress = (
  address: string,
  addressType: AddressType
): WalletAddress => {
  const cryptoManager = CryptoManager.getCryptoManager(addressType);
  return cryptoManager.decodeAddress(address);
};

export function* account_createAccount(
  signerAddress: {
    address: WalletAddress;
    account_id: number | null;
  },
  input: ParseInputResult<
    typeof BuiltinGrammar,
    typeof BuiltinGrammarPrefix.createAccount
  >
): SyncStateUpdateStream<boolean> {
  try {
    // If signerAddress already has an account, return false
    if (signerAddress.account_id !== null) {
      console.error(
        "Address already has an account:",
        signerAddress.account_id
      );
      return false;
    }

    // Create a new account with this address as primary
    const [newAccountResult] = yield* World.resolve(newAccount, {
      primary_address: signerAddress.address,
    });

    // Update the address to link it to the new account
    yield* World.resolve(updateAddressAccount, {
      account_id: newAccountResult.id,
      address: signerAddress.address,
    });

    return true;
  } catch (error) {
    console.error("Create account error:", error);
    return false;
  }
}

export function* account_linkAddress(
  signerAddress: {
    address: WalletAddress;
    account_id: number | null;
  },
  input: ParseInputResult<
    typeof BuiltinGrammar,
    typeof BuiltinGrammarPrefix.linkAddress
  >
): SyncStateUpdateStream<boolean> {
  try {
    const account_id: number = input.data.account_id;
    const primary_address_type: AddressType = input.data.primary_address_type;
    const new_address_type: AddressType = input.data.new_address_type;
    const signature_from_primary: Signature = input.data.signature_from_primary;
    const new_address: WalletAddress = formatWalletAddress(
      input.data.new_address,
      input.data.new_address_type
    );
    const signature_from_new_address: Signature =
      input.data.signature_from_new_address;
    const is_new_primary: boolean = input.data.is_new_primary;

    // Step 1: Get the account by account_id, it must exist
    const [account] = yield* World.resolve(getAccountById, { account_id });
    if (!account) {
      console.error("Account not found:", account_id);
      return false;
    }
    if (!account.primary_address) {
      // no admin operations are possible without a primary address
      console.error("Account has no primary address");
      return false;
    }

    // Step 2: Check primary signature verification
    // Verify signature from primary address
    const primaryMessage = accountMessages.linkAccount(
      account_id,
      new_address,
      is_new_primary
    );

    const primarySignatureValid = yield* verifySignature(
      primary_address_type,
      account.primary_address,
      primaryMessage,
      signature_from_primary
    );

    if (!primarySignatureValid) {
      console.error("Invalid signature from primary");
      return false;
    }

    // Step 3: Determine the new address and verify its signature if needed
    // If new_address is different from signer, verify signature from new_address
    const newAddressMessage = accountMessages.linkAccount(
      account_id,
      account.primary_address,
      is_new_primary
    );

    const newAddressSignatureValid = yield* verifySignature(
      new_address_type,
      new_address,
      newAddressMessage,
      signature_from_new_address
    );

    if (!newAddressSignatureValid) {
      console.error("Invalid signature from new address");
      return false;
    }

    // Step 4: Check if target address already exists
    const targetAddress = new_address || account.primary_address;
    let [existingAddress] = yield* World.resolve(getAddressByAddress, {
      address: targetAddress,
    });
    const targetAddressType = new_address
      ? new_address_type
      : account.address_type;

    if (!existingAddress) {
      // Create new address entry linked to this account
      yield* World.resolve(newAddressWithId, {
        address: targetAddress,
        account_id,
        address_type: targetAddressType,
      });
      [existingAddress] = yield* World.resolve(getAddressByAddress, {
        address: targetAddress,
      });
    }

    // Step 5:
    // Update existing address to link to this account
    yield* World.resolve(updateAddressAccount, {
      account_id,
      address: targetAddress,
    });

    // Step 5: Update primary address if needed
    if (is_new_primary) {
      yield* World.resolve(updatePrimaryAddress, {
        account_id,
        primary_address: targetAddress,
      });
    }

    return true;
  } catch (error) {
    console.error("Link account error:", error);
    return false;
  }
}

function* verifySignature(
  addressType: AddressType,
  address: WalletAddress,
  message: string,
  signature: Signature
): SyncStateUpdateStream<boolean> {
  try {
    const cryptoManager = CryptoManager.getCryptoManager(addressType);
    const validSignature = yield* World.promise(
      cryptoManager.verifySignature(address, message, signature)
    );
    return validSignature;
  } catch (error) {
    return false;
  }
}

export function* account_unlinkAddressWithPrimary(
  signerAddress: {
    address: WalletAddress;
    account_id: number | null;
  },
  input: ParseInputResult<
    typeof BuiltinGrammar,
    typeof BuiltinGrammarPrefix.unlinkAddress
  >
): SyncStateUpdateStream<boolean> {
  try {
    const account_id: number = input.data.account_id;
    const primary_address_type: AddressType = input.data.primary_address_type;
    const signature_from_primary: Signature = input.data.signature_from_primary;
    const target_address: WalletAddress = formatWalletAddress(
      input.data.target_address,
      input.data.target_address_type
    );
    const new_primary_address: WalletAddress | null =
      input.data.new_primary_address === "" ||
      input.data.new_primary_address_type === -1
        ? null
        : formatWalletAddress(
            input.data.new_primary_address,
            input.data.new_primary_address_type
          );

    // Step 1: Check if account_id exists
    const [account] = yield* World.resolve(getAccountById, { account_id });
    if (!account) {
      console.error("Account not found:", account_id);
      return false;
    }

    // Determine the target address to unlink
    const targetAddress = target_address || signerAddress.address;

    // Step 2: Signature-based unlinking
    if (!account.primary_address) {
      console.error(
        "Account has no primary address for signature verification"
      );
      return false;
    }

    // Verify signature from primary address
    const primaryMessage = accountMessages.unlinkAccountWithPrimary(
      account_id,
      targetAddress,
      new_primary_address
    );

    const primarySignatureValid = yield* verifySignature(
      primary_address_type,
      account.primary_address,
      primaryMessage,
      signature_from_primary
    );

    if (!primarySignatureValid) {
      console.error("Invalid signature from primary");
      return false;
    }

    // Check if the target_address exists and belongs to the account
    const [addressToUnlink] = yield* World.resolve(getAddressByAddress, {
      address: targetAddress,
    });

    if (!addressToUnlink) {
      console.error("Address to unlink not found:", targetAddress);
      return false;
    }

    if (addressToUnlink.account_id !== account_id) {
      console.error("Address does not belong to the account:", targetAddress);
      return false;
    }

    // Handle new primary address if specified
    if (new_primary_address) {
      const [newPrimaryAddress] = yield* World.resolve(getAddressByAddress, {
        address: new_primary_address,
      });

      if (!newPrimaryAddress) {
        console.error("New primary address not found:", new_primary_address);
        return false;
      }

      if (newPrimaryAddress.account_id !== account_id) {
        console.error(
          "New primary address is already assigned to another account"
        );
        return false;
      }

      // Update the primary address
      yield* World.resolve(updatePrimaryAddress, {
        account_id,
        primary_address: newPrimaryAddress.address,
      });

      yield* World.resolve(updateAddressAccount, {
        account_id,
        address: newPrimaryAddress.address,
      });
    } else if (account.primary_address === targetAddress) {
      // If unlinking the primary address and no new primary specified, set to null
      yield* World.resolve(updatePrimaryAddress, {
        account_id,
        primary_address: null as string | null,
      });
    }

    // Unlink the address
    yield* World.resolve(removeAddressAccount, {
      address: targetAddress,
    });

    return true;
  } catch (error) {
    console.error("Unlink account with primary error:", error);
    return false;
  }
}

export function* account_unlinkAddressSelf(
  signerAddress: {
    address: WalletAddress;
    account_id: number | null;
  },
  input: ParseInputResult<
    typeof BuiltinGrammar,
    typeof BuiltinGrammarPrefix.unlinkAddress
  >
): SyncStateUpdateStream<boolean> {
  try {
    const account_id: number = input.data.account_id;
    const primary_address_type: AddressType = input.data.primary_address_type;

    const target_address: WalletAddress | null =
      input.data.target_address === "" || input.data.target_address_type === -1
        ? null
        : formatWalletAddress(
            input.data.target_address,
            input.data.target_address_type
          );

    // Step 1: Check if account_id exists
    const [account] = yield* World.resolve(getAccountById, { account_id });
    if (!account) {
      console.error("Account not found:", account_id);
      return false;
    }

    if (target_address && target_address !== signerAddress.address) {
      console.error("Cannot unlink different address without signature");
      return false;
    }

    // Determine the target address to unlink
    const targetAddress = target_address || signerAddress.address;

    // Check if the address belongs to the account
    if (signerAddress.account_id !== account_id) {
      console.error("Signer address does not belong to the account");
      return false;
    }

    // If this was the primary address, set primary to null
    if (account.primary_address === targetAddress) {
      // Only allow unlinking if there are no other addresses in the account.
      // The user should use the unlinkAddressWithPrimary instead, by providing the signature.
      const otherAddresses = yield* World.resolve(getAddressByAccountId, {
        account_id,
      });
      if (otherAddresses.length > 0) {
        console.error(
          "Account has other addresses, cannot unlink primary address"
        );
        return false;
      }

      yield* World.resolve(updatePrimaryAddress, {
        account_id,
        primary_address: null,
      });
    }

    // Unlink the address
    yield* World.resolve(removeAddressAccount, {
      address: targetAddress,
    });

    return true;
  } catch (error) {
    console.error("Unlink account self error:", error);
    return false;
  }
}

export function* account_unlinkAddress(
  signerAddress: {
    address: WalletAddress;
    account_id: number | null;
  },
  input: ParseInputResult<
    typeof BuiltinGrammar,
    typeof BuiltinGrammarPrefix.unlinkAddress
  >
): SyncStateUpdateStream<boolean> {
  const { signature_from_primary } = input.data;

  if (signature_from_primary) {
    return yield* account_unlinkAddressWithPrimary(signerAddress, input);
  } else {
    return yield* account_unlinkAddressSelf(signerAddress, input);
  }
}
