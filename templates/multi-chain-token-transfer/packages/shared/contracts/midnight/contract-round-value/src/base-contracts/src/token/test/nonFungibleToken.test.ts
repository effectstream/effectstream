import type { CoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { NonFungibleTokenSimulator } from './simulators/NonFungibleTokenSimulator.js';
import {
  createEitherTestContractAddress,
  createEitherTestUser,
  toHexPadded,
  ZERO_ADDRESS,
  ZERO_KEY,
} from './utils/address.js';

// Contract Metadata
const NAME = 'NAME';
const SYMBOL = 'SYMBOL';
const EMPTY_STRING = '';
const INIT = true;
const BAD_INIT = false;

// Token Metadata
const TOKENID_1: bigint = BigInt(1);
const TOKENID_2: bigint = BigInt(2);
const TOKENID_3: bigint = BigInt(3);
const NON_EXISTENT_TOKEN: bigint = BigInt(0xdead);
const SOME_URI = 'https://openzeppelin.example';
const EMPTY_URI = '';
const AMOUNT: bigint = BigInt(1);

// Callers
const OWNER = toHexPadded('OWNER');
const SPENDER = toHexPadded('SPENDER');
const UNAUTHORIZED = toHexPadded('UNAUTHORIZED');

// Encoded PK/Addresses
const Z_OWNER = createEitherTestUser('OWNER');
const Z_SPENDER = createEitherTestUser('SPENDER');
const Z_RECIPIENT = createEitherTestUser('RECIPIENT');
const Z_OTHER = createEitherTestUser('OTHER');
const Z_UNAUTHORIZED = createEitherTestUser('UNAUTHORIZED');
const SOME_CONTRACT = createEitherTestContractAddress('CONTRACT');

let token: NonFungibleTokenSimulator;
let _caller: CoinPublicKey;

describe('NonFungibleToken', () => {
  describe('initializer and metadata', () => {
    it('should initialize metadata', () => {
      token = new NonFungibleTokenSimulator(NAME, SYMBOL, INIT);

      expect(token.name()).toEqual(NAME);
      expect(token.symbol()).toEqual(SYMBOL);
    });

    it('should initialize empty metadata', () => {
      token = new NonFungibleTokenSimulator(EMPTY_STRING, EMPTY_STRING, INIT);

      expect(token.name()).toEqual(EMPTY_STRING);
      expect(token.symbol()).toEqual(EMPTY_STRING);
    });

    it('should initialize metadata with whitespace', () => {
      token = new NonFungibleTokenSimulator('  NAME  ', '  SYMBOL  ', INIT);
      expect(token.name()).toEqual('  NAME  ');
      expect(token.symbol()).toEqual('  SYMBOL  ');
    });

    it('should initialize metadata with special characters', () => {
      token = new NonFungibleTokenSimulator('NAME!@#', 'SYMBOL$%^', INIT);
      expect(token.name()).toEqual('NAME!@#');
      expect(token.symbol()).toEqual('SYMBOL$%^');
    });

    it('should initialize metadata with very long strings', () => {
      const longName = 'A'.repeat(1000);
      const longSymbol = 'B'.repeat(1000);
      token = new NonFungibleTokenSimulator(longName, longSymbol, INIT);
      expect(token.name()).toEqual(longName);
      expect(token.symbol()).toEqual(longSymbol);
    });
  });

  beforeEach(() => {
    token = new NonFungibleTokenSimulator(NAME, SYMBOL, INIT);
  });

  describe('balanceOf', () => {
    it('should return zero when requested account has no balance', () => {
      expect(token.balanceOf(Z_OWNER)).toEqual(0n);
    });

    it('should return balance when requested account has tokens', () => {
      token._mint(Z_OWNER, AMOUNT);
      expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);
    });

    it('should return correct balance for multiple tokens', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);
      expect(token.balanceOf(Z_OWNER)).toEqual(3n);
    });

    it('should return correct balance after burning multiple tokens', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);
      token._burn(TOKENID_1);
      token._burn(TOKENID_2);
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);
    });

    it('should return correct balance after transferring multiple tokens', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);
      token._transfer(Z_OWNER, Z_RECIPIENT, TOKENID_1);
      token._transfer(Z_OWNER, Z_RECIPIENT, TOKENID_2);
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);
      expect(token.balanceOf(Z_RECIPIENT)).toEqual(2n);
    });
  });

  describe('ownerOf', () => {
    it('should throw if token does not exist', () => {
      expect(() => {
        token.ownerOf(NON_EXISTENT_TOKEN);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should throw if token has been burned', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._burn(TOKENID_1);
      expect(() => {
        token.ownerOf(TOKENID_1);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should return owner of token if it exists', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);
    });

    it('should return correct owner for multiple tokens', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);
      expect(token.ownerOf(TOKENID_2)).toEqual(Z_OWNER);
      expect(token.ownerOf(TOKENID_3)).toEqual(Z_OWNER);
    });

    it('should return correct owner after multiple transfers', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._mint(Z_OWNER, TOKENID_2);
      token._transfer(Z_OWNER, Z_SPENDER, TOKENID_1);
      token._transfer(Z_OWNER, Z_OTHER, TOKENID_2);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
      expect(token.ownerOf(TOKENID_2)).toEqual(Z_OTHER);
    });

    it('should return correct owner after multiple burns and mints', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._burn(TOKENID_1);
      token._mint(Z_SPENDER, TOKENID_1);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });
  });

  describe('tokenURI', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should throw if token does not exist', () => {
      expect(() => {
        token.tokenURI(NON_EXISTENT_TOKEN);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should return the empty string for an unset tokenURI', () => {
      expect(token.tokenURI(TOKENID_1)).toEqual(EMPTY_URI);
    });

    it('should return the empty string if tokenURI set as default value', () => {
      token._setTokenURI(TOKENID_1, EMPTY_URI);
      expect(token.tokenURI(TOKENID_1)).toEqual(EMPTY_URI);
    });

    it('should return some string if tokenURI is set', () => {
      token._setTokenURI(TOKENID_1, SOME_URI);
      expect(token.tokenURI(TOKENID_1)).toEqual(SOME_URI);
    });

    it('should return very long tokenURI', () => {
      const longURI = 'A'.repeat(1000);
      token._setTokenURI(TOKENID_1, longURI);
      expect(token.tokenURI(TOKENID_1)).toEqual(longURI);
    });

    it('should return tokenURI with special characters', () => {
      const specialURI = '!@#$%^&*()_+';
      token._setTokenURI(TOKENID_1, specialURI);
      expect(token.tokenURI(TOKENID_1)).toEqual(specialURI);
    });

    it('should update tokenURI multiple times', () => {
      token._setTokenURI(TOKENID_1, 'URI1');
      token._setTokenURI(TOKENID_1, 'URI2');
      token._setTokenURI(TOKENID_1, 'URI3');
      expect(token.tokenURI(TOKENID_1)).toEqual('URI3');
    });

    it('should maintain tokenURI after token transfer', () => {
      token._setTokenURI(TOKENID_1, SOME_URI);
      token._transfer(Z_OWNER, Z_RECIPIENT, TOKENID_1);
      expect(token.tokenURI(TOKENID_1)).toEqual(SOME_URI);
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });

    it('should throw if not owner', () => {
      _caller = UNAUTHORIZED;
      expect(() => {
        token.approve(Z_SPENDER, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Invalid Approver');
    });

    it('should approve spender', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should allow operator to approve', () => {
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      _caller = SPENDER;
      token.approve(Z_OTHER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_OTHER);
    });

    it('spender approved for only TOKENID_1 should not be able to approve', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);

      _caller = SPENDER;
      expect(() => {
        token.approve(Z_OTHER, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Invalid Approver');
    });

    it('should approve same address multiple times', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should approve after token transfer', () => {
      _caller = OWNER;
      token._transfer(Z_OWNER, Z_SPENDER, TOKENID_1);

      _caller = SPENDER;
      token.approve(Z_OTHER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_OTHER);
    });

    it('should approve after token burn and remint', () => {
      _caller = OWNER;
      token._burn(TOKENID_1);
      token._mint(Z_OWNER, TOKENID_1);
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should approve with very long token ID', () => {
      _caller = OWNER;
      const longTokenId = BigInt('18446744073709551615');
      token._mint(Z_OWNER, longTokenId);
      token.approve(Z_SPENDER, longTokenId, _caller);
      expect(token.getApproved(longTokenId)).toEqual(Z_SPENDER);
    });
  });

  describe('getApproved', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should throw if token does not exist', () => {
      expect(() => {
        token.getApproved(NON_EXISTENT_TOKEN);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should throw if token has been burned', () => {
      token._burn(TOKENID_1);
      expect(() => {
        token.getApproved(TOKENID_1);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should get current approved spender', () => {
      _caller = OWNER;
      token.approve(Z_OWNER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_OWNER);
    });

    it('should return zero key if approval not set', () => {
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });
  });

  describe('setApprovalForAll', () => {
    it('should not approve zero address', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      expect(() => {
        token.setApprovalForAll(ZERO_KEY, true, _caller);
      }).toThrow('NonFungibleToken: Invalid Operator');
    });

    it('should set operator', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);

      token.setApprovalForAll(Z_SPENDER, true, OWNER);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);
    });

    it('should allow operator to manage owner tokens', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, _caller);

      _caller = SPENDER;
      token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);

      token.approve(Z_OTHER, TOKENID_2, _caller);
      expect(token.getApproved(TOKENID_2)).toEqual(Z_OTHER);

      token.approve(Z_SPENDER, TOKENID_3, _caller);
      expect(token.getApproved(TOKENID_3)).toEqual(Z_SPENDER);
    });

    it('should revoke approval for all', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);

      token.setApprovalForAll(Z_SPENDER, false, _caller);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(false);

      _caller = SPENDER;
      expect(() => {
        token.approve(Z_SPENDER, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Invalid Approver');
    });

    it('should set approval for all to same address multiple times', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);
    });

    it('should set approval for all after token transfer', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token._transfer(Z_OWNER, Z_SPENDER, TOKENID_1);

      _caller = SPENDER;
      token.setApprovalForAll(Z_OTHER, true, _caller);
      expect(token.isApprovedForAll(Z_SPENDER, Z_OTHER)).toBe(true);
    });

    it('should set approval for all with multiple operators', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      token.setApprovalForAll(Z_OTHER, true, _caller);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);
      expect(token.isApprovedForAll(Z_OWNER, Z_OTHER)).toBe(true);
    });

    it('should set approval for all with very long token IDs', () => {
      _caller = OWNER;
      const longTokenId = BigInt('18446744073709551615');
      token._mint(Z_OWNER, longTokenId);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);
    });
  });

  describe('isApprovedForAll', () => {
    it('should return false if approval not set', () => {
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(false);
    });

    it('should return true if approval set', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.setApprovalForAll(Z_SPENDER, true, OWNER);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);
    });
  });

  describe('transferFrom', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should not transfer to ContractAddress', () => {
      expect(() => {
        token.transferFrom(Z_OWNER, SOME_CONTRACT, TOKENID_1);
      }).toThrow('NonFungibleToken: Unsafe Transfer');
    });

    it('should not transfer to zero address', () => {
      expect(() => {
        token.transferFrom(Z_OWNER, ZERO_KEY, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');
    });

    it('should not transfer from zero address', () => {
      expect(() => {
        token.transferFrom(ZERO_KEY, Z_SPENDER, TOKENID_1);
      }).toThrow('NonFungibleToken: Incorrect Owner');
    });

    it('should not transfer from unauthorized', () => {
      _caller = UNAUTHORIZED;
      expect(() => {
        token.transferFrom(Z_OWNER, Z_UNAUTHORIZED, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Insufficient Approval');
    });

    it('should not transfer token that has not been minted', () => {
      _caller = OWNER;
      expect(() => {
        token.transferFrom(Z_OWNER, Z_SPENDER, NON_EXISTENT_TOKEN, _caller);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should transfer token without approvers or operators', () => {
      _caller = OWNER;
      token.transferFrom(Z_OWNER, Z_RECIPIENT, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_RECIPIENT);
    });

    it('should transfer token via approved operator', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, OWNER);

      _caller = SPENDER;
      token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should transfer token via approvedForAll operator', () => {
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, OWNER);

      _caller = SPENDER;
      token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should allow transfer to same address', () => {
      _caller = OWNER;
      token._approve(Z_SPENDER, TOKENID_1, Z_OWNER);
      token._setApprovalForAll(Z_OWNER, Z_SPENDER, true);

      expect(() => {
        token.transferFrom(Z_OWNER, Z_OWNER, TOKENID_1, _caller);
      }).not.toThrow();
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
      expect(token._isAuthorized(Z_OWNER, Z_SPENDER, TOKENID_1)).toEqual(true);
    });

    it('should not transfer after approval revocation', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token.approve(ZERO_KEY, TOKENID_1, _caller);

      _caller = SPENDER;
      expect(() => {
        token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Insufficient Approval');
    });

    it('should not transfer after approval for all revocation', () => {
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      token.setApprovalForAll(Z_SPENDER, false, _caller);

      _caller = SPENDER;
      expect(() => {
        token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Insufficient Approval');
    });

    it('should transfer multiple tokens in sequence', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);

      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token.approve(Z_SPENDER, TOKENID_2, _caller);
      token.approve(Z_SPENDER, TOKENID_3, _caller);

      _caller = SPENDER;
      token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_2, _caller);
      token.transferFrom(Z_OWNER, Z_SPENDER, TOKENID_3, _caller);

      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
      expect(token.ownerOf(TOKENID_2)).toEqual(Z_SPENDER);
      expect(token.ownerOf(TOKENID_3)).toEqual(Z_SPENDER);
    });

    it('should transfer with very long token IDs', () => {
      _caller = OWNER;
      const longTokenId = BigInt('18446744073709551615');
      token._mint(Z_OWNER, longTokenId);
      token.approve(Z_SPENDER, longTokenId, _caller);

      _caller = SPENDER;
      token.transferFrom(Z_OWNER, Z_SPENDER, longTokenId, _caller);
      expect(token.ownerOf(longTokenId)).toEqual(Z_SPENDER);
    });

    it('should revoke approval after transferFrom', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token._setApprovalForAll(Z_OWNER, Z_SPENDER, true);

      token.transferFrom(Z_OWNER, Z_OTHER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
      expect(token._isAuthorized(Z_OTHER, Z_SPENDER, TOKENID_1)).toBe(false);

      _caller = SPENDER;
      expect(() => {
        token.approve(Z_UNAUTHORIZED, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Invalid Approver');
      expect(() => {
        token.transferFrom(Z_OTHER, Z_UNAUTHORIZED, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Insufficient Approval');
    });
  });

  describe('_requireOwned', () => {
    it('should throw if token has not been minted', () => {
      expect(() => {
        token._requireOwned(TOKENID_1);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should throw if token has been burned', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._burn(TOKENID_1);
      expect(() => {
        token._requireOwned(TOKENID_1);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should return correct owner', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(token._requireOwned(TOKENID_1)).toEqual(Z_OWNER);
    });
  });

  describe('_ownerOf', () => {
    it('should return zero address if token does not exist', () => {
      expect(token._ownerOf(NON_EXISTENT_TOKEN)).toEqual(ZERO_KEY);
    });

    it('should return owner of token', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(token._ownerOf(TOKENID_1)).toEqual(Z_OWNER);
    });
  });

  describe('_approve', () => {
    it('should approve if auth is owner', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._approve(Z_SPENDER, TOKENID_1, Z_OWNER);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should approve if auth is approved for all', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      token._approve(Z_SPENDER, TOKENID_1, Z_SPENDER);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should throw if auth is unauthorized', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(() => {
        token._approve(Z_SPENDER, TOKENID_1, Z_UNAUTHORIZED);
      }).toThrow('NonFungibleToken: Invalid Approver');
    });

    it('should approve if auth is zero address', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._approve(Z_SPENDER, TOKENID_1, ZERO_KEY);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });
  });

  describe('_checkAuthorized', () => {
    it('should throw if token not minted', () => {
      expect(() => {
        token._checkAuthorized(ZERO_KEY, Z_OWNER, TOKENID_1);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should throw if unauthorized', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(() => {
        token._checkAuthorized(Z_OWNER, Z_UNAUTHORIZED, TOKENID_1);
      }).toThrow('NonFungibleToken: Insufficient Approval');
    });

    it('should not throw if approved', () => {
      token._mint(Z_OWNER, TOKENID_1);
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token._checkAuthorized(Z_OWNER, Z_SPENDER, TOKENID_1);
    });

    it('should not throw if approvedForAll', () => {
      token._mint(Z_OWNER, TOKENID_1);
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      token._checkAuthorized(Z_OWNER, Z_SPENDER, TOKENID_1);
    });
  });

  describe('_isAuthorized', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should return true if spender is authorized', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      expect(token._isAuthorized(Z_OWNER, Z_SPENDER, TOKENID_1)).toBe(true);
    });

    it('should return true if spender is authorized for all', () => {
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      expect(token._isAuthorized(Z_OWNER, Z_SPENDER, TOKENID_1)).toBe(true);
    });

    it('should return true if spender is owner', () => {
      expect(token._isAuthorized(Z_OWNER, Z_OWNER, TOKENID_1)).toBe(true);
    });

    it('should return false if spender is zero address', () => {
      expect(token._isAuthorized(Z_OWNER, ZERO_KEY, TOKENID_1)).toBe(false);
    });

    it('should return false for unauthorized', () => {
      expect(token._isAuthorized(Z_OWNER, Z_UNAUTHORIZED, TOKENID_1)).toBe(
        false,
      );
    });
  });

  describe('_getApproved', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should return zero address if token is not minted', () => {
      expect(token._getApproved(NON_EXISTENT_TOKEN)).toEqual(ZERO_KEY);
    });

    it('should return approved address', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      expect(token._getApproved(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should return zero address if no approvals', () => {
      expect(token._getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });
  });

  describe('_setApprovalForAll', () => {
    it('should approve operator', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._setApprovalForAll(Z_OWNER, Z_SPENDER, true);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);
    });

    it('should revoke operator approval', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.setApprovalForAll(Z_SPENDER, true, _caller);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(true);

      token._setApprovalForAll(Z_OWNER, Z_SPENDER, false);
      expect(token.isApprovedForAll(Z_OWNER, Z_SPENDER)).toBe(false);
    });

    it('should throw if operator is zero address', () => {
      expect(() => {
        token._setApprovalForAll(Z_OWNER, ZERO_KEY, true);
      }).toThrow('NonFungibleToken: Invalid Operator');
    });
  });

  describe('_mint', () => {
    it('should not mint to ContractAddress', () => {
      expect(() => {
        token._mint(SOME_CONTRACT, TOKENID_1);
      }).toThrow('NonFungibleToken: Unsafe Transfer');
    });

    it('should not mint to zero address', () => {
      expect(() => {
        token._mint(ZERO_KEY, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');
    });

    it('should not mint a token that already exists', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(() => {
        token._mint(Z_OWNER, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Sender');
    });

    it('should mint token', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);

      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);
      expect(token.balanceOf(Z_OWNER)).toEqual(3n);
    });

    it('should mint multiple tokens in sequence', () => {
      for (let i = 0; i < 10; i++) {
        token._mint(Z_OWNER, TOKENID_1 + BigInt(i));
      }
      expect(token.balanceOf(Z_OWNER)).toEqual(10n);
    });

    it('should mint with very long token IDs', () => {
      const longTokenId = BigInt('18446744073709551615');
      token._mint(Z_OWNER, longTokenId);
      expect(token.ownerOf(longTokenId)).toEqual(Z_OWNER);
    });

    it('should mint after burning', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._burn(TOKENID_1);
      token._mint(Z_OWNER, TOKENID_1);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);
    });

    it('should mint with special characters in metadata', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._setTokenURI(TOKENID_1, '!@#$%^&*()_+');
      expect(token.tokenURI(TOKENID_1)).toEqual('!@#$%^&*()_+');
    });
  });

  describe('_burn', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should burn token', () => {
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);

      token._burn(TOKENID_1);
      expect(token._ownerOf(TOKENID_1)).toEqual(ZERO_KEY);
      expect(token.balanceOf(Z_OWNER)).toEqual(0n);
    });

    it('should not burn a token that does not exist', () => {
      expect(() => {
        token._burn(NON_EXISTENT_TOKEN);
      }).toThrow('NonFungibleToken: Invalid Sender');
    });

    it('should clear approval when token is burned', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(Z_SPENDER);

      token._burn(TOKENID_1);
      expect(token._getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });

    it('should burn multiple tokens in sequence', () => {
      token._mint(Z_OWNER, TOKENID_2);
      token._mint(Z_OWNER, TOKENID_3);

      token._burn(TOKENID_1);
      token._burn(TOKENID_2);
      token._burn(TOKENID_3);
      expect(token.balanceOf(Z_OWNER)).toEqual(0n);
    });

    it('should burn with very long token IDs', () => {
      const longTokenId = BigInt('18446744073709551615');
      token._mint(Z_OWNER, longTokenId);
      token._burn(longTokenId);
      expect(token._ownerOf(longTokenId)).toEqual(ZERO_KEY);
    });

    it('should burn after transfer', () => {
      token._transfer(Z_OWNER, Z_SPENDER, TOKENID_1);
      token._burn(TOKENID_1);
      expect(token._ownerOf(TOKENID_1)).toEqual(ZERO_KEY);
    });

    it('should burn after approval', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token._burn(TOKENID_1);
      expect(token._ownerOf(TOKENID_1)).toEqual(ZERO_KEY);
      expect(token._getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });
  });

  describe('_transfer', () => {
    it('should not transfer to ContractAddress', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(() => {
        token._transfer(Z_OWNER, SOME_CONTRACT, TOKENID_1);
      }).toThrow('NonFungibleToken: Unsafe Transfer');
    });

    it('should transfer token', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);
      expect(token.balanceOf(Z_SPENDER)).toEqual(0n);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);

      token._transfer(Z_OWNER, Z_SPENDER, TOKENID_1);
      expect(token.balanceOf(Z_OWNER)).toEqual(0n);
      expect(token.balanceOf(Z_SPENDER)).toEqual(1n);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should not transfer to zero address', () => {
      expect(() => {
        token._transfer(Z_OWNER, ZERO_KEY, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');
    });

    it('should throw if from does not own token', () => {
      token._mint(Z_OWNER, TOKENID_1);
      expect(() => {
        token._transfer(Z_UNAUTHORIZED, Z_SPENDER, TOKENID_1);
      }).toThrow('NonFungibleToken: Incorrect Owner');
    });

    it('should throw if token does not exist', () => {
      expect(() => {
        token._transfer(Z_OWNER, Z_SPENDER, NON_EXISTENT_TOKEN);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should revoke approval after _transfer', () => {
      _caller = OWNER;
      token._mint(Z_OWNER, TOKENID_1);
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token._transfer(Z_OWNER, Z_OTHER, TOKENID_1);
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });
  });

  describe('_setTokenURI', () => {
    it('should throw if token does not exist', () => {
      expect(() => {
        token._setTokenURI(NON_EXISTENT_TOKEN, EMPTY_URI);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should set tokenURI', () => {
      token._mint(Z_OWNER, TOKENID_1);
      token._setTokenURI(TOKENID_1, SOME_URI);
      expect(token.tokenURI(TOKENID_1)).toEqual(SOME_URI);
    });
  });

  describe('_unsafeMint', () => {
    it('should mint to ContractAddress', () => {
      expect(() => {
        token._unsafeMint(SOME_CONTRACT, TOKENID_1);
      }).not.toThrow();
    });

    it('should not mint to zero address', () => {
      expect(() => {
        token._unsafeMint(ZERO_KEY, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');

      expect(() => {
        token._unsafeMint(ZERO_ADDRESS, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');
    });

    it('should not mint a token that already exists', () => {
      token._unsafeMint(Z_OWNER, TOKENID_1);
      expect(() => {
        token._unsafeMint(Z_OWNER, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Sender');
    });

    it('should mint token to public key', () => {
      token._unsafeMint(Z_OWNER, TOKENID_1);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);

      token._unsafeMint(Z_OWNER, TOKENID_2);
      token._unsafeMint(Z_OWNER, TOKENID_3);
      expect(token.balanceOf(Z_OWNER)).toEqual(3n);
    });
  });

  describe('_unsafeTransfer', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should transfer to ContractAddress', () => {
      expect(() => {
        token._unsafeTransfer(Z_OWNER, SOME_CONTRACT, TOKENID_1);
      }).not.toThrow();
    });

    it('should transfer token to public key', () => {
      expect(token.balanceOf(Z_OWNER)).toEqual(1n);
      expect(token.balanceOf(Z_SPENDER)).toEqual(0n);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_OWNER);

      token._unsafeTransfer(Z_OWNER, Z_SPENDER, TOKENID_1);
      expect(token.balanceOf(Z_OWNER)).toEqual(0n);
      expect(token.balanceOf(Z_SPENDER)).toEqual(1n);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should not transfer to zero address', () => {
      expect(() => {
        token._unsafeTransfer(Z_OWNER, ZERO_KEY, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');

      expect(() => {
        token._unsafeTransfer(Z_OWNER, ZERO_ADDRESS, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');
    });

    it('should throw if from does not own token', () => {
      expect(() => {
        token._unsafeTransfer(Z_UNAUTHORIZED, Z_UNAUTHORIZED, TOKENID_1);
      }).toThrow('NonFungibleToken: Incorrect Owner');
    });

    it('should throw if token does not exist', () => {
      expect(() => {
        token._unsafeTransfer(Z_OWNER, Z_SPENDER, NON_EXISTENT_TOKEN);
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should revoke approval after _unsafeTransfer', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token._unsafeTransfer(Z_OWNER, Z_OTHER, TOKENID_1);
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });
  });

  describe('_unsafeTransferFrom', () => {
    beforeEach(() => {
      token._mint(Z_OWNER, TOKENID_1);
    });

    it('should transfer to ContractAddress', () => {
      expect(() => {
        token._unsafeTransferFrom(Z_OWNER, SOME_CONTRACT, TOKENID_1);
      }).not.toThrow();
    });

    it('should not transfer to zero address', () => {
      expect(() => {
        token._unsafeTransferFrom(Z_OWNER, ZERO_KEY, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');

      expect(() => {
        token._unsafeTransferFrom(Z_OWNER, ZERO_ADDRESS, TOKENID_1);
      }).toThrow('NonFungibleToken: Invalid Receiver');
    });

    it('should not transfer from zero address', () => {
      expect(() => {
        token._unsafeTransferFrom(ZERO_KEY, Z_SPENDER, TOKENID_1);
      }).toThrow('NonFungibleToken: Incorrect Owner');

      expect(() => {
        token._unsafeTransferFrom(ZERO_ADDRESS, Z_SPENDER, TOKENID_1);
      }).toThrow('NonFungibleToken: Incorrect Owner');
    });

    it('unapproved operator should not transfer', () => {
      _caller = SPENDER;
      expect(() => {
        token._unsafeTransferFrom(Z_OWNER, Z_UNAUTHORIZED, TOKENID_1, _caller);
      }).toThrow('NonFungibleToken: Insufficient Approval');
    });

    it('should not transfer token that has not been minted', () => {
      _caller = OWNER;
      expect(() => {
        token._unsafeTransferFrom(
          Z_OWNER,
          Z_SPENDER,
          NON_EXISTENT_TOKEN,
          _caller,
        );
      }).toThrow('NonFungibleToken: Nonexistent Token');
    });

    it('should transfer token to spender via approved operator', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, OWNER);

      _caller = SPENDER;
      token._unsafeTransferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should transfer token to ContractAddress via approved operator', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, OWNER);

      _caller = SPENDER;
      token._unsafeTransferFrom(Z_OWNER, SOME_CONTRACT, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(SOME_CONTRACT);
    });

    it('should transfer token to spender via approvedForAll operator', () => {
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, OWNER);

      _caller = SPENDER;
      token._unsafeTransferFrom(Z_OWNER, Z_SPENDER, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(Z_SPENDER);
    });

    it('should transfer token to ContractAddress via approvedForAll operator', () => {
      _caller = OWNER;
      token.setApprovalForAll(Z_SPENDER, true, OWNER);

      _caller = SPENDER;
      token._unsafeTransferFrom(Z_OWNER, SOME_CONTRACT, TOKENID_1, _caller);
      expect(token.ownerOf(TOKENID_1)).toEqual(SOME_CONTRACT);
    });

    it('should revoke approval after _unsafeTransferFrom', () => {
      _caller = OWNER;
      token.approve(Z_SPENDER, TOKENID_1, _caller);
      token._unsafeTransferFrom(Z_OWNER, Z_OTHER, TOKENID_1, _caller);
      expect(token.getApproved(TOKENID_1)).toEqual(ZERO_KEY);
    });
  });
});

type FailingCircuits = [
  method: keyof NonFungibleTokenSimulator,
  args: unknown[],
]; // Circuit calls should fail before the args are used

const circuitsToFail: FailingCircuits[] = [
  ['name', []],
  ['symbol', []],
  ['balanceOf', [Z_OWNER]],
  ['ownerOf', [TOKENID_1]],
  ['tokenURI', [TOKENID_1]],
  ['approve', [Z_OWNER, TOKENID_1]],
  ['getApproved', [TOKENID_1]],
  ['setApprovalForAll', [Z_SPENDER, true]],
  ['isApprovedForAll', [Z_OWNER, Z_SPENDER]],
  ['transferFrom', [Z_OWNER, Z_RECIPIENT, TOKENID_1]],
  ['_requireOwned', [TOKENID_1]],
  ['_ownerOf', [TOKENID_1]],
  ['_approve', [Z_OWNER, TOKENID_1, Z_SPENDER]],
  ['_checkAuthorized', [Z_OWNER, Z_SPENDER, TOKENID_1]],
  ['_isAuthorized', [Z_OWNER, Z_SPENDER, TOKENID_1]],
  ['_getApproved', [TOKENID_1]],
  ['_setApprovalForAll', [Z_OWNER, Z_SPENDER, true]],
  ['_mint', [Z_OWNER, TOKENID_1]],
  ['_burn', [TOKENID_1]],
  ['_transfer', [Z_OWNER, Z_RECIPIENT, TOKENID_1]],
  ['_setTokenURI', [TOKENID_1]],
  ['_unsafeTransferFrom', [Z_OWNER, Z_RECIPIENT, TOKENID_1]],
  ['_unsafeTransfer', [Z_OWNER, Z_RECIPIENT, TOKENID_1]],
  ['_unsafeMint', [Z_OWNER, TOKENID_1]],
];

let uninitializedToken: NonFungibleTokenSimulator;

describe('Uninitialized NonFungibleToken', () => {
  beforeEach(() => {
    uninitializedToken = new NonFungibleTokenSimulator(NAME, SYMBOL, BAD_INIT);
  });

  it.each(circuitsToFail)('%s should fail', (circuitName, args) => {
    expect(() => {
      (uninitializedToken[circuitName] as (...args: unknown[]) => unknown)(
        ...args,
      );
    }).toThrow('Initializable: contract not initialized');
  });
});
