import type {
  MidnightV2ProtocolTypes,
  MidnightV2ProviderConfig,
  MidnightV2Providers,
} from '../chains/midnight-contracts-v2/src/index.js';
import type {
  AuthenticatedCallTree,
  FinalizedBlockPin,
} from '../chains/midnight-contracts-v2/src/call-tree-loader.js';

const config = {
  networkId: 'stagenet',
  nodeUrl: 'wss://rpc.stagenet.shielded.tools',
  indexerHttpUrl: 'https://indexer.stagenet.shielded.tools/api/v4/graphql',
  indexerWsUrl: 'wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws',
  proofServerUrl: 'http://proof-server-experimental:6300',
} as const satisfies MidnightV2ProviderConfig;

const providerKeys = [
  'privateStateProvider',
  'publicDataProvider',
  'zkConfigProvider',
  'proofProvider',
  'walletProvider',
  'midnightProvider',
] as const satisfies readonly (keyof MidnightV2Providers)[];

type ProtocolTypesArePublicImports = MidnightV2ProtocolTypes;
type CallTreeUsesPinnedBlock = AuthenticatedCallTree['stateQueries'][string]['block'] extends FinalizedBlockPin
  ? true
  : false;

export { config, providerKeys };
export type { CallTreeUsesPinnedBlock, ProtocolTypesArePublicImports };
