export interface CIP30Api {
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getBalance(): Promise<string>;
  getNetworkId(): Promise<number>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  submitTx(tx: string): Promise<string>;
}

export interface DetectedWallet {
  name: string;
  icon: string;
}

declare global {
  interface Window {
    cardano?: Record<
      string,
      | {
          name: string;
          icon: string;
          apiVersion: string;
          enable: () => Promise<CIP30Api>;
          isEnabled: () => Promise<boolean>;
        }
      | undefined
    >;
  }
}

const KNOWN_WALLETS = ["nami", "eternl", "lace", "flint", "yoroi", "gerowallet", "typhoncip30"];

export function detectWallets(): DetectedWallet[] {
  if (!window.cardano) return [];
  const wallets: DetectedWallet[] = [];
  for (const key of KNOWN_WALLETS) {
    const w = window.cardano[key];
    if (w && typeof w.enable === "function") {
      wallets.push({ name: w.name || key, icon: w.icon || "" });
    }
  }
  return wallets;
}

export async function connectExtension(
  walletKey: string,
): Promise<{ api: CIP30Api; address: string }> {
  const w = window.cardano?.[walletKey];
  if (!w) throw new Error(`Wallet "${walletKey}" not found`);
  const api = await w.enable();
  const addresses = await api.getUsedAddresses();
  const address = addresses[0] || (await api.getUnusedAddresses())[0];
  if (!address) throw new Error("No address found in wallet");
  return { api, address };
}
