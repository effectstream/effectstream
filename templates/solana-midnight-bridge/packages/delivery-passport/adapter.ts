// The Passport delivery adapter (plan 00058 Interfaces D-1, D-3–D-5): the first
// ContractDeliveryAdapter. It recognises Passport accounts of the pinned key set and delivers a
// bridge mint into one with `deposit_shielded`, in the same transaction as the mint.
//
// It never holds the operator key: the router hands it an already signed mint. It proves the
// account's `deposit_shielded` only with the imported bundle, checked against the pin at `init`
// (a mismatch → the node refuses to start, FR-006). The delivery wallet that pays (Q1 A) is built
// on first use and reused.
import path from "node:path";
import type {
  ContractDeliveryAdapter,
  DeliveryAdapterInfo,
  DeliveryHooks,
  DeliveryResult,
  Recognition,
  SignedMint,
} from "@solana-midnight-bridge/delivery";
import { verifyBundle } from "./bundle.ts";
import { adapterIdFor, type PassportPin } from "./pin.ts";
import { compareVerifierKeys, decodeAccountView, operationDigests, passportRules, type AccountLedgerLike } from "./recognise.ts";
import { deliverComposed, type ComposeDeps } from "./compose.ts";

/** What composing a delivery needs from the node (built once, lazily: the delivery wallet). */
export type DeliveryEnvironment = {
  /** Providers of the delivery wallet for the bridge's call (zk config: the bridge's managed/). */
  bridgeProviders: any;
  /** The bridge's compiled contract (midnight-js CompiledContract). */
  bridgeCompiled: unknown;
};

export type PassportAdapterConfig = {
  pin: PassportPin;
  bundleDir: string;
  networkId: string;
  bridge: { address: string; colour: string; managedDir: string };
  /** The bridge's indexer (read-only; recognition needs no wallet). */
  publicData: { queryContractState(address: string): Promise<any> };
  /** The delivery wallet's environment, built on first delivery. */
  environment: () => Promise<DeliveryEnvironment>;
  /** midnight-js pieces (injected so the adapter stays testable). */
  sdk: Omit<ComposeDeps, "seal"> & {
    CompiledContract: any;
    NodeZkConfigProvider: new (dir: string) => unknown;
    ZKConfigRegistry: new (sources: unknown[]) => unknown;
    httpClientProofProvider: (url: string, registry: unknown) => unknown;
  };
  seal: ComposeDeps["seal"];
  contractProofServer: string;
  log?: (m: string) => void;
};

type AccountModule = { Contract: new (w: unknown) => { provableCircuits: Record<string, unknown> }; ledger: (d: unknown) => AccountLedgerLike };

export class PassportAdapter implements ContractDeliveryAdapter {
  readonly id: string;
  readonly info: DeliveryAdapterInfo;
  private account: AccountModule | null = null;
  private compiledAccount: unknown = null;
  private env: Promise<DeliveryEnvironment & { accountProviders: any; submitProviders: any }> | null = null;

  constructor(private readonly cfg: PassportAdapterConfig) {
    this.id = adapterIdFor(cfg.pin);
    this.info = { id: "passport-ed25519", keySet: cfg.pin.keySet, passportCommit: cfg.pin.passportCommit };
  }

  private log(m: string) {
    (this.cfg.log ?? ((x) => console.log(`[delivery ${this.id}] ${x}`)))(m);
  }

