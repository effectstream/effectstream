import {
  BuiltinGrammar,
  BuiltinGrammarPrefix,
  KeyedBuiltinGrammar,
  parseStmInput,
} from "@paima/concise";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import {
  type EvmAddress,
  type EvmPrivateKey,
  type PrivateKey,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import { Value } from "@sinclair/typebox/value";

export function extractDelegateWallet(inputData: string) {
  const parsed = parseStmInput<
    typeof BuiltinGrammar,
    | typeof BuiltinGrammarPrefix.createAccount
    | typeof BuiltinGrammarPrefix.linkAddress
    | typeof BuiltinGrammarPrefix.unlinkAddress
  >(
    inputData,
    BuiltinGrammar,
    KeyedBuiltinGrammar,
  );
  return parsed;
}

export const accountMessages = {
  linkAccount: (
    account_id: number,
    other_address: WalletAddress,
    is_new_primary: boolean,
  ) => {
    return `link:${String(account_id)}:${other_address}:${
      is_new_primary ? "true" : "false"
    }`;
  },
  unlinkAccountWithPrimary: (
    account_id: number,
    other_address: WalletAddress,
    new_primary?: WalletAddress | null,
  ) => {
    return `unlink:${String(account_id)}:${other_address}:${new_primary ?? ""}`;
  },
};

const isEvmPrivateKey = (
  privateKey: PrivateKey,
): privateKey is EvmPrivateKey => {
  return Value.Check(TypeboxHelpers.Evm.PrivateKey, privateKey);
};
const isEvmAddress = (address: WalletAddress): address is EvmAddress => {
  return Value.Check(TypeboxHelpers.Evm.Address, address);
};

export const signMessage = async (
  message: string,
  privateKey: PrivateKey,
) => {
  if (!isEvmPrivateKey(privateKey)) {
    throw new Error("NYI: Private key is not an EVM private key");
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    // Viem requires a transport with URL or chain to be provided.
    // This transport will not be used.
    transport: http("http://0.0.0.0"),
  });
  return await walletClient.signMessage({ message });
};

export const accountPayload = {
  createAccount: async (): Promise<string[]> => {
    return [BuiltinGrammarPrefix.createAccount];
  },
  linkAddress: async (
    primaryAccountPrivateKey: PrivateKey,
    newAccountPrivateKey: PrivateKey,
    primaryAddress: WalletAddress,
    newAddress: WalletAddress,
    accountId: number,
    isNewPrimary: boolean,
  ): Promise<string[]> => {
    return [
      BuiltinGrammarPrefix.linkAddress,
      String(accountId),
      await signMessage(
        accountMessages.linkAccount(
          accountId,
          isEvmAddress(newAddress)
            ? Value.Decode(TypeboxHelpers.Evm.Address, newAddress)
            : newAddress,
          isNewPrimary,
        ),
        primaryAccountPrivateKey,
      ),
      newAddress,
      await signMessage(
        accountMessages.linkAccount(
          accountId,
          isEvmAddress(primaryAddress)
            ? Value.Decode(TypeboxHelpers.Evm.Address, primaryAddress)
            : primaryAddress,
          isNewPrimary,
        ),
        newAccountPrivateKey,
      ),
      isNewPrimary ? "true" : "false",
    ];
  },
  unlinkSelf: async (
    accountId: number,
  ): Promise<string[]> => {
    return [
      BuiltinGrammarPrefix.unlinkAddress,
      String(accountId),
      "",
      "",
      "",
    ];
  },
  unlinkAddress: async (
    primaryAccountPrivateKey: PrivateKey,
    accountId: number,
    accountAddress: WalletAddress,
    newPrimary: WalletAddress,
  ): Promise<string[]> => {
    return [
      BuiltinGrammarPrefix.unlinkAddress,
      String(accountId),
      await signMessage(
        accountMessages.unlinkAccountWithPrimary(
          accountId,
          isEvmAddress(accountAddress)
            ? Value.Decode(TypeboxHelpers.Evm.Address, accountAddress)
            : accountAddress,
          isEvmAddress(newPrimary)
            ? Value.Decode(TypeboxHelpers.Evm.Address, newPrimary)
            : newPrimary,
        ),
        primaryAccountPrivateKey,
      ),
      accountAddress,
      newPrimary.toLowerCase(),
    ];
  },
};
