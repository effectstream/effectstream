import {
  BuiltinGrammar,
  BuiltinGrammarPrefix,
  KeyedBuiltinGrammar,
} from "./v2/builtins/grammar.ts";
import { parseStmInput } from "./v2/inputs.ts";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import {
  AddressType,
  type EvmAddress,
  type EvmPrivateKey,
  type PrivateKey,
  TypeboxHelpers,
  type WalletAddress,
} from "@effectstream/utils/types";
import { Value } from "@sinclair/typebox/value";
import { CryptoManager } from "@effectstream/crypto";

export function extractDelegateWallet(inputData: string) {
  const parsed = parseStmInput<
    typeof BuiltinGrammar,
    | typeof BuiltinGrammarPrefix.createAccount
    | typeof BuiltinGrammarPrefix.linkAddress
    | typeof BuiltinGrammarPrefix.unlinkAddress
  >(inputData, BuiltinGrammar, KeyedBuiltinGrammar);
  return parsed;
}

export const accountMessages = {
  linkAccount: (
    account_id: number,
    other_address: WalletAddress,
    is_new_primary: boolean
  ) => {
    return `link:${String(account_id)}:${other_address}:${
      is_new_primary ? "true" : "false"
    }`;
  },
  unlinkAccountWithPrimary: (
    account_id: number,
    other_address: WalletAddress,
    new_primary?: WalletAddress | null
  ) => {
    return `unlink:${String(account_id)}:${other_address}:${new_primary ?? ""}`;
  },
};

const isEvmPrivateKey = (
  privateKey: PrivateKey
): privateKey is EvmPrivateKey => {
  return Value.Check(TypeboxHelpers.Evm.PrivateKey, privateKey);
};
const isEvmAddress = (address: WalletAddress): address is EvmAddress => {
  return Value.Check(TypeboxHelpers.Evm.Address, address);
};

export const signMessage = async (message: string, privateKey: PrivateKey) => {
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
  createAccount: async (): Promise<["&createAccount"]> => {
    return [BuiltinGrammarPrefix.createAccount];
  },
  // TODO This should use the Wallet connector to sign the message
  linkAddress: async (
    primaryAccountPrivateKey: PrivateKey,
    primaryAccountAddressType: AddressType,
    newAccountPrivateKey: PrivateKey,
    newAccountAddressType: AddressType,
    _primaryAddress: WalletAddress,
    _newAddress: WalletAddress,
    accountId: number,
    isNewPrimary: boolean
  ): Promise<
    ["&linkAddress", number, string, number, string, string, number, boolean]
  > => {
    const primaryCryptoManager = CryptoManager.getCryptoManager(
      primaryAccountAddressType
    );
    const primaryAddress = primaryCryptoManager.decodeAddress(_primaryAddress);
    const newCryptoManager = CryptoManager.getCryptoManager(
      newAccountAddressType
    );
    const newAddress = newCryptoManager.decodeAddress(_newAddress);

    const signatureFromPrimary = await signMessage(
      accountMessages.linkAccount(accountId, newAddress, isNewPrimary),
      primaryAccountPrivateKey
    );

    const signatureFromNewAddress = await signMessage(
      accountMessages.linkAccount(accountId, primaryAddress, isNewPrimary),
      newAccountPrivateKey
    );

    return [
      BuiltinGrammarPrefix.linkAddress,
      accountId,
      signatureFromPrimary,
      primaryAccountAddressType,
      newAddress,
      signatureFromNewAddress,
      newAccountAddressType,
      isNewPrimary,
    ];
  },
  unlinkSelf: async (
    accountId: number
  ): Promise<
    ["&unlinkAddress", number, string, number, string, number, string, number]
  > => {
    return [
      BuiltinGrammarPrefix.unlinkAddress,
      accountId,
      "",
      -1,
      "",
      -1,
      "",
      -1,
    ];
  },
  // TODO This should use the Wallet connector to sign the message
  unlinkAddress: async (
    primaryAccountPrivateKey: PrivateKey,
    primaryAccountAddressType: AddressType,
    accountId: number,
    _targetAddress: WalletAddress,
    targetAddressType: AddressType,
    _newPrimary: WalletAddress | null,
    newPrimaryType: AddressType | null
  ): Promise<
    ["&unlinkAddress", number, string, number, string, number, string, number]
  > => {
    const targetCryptoManager =
      CryptoManager.getCryptoManager(targetAddressType);
    const targetAddress = targetCryptoManager.decodeAddress(_targetAddress);
    let newPrimaryAddress: WalletAddress | null = null;
    if (_newPrimary && newPrimaryType !== null) {
      const newPrimaryCryptoManager =
        CryptoManager.getCryptoManager(newPrimaryType);
      newPrimaryAddress = newPrimaryCryptoManager.decodeAddress(_newPrimary);
    }
    const signatureFromPrimary = await signMessage(
      accountMessages.unlinkAccountWithPrimary(
        accountId,
        targetAddress,
        newPrimaryAddress
      ),
      primaryAccountPrivateKey
    );

    return [
      BuiltinGrammarPrefix.unlinkAddress,
      accountId,
      signatureFromPrimary,
      primaryAccountAddressType,
      targetAddress,
      targetAddressType,
      newPrimaryAddress ?? "",
      newPrimaryType ?? -1,
    ];
  },
};

