import {
  type CircuitContext,
  type CoinPublicKey,
  type ContractState,
  constructorContext,
  emptyZswapLocalState,
  QueryContext,
} from '@midnight-ntwrk/compact-runtime';
import { sampleContractAddress } from '@midnight-ntwrk/zswap';
import {
  type ContractAddress,
  type Either,
  type Ledger,
  ledger,
  Contract as MockAccessControl,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockAccessControl/contract/index.cjs'; // Combined imports
import {
  type AccessControlPrivateState,
  AccessControlWitnesses,
} from '../../witnesses/AccessControlWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of a AccessControl contract for testing purposes.
 * @template P - The private state type, fixed to AccessControlPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class AccessControlSimulator
  implements IContractSimulator<AccessControlPrivateState, Ledger>
{
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockAccessControl<AccessControlPrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<AccessControlPrivateState>;

  /**
   * @description Initializes the mock contract.
   */
  constructor() {
    this.contract = new MockAccessControl<AccessControlPrivateState>(
      AccessControlWitnesses,
    );
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(constructorContext({}, '0'.repeat(64)));
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      originalState: currentContractState,
      transactionContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
    this.contractAddress = this.circuitContext.transactionContext.address;
  }

  /**
   * @description Retrieves the current public ledger state of the contract.
   * @returns The ledger state as defined by the contract.
   */
  public getPublicState(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  /**
   * @description Retrieves the current private state of the contract.
   * @returns The private state of type AccessControlPrivateState.
   */
  public getPrivateState(): AccessControlPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /**
   * @description Retrieves the current contract state.
   * @returns The contract state object.
   */
  public getContractState(): ContractState {
    return this.circuitContext.originalState;
  }

  /**
   * @description Retrieves an account's permission for `roleId`.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   * @returns Whether an account has a specified role.
   */
  public hasRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    return this.contract.impureCircuits.hasRole(
      this.circuitContext,
      roleId,
      account,
    ).result;
  }

  /**
   * @description Retrieves an account's permission for `roleId`.
   * @param caller - Optional. Sets the caller context if provided.
   * @param roleId - The role identifier.
   */
  public assertOnlyRole(roleId: Uint8Array, caller?: CoinPublicKey) {
    const res = this.contract.impureCircuits.assertOnlyRole(
      {
        ...this.circuitContext,
        currentZswapLocalState: caller
          ? emptyZswapLocalState(caller)
          : this.circuitContext.currentZswapLocalState,
      },
      roleId,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Retrieves an account's permission for `roleId`.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public _checkRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
  ) {
    this.circuitContext = this.contract.impureCircuits._checkRole(
      this.circuitContext,
      roleId,
      account,
    ).context;
  }

  /**
   * @description Retrieves `roleId`'s admin identifier.
   * @param roleId - The role identifier.
   * @returns The admin identifier for `roleId`.
   */
  public getRoleAdmin(roleId: Uint8Array): Uint8Array {
    return this.contract.impureCircuits.getRoleAdmin(
      this.circuitContext,
      roleId,
    ).result;
  }

  /**
   * @description Grants an account permissions to use `roleId`.
   * @param caller - Optional. Sets the caller context if provided.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public grantRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    caller?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits.grantRole(
      {
        ...this.circuitContext,
        currentZswapLocalState: caller
          ? emptyZswapLocalState(caller)
          : this.circuitContext.currentZswapLocalState,
      },
      roleId,
      account,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Revokes an account's permission to use `roleId`.
   * @param caller - Optional. Sets the caller context if provided.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public revokeRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    caller?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits.revokeRole(
      {
        ...this.circuitContext,
        currentZswapLocalState: caller
          ? emptyZswapLocalState(caller)
          : this.circuitContext.currentZswapLocalState,
      },
      roleId,
      account,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Revokes `roleId` from the calling account.
   * @param caller - Optional. Sets the caller context if provided.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public renounceRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    caller?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits.renounceRole(
      {
        ...this.circuitContext,
        currentZswapLocalState: caller
          ? emptyZswapLocalState(caller)
          : this.circuitContext.currentZswapLocalState,
      },
      roleId,
      account,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Sets the admin identifier for `roleId`.
   * @param roleId - The role identifier.
   * @param adminId - The admin role identifier.
   */
  public _setRoleAdmin(roleId: Uint8Array, adminId: Uint8Array) {
    this.circuitContext = this.contract.impureCircuits._setRoleAdmin(
      this.circuitContext,
      roleId,
      adminId,
    ).context;
  }

  /**
   * @description Grants an account permissions to use `roleId`. Internal function without access restriction.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public _grantRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    const res = this.contract.impureCircuits._grantRole(
      this.circuitContext,
      roleId,
      account,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  /**
   * @description Grants an account permissions to use `roleId`. Internal function without access restriction.
   * DOES NOT restrict sending to a ContractAddress.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public _unsafeGrantRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    const res = this.contract.impureCircuits._unsafeGrantRole(
      this.circuitContext,
      roleId,
      account,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  /**
   * @description Revokes an account's permission to use `roleId`. Internal function without access restriction.
   * @param roleId - The role identifier.
   * @param account - A ZswapCoinPublicKey or a ContractAddress.
   */
  public _revokeRole(
    roleId: Uint8Array,
    account: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    const res = this.contract.impureCircuits._revokeRole(
      this.circuitContext,
      roleId,
      account,
    );

    this.circuitContext = res.context;
    return res.result;
  }
}
