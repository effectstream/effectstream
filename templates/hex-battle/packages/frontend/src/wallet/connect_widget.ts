// The single global wallet connector UI.
//
// Replaces the old per-screen `#wallet_selection` popup + the identity-in-URL
// dance. It renders ONE persistent "Connect Wallet" button (top-right, fixed,
// outside the canvas's #wrap so its `zoom` doesn't scale it) plus a connected
// address chip, and a modal offering two paths:
//   • Create browser wallet  → store.connectBrowserWallet() (random + funded)
//   • an installed wallet     → store.connectInjected(name)
//
// The connected wallet is held in wallet_store.ts; this widget only renders it
// and drives connect/disconnect. `ensureConnected()` is what lobby actions call
// before a write so the user gets prompted if they haven't connected yet.
import * as store from './wallet_store';
import {Name} from '@hex-battle/engine';

let modalEl: HTMLElement | null = null;
let pendingResolve: (() => void) | null = null;
let pendingReject: ((e: Error) => void) | null = null;

// Mount the persistent bar once (idempotent). Call from index.ts on boot.
export function mountConnectWidget(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('wallet-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'wallet-bar';
  bar.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:1000;display:flex;gap:8px;align-items:center;font-family:Electrolize,monospace;';
  bar.innerHTML = `
    <span data-testid="wallet-address" id="wallet-chip"
          style="display:none;color:#eafdff;background:rgba(16,24,34,0.6);border:1px solid rgba(120,210,235,0.28);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);padding:8px 12px;border-radius:10px;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,0.35);"></span>
    <button data-testid="connect-wallet" id="connect-wallet-btn"
            style="cursor:pointer;color:#eafdff;background:linear-gradient(180deg,rgba(56,208,230,0.4),rgba(34,176,204,0.26));border:1px solid rgba(120,224,240,0.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:8px 14px;border-radius:10px;font-size:14px;font-family:inherit;box-shadow:0 0 18px rgba(56,208,230,0.25);">
      Connect Wallet
    </button>`;
  document.body.appendChild(bar);
  bar.querySelector('#connect-wallet-btn')!.addEventListener('click', () => {
    if (store.isConnected()) {
      store.disconnect();
    } else {
      void openConnectModal().catch(() => {
        /* user cancelled */
      });
    }
  });
  store.subscribe(renderBar);
  renderBar();
}

function renderBar(): void {
  const chip = document.getElementById('wallet-chip');
  const btn = document.getElementById('connect-wallet-btn');
  if (!chip || !btn) return;
  const addr = store.getAddress();
  if (addr) {
    chip.style.display = '';
    chip.textContent = `${Name.generateName(addr)} (${Name.shortWallet(addr)})`;
    btn.textContent = 'Disconnect';
    (btn as HTMLElement).style.background =
      'linear-gradient(180deg,rgba(231,76,60,0.45),rgba(192,57,43,0.3))';
    (btn as HTMLElement).style.borderColor = 'rgba(231,120,110,0.5)';
    (btn as HTMLElement).style.boxShadow = '0 0 18px rgba(231,76,60,0.3)';
  } else {
    chip.style.display = 'none';
    chip.textContent = '';
    btn.textContent = 'Connect Wallet';
    (btn as HTMLElement).style.background =
      'linear-gradient(180deg,rgba(56,208,230,0.4),rgba(34,176,204,0.26))';
    (btn as HTMLElement).style.borderColor = 'rgba(120,224,240,0.5)';
    (btn as HTMLElement).style.boxShadow = '0 0 18px rgba(56,208,230,0.25)';
  }
}

// Resolve once a wallet is connected; if not, open the modal and resolve when
// the user connects (rejects if they cancel). Lobby actions await this.
export async function ensureConnected(): Promise<void> {
  if (store.isConnected()) return;
  await openConnectModal();
  if (!store.isConnected()) throw new Error('Wallet connection cancelled');
}

// Open the connect modal; resolves on a successful connect, rejects on cancel.
export function openConnectModal(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    void buildModal();
  });
}

function cancel(): void {
  const reject = pendingReject;
  closeModal();
  reject?.(new Error('Wallet connection cancelled'));
}

function succeed(): void {
  const resolve = pendingResolve;
  closeModal();
  resolve?.();
}

function setStatus(msg: string, isError = false): void {
  const el = modalEl?.querySelector('#wm-status') as HTMLElement | null;
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#e74c3c' : '#bdc3c7';
  el.style.display = msg ? '' : 'none';
}

