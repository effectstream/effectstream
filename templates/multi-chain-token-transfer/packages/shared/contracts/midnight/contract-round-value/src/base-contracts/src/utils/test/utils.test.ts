import { describe, expect, it } from 'vitest';
import { UtilsSimulator } from './simulators/UtilsSimulator.js';
import * as contractUtils from './utils/address.js';

const Z_SOME_KEY = contractUtils.createEitherTestUser('SOME_KEY');
const Z_OTHER_KEY = contractUtils.createEitherTestUser('OTHER_KEY');
const SOME_CONTRACT =
  contractUtils.createEitherTestContractAddress('SOME_CONTRACT');
const OTHER_CONTRACT =
  contractUtils.createEitherTestContractAddress('OTHER_CONTRACT');

const EMPTY_STRING = '';

let contract: UtilsSimulator;

describe('Utils', () => {
  contract = new UtilsSimulator();

  describe('isKeyOrAddressZero', () => {
    it('should return zero for the zero address', () => {
      expect(contract.isKeyOrAddressZero(contractUtils.ZERO_KEY)).toBe(true);
      expect(contract.isKeyOrAddressZero(contractUtils.ZERO_ADDRESS)).toBe(
        true,
      );
    });

    it('should not return zero for nonzero addresses', () => {
      expect(contract.isKeyOrAddressZero(Z_SOME_KEY)).toBe(false);
      expect(contract.isKeyOrAddressZero(SOME_CONTRACT)).toBe(false);
    });
  });

  describe('isKeyOrAddressEqual', () => {
    it('should return true for two matching pubkeys', () => {
      expect(contract.isKeyOrAddressEqual(Z_SOME_KEY, Z_SOME_KEY)).toBe(true);
    });

    it('should return true for two matching contract addresses', () => {
      expect(contract.isKeyOrAddressEqual(SOME_CONTRACT, SOME_CONTRACT)).toBe(
        true,
      );
    });

    it('should return false for two different pubkeys', () => {
      expect(contract.isKeyOrAddressEqual(Z_SOME_KEY, Z_OTHER_KEY)).toBe(false);
    });

    it('should return false for two different contract addresses', () => {
      expect(contract.isKeyOrAddressEqual(SOME_CONTRACT, OTHER_CONTRACT)).toBe(
        false,
      );
    });

    it('should return false for two different address types', () => {
      expect(contract.isKeyOrAddressEqual(Z_SOME_KEY, SOME_CONTRACT)).toBe(
        false,
      );
    });

    it('should return false for two different address types of equal value', () => {
      expect(
        contract.isKeyOrAddressEqual(
          contractUtils.ZERO_KEY,
          contractUtils.ZERO_ADDRESS,
        ),
      ).toBe(false);
    });
  });

  describe('isKeyZero', () => {
    it('should return zero for the zero address', () => {
      expect(contract.isKeyZero(contractUtils.ZERO_KEY.left)).toBe(true);
    });

    it('should not return zero for nonzero addresses', () => {
      expect(contract.isKeyZero(Z_SOME_KEY.left)).toBe(false);
    });
  });

  describe('isContractAddress', () => {
    it('should return true if ContractAddress', () => {
      expect(contract.isContractAddress(SOME_CONTRACT)).toBe(true);
    });

    it('should return false ZswapCoinPublicKey', () => {
      expect(contract.isContractAddress(Z_SOME_KEY)).toBe(false);
    });
  });

  describe('emptyString', () => {
    it('should return the empty string', () => {
      expect(contract.emptyString()).toBe(EMPTY_STRING);
    });
  });
});
