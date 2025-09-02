import type {
  IInjectedConnector,
  ActiveConnection,
  IProvider,
  AddressAndType,
  UserSignature,
  IConnector,
  ConnectionOption,
} from "../IProvider.ts";

// TODO: proper type definitions for MidnightApi
export type MidnightApi = any;

// TODO Implement this class
export class MidnightConnector implements IConnector<MidnightApi>, IInjectedConnector<MidnightApi> {
  private provider: MidnightProvider | undefined;
  private static INSTANCE: undefined | MidnightConnector = undefined;
  static instance(): MidnightConnector {
    if (MidnightConnector.INSTANCE == null) {
      const newInstance = new MidnightConnector();
      MidnightConnector.INSTANCE = newInstance;
    }
    return MidnightConnector.INSTANCE;
  }

  static getWalletOptions(): ConnectionOption<MidnightApi>[] {
    return [];
  }

  getOrThrowProvider = (): MidnightProvider => {
    if (this.provider == null) {
      throw new Error(`MidnightConnector provider isn't initialized yet`);
    }
    return this.provider;
  };
  getProvider = (): undefined | MidnightProvider => {
    return this.provider;
  };
  isConnected(): boolean {
    return this.provider != null;
  }

  connectSimple(): Promise<MidnightProvider> {
    throw new Error("Method not implemented.");
  }
  connectNamed(name: string): Promise<MidnightProvider> {
    throw new Error("Method not implemented.");
  }
  connectExternal(conn: ActiveConnection<MidnightApi>): Promise<MidnightProvider> {
    throw new Error("Method not implemented.");
  }

}

// TODO Implement this class
export class MidnightProvider implements IProvider<MidnightApi> {
  getConnection(): ActiveConnection<MidnightApi> {
    throw new Error("Method not implemented.");
  }
  signMessage(message: string): Promise<UserSignature> {
    throw new Error("Method not implemented.");
  }
  getAddress(): AddressAndType {
    throw new Error("Method not implemented.");
  }
}
