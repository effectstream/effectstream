import type {
  MidnightProvider,
  PrivateStateProvider,
  ProofProvider,
  PublicDataProvider,
  WalletProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js-types';
import type { ContractState } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { StateValue } from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';

export type MidnightV2ProviderConfig = Readonly<{
  networkId: 'stagenet';
  nodeUrl: string;
  indexerHttpUrl: string;
  indexerWsUrl: string;
  proofServerUrl: string;
}>;

export type MidnightV2Providers<PSI extends string = string> = Readonly<{
  privateStateProvider: PrivateStateProvider<PSI>;
  publicDataProvider: PublicDataProvider;
  zkConfigProvider: ZKConfigProvider<string>;
  proofProvider: ProofProvider;
  walletProvider: WalletProvider;
  midnightProvider: MidnightProvider;
}>;

export type MidnightV2ProtocolTypes = Readonly<{
  contractState: ContractState;
  stateValue: StateValue;
}>;

export declare function constructV2Providers<PSI extends string = string>(
  config: MidnightV2ProviderConfig,
  factories: Readonly<{
    [K in keyof MidnightV2Providers<PSI>]: (config: MidnightV2ProviderConfig) => MidnightV2Providers<PSI>[K];
  }>,
): MidnightV2Providers<PSI>;

export declare function validateProviderConfig(config: unknown): MidnightV2ProviderConfig;
