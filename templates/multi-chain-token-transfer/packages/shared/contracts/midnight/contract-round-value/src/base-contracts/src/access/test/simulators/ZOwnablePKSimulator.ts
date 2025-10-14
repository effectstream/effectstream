import {
  type CircuitContext,
  type CoinPublicKey,
  emptyZswapLocalState,
} from '@midnight-ntwrk/compact-runtime';
import { sampleContractAddress } from '@midnight-ntwrk/zswap';
import {
  type ContractAddress,
  type Either,
  type Ledger,
  ledger,
  Contract as MockOwnable,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockZOwnablePK/contract/index.cjs';
import {
  ZOwnablePKPrivateState,
  ZOwnablePKWitnesses,
} from '../../witnesses/ZOwnablePKWitnesses.js';
import type {
  ContextlessCircuits,
  ExtractImpureCircuits,
  ExtractPureCircuits,
  SimulatorOptions,
} from '../types/test.js';
import { AbstractContractSimulator } from '../utils/AbstractContractSimulator.js';
import { SimulatorStateManager } from '../utils/SimualatorStateManager.js';

type OwnableSimOptions = SimulatorOptions<
  ZOwnablePKPrivateState,
  typeof ZOwnablePKWitnesses
>;

/**
 * @description A simulator implementation of a contract for testing purposes.
 * @template P - The private state type, fixed to ZOwnablePKPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class ZOwnablePKSimulator extends AbstractContractSimulator<
  ZOwnablePKPrivateState,
  Ledger
> {
  contract: MockOwnable<ZOwnablePKPrivateState>;
  readonly contractAddress: string;
  private stateManager: SimulatorStateManager<ZOwnablePKPrivateState>;
  private callerOverride: CoinPublicKey | null = null;
  private _witnesses: ReturnType<typeof ZOwnablePKWitnesses>;

  private _pureCircuitProxy?: ContextlessCircuits<
    ExtractPureCircuits<MockOwnable<ZOwnablePKPrivateState>>,
    ZOwnablePKPrivateState
  >;

  private _impureCircuitProxy?: ContextlessCircuits<
    ExtractImpureCircuits<MockOwnable<ZOwnablePKPrivateState>>,
    ZOwnablePKPrivateState
  >;

  constructor(
    initOwner: Uint8Array,
    instanceSalt: Uint8Array,
    isInit: boolean,
    options: OwnableSimOptions = {},
  ) {
    super();

    // Setup initial state
    const {
      privateState = ZOwnablePKPrivateState.generate(),
      witnesses = ZOwnablePKWitnesses(),
      coinPK = '0'.repeat(64),
      address = sampleContractAddress(),
    } = options;
    const constructorArgs = [initOwner, instanceSalt, isInit];

    this.contract = new MockOwnable<ZOwnablePKPrivateState>(witnesses);

    this.stateManager = new SimulatorStateManager(
      this.contract,
      privateState,
      coinPK,
      address,
      ...constructorArgs,
    );
    this.contractAddress = this.circuitContext.transactionContext.address;
    this._witnesses = witnesses;
    this.contract = new MockOwnable<ZOwnablePKPrivateState>(this._witnesses);
  }

  get circuitContext() {
    return this.stateManager.getContext();
  }

  set circuitContext(ctx) {
    this.stateManager.setContext(ctx);
  }

  getPublicState(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  /**
   * @description Constructs a caller-specific circuit context.
   * If a caller override is present, it replaces the current Zswap local state with an empty one
   * scoped to the overridden caller. Otherwise, the existing context is reused as-is.
   * @returns A circuit context adjusted for the current simulated caller.
   */
  protected getCallerContext(): CircuitContext<ZOwnablePKPrivateState> {
    return {
      ...this.circuitContext,
      currentZswapLocalState: this.callerOverride
        ? emptyZswapLocalState(this.callerOverride)
        : this.circuitContext.currentZswapLocalState,
    };
  }

  /**
   * @description Initializes and returns a proxy to pure contract circuits.
   * The proxy automatically injects the current circuit context into each call,
   * and returns only the result portion of each circuit's output.
   * @notice The proxy is created only when first accessed a.k.a lazy initialization.
   * This approach is efficient in cases where only pure or only impure circuits are used,
   * avoiding unnecessary proxy creation.
   * @returns A proxy object exposing pure circuit functions without requiring explicit context.
   */
  protected get pureCircuit(): ContextlessCircuits<
    ExtractPureCircuits<MockOwnable<ZOwnablePKPrivateState>>,
    ZOwnablePKPrivateState
  > {
    if (!this._pureCircuitProxy) {
      this._pureCircuitProxy = this.createPureCircuitProxy<
        MockOwnable<ZOwnablePKPrivateState>['circuits']
      >(this.contract.circuits, () => this.circuitContext);
    }
    return this._pureCircuitProxy;
  }

  /**
   * @description Initializes and returns a proxy to impure contract circuits.
   * The proxy automatically injects the current (possibly caller-modified) context into each call,
   * and updates the circuit context with the one returned by the circuit after execution.
   * @notice The proxy is created only when first accessed a.k.a. lazy initialization.
   * This approach is efficient in cases where only pure or only impure circuits are used,
   * avoiding unnecessary proxy creation.
   * @returns A proxy object exposing impure circuit functions without requiring explicit context management.
   */
  protected get impureCircuit(): ContextlessCircuits<
    ExtractImpureCircuits<MockOwnable<ZOwnablePKPrivateState>>,
    ZOwnablePKPrivateState
  > {
    if (!this._impureCircuitProxy) {
      this._impureCircuitProxy = this.createImpureCircuitProxy<
        MockOwnable<ZOwnablePKPrivateState>['impureCircuits']
      >(
        this.contract.impureCircuits,
        () => this.getCallerContext(),
        (ctx: any) => {
          this.circuitContext = ctx;
        },
      );
    }
    return this._impureCircuitProxy;
  }

  /**
   * @description Resets the cached circuit proxy instances.
   * This is useful if the underlying contract state or circuit context has changed,
   * and you want to ensure the proxies are recreated with updated context on next access.
   */
  public resetCircuitProxies(): void {
    this._pureCircuitProxy = undefined;
    this._impureCircuitProxy = undefined;
  }

  /**
   * @description Helper method that provides access to both pure and impure circuit proxies.
   * These proxies automatically inject the appropriate circuit context when invoked.
   * @returns An object containing `pure` and `impure` circuit proxy interfaces.
   */
  public get circuits() {
    return {
      pure: this.pureCircuit,
      impure: this.impureCircuit,
    };
  }

  public get witnesses(): ReturnType<typeof ZOwnablePKWitnesses> {
    return this._witnesses;
  }

  public set witnesses(newWitnesses: ReturnType<typeof ZOwnablePKWitnesses>) {
    this._witnesses = newWitnesses;
    this.contract = new MockOwnable<ZOwnablePKPrivateState>(this._witnesses);
  }

  public overrideWitness<K extends keyof typeof this._witnesses>(
    key: K,
    fn: (typeof this._witnesses)[K],
  ) {
    this.witnesses = {
      ...this._witnesses,
      [key]: fn,
    };
  }

  /**
   * @description Returns the current commitment representing the contract owner.
   * The full commitment is: `SHA256(SHA256(pk, nonce), instanceSalt, counter, domain)`.
   * @returns The current owner's commitment.
   */
  public owner(): Uint8Array {
    return this.circuits.impure.owner();
  }

  /**
   * @description Transfers ownership to `newOwnerId`.
   * `newOwnerId` must be precalculated and given to the current owner off chain.
   * @param newOwnerId The new owner's unique identifier (`SHA256(pk, nonce)`).
   */
  public transferOwnership(newOwnerId: Uint8Array) {
    this.circuits.impure.transferOwnership(newOwnerId);
  }

  /**
   * @description Leaves the contract without an owner.
   * It will not be possible to call `assertOnlyOnwer` circuits anymore.
   * Can only be called by the current owner.
   */
  public renounceOwnership() {
    this.circuits.impure.renounceOwnership();
  }

  /**
   * @description Throws if called by any account whose id hash `SHA256(pk, nonce)` does not match
   * the stored owner commitment. Use this to only allow the owner to call specific circuits.
   */
  public assertOnlyOwner() {
    this.circuits.impure.assertOnlyOwner();
  }

  /**
   * @description Computes the owner commitment from the given `id` and `counter`.
   * @param id - The unique identifier of the owner calculated by `SHA256(pk, nonce)`.
   * @param counter - The current counter or round. This increments by `1`
   * after every transfer to prevent duplicate commitments given the same `id`.
   * @returns The commitment derived from `id` and `counter`.
   */
  public _computeOwnerCommitment(id: Uint8Array, counter: bigint): Uint8Array {
    return this.circuits.impure._computeOwnerCommitment(id, counter);
  }

  /**
   * @description Computes the unique identifier (`id`) of the owner from their
   * public key and a secret nonce.
   * @param pk - The public key of the identity being committed.
   * @param nonce - A private nonce to scope the commitment.
   * @returns The computed owner ID.
   */
  public _computeOwnerId(
    pk: Either<ZswapCoinPublicKey, ContractAddress>,
    nonce: Uint8Array,
  ): Uint8Array {
    return this.circuits.pure._computeOwnerId(pk, nonce);
  }

  /**
   * @description Transfers ownership to owner id `newOwnerId` without
   * enforcing permission checks on the caller.
   * @param newOwnerId - The unique identifier of the new owner calculated by `SHA256(pk, nonce)`.
   */
  public _transferOwnership(newOwnerId: Uint8Array) {
    this.circuits.impure._transferOwnership(newOwnerId);
  }

  public readonly privateState = {
    /**
     * @description Contextually sets a new nonce into the private state.
     * @param newNonce The secret nonce.
     * @returns The ZOwnablePK private state after setting the new nonce.
     */
    injectSecretNonce: (
      newNonce: Buffer<ArrayBufferLike>,
    ): ZOwnablePKPrivateState => {
      const currentState = this.stateManager.getContext().currentPrivateState;
      const updatedState = { ...currentState, secretNonce: newNonce };
      this.stateManager.updatePrivateState(updatedState);
      return updatedState;
    },

    /**
     * @description Returns the secret nonce given the context.
     * @returns The secret nonce.
     */
    getCurrentSecretNonce: (): Uint8Array => {
      return this.stateManager.getContext().currentPrivateState.secretNonce;
    },
  };

  public callerCtx = {
    /**
     * @description Sets the caller context.
     * @param caller The caller in context of the proceeding circuit calls.
     */
    setCaller: (caller: CoinPublicKey) => {
      this.callerOverride = caller;
    },
  };
}
