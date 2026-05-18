import { BATCHER_SUBMIT_URL } from "./env.ts";

const CELESTIA_TARGET = "celestia";
// AddressType.NONE — Celestia submissions have no user signer.
const ADDRESS_TYPE_NONE = -1;

interface SendInputResponse {
  success?: boolean;
  message?: string;
  error?: string;
  transactionHash?: string;
  rollup?: number;
}

export interface CelestiaSubmitResult {
  txhash: string;
  height: string;
}

export async function submitBlobViaBatcher(
  blob: string,
): Promise<CelestiaSubmitResult> {
  const body = {
    data: {
      address: "celestia",
      addressType: ADDRESS_TYPE_NONE,
      input: blob,
      signature: "",
      timestamp: String(Date.now()),
      target: CELESTIA_TARGET,
    },
    confirmationLevel: "wait-receipt",
  };

  const resp = await fetch(`${BATCHER_SUBMIT_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await resp.json()) as SendInputResponse;
  if (!resp.ok || !json.success) {
    const reason = json.error ?? json.message ?? `HTTP ${resp.status}`;
    throw new Error(`Failed to submit blob to Celestia via batcher: ${reason}`);
  }

  return {
    txhash: json.transactionHash ?? "",
    height: json.rollup !== undefined ? String(json.rollup) : "",
  };
}