// TODO Complete and use this implementation instead of the one above
// Partial implementation of account delegation
interface WalletInterface {
  provider: {
    getAddress: () => Promise<{ address: string; type: number }>;
    signMessage: (message: string) => Promise<string>;
  };
}

export const accountPayload_ = {
  createAccount: async () => {
    return [BuiltinGrammarPrefix.createAccount];
  },

  linkAddress: async (
    mainWallet: WalletInterface,
    secondaryWallet: WalletInterface,

    accountId: number,
    isNewPrimary: boolean
  ) => {
    const mainWalletAddress = await mainWallet.provider.getAddress();
    const secondaryWalletAddress = await secondaryWallet.provider.getAddress();

    const signatureFromMainWallet = await mainWallet.provider.signMessage(
      accountMessages.linkAccount(
        accountId,
        secondaryWalletAddress.address,
        isNewPrimary
      )
    );

    const signatureFromSecondaryWallet =
      await secondaryWallet.provider.signMessage(
        accountMessages.linkAccount(
          accountId,
          mainWalletAddress.address,
          isNewPrimary
        )
      );

    return [
      BuiltinGrammarPrefix.linkAddress,
      accountId,

      signatureFromMainWallet,
      mainWalletAddress.type,

      secondaryWalletAddress.address,
      signatureFromSecondaryWallet,
      secondaryWalletAddress.type,

      isNewPrimary,
    ];
  },

  unlinkSelf: async (
    accountId: number,
  ) => {
    return [BuiltinGrammarPrefix.unlinkAddress, accountId, "", -1, "", -1, "", -1];
  },

  unlinkAddress: async (
    primaryWallet: WalletInterface,
    targetWallet: WalletInterface,
    accountId: number,
    newPrimary: {
      address: WalletAddress,
      type: AddressType,
    } | null,
  ): Promise<['&unlinkAddress', number, string, number, string, number, string, number]> => {
    const mainAddress = await primaryWallet.provider.getAddress();
    const targetAddress = await targetWallet.provider.getAddress();

    const signatureFromPrimary = await primaryWallet.provider.signMessage(accountMessages.unlinkAccountWithPrimary(
      accountId,
      targetAddress.address,
      newPrimary?.address || null,
    ));

    return [
      BuiltinGrammarPrefix.unlinkAddress,
      accountId,
      signatureFromPrimary,
      mainAddress.type,
      targetAddress.address,
      targetAddress.type,
      newPrimary?.address || "",
      newPrimary?.type || -1,
    ];
  },
};
