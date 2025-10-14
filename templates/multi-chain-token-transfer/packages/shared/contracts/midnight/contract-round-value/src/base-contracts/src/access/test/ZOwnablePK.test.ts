import {
  CompactTypeBytes,
  CompactTypeVector,
  convert_bigint_to_Uint8Array,
  persistentHash,
  transientHash,
  upgradeFromTransient,
} from '@midnight-ntwrk/compact-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ZswapCoinPublicKey } from '../../../artifacts/MockOwnable/contract/index.cjs';
import { ZOwnablePKPrivateState } from '../witnesses/ZOwnablePKWitnesses.js';
import { ZOwnablePKSimulator } from './simulators/ZOwnablePKSimulator.js';
import * as utils from './utils/address.js';

// PKs
const [OWNER, Z_OWNER] = utils.generatePubKeyPair('OWNER');
const [NEW_OWNER, Z_NEW_OWNER] = utils.generatePubKeyPair('NEW_OWNER');
const [UNAUTHORIZED, _] = utils.generatePubKeyPair('UNAUTHORIZED');

const INSTANCE_SALT = new Uint8Array(32).fill(8675309);
const BAD_NONCE = Buffer.from(Buffer.alloc(32, 'BAD_NONCE'));
const DOMAIN = 'ZOwnablePK:shield:';
const INIT_COUNTER = 1n;

const isInit = true;
let secretNonce: Uint8Array;
let ownable: ZOwnablePKSimulator;

// Helpers
const createIdHash = (
  pk: ZswapCoinPublicKey,
  nonce: Uint8Array,
): Uint8Array => {
  const rt_type = new CompactTypeVector(2, new CompactTypeBytes(32));

  const bPK = pk.bytes;
  return persistentHash(rt_type, [bPK, nonce]);
};

const buildCommitmentFromId = (
  id: Uint8Array,
  instanceSalt: Uint8Array,
  counter: bigint,
): Uint8Array => {
  const rt_type = new CompactTypeVector(4, new CompactTypeBytes(32));
  const bCounter = convert_bigint_to_Uint8Array(32, counter);
  const bDomain = new TextEncoder().encode(DOMAIN);

  const commitment = persistentHash(rt_type, [
    id,
    instanceSalt,
    bCounter,
    bDomain,
  ]);
  return commitment;
};

const buildCommitment = (
  pk: ZswapCoinPublicKey,
  nonce: Uint8Array,
  instanceSalt: Uint8Array,
  counter: bigint,
  domain: string,
): Uint8Array => {
  const id = createIdHash(pk, nonce);

  const rt_type = new CompactTypeVector(4, new CompactTypeBytes(32));
  const bCounter = convert_bigint_to_Uint8Array(32, counter);
  const bDomain = new TextEncoder().encode(domain);

  const commitment = persistentHash(rt_type, [
    id,
    instanceSalt,
    bCounter,
    bDomain,
  ]);
  return commitment;
};

