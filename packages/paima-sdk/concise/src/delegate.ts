import {
  BuiltinGrammar,
  BuiltinGrammarPrefix,
  KeyedBuiltinGrammar,
  parseStmInput,
} from "@paima/concise";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";

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
    other_address: string,
    is_new_primary: boolean,
  ) => {
    return `link:${String(account_id)}:${other_address}:${
      is_new_primary ? "true" : "false"
    }`;
  },
  unlinkAccountWithPrimary: (
    account_id: number,
    other_address: string,
    new_primary?: string | null,
  ) => {
    return `unlink:${String(account_id)}:${other_address}:${new_primary ?? ""}`;
  },
};

export const signMessage = async (
  message: string,
  privateKey: `0x${string}`,
) => {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    transport: http("http://0.0.0.0"),
  });
  const signature = await walletClient.signMessage({ message });
  console.error("Signature:", signature, message, account.address);
  return signature;
};

export const accountPayload = {
  createAccount: async (): Promise<string[]> => {
    return [BuiltinGrammarPrefix.createAccount];
  },
  linkAddress: async (
    primaryAccountPrivateKey: `0x${string}`,
    newAccountPrivateKey: `0x${string}`,
    primaryAddress: `0x${string}`,
    newAddress: `0x${string}`,
    accountId: number,
    isNewPrimary: boolean,
  ): Promise<string[]> => {
    return [
      BuiltinGrammarPrefix.linkAddress,
      String(accountId),
      await signMessage(
        accountMessages.linkAccount(
          accountId,
          newAddress.toLowerCase(),
          isNewPrimary,
        ),
        primaryAccountPrivateKey,
      ),
      newAddress,
      await signMessage(
        accountMessages.linkAccount(
          accountId,
          primaryAddress.toLowerCase(),
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
    primaryAccountPrivateKey: `0x${string}`,
    accountId: number,
    accountAddress: string,
    newPrimary: string,
  ): Promise<string[]> => {
    return [
      BuiltinGrammarPrefix.unlinkAddress,
      String(accountId),
      await signMessage(
        accountMessages.unlinkAccountWithPrimary(
          accountId,
          accountAddress.toLowerCase(),
          newPrimary.toLowerCase(),
        ),
        primaryAccountPrivateKey,
      ),
      accountAddress,
      newPrimary.toLowerCase(),
    ];
  },
};
