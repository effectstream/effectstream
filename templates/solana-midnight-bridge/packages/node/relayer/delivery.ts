// Delivery into contracts for this node (plan 00058 Interfaces D-1, D-7):
//
//   BRIDGE_DELIVERY_ADAPTERS            comma list of adapters; `passport` is the only one. Empty
//                                       (the default): every lock to a contract is
//                                       undeliverable(no-adapter), and nothing is signed for it.
//   PASSPORT_BUNDLE_DIR                 the Passport bundle (default: the delivery-passport
//                                       package's bundle/account, filled by
//                                       `bun run delivery:import-bundle <key-volume>/account`).
//                                       It must stay inside the delivery-passport package, where
//                                       the compiled account module resolves the 0.20 runtime.
//   BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS  how long a missing contract is retried before it is
//                                       undeliverable(not-a-contract) (default 600000).
//
// The router's signer is the ONLY code that signs a mint for a contract recipient: it runs after an
// adapter said `deliverable`, and the adapter receives the signed arguments, never the key.
// The delivery wallet (`delivery` role: <secrets>/midnight-delivery.seed live, dev seed 0x…03
// locally) pays for the composed transactions; it is built on the first delivery.
import { randomBytes } from "node:crypto";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { DeliveryRouter, DEFAULT_NOT_FOUND_GRACE_MS, type DeliveryAdapterInfo, type MintToSign, type SignedMint } from "@solana-midnight-bridge/delivery";
import { DEFAULT_BUNDLE_DIR, loadPin, PassportAdapter } from "@solana-midnight-bridge/delivery-passport";
import { passportSdk, passportSeal } from "@solana-midnight-bridge/delivery-passport/sdk";
import { MANAGED_DIR } from "@solana-midnight-bridge/contracts-midnight/contract";
import { bridgeProviders, compiledBridgeContract } from "@solana-midnight-bridge/contracts-midnight/client";
import { hexToBytes, signMint } from "@solana-midnight-bridge/contracts-midnight/signing";
import { buildBridgeWallet, resolveSeed } from "@solana-midnight-bridge/contracts-midnight/wallets";
import type { Recognised } from "../api.ts";
import type { BridgeNodeSettings } from "../config.ts";
import { loadRelayerKeys } from "./keys.ts";

export const KNOWN_ADAPTERS = ["passport"] as const;
export type AdapterName = (typeof KNOWN_ADAPTERS)[number];

export type DeliveryConfig = { adapters: AdapterName[]; bundleDir: string; graceMs: number };

export function deliveryConfig(env: Record<string, string | undefined> = process.env): DeliveryConfig {
  const names = (env.BRIDGE_DELIVERY_ADAPTERS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const n of names) {
    if (!(KNOWN_ADAPTERS as readonly string[]).includes(n)) {
      throw new Error(`BRIDGE_DELIVERY_ADAPTERS: unknown adapter "${n}" (known: ${KNOWN_ADAPTERS.join(", ")})`);
    }
  }
  const grace = env.BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS?.trim();
  const graceMs = grace ? Number(grace) : DEFAULT_NOT_FOUND_GRACE_MS;
  if (!Number.isInteger(graceMs) || graceMs < 0) throw new Error("BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS must be a non-negative integer");
  return { adapters: [...new Set(names)] as AdapterName[], bundleDir: env.PASSPORT_BUNDLE_DIR?.trim() || DEFAULT_BUNDLE_DIR, graceMs };
}

/** The deployment record's `delivery.adapters` for a configuration (no init needed). */
export function deliveryInfos(c: DeliveryConfig): DeliveryAdapterInfo[] {
  return c.adapters.map((a) => {
    const pin = loadPin();
    return { id: "passport-ed25519", keySet: pin.keySet, passportCommit: pin.passportCommit } satisfies DeliveryAdapterInfo;
  });
}

/** The router's signer: `mintFromSolana` for `right(contract)` with the operator's Solana key. */
export function operatorMintSigner(
  operatorSecretKey: Uint8Array,
  addrs: { contractAddress: string; networkTag: string },
): (m: MintToSign) => SignedMint {
  return (m) => {
    if (m.recipient.is_left !== false) throw new Error("the delivery signer only signs contract recipients");
    const mintNonce = new Uint8Array(randomBytes(32));
    const { sig } = signMint(operatorSecretKey, {
      contractAddress: hexToBytes(addrs.contractAddress, 32, "contract address"),
      networkTag: hexToBytes(addrs.networkTag, 32, "network tag"),
      lockNonce: m.lockNonce,
      recipient: m.recipient,
      amount: m.amount,
    });
    return { lockNonce: m.lockNonce, amount: m.amount, recipient: m.recipient, mintNonce, sig };
  };
}

export type NodeDelivery = {
  router: DeliveryRouter;
  /** For GET /recipients/contract/:address (read-only). */
  recognise: (address: string) => Promise<Recognised>;
  infos: DeliveryAdapterInfo[];
};

/** Maps a router decision to the API's answer. */
export async function recogniseForApi(router: DeliveryRouter, address: string): Promise<Recognised> {
  const d = await router.recognise(address);
  if (d.kind === "deliverable") return { verdict: "deliverable", adapter: d.adapter.id, code: null, message: null };
  if (d.kind === "undeliverable") return { verdict: "undeliverable", adapter: null, code: d.code, message: d.message };
  return { verdict: "retry", adapter: null, code: null, message: d.message };
}

/** Builds and initialises the configured adapters; throws (the node refuses to start) on failure. */
export async function createDelivery(s: BridgeNodeSettings, c: DeliveryConfig = deliveryConfig()): Promise<NodeDelivery> {
  const keys = loadRelayerKeys(s);
  const urls = s.midnightUrls;
  const adapters = [];
  for (const name of c.adapters) {
    if (name === "passport") {
      const adapter = new PassportAdapter({
        pin: loadPin(),
        bundleDir: c.bundleDir,
        networkId: urls.id,
        bridge: { address: s.midnight.contractAddress, colour: s.midnight.tokenColor, managedDir: MANAGED_DIR },
        publicData: indexerPublicDataProvider(urls.indexer, urls.indexerWS) as never,
        environment: async () => {
          const seed = resolveSeed(s.mode === "local" ? "local" : "stagenet", "delivery", urls);
          const w = await buildBridgeWallet(urls, seed);
          return { bridgeProviders: await bridgeProviders(w, urls, `bridge-delivery-${urls.id}`), bridgeCompiled: compiledBridgeContract() };
        },
        sdk: passportSdk(),
        seal: passportSeal,
        contractProofServer: urls.contractProofServer,
      });
      await adapter.init();
      adapters.push(adapter);
    }
  }
  const router = new DeliveryRouter(adapters, {
    signMint: operatorMintSigner(keys.solanaOperator.secretKey, { contractAddress: s.midnight.contractAddress, networkTag: s.midnight.networkTag }),
    graceMs: c.graceMs,
  });
  console.log(`[delivery] adapters: ${adapters.length ? adapters.map((a) => a.id).join(", ") : "none (every contract recipient is undeliverable: no-adapter)"}`);
  return { router, recognise: (a) => recogniseForApi(router, a), infos: router.infos() };
}
