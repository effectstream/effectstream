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

function showSigningPopup(message: string): HTMLElement {
  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:10001",
    "display:flex", "align-items:center", "justify-content:center",
    "background:rgba(0,0,0,0.72)",
    "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif",
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "background:#13151e",
    "border:1px solid #2a2f3a",
    "border-radius:16px",
    "padding:28px 32px",
    "width:min(400px,92vw)",
    "box-shadow:0 12px 48px rgba(0,0,0,0.7)",
    "color:#e8eaed",
  ].join(";");

  // Header row
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:20px;";

  const icon = document.createElement("span");
  icon.textContent = "🔏";
  icon.style.cssText = "font-size:22px;line-height:1;";

  const title = document.createElement("span");
  title.textContent = "Signature Request";
  title.style.cssText = "font-size:17px;font-weight:600;letter-spacing:-0.01em;";

  const badge = document.createElement("span");
  badge.textContent = "Social / Biometric";
  badge.style.cssText = [
    "margin-left:auto",
    "background:#0e4c6e",
    "color:#67d4f8",
    "font-size:11px",
    "font-weight:600",
    "padding:3px 9px",
    "border-radius:20px",
    "letter-spacing:0.03em",
  ].join(";");

  header.append(icon, title, badge);

  // Message box
  const label = document.createElement("div");
  label.textContent = "Message to sign";
  label.style.cssText = "font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280;margin-bottom:6px;";

  const msgBox = document.createElement("div");
  // Show first 120 chars of the message — these are batcher messages, not human-readable prose
  const preview = message.length > 120 ? message.slice(0, 120) + "…" : message;
  msgBox.textContent = preview;
  msgBox.style.cssText = [
    "background:#0d0f16",
    "border:1px solid #1f2535",
    "border-radius:8px",
    "padding:10px 12px",
    "font-size:11px",
    "font-family:ui-monospace,SFMono-Regular,monospace",
    "color:#94a3b8",
    "word-break:break-all",
    "line-height:1.55",
    "max-height:80px",
    "overflow-y:auto",
    "margin-bottom:20px",
  ].join(";");

  // Status row
  const status = document.createElement("div");
  status.style.cssText = "display:flex;align-items:center;gap:10px;";

  const spinner = document.createElement("div");
  spinner.style.cssText = [
    "width:18px", "height:18px",
    "border:2px solid #1e3a5f",
    "border-top-color:#06b6d4",
    "border-radius:50%",
    "animation:spin 0.8s linear infinite",
    "flex-shrink:0",
  ].join(";");

  // Inject keyframes once
  if (!document.getElementById("_spin_kf")) {
    const style = document.createElement("style");
    style.id = "_spin_kf";
    style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }

  const statusText = document.createElement("span");
  statusText.textContent = "Confirm with your biometric or passkey…";
  statusText.style.cssText = "font-size:13px;color:#9ca3af;";

  status.append(spinner, statusText);
  card.append(header, label, msgBox, status);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
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
    const MIN_DISPLAY_MS = 1_400; // keep popup visible long enough for users to see it
    const popup = showSigningPopup(message);
    const shownAt = Date.now();

    return new Promise<string>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      let result: { sig?: string; err?: string } | null = null;

      const finish = (sig?: string, err?: string) => {
        clearTimeout(timeout);
        window.removeEventListener("message", handler);
        const elapsed = Date.now() - shownAt;
        const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
        setTimeout(() => {
          popup.remove();
          if (sig !== undefined) resolve(sig);
          else reject(new Error(err ?? "sign-error"));
        }, delay);
      };

      const timeout = setTimeout(() => finish(undefined, "Social wallet sign timed out (2 min)"), 120_000);

      const handler = (event: MessageEvent) => {
        if (event.origin !== this.iframeOrigin) return;
        const data = event.data as WalletMsg | undefined;
        if (!data || data.source !== SOURCE_WALLET || data.requestId !== requestId) return;
        if (data.type === "signed") {
          finish((data.payload as any).signature as string);
        } else {
          finish(undefined, (data.payload as any)?.message ?? "sign-error");
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
