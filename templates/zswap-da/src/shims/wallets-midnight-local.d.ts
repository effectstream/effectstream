// Loose type shim for @effectstream/wallets' JS-wallet subpath.
// The package ships raw .ts that the app's strict tsc (erasableSyntaxOnly) can't
// type-check; tsc resolves this shim via tsconfig `paths`, while Vite bundles the
// real `@effectstream/wallets/midnight-local` module at build time.

export interface MidnightLocalNetworkUrls {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  id?: string;
}

export interface MidnightLocalConnectArgs {
  seed?: string;
  networkId: string;
  networkUrls?: MidnightLocalNetworkUrls;
  syncMode?: 'all' | 'dust-only';
}

export interface MidnightLocalConnection {
  api: any;
  metadata: { name: string; displayName?: string; icon?: string };
}

export interface MidnightLocalProvider {
  getConnection(): MidnightLocalConnection;
  getAddress(): { type: string; address: string };
  getUnshieldedKeystore(): unknown;
}

export declare class MidnightLocalConnector {
  static instance(): {
    connectFromSeed(args: MidnightLocalConnectArgs): Promise<MidnightLocalProvider>;
  };
}
