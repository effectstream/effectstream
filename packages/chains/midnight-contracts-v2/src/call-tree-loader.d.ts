import type {
  PublicDataProvider,
  ZKConfigProvider,
  ZKConfigRegistry,
} from '@midnight-ntwrk/midnight-js-types';

export type ImplementationBinding = Readonly<{
  name: string;
  address: string;
  artifactPath: string;
  compilerManifestSha256: string;
  verifierKeys: Readonly<Record<string, string>>;
}>;

export type FinalizedBlockPin = Readonly<{ hash: string; height: number }>;

export type PinnedStateQuery = Readonly<{
  contractName: string;
  address: string;
  block: FinalizedBlockPin;
  read(publicDataProvider: PublicDataProvider): ReturnType<PublicDataProvider['queryContractState']>;
}>;

export type AuthenticatedCallTree = Readonly<{
  compilationOrder: readonly string[];
  managedRoot: string;
  manifestHash: string;
  leafProviders: readonly ZKConfigProvider<string>[];
  registry: ZKConfigRegistry;
  registryRoot: string;
  zkConfigs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  stateQueries: Readonly<Record<string, PinnedStateQuery>>;
}>;

export declare function loadAuthenticatedCallTree(options: Readonly<{
  managedRoot: string;
  manifestPath: string;
  expectedCallTreeManifestHash: string;
  implementations: readonly ImplementationBinding[];
  expectedAddresses: Readonly<Record<string, string>>;
  blockPin: FinalizedBlockPin;
  providerFactory?: (directory: string, integrity: Readonly<Record<string, unknown>>) => ZKConfigProvider<string>;
  registryFactory?: (managedRoot: string) => Promise<ZKConfigRegistry>;
}>): Promise<AuthenticatedCallTree>;

export declare function createPinnedStateQuery(
  contractName: string,
  address: string,
  blockPin: FinalizedBlockPin,
): PinnedStateQuery;
