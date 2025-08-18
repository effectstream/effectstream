export interface AccountState {
  accounts: {
    [accountId: number]: {
      primaryAddress: string | null;
      addresses: Set<string>;
    };
  };
  unlinkedAddresses: Set<string>; // Addresses that exist but have account_id = null
}

export interface SharedState {
  primitive_accounting_counter: number;
  paima_state_machine_counter: number;
  address_erc20_balances: Record<string, Record<string, bigint>>;
  address_erc721_ownership: Record<string, Record<string, string>>;
  account_state: AccountState;
}

export const newSharedState = (): SharedState => {
  return {
    primitive_accounting_counter: 0,
    paima_state_machine_counter: 0,
    address_erc20_balances: {
      // 31337: {
      //   [wallets[0].address]: 0n,
      //   [wallets[1].address]: 0n,
      // },
      // 31338: {
      //   [wallets[0].address]: 0n,
      //   [wallets[1].address]: 0n,
      // },
    },
    address_erc721_ownership: {
      // 31337: {},
      // 31338: {},
    },
    account_state: {
      accounts: {},
      unlinkedAddresses: new Set(),
    },
  };
};

export function addLinkedAddress(
  sharedState: SharedState,
  _address: string,
  isPrimary: boolean,
  accountId: number | null,
) {
  const address = _address.toLowerCase();
  // remove if unlinked
  if (sharedState.account_state.unlinkedAddresses.has(address)) {
    sharedState.account_state.unlinkedAddresses.delete(address);
  }
  // remove from other accounts
  for (const account of Object.values(sharedState.account_state.accounts)) {
    if (account.addresses.has(address)) {
      account.addresses.delete(address);
      if (account.primaryAddress === address) {
        account.primaryAddress = null;
      }
    }
  }

  if (accountId == null) {
    sharedState.account_state.unlinkedAddresses.add(address);
  } else {
    if (!sharedState.account_state.accounts[accountId]) {
      sharedState.account_state.accounts[accountId] = {
        primaryAddress: address.toLowerCase(),
        addresses: new Set([address.toLowerCase()]),
      };
    } else {
      if (isPrimary) {
        sharedState.account_state.accounts[accountId].primaryAddress = address;
      }
      sharedState.account_state.accounts[accountId].addresses.add(address);
    }
  }
}

export function updateERC20Balance(
  sharedState: SharedState,
  chainId: number,
  _address: string,
  amount: bigint,
) {
  const address = _address.toLowerCase();
  if (!sharedState.address_erc20_balances[String(chainId)]) {
    sharedState.address_erc20_balances[String(chainId)] = {};
  }
  if (!sharedState.address_erc20_balances[String(chainId)][address]) {
    sharedState.address_erc20_balances[String(chainId)][address] = 0n;
  }
  sharedState.address_erc20_balances[String(chainId)][address] += amount;
}

export function updateERC721Ownership(
  sharedState: SharedState,
  chainId: number,
  _address: string | null,
  tokenId: bigint,
) {
  if (!sharedState.address_erc721_ownership[String(chainId)]) {
    sharedState.address_erc721_ownership[String(chainId)] = {};
  }
  if (_address == null) {
    delete sharedState.address_erc721_ownership[String(chainId)][
      String(tokenId)
    ];
  } else {
    const address = _address.toLowerCase();

    sharedState.address_erc721_ownership[String(chainId)][String(tokenId)] =
      address;
  }
}