describe('ZOwnablePK', () => {
  describe('before initialize', () => {
    it('should fail when setting owner commitment as 0', () => {
      expect(() => {
        const badId = new Uint8Array(32).fill(0);
        new ZOwnablePKSimulator(badId, INSTANCE_SALT, isInit);
      }).toThrow('ZOwnablePK: invalid id');
    });

    it('should initialize with non-zero commitment', () => {
      const notZeroPK = utils.encodeToPK('NOT_ZERO');
      const notZeroNonce = new Uint8Array(32).fill(1);
      const nonZeroId = createIdHash(notZeroPK, notZeroNonce);
      ownable = new ZOwnablePKSimulator(nonZeroId, INSTANCE_SALT, isInit);

      const nonZeroCommitment = buildCommitmentFromId(
        nonZeroId,
        INSTANCE_SALT,
        INIT_COUNTER,
      );
      expect(ownable.owner()).toEqual(nonZeroCommitment);
    });
  });

  describe('when not deployed and not initialized', () => {
    const isNotInit = false;

    beforeEach(() => {
      ownable = new ZOwnablePKSimulator(
        randomByteArray,
        INSTANCE_SALT,
        isNotInit,
      );
    });
    type FailingCircuits = [method: keyof ZOwnablePKSimulator, args: unknown[]];
    const randomByteArray = new Uint8Array(32).fill(123);
    const randomCounter = 321n;
    // Circuit calls should fail before the args are used
    const circuitsToFail: FailingCircuits[] = [
      ['owner', []],
      ['assertOnlyOwner', []],
      ['transferOwnership', [randomByteArray]],
      ['renounceOwnership', []],
      ['_computeOwnerCommitment', [randomByteArray, randomCounter]],
      ['_transferOwnership', [randomByteArray]],
    ];
    it.each(circuitsToFail)('%s should fail', (circuitName, args) => {
      expect(() => {
        (ownable[circuitName] as (...args: unknown[]) => unknown)(...args);
      }).toThrow('Initializable: contract not initialized');
    });

    it('should allow pure computeOwnerId', () => {
      const eitherOwner = utils.createEitherTestUser('OWNER');

      expect(() => {
        ownable._computeOwnerId(eitherOwner, randomByteArray);
      }).not.toThrow();
    });
  });

  describe('when incorrect hashing algo (not SHA256) is used to generate initial owner id', () => {
    // ZOwnablePK only supports sha256 for owner id calculation
    // Obviously, using any other algo for the id will not work
    const badHashAlgo = (pk: ZswapCoinPublicKey, nonce: Uint8Array) => {
      const rt_type = new CompactTypeVector(2, new CompactTypeBytes(32));
      return upgradeFromTransient(transientHash(rt_type, [pk.bytes, nonce]));
    };
    const secretNonce = ZOwnablePKPrivateState.generate().secretNonce;
    const badOwnerId = badHashAlgo(Z_OWNER, secretNonce);

    beforeEach(() => {
      ownable = new ZOwnablePKSimulator(badOwnerId, INSTANCE_SALT, isInit);
    });
    //
    type FailingCircuits = [method: keyof ZOwnablePKSimulator, args: unknown[]];
    const protectedCircuits: FailingCircuits[] = [
      ['assertOnlyOwner', []],
      ['transferOwnership', [badOwnerId]],
      ['renounceOwnership', []],
    ];

    it.each(protectedCircuits)('%s should fail', (circuitName, args) => {
      ownable.callerCtx.setCaller(OWNER);

      expect(() => {
        (ownable[circuitName] as (...args: unknown[]) => unknown)(...args);
      }).toThrow('ZOwnablePK: caller is not the owner');
    });
  });

  describe('after initialization', () => {
    beforeEach(() => {
      // Create private state object and generate nonce
      const PS = ZOwnablePKPrivateState.generate();
      // Bind nonce for convenience
      secretNonce = PS.secretNonce;
      // Prepare owner ID with gen nonce
      const ownerId = createIdHash(Z_OWNER, secretNonce);
      // Deploy contract with derived owner commitment and PS
      ownable = new ZOwnablePKSimulator(ownerId, INSTANCE_SALT, isInit, {
        privateState: PS,
      });
    });

    describe('owner', () => {
      it('should return the correct owner commitment', () => {
        const expCommitment = buildCommitment(
          Z_OWNER,
          secretNonce,
          INSTANCE_SALT,
          INIT_COUNTER,
          DOMAIN,
        );
        expect(ownable.owner()).toEqual(expCommitment);
      });
    });

    describe('transferOwnership', () => {
      let newOwnerCommitment: Uint8Array;
      let newOwnerNonce: Uint8Array;
      let newIdHash: Uint8Array;
      let newCounter: bigint;

      beforeEach(() => {
        // Prepare new owner commitment
        newOwnerNonce = ZOwnablePKPrivateState.generate().secretNonce;
        newCounter = INIT_COUNTER + 1n;
        newIdHash = createIdHash(Z_NEW_OWNER, newOwnerNonce);
        newOwnerCommitment = buildCommitment(
          Z_NEW_OWNER,
          newOwnerNonce,
          INSTANCE_SALT,
          newCounter,
          DOMAIN,
        );
      });

      it('should transfer ownership', () => {
        ownable.callerCtx.setCaller(OWNER);
        ownable.transferOwnership(newIdHash);
        expect(ownable.owner()).toEqual(newOwnerCommitment);

        // Old owner
        ownable.callerCtx.setCaller(OWNER);
        expect(() => {
          ownable.assertOnlyOwner();
        }).toThrow('ZOwnablePK: caller is not the owner');

        // Unauthorized
        ownable.callerCtx.setCaller(UNAUTHORIZED);
        expect(() => {
          ownable.assertOnlyOwner();
        }).toThrow('ZOwnablePK: caller is not the owner');

        // New owner
        ownable.callerCtx.setCaller(NEW_OWNER);
        ownable.privateState.injectSecretNonce(Buffer.from(newOwnerNonce));
        expect(ownable.assertOnlyOwner()).not.to.throw;
      });

      it('should fail when transferring to id zero', () => {
        ownable.callerCtx.setCaller(OWNER);
        const badId = new Uint8Array(32).fill(0);
        expect(() => {
          ownable.transferOwnership(badId);
        }).toThrow('ZOwnablePK: invalid id');
      });

      it('should fail when unauthorized transfers ownership', () => {
        ownable.callerCtx.setCaller(UNAUTHORIZED);
        expect(() => {
          ownable.transferOwnership(newOwnerCommitment);
        }).toThrow('ZOwnablePK: caller is not the owner');
      });

      /**
       * @description More thoroughly tested in `_transferOwnership`
       * */
      it('should bump instance after transfer', () => {
        const beforeInstance = ownable.getPublicState().ZOwnablePK__counter;

        // Transfer
        ownable.callerCtx.setCaller(OWNER);
        ownable.transferOwnership(newOwnerCommitment);

        // Check counter
        const afterInstance = ownable.getPublicState().ZOwnablePK__counter;
        expect(afterInstance).toEqual(beforeInstance + 1n);
      });

      it('should change commitment when transferring ownership to self with same pk + nonce)', () => {
        // Confirm current commitment
        const repeatedId = createIdHash(Z_OWNER, secretNonce);
        const initCommitment = ownable.owner();
        const expInitCommitment = buildCommitmentFromId(
          repeatedId,
          INSTANCE_SALT,
          INIT_COUNTER,
        );
        expect(initCommitment).toEqual(expInitCommitment);

        // Transfer ownership to self with the same id -> `H(pk, nonce)`
        ownable.callerCtx.setCaller(OWNER);
        ownable.transferOwnership(repeatedId);

        // Check commitments don't match
        const newCommitment = ownable.owner();
        expect(initCommitment).not.toEqual(newCommitment);

        // Build commitment locally and validate new commitment == expected
        const bumpedCounter = INIT_COUNTER + 1n;
        const expNewCommitment = buildCommitmentFromId(
          repeatedId,
          INSTANCE_SALT,
          bumpedCounter,
        );
        expect(newCommitment).toEqual(expNewCommitment);

        // Check same owner maintains permissions after transfer
        ownable.callerCtx.setCaller(OWNER);
        expect(ownable.assertOnlyOwner()).not.to.throw;
      });
    });

    describe('renounceOwnership', () => {
      it('should renounce ownership', () => {
        ownable.callerCtx.setCaller(OWNER);
        ownable.renounceOwnership();

        // Check owner is reset
        expect(ownable.owner()).toEqual(new Uint8Array(32).fill(0));

        // Check revoked permissions
        expect(() => {
          ownable.assertOnlyOwner();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });

      it('should fail when renouncing from unauthorized', () => {
        ownable.callerCtx.setCaller(UNAUTHORIZED);
        expect(() => {
          ownable.renounceOwnership();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });

      it('should fail when renouncing from authorized with bad nonce', () => {
        ownable.callerCtx.setCaller(OWNER);
        ownable.privateState.injectSecretNonce(BAD_NONCE);
        expect(() => {
          ownable.renounceOwnership();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });

      it('should fail when renouncing from unauthorized with bad nonce', () => {
        ownable.callerCtx.setCaller(UNAUTHORIZED);
        ownable.privateState.injectSecretNonce(BAD_NONCE);
        expect(() => {
          ownable.renounceOwnership();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });
    });

    describe('assertOnlyOwner', () => {
      it('should allow authorized caller with correct nonce to call', () => {
        // Check nonce is correct
        expect(ownable.privateState.getCurrentSecretNonce()).toEqual(
          secretNonce,
        );

        ownable.callerCtx.setCaller(OWNER);
        expect(ownable.assertOnlyOwner()).to.not.throw;
      });

      it('should fail when the authorized caller has the wrong nonce', () => {
        // Inject bad nonce
        ownable.privateState.injectSecretNonce(BAD_NONCE);

        // Check nonce does not match
        expect(ownable.privateState.getCurrentSecretNonce()).not.toEqual(
          secretNonce,
        );

        // Set caller and call circuit
        ownable.callerCtx.setCaller(OWNER);
        expect(() => {
          ownable.assertOnlyOwner();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });

      it('should fail when unauthorized caller has the correct nonce', () => {
        // Check nonce is correct
        expect(ownable.privateState.getCurrentSecretNonce()).toEqual(
          secretNonce,
        );

        ownable.callerCtx.setCaller(UNAUTHORIZED);
        expect(() => {
          ownable.assertOnlyOwner();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });

      it('should fail when unauthorized caller has the wrong nonce', () => {
        // Inject bad nonce
        ownable.privateState.injectSecretNonce(BAD_NONCE);

        // Check nonce does not match
        expect(ownable.privateState.getCurrentSecretNonce()).not.toEqual(
          secretNonce,
        );

        // Set unauthorized caller and call circuit
        ownable.callerCtx.setCaller(UNAUTHORIZED);
        expect(() => {
          ownable.assertOnlyOwner();
        }).toThrow('ZOwnablePK: caller is not the owner');
      });
    });

    describe('_computeOwnerCommitment', () => {
      const MAX_U64 = 2n ** 64n - 1n;
      const testCases = [
        ...Array.from({ length: 10 }, (_, i) => ({
          label: `User${i}`,
          ownerPK: utils.encodeToPK(`User${i}`),
          counter: BigInt(Math.floor(Math.random() * 2 ** 64 - 1)),
        })),
        {
          label: 'ZeroCounter',
          ownerPK: utils.encodeToPK('ZeroCounter'),
          counter: 0n,
        },
        {
          label: 'MaxCounter',
          ownerPK: utils.encodeToPK('MaxUser'),
          counter: MAX_U64,
        },
      ];
      it.each(testCases)(
        'should match commitment for $label with counter $counter',
        ({ ownerPK, counter }) => {
          const id = createIdHash(ownerPK, secretNonce);

          // Check buildCommitmentFromId
          const hashFromContract = ownable._computeOwnerCommitment(id, counter);
          const hashFromHelper1 = buildCommitmentFromId(
            id,
            INSTANCE_SALT,
            counter,
          );
          expect(hashFromContract).toEqual(hashFromHelper1);

          // Check buildCommitment
          const hashFromHelper2 = buildCommitment(
            ownerPK,
            secretNonce,
            INSTANCE_SALT,
            counter,
            DOMAIN,
          );
          expect(hashFromHelper1).toEqual(hashFromHelper2);
        },
      );
    });

    describe('_computeOwnerId', () => {
      const testCases = [
        ...Array.from({ length: 10 }, (_, i) => ({
          label: `User${i}`,
          eitherOwner: utils.createEitherTestUser(`User${i}`),
          nonce: new Uint8Array(32).fill(i),
        })),
        {
          label: 'All-zero nonce',
          eitherOwner: utils.createEitherTestUser('ZeroUser'),
          nonce: new Uint8Array(32).fill(0),
        },
        {
          label: 'Max nonce',
          eitherOwner: utils.createEitherTestUser('MaxUser'),
          nonce: new Uint8Array(32).fill(255),
        },
      ];

      it.each(testCases)(
        'should match local and contract owner id for $label',
        ({ eitherOwner, nonce }) => {
          const ownerId = ownable._computeOwnerId(eitherOwner, nonce);
          const expId = createIdHash(eitherOwner.left, nonce);
          expect(ownerId).toEqual(expId);
        },
      );

      it('should fail to compute ContractAddress id', () => {
        const eitherContract =
          utils.createEitherTestContractAddress('CONTRACT');
        expect(() => {
          ownable._computeOwnerId(eitherContract, secretNonce);
        }).toThrow('ZOwnablePK: contract address owners are not yet supported');
      });
    });

    describe('_transferOwnership', () => {
      it('should transfer ownership', () => {
        const id = createIdHash(Z_OWNER, secretNonce);
        ownable._transferOwnership(id);

        const nextCounter = INIT_COUNTER + 1n;
        const expCommitment = buildCommitmentFromId(
          id,
          INSTANCE_SALT,
          nextCounter,
        );
        expect(ownable.owner()).toEqual(expCommitment);
      });

      it('should bump the counter with each transfer', () => {
        const nTransfers = 10;
        const counterStart = 2; // count starts at 2 bc the constructor bumps the count to 1
        for (let i = counterStart; i <= nTransfers; i++) {
          const pk = utils.encodeToPK(`Id${i}`);
          const nonce = new Uint8Array(32).fill(i);
          const id = createIdHash(pk, nonce);
          ownable._transferOwnership(id);

          expect(ownable.getPublicState().ZOwnablePK__counter).toEqual(
            BigInt(i),
          );
        }
      });

      it('should allow transfer to all zeroes id', () => {
        const zeroId = utils.zeroUint8Array();
        ownable._transferOwnership(zeroId);

        const nextCounter = INIT_COUNTER + 1n;
        const expCommitment = buildCommitmentFromId(
          zeroId,
          INSTANCE_SALT,
          nextCounter,
        );
        expect(ownable.owner()).toEqual(expCommitment);
      });

      it('should allow anyone to transfer', () => {
        ownable.callerCtx.setCaller(OWNER);
        const id = createIdHash(Z_OWNER, secretNonce);
        expect(ownable._transferOwnership(id)).not.to.throw;

        ownable.callerCtx.setCaller(UNAUTHORIZED);
        expect(ownable._transferOwnership(id)).not.to.throw;
      });
    });
  });
});
