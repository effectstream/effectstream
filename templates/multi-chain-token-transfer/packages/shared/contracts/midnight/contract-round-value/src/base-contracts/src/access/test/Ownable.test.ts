import type { CoinPublicKey } from '@midnight-ntwrk/compact-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { OwnableSimulator } from './simulators/OwnableSimulator.js';
import * as utils from './utils/address.js';

// PKs
const [OWNER, Z_OWNER] = utils.generateEitherPubKeyPair('OWNER');
const [NEW_OWNER, Z_NEW_OWNER] = utils.generateEitherPubKeyPair('NEW_OWNER');
const [UNAUTHORIZED, _] = utils.generateEitherPubKeyPair('UNAUTHORIZED');

// Encoded contract addresses
const Z_OWNER_CONTRACT =
  utils.createEitherTestContractAddress('OWNER_CONTRACT');
const Z_RECIPIENT_CONTRACT =
  utils.createEitherTestContractAddress('RECIPIENT_CONTRACT');

const isInit = true;
const isBadInit = false;

let ownable: OwnableSimulator;
let caller: CoinPublicKey;

const newOwnerTypes = [
  ['contract', Z_OWNER_CONTRACT],
  ['pubkey', Z_NEW_OWNER],
] as const;

const zeroTypes = [
  ['contract', utils.ZERO_ADDRESS],
  ['pubkey', utils.ZERO_KEY],
] as const;

