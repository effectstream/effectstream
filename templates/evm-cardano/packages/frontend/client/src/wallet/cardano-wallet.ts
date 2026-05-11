export interface CardanoWalletInfo {
  address: string;
  balance_lovelace: string;
}

let walletInfo: CardanoWalletInfo | null = null;

export async function connectCardanoWallet(): Promise<CardanoWalletInfo> {
  if (walletInfo) return walletInfo;

  const res = await fetch("/cardano/connect", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Connection failed" }));
    throw new Error(err.error);
  }
  walletInfo = await res.json();
  return walletInfo!;
}

export async function faucetTopup(amount: number): Promise<{ txHash: string }> {
  const res = await fetch("/cardano/faucet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Faucet failed" }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function sendAda(
  to: string,
  amount: number,
): Promise<{ txHash: string }> {
  const res = await fetch("/cardano/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Send failed" }));
    throw new Error(err.error);
  }
  return res.json();
}

export function getCardanoAddress(): string | null {
  return walletInfo?.address ?? null;
}
