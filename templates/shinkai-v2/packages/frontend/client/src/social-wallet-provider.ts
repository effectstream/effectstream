import { getAddressType, WalletMode } from "@effectstream/wallets";
import type { IProvider, AddressAndType, WalletOption } from "@effectstream/wallets";
import type { Wallet } from "@effectstream/wallets";

type ActiveConnection<T> = { metadata: WalletOption; api: T };

const SOCIAL_WALLET_URL = import.meta.env.VITE_SOCIAL_WALLET_URL ?? "https://wallet.zkdojo.com/embed/";

const SOURCE_WALLET = "login-2of3:wallet";
const SOURCE_DAPP = "login-2of3:dapp";
const PROTO_VERSION = 1;

interface WalletMsg {
  source: string;
  version?: number;
  type: string;
  payload?: Record<string, unknown>;
  requestId?: string;
}

class SocialProvider implements IProvider<Window> {
  constructor(
    private readonly evmAddress: string,
    private readonly iframeEl: HTMLIFrameElement,
    private readonly iframeOrigin: string,
  ) {}

  getConnection(): ActiveConnection<Window> {
    return {
      metadata: { name: "social", displayName: "Social / Biometric" },
      api: this.iframeEl.contentWindow!,
    };
  }

  getAddress(): AddressAndType {
    return { type: getAddressType(WalletMode.EvmInjected), address: this.evmAddress };
  }

  signMessage(message: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const requestId = crypto.randomUUID();

      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Social wallet sign timed out (2 min)"));
      }, 120_000);

      const handler = (event: MessageEvent) => {
        if (event.origin !== this.iframeOrigin) return;
        const data = event.data as WalletMsg | undefined;
        if (!data || data.source !== SOURCE_WALLET || data.requestId !== requestId) return;
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        if (data.type === "signed") {
          resolve((data.payload as any).signature as string);
        } else {
          reject(new Error((data.payload as any)?.message ?? "sign-error"));
        }
      };

      window.addEventListener("message", handler);

      this.iframeEl.contentWindow!.postMessage(
        {
          source: SOURCE_DAPP,
          version: PROTO_VERSION,
          type: "signMessage",
          payload: { chain: "evm", message },
          requestId,
        },
        this.iframeOrigin,
      );
    });
  }
}

// Show the social wallet iframe in a modal overlay, wait for `authenticated`,
// then shrink the iframe to invisible (so the session stays alive for signing).
export async function connectSocialWallet(): Promise<Wallet> {
  const iframeOrigin = new URL(SOCIAL_WALLET_URL).origin;

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.75);";

  // Iframe — lives directly in <body> so it survives overlay removal
  const iframe = document.createElement("iframe");
  iframe.src = SOCIAL_WALLET_URL;
  iframe.allow = "publickey-credentials-get *";
  iframe.style.cssText = [
    "position:fixed",
    "top:50%",
    "left:50%",
    "transform:translate(-50%,-50%)",
    "width:min(420px,96vw)",
    "height:min(620px,90vh)",
    "z-index:9999",
    "border:none",
    "border-radius:14px",
    "box-shadow:0 8px 40px rgba(0,0,0,0.6)",
  ].join(";");

  // Close button (cancel)
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = [
    "position:fixed",
    "z-index:10000",
    "top:calc(50% - min(310px,45vh) - 40px)",
    "right:calc(50% - min(210px,48vw))",
    "background:rgba(255,255,255,0.15)",
    "border:none",
    "color:#fff",
    "font-size:18px",
    "width:32px",
    "height:32px",
    "border-radius:50%",
    "cursor:pointer",
    "line-height:1",
  ].join(";");

  document.body.appendChild(backdrop);
  document.body.appendChild(iframe);
  document.body.appendChild(closeBtn);

  const cleanup = () => {
    backdrop.remove();
    closeBtn.remove();
    // Collapse iframe to 0 so the session stays alive but is invisible
    iframe.style.cssText =
      "position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;top:0;left:0;";
  };

  return new Promise<Wallet>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== iframeOrigin) return;
      const data = event.data as WalletMsg | undefined;
      if (!data || data.source !== SOURCE_WALLET) return;

      if (data.type === "authenticated") {
        const addresses = (data.payload as any)?.addresses;
        const evmAddress = addresses?.evm?.address as string | undefined;
        if (!evmAddress) {
          window.removeEventListener("message", handler);
          cleanup();
          iframe.remove();
          reject(new Error("Social wallet: no EVM address in authenticated message"));
          return;
        }
        window.removeEventListener("message", handler);
        cleanup();

        const provider = new SocialProvider(evmAddress, iframe, iframeOrigin);
        resolve({
          provider,
          walletAddress: evmAddress as any,
          metadata: { name: "social", displayName: "Social / Biometric" },
        });
      } else if (data.type === "error") {
        window.removeEventListener("message", handler);
        cleanup();
        iframe.remove();
        reject(new Error((data.payload as any)?.message ?? "Social wallet error"));
      }
    };

    window.addEventListener("message", handler);

    closeBtn.onclick = () => {
      window.removeEventListener("message", handler);
      cleanup();
      iframe.remove();
      reject(new Error("Social wallet connection cancelled"));
    };
  });
}
