import type { CoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FungibleTokenSimulator } from './simulators/FungibleTokenSimulator.js';
import * as utils from './utils/address.js';

// Metadata
const EMPTY_STRING = '';
const NAME = 'NAME';
const SYMBOL = 'SYMBOL';
const DECIMALS = 18n;
const NO_DECIMALS = 0n;
const INIT = true;
const BAD_INIT = false;

// Amounts
const AMOUNT: bigint = BigInt(250);
const MAX_UINT128 = BigInt(2 ** 128) - BigInt(1);

// Callers
const OWNER = utils.toHexPadded('OWNER');
const SPENDER = utils.toHexPadded('SPENDER');
const UNAUTHORIZED = utils.toHexPadded('UNAUTHORIZED');
const ZERO = utils.toHexPadded('');

// Encoded PK/Addresses
const Z_OWNER = utils.createEitherTestUser('OWNER');
const Z_RECIPIENT = utils.createEitherTestUser('RECIPIENT');
const Z_SPENDER = utils.createEitherTestUser('SPENDER');
const Z_OTHER = utils.createEitherTestUser('OTHER');
const Z_OWNER_CONTRACT =
  utils.createEitherTestContractAddress('OWNER_CONTRACT');
const Z_RECIPIENT_CONTRACT =
  utils.createEitherTestContractAddress('RECIPIENT_CONTRACT');

// Helper types
const ownerTypes = [
  ['contract', Z_OWNER_CONTRACT],
  ['pubkey', Z_OWNER],
] as const;

const recipientTypes = [
  ['contract', Z_RECIPIENT_CONTRACT],
  ['pubkey', Z_RECIPIENT],
] as const;

let token: FungibleTokenSimulator;
let caller: CoinPublicKey;