  /** FR-006: the bundle is the pin's, and its account module loads and carries deposit_shielded. */
  async init(): Promise<void> {
    const v = verifyBundle(this.cfg.bundleDir, this.cfg.pin);
    const mod = (await import(path.join(this.cfg.bundleDir, "contract/index.js"))) as AccountModule;
    if (typeof mod.Contract !== "function" || typeof mod.ledger !== "function") {
      throw new Error(`the bundle's account module at ${this.cfg.bundleDir} has no Contract/ledger`);
    }
    const stub = { held_coin: () => { throw new Error("held_coin is never called by deposit_shielded"); } };
    if (!("deposit_shielded" in new mod.Contract(stub).provableCircuits)) throw new Error("the bundle's account has no deposit_shielded circuit");
    this.account = mod;
    // The account restricted to the circuit the bundle carries keys for (00058 G-COMPOSE F-G2).
    const Base = mod.Contract;
    class DepositOnlyAccount extends Base {
      constructor(...a: unknown[]) {
        super(a[0]);
        for (const id of Object.keys(this.provableCircuits)) if (id !== "deposit_shielded") delete this.provableCircuits[id];
      }
    }
    const { CompiledContract } = this.cfg.sdk;
    this.compiledAccount = CompiledContract.make("account", DepositOnlyAccount as never).pipe(
      CompiledContract.withWitnesses(stub as never),
      CompiledContract.withCompiledFileAssets(this.cfg.bundleDir),
    );
    this.log(`bundle verified (${v.files} files, key set ${this.cfg.pin.keySet.slice(0, 8)}, passport ${this.cfg.pin.passportCommit.slice(0, 7)})`);
  }

  async recognise(contract: string): Promise<Recognition> {
    if (!this.account) throw new Error("the Passport adapter is not initialised");
    let state: any;
    try {
      state = await this.cfg.publicData.queryContractState(contract);
    } catch (e) {
      return { verdict: "retry", message: `the indexer did not answer: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!state) return { verdict: "retry", message: `no contract state at ${contract} on ${this.cfg.networkId} (not indexed yet, or not a contract)`, missing: true };
    // Rule 2 first, so a contract of another kind is reported with its circuits' differences.
    const keys = compareVerifierKeys(operationDigests(state), this.cfg.pin.circuits);
    const view = keys.equal ? decodeAccountView(state, this.account.ledger) : null;
    if (keys.equal && !view) return { verdict: "not-mine", detail: "its state does not decode as a Passport account ledger" };
    if (!view) {
      const parts = [
        keys.different.length ? `different: ${keys.different.join(", ")}` : "",
        keys.missing.length ? `missing: ${keys.missing.join(", ")}` : "",
        keys.extra.length ? `extra: ${keys.extra.join(", ")}` : "",
      ].filter(Boolean);
      return { verdict: "not-mine", detail: `not a Passport account of key set ${this.cfg.pin.keySet.slice(0, 8)} (${parts.join("; ")})` };
    }
    return passportRules(view, this.cfg.pin, this.cfg.networkId);
  }

  private environment() {
    this.env ??= (async () => {
      const e = await this.cfg.environment();
      const s = this.cfg.sdk;
      const accountProviders = { ...e.bridgeProviders, zkConfigProvider: new s.NodeZkConfigProvider(this.cfg.bundleDir) };
      const registry = new s.ZKConfigRegistry([new s.NodeZkConfigProvider(this.cfg.bridge.managedDir), new s.NodeZkConfigProvider(this.cfg.bundleDir)]);
      const submitProviders = { ...e.bridgeProviders, proofProvider: s.httpClientProofProvider(this.cfg.contractProofServer, registry) };
      return { ...e, accountProviders, submitProviders };
    })().catch((err) => {
      this.env = null; // rebuild on the next attempt
      throw err;
    });
    return this.env;
  }

  async deliver(contract: string, mint: SignedMint, hooks?: DeliveryHooks): Promise<DeliveryResult> {
    if (!this.account || !this.compiledAccount) throw new Error("the Passport adapter is not initialised");
    const env = await this.environment();
    const ledger = this.account.ledger;
    return deliverComposed({ ...this.cfg.sdk, seal: this.cfg.seal }, {
      networkId: this.cfg.networkId,
      bridge: { address: this.cfg.bridge.address, compiled: env.bridgeCompiled, colour: this.cfg.bridge.colour },
      account: { address: contract, compiled: this.compiledAccount, readEncKey: (st) => Uint8Array.from(ledger(st.data).enc_key) },
      mint,
      providers: { bridge: env.bridgeProviders, account: env.accountProviders, submit: env.submitProviders, publicData: this.cfg.publicData },
      hooks,
    });
  }
}