describe('Ownable', () => {
  describe('before initialized', () => {
    it('should initialize', () => {
      ownable = new OwnableSimulator(Z_OWNER, isInit);
      expect(ownable.owner()).toEqual(Z_OWNER);
    });

    it('should fail to initialize when owner is a contract address', () => {
      expect(() => {
        new OwnableSimulator(Z_OWNER_CONTRACT, isInit);
      }).toThrow('Ownable: unsafe ownership transfer');
    });

    it.each(zeroTypes)(
      'should fail to initialize when owner is zero (%s)',
      (_, _zero) => {
        expect(() => {
          ownable = new OwnableSimulator(_zero, isInit);
        }).toThrow('Ownable: invalid initial owner');
      },
    );

    type FailingCircuits = [method: keyof OwnableSimulator, args: unknown[]];
    // Circuit calls should fail before the args are used
    const circuitsToFail: FailingCircuits[] = [
      ['owner', []],
      ['assertOnlyOwner', []],
      ['transferOwnership', [Z_OWNER]],
      ['_unsafeTransferOwnership', [Z_OWNER]],
      ['renounceOwnership', []],
      ['_transferOwnership', [Z_OWNER]],
      ['_unsafeUncheckedTransferOwnership', [Z_OWNER]],
    ];
    it.each(circuitsToFail)(
      'should fail when calling circuit "%s"',
      (circuitName, args) => {
        ownable = new OwnableSimulator(Z_OWNER, isBadInit);
        expect(() => {
          (ownable[circuitName] as (...args: unknown[]) => unknown)(...args);
        }).toThrow('Initializable: contract not initialized');
      },
    );
  });

  describe('when initialized', () => {
    beforeEach(() => {
      ownable = new OwnableSimulator(Z_OWNER, isInit);
    });

    describe('owner', () => {
      it('should return owner', () => {
        expect(ownable.owner()).toEqual(Z_OWNER);
      });

      it('should return zero address when unowned', () => {
        ownable._transferOwnership(utils.ZERO_KEY);
        expect(ownable.owner()).toEqual(utils.ZERO_KEY);
      });
    });

    describe('assertOnlyOwner', () => {
      it('should allow owner to call', () => {
        caller = OWNER;

        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).not.toThrow();
      });

      it('should fail when called by unauthorized', () => {
        caller = UNAUTHORIZED;

        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');
      });
    });

    describe('transferOwnership', () => {
      it('should transfer ownership', () => {
        caller = OWNER;
        ownable.transferOwnership(Z_NEW_OWNER, caller);
        expect(ownable.owner()).toEqual(Z_NEW_OWNER);

        // Old owner
        caller = OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');

        // Unauthorized
        caller = UNAUTHORIZED;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');

        // New owner
        caller = NEW_OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).not.toThrow();
      });

      it('should fail when unauthorized transfers ownership', () => {
        expect(() => {
          caller = UNAUTHORIZED;
          ownable.transferOwnership(Z_NEW_OWNER, caller);
        }).toThrow('Ownable: caller is not the owner');
      });

      it('should fail when transferring to a contract address', () => {
        expect(() => {
          caller = OWNER;
          ownable.transferOwnership(Z_RECIPIENT_CONTRACT, caller);
        }).toThrow('Ownable: unsafe ownership transfer');
      });

      it('should fail when transferring to zero (pk)', () => {
        caller = OWNER;

        expect(() => {
          ownable.transferOwnership(utils.ZERO_KEY, caller);
        }).toThrow('Ownable: invalid new owner');
      });

      it('should fail when transferring to zero (contract)', () => {
        caller = OWNER;

        expect(() => {
          ownable.transferOwnership(utils.ZERO_ADDRESS, caller);
        }).toThrow('Ownable: unsafe ownership transfer');
      });

      it('should transfer multiple times', () => {
        caller = OWNER;
        ownable.transferOwnership(Z_NEW_OWNER, caller);

        caller = NEW_OWNER;
        ownable.transferOwnership(Z_OWNER, caller);

        caller = OWNER;
        ownable.transferOwnership(Z_NEW_OWNER, caller);

        expect(ownable.owner()).toEqual(Z_NEW_OWNER);
      });
    });

    describe('_unsafeTransferOwnership', () => {
      describe.each(newOwnerTypes)(
        'when the owner is a %s',
        (type, newOwner) => {
          caller = OWNER;

          it('should transfer ownership', () => {
            ownable._unsafeTransferOwnership(newOwner, caller);
            expect(ownable.owner()).toEqual(newOwner);

            // Old owner
            caller = OWNER;
            expect(() => {
              ownable.assertOnlyOwner(caller);
            }).toThrow('Ownable: caller is not the owner');

            if (type === 'pubkey') {
              // New owner
              caller = NEW_OWNER;
              expect(() => {
                ownable.assertOnlyOwner(caller);
              }).not.toThrow();
            }
          });
        },
      );

      it('should fail when unauthorized transfers ownership', () => {
        caller = UNAUTHORIZED;

        expect(() => {
          ownable._unsafeTransferOwnership(Z_NEW_OWNER, caller);
        }).toThrow('Ownable: caller is not the owner');
      });

      it('should fail when transferring to zero (pk)', () => {
        caller = OWNER;

        expect(() => {
          ownable._unsafeTransferOwnership(utils.ZERO_KEY, caller);
        }).toThrow('Ownable: invalid new owner');
      });

      it('should fail when transferring to zero (contract)', () => {
        caller = OWNER;

        expect(() => {
          ownable._unsafeTransferOwnership(utils.ZERO_ADDRESS, caller);
        }).toThrow('Ownable: invalid new owner');
      });

      it('should transfer multiple times', () => {
        caller = OWNER;
        ownable._unsafeTransferOwnership(Z_NEW_OWNER, caller);

        caller = NEW_OWNER;
        ownable._unsafeTransferOwnership(Z_OWNER, caller);

        caller = OWNER;
        ownable._unsafeTransferOwnership(Z_OWNER_CONTRACT, caller);

        expect(ownable.owner()).toEqual(Z_OWNER_CONTRACT);
      });
    });

    describe('renounceOwnership', () => {
      it('should renounce ownership', () => {
        expect(ownable.owner()).toEqual(Z_OWNER);

        caller = OWNER;
        ownable.renounceOwnership(caller);

        // Check owner
        expect(ownable.owner()).toEqual(utils.ZERO_KEY);

        // Confirm revoked permissions
        caller = OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');
      });

      it('should fail when renouncing from unauthorized', () => {
        caller = UNAUTHORIZED;

        expect(() => {
          ownable.renounceOwnership(caller);
        }).toThrow('Ownable: caller is not the owner');
      });
    });

    describe('_transferOwnership', () => {
      it('should transfer ownership', () => {
        ownable._transferOwnership(Z_NEW_OWNER);
        expect(ownable.owner()).toEqual(Z_NEW_OWNER);

        // Old owner
        caller = OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');

        // Unauthorized
        caller = UNAUTHORIZED;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');

        // New owner
        caller = NEW_OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).not.toThrow();
      });

      it('should allow transfers to zero', () => {
        ownable._transferOwnership(utils.ZERO_KEY);
        expect(ownable.owner()).toEqual(utils.ZERO_KEY);
      });

      it('should fail when transferring ownership to contract address zero', () => {
        expect(() => {
          ownable._transferOwnership(utils.ZERO_ADDRESS);
        }).toThrow('Ownable: unsafe ownership transfer');
      });

      it('should fail when transferring ownership to non-zero contract address', () => {
        expect(() => {
          ownable._transferOwnership(Z_OWNER_CONTRACT);
        }).toThrow('Ownable: unsafe ownership transfer');
      });

      it('should transfer multiple times', () => {
        caller = OWNER;
        ownable._transferOwnership(Z_NEW_OWNER, caller);

        caller = NEW_OWNER;
        ownable._transferOwnership(Z_OWNER, caller);

        caller = OWNER;
        ownable._transferOwnership(Z_NEW_OWNER, caller);

        expect(ownable.owner()).toEqual(Z_NEW_OWNER);
      });
    });

    describe('_unsafeUncheckedTransferOwnership', () => {
      describe.each(newOwnerTypes)('when the owner is a %s', (_, newOwner) => {
        it('should transfer ownership', () => {
          ownable._unsafeUncheckedTransferOwnership(newOwner);
          expect(ownable.owner()).toEqual(newOwner);
        });
      });

      it('should enforce permissions after transfer (pk)', () => {
        ownable._unsafeUncheckedTransferOwnership(Z_NEW_OWNER);

        // Old owner
        caller = OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');

        // Unauthorized
        caller = UNAUTHORIZED;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).toThrow('Ownable: caller is not the owner');

        // New owner
        caller = NEW_OWNER;
        expect(() => {
          ownable.assertOnlyOwner(caller);
        }).not.toThrow();
      });

      it('should transfer multiple times', () => {
        caller = OWNER;
        ownable._unsafeUncheckedTransferOwnership(Z_NEW_OWNER, caller);

        caller = NEW_OWNER;
        ownable._unsafeUncheckedTransferOwnership(Z_OWNER, caller);

        caller = OWNER;
        ownable._unsafeUncheckedTransferOwnership(Z_OWNER_CONTRACT, caller);

        expect(ownable.owner()).toEqual(Z_OWNER_CONTRACT);
      });
    });
  });
});