describe('FungibleToken', () => {
  describe('before initialization', () => {
    it('should initialize metadata', () => {
      token = new FungibleTokenSimulator(NAME, SYMBOL, DECIMALS, INIT);

      expect(token.name()).toEqual(NAME);
      expect(token.symbol()).toEqual(SYMBOL);
      expect(token.decimals()).toEqual(DECIMALS);
    });

    it('should initialize empty metadata', () => {
      token = new FungibleTokenSimulator(
        EMPTY_STRING,
        EMPTY_STRING,
        NO_DECIMALS,
        INIT,
      );

      expect(token.name()).toEqual(EMPTY_STRING);
      expect(token.symbol()).toEqual(EMPTY_STRING);
      expect(token.decimals()).toEqual(NO_DECIMALS);
    });
  });

  describe('when not initialized correctly', () => {
    beforeEach(() => {
      token = new FungibleTokenSimulator(
        EMPTY_STRING,
        EMPTY_STRING,
        NO_DECIMALS,
        BAD_INIT,
      );
    });

    type FailingCircuits = [
      method: keyof FungibleTokenSimulator,
      args: unknown[],
    ];
    // Circuit calls should fail before the args are used
    const circuitsToFail: FailingCircuits[] = [
      ['name', []],
      ['symbol', []],
      ['decimals', []],
      ['totalSupply', []],
      ['balanceOf', [Z_OWNER]],
      ['allowance', [Z_OWNER, Z_SPENDER]],
      ['transfer', [Z_RECIPIENT, AMOUNT]],
      ['_unsafeTransfer', [Z_RECIPIENT, AMOUNT]],
      ['transferFrom', [Z_OWNER, Z_RECIPIENT, AMOUNT]],
      ['_unsafeTransferFrom', [Z_OWNER, Z_RECIPIENT, AMOUNT]],
      ['approve', [Z_OWNER, AMOUNT]],
      ['_approve', [Z_OWNER, Z_SPENDER, AMOUNT]],
      ['_transfer', [Z_OWNER, Z_RECIPIENT, AMOUNT]],
      ['_unsafeUncheckedTransfer', [Z_OWNER, Z_RECIPIENT, AMOUNT]],
      ['_mint', [Z_OWNER, AMOUNT]],
      ['_unsafeMint', [Z_OWNER, AMOUNT]],
      ['_burn', [Z_OWNER, AMOUNT]],
    ];

    it.each(circuitsToFail)('%s should fail', (circuitName, args) => {
      expect(() => {
        (token[circuitName] as (...args: unknown[]) => unknown)(...args);
      }).toThrow('Initializable: contract not initialized');
    });
  });

  describe('when initialized correctly', () => {
    beforeEach(() => {
      token = new FungibleTokenSimulator(NAME, SYMBOL, DECIMALS, INIT);
    });

    describe('totalSupply', () => {
      it('returns 0 when there is no supply', () => {
        expect(token.totalSupply()).toEqual(0n);
      });

      it('returns the amount of existing tokens when there is a supply', () => {
        token._mint(Z_OWNER, AMOUNT);
        expect(token.totalSupply()).toEqual(AMOUNT);
      });
    });

    describe('balanceOf', () => {
      describe.each(ownerTypes)('when the owner is a %s', (_, owner) => {
        it('should return zero when requested account has no balance', () => {
          expect(token.balanceOf(owner)).toEqual(0n);
        });

        it('should return balance when requested account has tokens', () => {
          token._unsafeMint(owner, AMOUNT);
          expect(token.balanceOf(owner)).toEqual(AMOUNT);
        });
      });
    });

    describe('transfer', () => {
      beforeEach(() => {
        token._mint(Z_OWNER, AMOUNT);

        expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(0n);
      });

      afterEach(() => {
        expect(token.totalSupply()).toEqual(AMOUNT);
      });

      it('should transfer partial', () => {
        const partialAmt = AMOUNT - 1n;
        caller = OWNER;
        const txSuccess = token.transfer(Z_RECIPIENT, partialAmt, caller);

        expect(txSuccess).toBe(true);
        expect(token.balanceOf(Z_OWNER)).toEqual(1n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(partialAmt);
      });

      it('should transfer full', () => {
        caller = OWNER;
        const txSuccess = token.transfer(Z_RECIPIENT, AMOUNT, caller);

        expect(txSuccess).toBe(true);
        expect(token.balanceOf(Z_OWNER)).toEqual(0n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(AMOUNT);
      });

      it('should fail with insufficient balance', () => {
        caller = OWNER;

        expect(() => {
          token.transfer(Z_RECIPIENT, AMOUNT + 1n, caller);
        }).toThrow('FungibleToken: insufficient balance');
      });

      it('should fail with transfer from zero', () => {
        caller = ZERO;

        expect(() => {
          token.transfer(Z_RECIPIENT, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid sender');
      });

      it('should fail with transfer to zero', () => {
        caller = OWNER;

        expect(() => {
          token.transfer(utils.ZERO_KEY, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should allow transfer of 0 tokens', () => {
        const txSuccess = token.transfer(Z_RECIPIENT, 0n, caller);

        expect(txSuccess).toBe(true);
        expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(0n);
      });

      it('should handle transfer with empty _balances', () => {
        caller = SPENDER;

        expect(() => {
          token.transfer(Z_RECIPIENT, 1n, caller);
        }).toThrow('FungibleToken: insufficient balance');
      });

      it('should fail when transferring to a contract', () => {
        expect(() => {
          token.transfer(Z_OWNER_CONTRACT, AMOUNT);
        }).toThrow('FungibleToken: Unsafe Transfer');
      });
    });

    describe('_unsafeTransfer', () => {
      describe.each(recipientTypes)(
        'when the recipient is a %s',
        (_, recipient) => {
          beforeEach(() => {
            token._mint(Z_OWNER, AMOUNT);

            expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);
            expect(token.balanceOf(recipient)).toEqual(0n);
          });

          afterEach(() => {
            expect(token.totalSupply()).toEqual(AMOUNT);
          });

          it('should transfer partial', () => {
            const partialAmt = AMOUNT - 1n;
            caller = OWNER;
            const txSuccess = token._unsafeTransfer(
              recipient,
              partialAmt,
              caller,
            );

            expect(txSuccess).toBe(true);
            expect(token.balanceOf(Z_OWNER)).toEqual(1n);
            expect(token.balanceOf(recipient)).toEqual(partialAmt);
          });

          it('should transfer full', () => {
            caller = OWNER;
            const txSuccess = token._unsafeTransfer(recipient, AMOUNT, caller);

            expect(txSuccess).toBe(true);
            expect(token.balanceOf(Z_OWNER)).toEqual(0n);
            expect(token.balanceOf(recipient)).toEqual(AMOUNT);
          });

          it('should fail with insufficient balance', () => {
            caller = OWNER;

            expect(() => {
              token._unsafeTransfer(recipient, AMOUNT + 1n, caller);
            }).toThrow('FungibleToken: insufficient balance');
          });

          it('should fail with transfer from zero', () => {
            caller = ZERO;

            expect(() => {
              token._unsafeTransfer(recipient, AMOUNT, caller);
            }).toThrow('FungibleToken: invalid sender');
          });

          it('should allow transfer of 0 tokens', () => {
            caller = OWNER;
            const txSuccess = token._unsafeTransfer(recipient, 0n, caller);

            expect(txSuccess).toBe(true);
            expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);
            expect(token.balanceOf(recipient)).toEqual(0n);
          });

          it('should handle transfer with empty _balances', () => {
            caller = SPENDER;

            expect(() => {
              token._unsafeTransfer(recipient, 1n, caller);
            }).toThrow('FungibleToken: insufficient balance');
          });
        },
      );

      it('should fail with transfer to zero (pk)', () => {
        caller = OWNER;

        expect(() => {
          token._unsafeTransfer(utils.ZERO_KEY, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should fail with transfer to zero (contract)', () => {
        caller = OWNER;

        expect(() => {
          token._unsafeTransfer(utils.ZERO_ADDRESS, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid receiver');
      });
    });

    describe('approve', () => {
      beforeEach(() => {
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
      });

      it('should approve and update allowance', () => {
        caller = OWNER;

        token.approve(Z_SPENDER, AMOUNT, caller);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(AMOUNT);
      });

      it('should approve and update allowance for multiple spenders', () => {
        caller = OWNER;

        token.approve(Z_SPENDER, AMOUNT, caller);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(AMOUNT);

        token.approve(Z_OTHER, AMOUNT, caller);
        expect(token.allowance(Z_OWNER, Z_OTHER)).toEqual(AMOUNT);

        expect(token.allowance(Z_OWNER, Z_RECIPIENT)).toEqual(0n);
      });

      it('should fail when approve from zero', () => {
        caller = ZERO;

        expect(() => {
          token.approve(Z_SPENDER, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid owner');
      });

      it('should fail when approve to zero', () => {
        caller = OWNER;

        expect(() => {
          token.approve(utils.ZERO_KEY, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid spender');
      });

      it('should transfer exact allowance and fail subsequent transfer', () => {
        token._mint(Z_OWNER, AMOUNT);
        caller = OWNER;
        token.approve(Z_SPENDER, AMOUNT, caller);

        caller = SPENDER;
        token.transferFrom(Z_OWNER, Z_RECIPIENT, AMOUNT, caller);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);

        expect(() => {
          token.transferFrom(Z_OWNER, Z_RECIPIENT, 1n, caller);
        }).toThrow('FungibleToken: insufficient allowance');
      });

      it('should allow approve of 0 tokens', () => {
        caller = OWNER;
        token.approve(Z_SPENDER, 0n, caller);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
      });

      it('should handle allowance with empty _allowances', () => {
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
      });
    });

    describe('transferFrom', () => {
      beforeEach(() => {
        caller = OWNER;

        token.approve(Z_SPENDER, AMOUNT, caller);
        token._mint(Z_OWNER, AMOUNT);
      });

      afterEach(() => {
        expect(token.totalSupply()).toEqual(AMOUNT);
      });

      it('should transferFrom spender (partial)', () => {
        caller = SPENDER;
        const partialAmt = AMOUNT - 1n;

        const txSuccess = token.transferFrom(
          Z_OWNER,
          Z_RECIPIENT,
          partialAmt,
          caller,
        );
        expect(txSuccess).toBe(true);

        // Check balances
        expect(token.balanceOf(Z_OWNER)).toEqual(1n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(partialAmt);
        // Check leftover allowance
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(1n);
      });

      it('should transferFrom spender (full)', () => {
        caller = SPENDER;

        const txSuccess = token.transferFrom(
          Z_OWNER,
          Z_RECIPIENT,
          AMOUNT,
          caller,
        );
        expect(txSuccess).toBe(true);

        // Check balances
        expect(token.balanceOf(Z_OWNER)).toEqual(0n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(AMOUNT);
        // Check no allowance
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
      });

      it('should transferFrom and not consume infinite allowance', () => {
        caller = OWNER;
        token.approve(Z_SPENDER, MAX_UINT128, caller);

        caller = SPENDER;
        const txSuccess = token.transferFrom(
          Z_OWNER,
          Z_RECIPIENT,
          AMOUNT,
          caller,
        );
        expect(txSuccess).toBe(true);

        // Check balances
        expect(token.balanceOf(Z_OWNER)).toEqual(0n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(AMOUNT);
        // Check infinite allowance
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(MAX_UINT128);
      });

      it('should fail when transfer amount exceeds allowance', () => {
        caller = SPENDER;

        expect(() => {
          token.transferFrom(Z_OWNER, Z_RECIPIENT, AMOUNT + 1n);
        }).toThrow('FungibleToken: insufficient allowance');
      });

      it('should fail when transfer amount exceeds balance', () => {
        caller = OWNER;
        // Increase allowance > balance
        token.approve(Z_SPENDER, AMOUNT + 1n, caller);

        caller = SPENDER;
        expect(() => {
          token.transferFrom(Z_OWNER, Z_RECIPIENT, AMOUNT + 1n, caller);
        }).toThrow('FungibleToken: insufficient balance');
      });

      it('should fail when spender does not have allowance', () => {
        caller = UNAUTHORIZED;

        expect(() => {
          token.transferFrom(Z_OWNER, Z_RECIPIENT, AMOUNT, caller);
        }).toThrow('FungibleToken: insufficient allowance');
      });

      it('should fail to transferFrom zero address', () => {
        caller = ZERO;

        expect(() => {
          token.transferFrom(Z_OWNER, Z_RECIPIENT, AMOUNT, caller);
        }).toThrow('FungibleToken: insufficient allowance');
      });

      it('should fail to transferFrom to the zero address', () => {
        caller = SPENDER;

        expect(() => {
          token.transferFrom(Z_OWNER, utils.ZERO_KEY, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should fail when transferring to a contract', () => {
        expect(() => {
          token.transferFrom(Z_OWNER, Z_OWNER_CONTRACT, AMOUNT, caller);
        }).toThrow('FungibleToken: Unsafe Transfer');
      });
    });

    describe('_unsafeTransferFrom', () => {
      beforeEach(() => {
        caller = OWNER;

        token.approve(Z_SPENDER, AMOUNT, caller);
        token._mint(Z_OWNER, AMOUNT);
      });

      afterEach(() => {
        expect(token.totalSupply()).toEqual(AMOUNT);
      });

      describe.each(recipientTypes)(
        'when the recipient is a %s',
        (_, recipient) => {
          it('should transferFrom spender (partial)', () => {
            caller = SPENDER;
            const partialAmt = AMOUNT - 1n;

            const txSuccess = token._unsafeTransferFrom(
              Z_OWNER,
              recipient,
              partialAmt,
              caller,
            );
            expect(txSuccess).toBe(true);

            // Check balances
            expect(token.balanceOf(Z_OWNER)).toEqual(1n);
            expect(token.balanceOf(recipient)).toEqual(partialAmt);
            // Check leftover allowance
            expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(1n);
          });

          it('should transferFrom spender (full)', () => {
            caller = SPENDER;

            const txSuccess = token._unsafeTransferFrom(
              Z_OWNER,
              recipient,
              AMOUNT,
              caller,
            );
            expect(txSuccess).toBe(true);

            // Check balances
            expect(token.balanceOf(Z_OWNER)).toEqual(0n);
            expect(token.balanceOf(recipient)).toEqual(AMOUNT);
            // Check no allowance
            expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
          });

          it('should transferFrom and not consume infinite allowance', () => {
            caller = OWNER;
            token.approve(Z_SPENDER, MAX_UINT128, caller);

            caller = SPENDER;
            const txSuccess = token._unsafeTransferFrom(
              Z_OWNER,
              recipient,
              AMOUNT,
              caller,
            );
            expect(txSuccess).toBe(true);

            // Check balances
            expect(token.balanceOf(Z_OWNER)).toEqual(0n);
            expect(token.balanceOf(recipient)).toEqual(AMOUNT);
            // Check infinite allowance
            expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(MAX_UINT128);
          });

          it('should fail when transfer amount exceeds allowance', () => {
            caller = SPENDER;

            expect(() => {
              token._unsafeTransferFrom(Z_OWNER, recipient, AMOUNT + 1n);
            }).toThrow('FungibleToken: insufficient allowance');
          });

          it('should fail when transfer amount exceeds balance', () => {
            caller = OWNER;
            // Increase allowance > balance
            token.approve(Z_SPENDER, AMOUNT + 1n, caller);

            caller = SPENDER;
            expect(() => {
              token._unsafeTransferFrom(
                Z_OWNER,
                recipient,
                AMOUNT + 1n,
                caller,
              );
            }).toThrow('FungibleToken: insufficient balance');
          });

          it('should fail when spender does not have allowance', () => {
            caller = UNAUTHORIZED;

            expect(() => {
              token._unsafeTransferFrom(Z_OWNER, recipient, AMOUNT, caller);
            }).toThrow('FungibleToken: insufficient allowance');
          });

          it('should fail to transfer from the zero address', () => {
            caller = ZERO;

            expect(() => {
              token._unsafeTransferFrom(Z_OWNER, recipient, AMOUNT, caller);
            }).toThrow('FungibleToken: insufficient allowance');
          });
        },
      );

      it('should fail to transfer to the zero address (pk)', () => {
        caller = SPENDER;

        expect(() => {
          token._unsafeTransferFrom(Z_OWNER, utils.ZERO_KEY, AMOUNT, caller);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should fail to transfer to the zero address (contract)', () => {
        caller = SPENDER;

        expect(() => {
          token._unsafeTransferFrom(
            Z_OWNER,
            utils.ZERO_ADDRESS,
            AMOUNT,
            caller,
          );
        }).toThrow('FungibleToken: invalid receiver');
      });
    });

    describe('_transfer', () => {
      beforeEach(() => {
        token._mint(Z_OWNER, AMOUNT);
      });

      afterEach(() => {
        expect(token.totalSupply()).toEqual(AMOUNT);
      });

      it('should update balances (partial)', () => {
        const partialAmt = AMOUNT - 1n;
        token._transfer(Z_OWNER, Z_RECIPIENT, partialAmt);

        expect(token.balanceOf(Z_OWNER)).toEqual(1n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(partialAmt);
      });

      it('should fail when transferring to a contract', () => {
        expect(() => {
          token._transfer(Z_OWNER, Z_OWNER_CONTRACT, AMOUNT);
        }).toThrow('FungibleToken: Unsafe Transfer');
      });
    });

    describe('_unsafeUncheckedTransfer', () => {
      beforeEach(() => {
        token._mint(Z_OWNER, AMOUNT);
      });

      afterEach(() => {
        expect(token.totalSupply()).toEqual(AMOUNT);
      });

      describe.each(recipientTypes)(
        'when the recipient is a %s',
        (_, recipient) => {
          it('should update balances (partial)', () => {
            const partialAmt = AMOUNT - 1n;
            token._unsafeUncheckedTransfer(Z_OWNER, recipient, partialAmt);

            expect(token.balanceOf(Z_OWNER)).toEqual(1n);
            expect(token.balanceOf(recipient)).toEqual(partialAmt);
          });

          it('should update balances (full)', () => {
            token._unsafeUncheckedTransfer(Z_OWNER, recipient, AMOUNT);

            expect(token.balanceOf(Z_OWNER)).toEqual(0n);
            expect(token.balanceOf(recipient)).toEqual(AMOUNT);
          });

          it('should fail when transfer amount exceeds balance', () => {
            expect(() => {
              token._unsafeUncheckedTransfer(Z_OWNER, recipient, AMOUNT + 1n);
            }).toThrow('FungibleToken: insufficient balance');
          });

          it('should fail when transfer from zero', () => {
            expect(() => {
              token._unsafeUncheckedTransfer(
                utils.ZERO_ADDRESS,
                recipient,
                AMOUNT,
              );
            }).toThrow('FungibleToken: invalid sender');
          });
        },
      );

      it('should fail when transfer to zero (pk)', () => {
        expect(() => {
          token._unsafeUncheckedTransfer(Z_OWNER, utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should fail when transfer to zero (contract)', () => {
        expect(() => {
          token._unsafeUncheckedTransfer(Z_OWNER, utils.ZERO_ADDRESS, AMOUNT);
        }).toThrow('FungibleToken: invalid receiver');
      });
    });

    describe('_mint', () => {
      it('should mint and update supply', () => {
        expect(token.totalSupply()).toEqual(0n);

        token._mint(Z_RECIPIENT, AMOUNT);
        expect(token.totalSupply()).toEqual(AMOUNT);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(AMOUNT);
      });

      it('should catch mint overflow', () => {
        token._mint(Z_RECIPIENT, MAX_UINT128);

        expect(() => {
          token._mint(Z_RECIPIENT, 1n);
        }).toThrow('FungibleToken: arithmetic overflow');
      });

      it('should not mint to zero pubkey', () => {
        expect(() => {
          token._mint(utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should not mint to zero contract address', () => {
        expect(() => {
          token._mint(utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should allow mint of 0 tokens', () => {
        token._mint(Z_OWNER, 0n);
        expect(token.totalSupply()).toEqual(0n);
        expect(token.balanceOf(Z_OWNER)).toEqual(0n);
      });

      it('should fail when minting to a contract', () => {
        expect(() => {
          token._mint(Z_OWNER_CONTRACT, AMOUNT);
        }).toThrow('FungibleToken: Unsafe Transfer');
      });
    });

    describe('_unsafeMint', () => {
      describe.each(recipientTypes)(
        'when the recipient is a %s',
        (_, recipient) => {
          it('should mint and update supply', () => {
            expect(token.totalSupply()).toEqual(0n);

            token._unsafeMint(recipient, AMOUNT);
            expect(token.totalSupply()).toEqual(AMOUNT);
            expect(token.balanceOf(recipient)).toEqual(AMOUNT);
          });

          it('should catch mint overflow', () => {
            token._unsafeMint(recipient, MAX_UINT128);

            expect(() => {
              token._unsafeMint(recipient, 1n);
            }).toThrow('FungibleToken: arithmetic overflow');
          });

          it('should allow mint of 0 tokens', () => {
            token._unsafeMint(recipient, 0n);
            expect(token.totalSupply()).toEqual(0n);
            expect(token.balanceOf(recipient)).toEqual(0n);
          });
        },
      );

      it('should not mint to zero pubkey', () => {
        expect(() => {
          token._unsafeMint(utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid receiver');
      });

      it('should not mint to zero contract address', () => {
        expect(() => {
          token._unsafeMint(utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid receiver');
      });
    });

    describe('_burn', () => {
      beforeEach(() => {
        token._mint(Z_OWNER, AMOUNT);
      });

      it('should burn tokens', () => {
        token._burn(Z_OWNER, 1n);

        const afterBurn = AMOUNT - 1n;
        expect(token.balanceOf(Z_OWNER)).toEqual(afterBurn);
        expect(token.totalSupply()).toEqual(afterBurn);
      });

      it('should throw when burning from zero', () => {
        expect(() => {
          token._burn(utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid sender');
      });

      it('should throw when burn amount is greater than balance', () => {
        expect(() => {
          token._burn(Z_OWNER, AMOUNT + 1n);
        }).toThrow('FungibleToken: insufficient balance');
      });

      it('should allow burn of 0 tokens', () => {
        token._burn(Z_OWNER, 0n);
        expect(token.totalSupply()).toEqual(AMOUNT);
        expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);
      });
    });

    describe('_approve', () => {
      beforeEach(() => {
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
      });

      it('should approve and update allowance', () => {
        token._approve(Z_OWNER, Z_SPENDER, AMOUNT);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(AMOUNT);
      });

      it('should approve and update allowance for multiple spenders', () => {
        // Approve spender
        token._approve(Z_OWNER, Z_SPENDER, AMOUNT);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(AMOUNT);

        // Approve other
        token._approve(Z_OWNER, Z_OTHER, AMOUNT);
        expect(token.allowance(Z_OWNER, Z_OTHER)).toEqual(AMOUNT);

        expect(token.allowance(Z_OWNER, Z_RECIPIENT)).toEqual(0n);
      });

      it('should fail when approve from zero (pk)', () => {
        expect(() => {
          token._approve(utils.ZERO_KEY, Z_SPENDER, AMOUNT);
        }).toThrow('FungibleToken: invalid owner');
      });

      it('should fail when approve from zero (contract)', () => {
        expect(() => {
          token._approve(utils.ZERO_ADDRESS, Z_SPENDER, AMOUNT);
        }).toThrow('FungibleToken: invalid owner');
      });

      it('should fail when approve to zero (pk)', () => {
        expect(() => {
          token._approve(Z_OWNER, utils.ZERO_KEY, AMOUNT);
        }).toThrow('FungibleToken: invalid spender');
      });

      it('should fail when approve to zero (contract)', () => {
        expect(() => {
          token._approve(Z_OWNER, utils.ZERO_ADDRESS, AMOUNT);
        }).toThrow('FungibleToken: invalid spender');
      });

      it('should allow approve of 0 tokens', () => {
        token._approve(Z_OWNER, Z_SPENDER, 0n);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(0n);
      });
    });

    describe('_spendAllowance', () => {
      beforeEach(() => {
        token._mint(Z_OWNER, AMOUNT);
      });

      it('should update allowance when not unlimited', () => {
        token._approve(Z_OWNER, Z_SPENDER, MAX_UINT128 - 1n);
        token._spendAllowance(Z_OWNER, Z_SPENDER, AMOUNT);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(
          MAX_UINT128 - 1n - AMOUNT,
        );
      });

      it('should not update allowance when unlimited', () => {
        token._approve(Z_OWNER, Z_SPENDER, MAX_UINT128);
        token._spendAllowance(Z_OWNER, Z_SPENDER, MAX_UINT128 - 1n);
        expect(token.allowance(Z_OWNER, Z_SPENDER)).toEqual(MAX_UINT128);
      });

      it('should fail when owner allowance is not initialized', () => {
        expect(() => {
          token._spendAllowance(Z_OTHER, Z_SPENDER, AMOUNT);
        }).toThrow('FungibleToken: insufficient allowance');
      });

      it('should fail when spender is not initialized', () => {
        token._approve(Z_OWNER, Z_SPENDER, AMOUNT);
        expect(() => {
          token._spendAllowance(Z_OWNER, Z_OTHER, AMOUNT);
        }).toThrow('FungibleToken: insufficient allowance');
      });

      it('should fail when spender has insufficient allowance', () => {
        token._approve(Z_OWNER, Z_SPENDER, AMOUNT);
        expect(() => {
          token._spendAllowance(Z_OWNER, Z_SPENDER, AMOUNT + 1n);
        }).toThrow('FungibleToken: insufficient allowance');
      });
    });

    describe('Multiple Operations', () => {
      it('should handle mint → transfer → burn sequence', () => {
        token._mint(Z_OWNER, AMOUNT);
        expect(token.totalSupply()).toEqual(AMOUNT);
        expect(token.balanceOf(Z_OWNER)).toEqual(AMOUNT);

        caller = OWNER;
        token.transfer(Z_RECIPIENT, AMOUNT - 1n, caller);
        expect(token.balanceOf(Z_OWNER)).toEqual(1n);
        expect(token.balanceOf(Z_RECIPIENT)).toEqual(AMOUNT - 1n);

        token._burn(Z_OWNER, 1n);
        expect(token.totalSupply()).toEqual(AMOUNT - 1n);
        expect(token.balanceOf(Z_OWNER)).toEqual(0n);
      });
    });
  });
});
