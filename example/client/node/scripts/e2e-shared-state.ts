import { wallets } from "./e2e-contracts.ts";

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
  address_erc20_balances: Record<"a" | "b", Record<string, bigint>>;
  address_erc721_ownership: Record<"a" | "b", Record<string, string>>;
  account_state: AccountState;
}

export const newSharedState = (): SharedState => {
  return {
    primitive_accounting_counter: 0,
    paima_state_machine_counter: 0,
    address_erc20_balances: {
      a: {
        [wallets[0].address]: 0n,
        [wallets[1].address]: 0n,
      },
      b: {
        [wallets[0].address]: 0n,
        [wallets[1].address]: 0n,
      },
    },
    address_erc721_ownership: {
      a: {},
      b: {},
    },
    account_state: {
      accounts: {},
      unlinkedAddresses: new Set(),
    },
  };
};