async function buildModal(): Promise<void> {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'wallet-modal';
  overlay.setAttribute('data-testid', 'wallet-connect-modal');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1100;background:radial-gradient(circle at 50% 38%, rgba(12,20,30,0.5), rgba(4,8,12,0.78));-webkit-backdrop-filter:blur(9px) saturate(120%);backdrop-filter:blur(9px) saturate(120%);display:flex;align-items:center;justify-content:center;font-family:Electrolize,monospace;';
  const card = document.createElement('div');
  card.style.cssText =
    'background:linear-gradient(160deg, rgba(40,56,74,0.62), rgba(16,24,34,0.68));-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%);border:1px solid rgba(120,210,235,0.22);color:#e8f4f8;padding:24px;border-radius:18px;min-width:340px;max-width:90vw;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 70px rgba(0,0,0,0.55), 0 0 44px rgba(56,208,230,0.12);';
  card.innerHTML = `
    <div style="font-size:22px;margin-bottom:18px;text-align:center;letter-spacing:1px;text-transform:uppercase;color:#eafcff;text-shadow:0 0 14px rgba(56,208,230,0.45);padding-bottom:12px;border-bottom:1px solid rgba(56,208,230,0.35);">Connect Wallet</div>
    <button data-testid="create-browser-wallet" id="wm-create"
            style="display:block;width:100%;cursor:pointer;color:#eafdff;background:linear-gradient(180deg,rgba(56,208,230,0.32),rgba(34,176,204,0.2));border:1px solid rgba(120,224,240,0.5);padding:13px;border-radius:12px;font-size:16px;font-family:inherit;margin-bottom:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.18), 0 0 18px rgba(56,208,230,0.22);">
      🎲 Create browser wallet
    </button>
    <div style="font-size:13px;opacity:0.65;margin-bottom:8px;">or connect an installed wallet:</div>
    <div id="wm-injected" style="display:flex;flex-direction:column;gap:8px;">
      <div style="font-size:12px;opacity:0.5;">Scanning…</div>
    </div>
    <div id="wm-status" style="display:none;font-size:13px;margin-top:14px;text-align:center;"></div>
    <button data-testid="wallet-modal-cancel" id="wm-cancel"
            style="display:block;width:100%;cursor:pointer;color:#cfe7f0;background:rgba(255,255,255,0.07);border:1px solid rgba(180,210,225,0.25);padding:11px;border-radius:12px;font-size:14px;font-family:inherit;margin-top:16px;">
      Cancel
    </button>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  modalEl = overlay;

  const run = (p: Promise<unknown>): void => {
    p.then(succeed).catch((e: unknown) =>
      setStatus(String((e as Error)?.message ?? e), true)
    );
  };

  card.querySelector('#wm-create')!.addEventListener('click', () => {
    setStatus('Creating + funding wallet…');
    run(store.connectBrowserWallet());
  });
  card.querySelector('#wm-cancel')!.addEventListener('click', cancel);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) cancel();
  });

  // Populate discovered injected wallets.
  const list = card.querySelector('#wm-injected') as HTMLElement;
  const injected = await store.listInjected();
  if (modalEl !== overlay) return; // modal was closed while discovering
  if (injected.length === 0) {
    list.innerHTML =
      '<div style="font-size:12px;opacity:0.5;">No installed wallets detected.</div>';
    return;
  }
  list.innerHTML = '';
  for (const opt of injected) {
    const b = document.createElement('button');
    b.setAttribute('data-testid', `connect-injected-${opt.name}`);
    b.style.cssText =
      'display:flex;align-items:center;gap:10px;cursor:pointer;color:#eafdff;background:rgba(255,255,255,0.07);border:1px solid rgba(180,210,225,0.25);padding:10px;border-radius:12px;font-size:15px;font-family:inherit;';
    // DANGER: wallet icons may be SVG — only ever render via <img src>, never innerHTML.
    const icon = opt.icon
      ? `<img src="${opt.icon}" alt="" width="20" height="20" style="border-radius:4px;"/>`
      : '';
    const label = document.createElement('span');
    label.textContent = opt.displayName;
    b.innerHTML = icon;
    b.appendChild(label);
    b.addEventListener('click', () => {
      setStatus(`Connecting ${opt.displayName}…`);
      run(store.connectInjected(opt.name));
    });
    list.appendChild(b);
  }
}

function closeModal(): void {
  pendingResolve = null;
  pendingReject = null;
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
}
