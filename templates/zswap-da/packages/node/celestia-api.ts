import {
    CELESTIA_FEE,
    CELESTIA_GAS_LIMIT,
    CELESTIA_NAMESPACE,
    CELESTIA_RPC_URL,
  } from "./config.ts";
  
// ─── Celestia Submission Helper ───────────────────────────────────────────────

function namespaceToBase64(hex: string): string {
    const clean = hex.replace(/^0x/, "");
    const bytes = new Uint8Array(29); // 1-byte version prefix + 28-byte namespace ID
    const hexBytes = (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16));
    bytes.set(hexBytes, 29 - hexBytes.length);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  
export async function submitToCelestia(
    data: string,
  ): Promise<{ txhash: string; height: string } | null> {
    const ns64 = namespaceToBase64(CELESTIA_NAMESPACE);
    const b64 = btoa(unescape(encodeURIComponent(data)));
    try {
      const res = await fetch(CELESTIA_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "blob.Submit",
          params: [
            [{ namespace: ns64, data: b64, share_version: 0 }],
            { fee: CELESTIA_FEE, gasLimit: CELESTIA_GAS_LIMIT },
          ],
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json.result;
    } catch (e) {
      console.error("[Celestia submit error]", e);
      return null;
    }
  }