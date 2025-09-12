import {
  BuiltinGrammar,
  BuiltinGrammarPrefix,
  KeyedBuiltinGrammar,
  parseStmInput,
} from "@paima/concise";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import {
AddressType,
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
  createAccount: async (): Promise<['&createAccount']> => {
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
    isNewPrimary: boolean,
  ): Promise<['&linkAddress', number, string, number, string, string, number, boolean]> => {
    
    // TODO Unify for any wallet type.
    let primaryAddress: WalletAddress;
    switch (primaryAccountAddressType) {
      case AddressType.EVM:
        primaryAddress = Value.Decode(TypeboxHelpers.Evm.Address, _primaryAddress);
        break;
      default:
        throw new Error("NYI: Primary account address type is not EVM");
    }

    let newAddress: WalletAddress;
    switch (newAccountAddressType) {
      case AddressType.EVM:
        newAddress = Value.Decode(TypeboxHelpers.Evm.Address, _newAddress);
        break;
      default:
        throw new Error("NYI: New account address type is not EVM");
    }    

    const signatureFromPrimary = await signMessage(
      accountMessages.linkAccount(
        accountId,
        newAddress,
        isNewPrimary,
      ),
      primaryAccountPrivateKey,
    );

    const signatureFromNewAddress = await signMessage(
      accountMessages.linkAccount(
        accountId,
        primaryAddress,
        isNewPrimary,
      ),
      newAccountPrivateKey,
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
    accountId: number,
  ): Promise<['&unlinkAddress', number, string, number, string, number, string, number]> => {
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
    newPrimaryType: AddressType | null,
  ): Promise<['&unlinkAddress', number, string, number, string, number, string, number]> => {
    // TODO Unify for any wallet type.
    let targetAddress: WalletAddress;
    switch (targetAddressType) {
      case AddressType.EVM:
        targetAddress = Value.Decode(TypeboxHelpers.Evm.Address, _targetAddress);
        break;
      default:
        throw new Error("NYI: Target address type is not EVM");
    }
    let newPrimary: WalletAddress | null = null;
    if (_newPrimary) {
      switch (newPrimaryType) {
        case AddressType.EVM:
          newPrimary = Value.Decode(TypeboxHelpers.Evm.Address, _newPrimary);
          break;
        default:
          throw new Error("NYI: New primary address type is not EVM");
      }
    }
    
    const signatureFromPrimary = await signMessage(
      accountMessages.unlinkAccountWithPrimary(
        accountId,
        targetAddress,
        newPrimary,
      ),
      primaryAccountPrivateKey,
    );

    return [
      BuiltinGrammarPrefix.unlinkAddress,
      accountId,
      signatureFromPrimary,
      primaryAccountAddressType,
      targetAddress,
      targetAddressType,
      newPrimary ?? "",
      newPrimaryType ?? -1,
    ];
  },
};
