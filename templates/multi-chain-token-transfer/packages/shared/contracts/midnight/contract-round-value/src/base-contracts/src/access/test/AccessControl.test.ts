import {
  type CoinPublicKey,
  convert_bigint_to_Uint8Array,
} from '@midnight-ntwrk/compact-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessControlSimulator } from './simulators/AccessControlSimulator.js';
import * as utils from './utils/address.js';

// Callers
const OPERATOR_1 = utils.toHexPadded('OPERATOR_1');
const ADMIN = utils.toHexPadded('ADMIN');
const CUSTOM_ADMIN = utils.toHexPadded('CUSTOM_ADMIN');
const UNAUTHORIZED = utils.toHexPadded('UNAUTHORIZED');
const OPERATOR_CONTRACT = utils.toHexPadded('OPERATOR_CONTRACT');

// Encoded PK/Addresses
const Z_OPERATOR_1 = utils.createEitherTestUser('OPERATOR_1');
const Z_OPERATOR_2 = utils.createEitherTestUser('OPERATOR_2');
const Z_ADMIN = utils.createEitherTestUser('ADMIN');
const Z_CUSTOM_ADMIN = utils.createEitherTestUser('CUSTOM_ADMIN');
const Z_UNAUTHORIZED = utils.createEitherTestUser('UNAUTHORIZED');
const Z_OPERATOR_CONTRACT =
  utils.createEitherTestContractAddress('OPERATOR_CONTRACT');

// Roles
const DEFAULT_ADMIN_ROLE = utils.zeroUint8Array();
const OPERATOR_ROLE_1 = convert_bigint_to_Uint8Array(32, 1n);
const OPERATOR_ROLE_2 = convert_bigint_to_Uint8Array(32, 2n);
const OPERATOR_ROLE_3 = convert_bigint_to_Uint8Array(32, 3n);
const CUSTOM_ADMIN_ROLE = convert_bigint_to_Uint8Array(32, 4n);
const UNINITIALIZED_ROLE = convert_bigint_to_Uint8Array(32, 5n);

let accessControl: AccessControlSimulator;
let caller: CoinPublicKey;

const callerTypes = {
  contract: OPERATOR_CONTRACT,
  pubkey: OPERATOR_1,
};

const operatorTypes = [
  ['contract', Z_OPERATOR_CONTRACT],
  ['pubkey', Z_OPERATOR_1],
] as const;

const operatorRoles = [OPERATOR_ROLE_1, OPERATOR_ROLE_2];
const operatorPKs = [Z_OPERATOR_1, Z_OPERATOR_2, Z_OPERATOR_CONTRACT];

describe('AccessControl', () => {
  beforeEach(() => {
    accessControl = new AccessControlSimulator();
  });

  describe('hasRole', () => {
    beforeEach(() => {
      accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1);
    });

    it('should return true when operator has a role', () => {
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);
    });

    it('should return false when unauthorized', () => {
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_UNAUTHORIZED)).toBe(
        false,
      );
    });

    it('should return false when role does not exist', () => {
      expect(accessControl.hasRole(UNINITIALIZED_ROLE, Z_OPERATOR_1)).toBe(
        false,
      );
    });
  });

  describe('assertOnlyRole', () => {
    beforeEach(() => {
      accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1);
    });

    it('should allow operator with role to call', () => {
      caller = OPERATOR_1;
      expect(() =>
        accessControl.assertOnlyRole(OPERATOR_ROLE_1, caller),
      ).not.toThrow();
    });

    it('should throw if caller is unauthorized', () => {
      caller = UNAUTHORIZED;
      expect(() =>
        accessControl.assertOnlyRole(OPERATOR_ROLE_1, caller),
      ).toThrow('AccessControl: unauthorized account');
    });

    it('should throw if ContractAddress with role is caller', () => {
      caller = OPERATOR_CONTRACT;
      accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT);

      expect(() =>
        accessControl.assertOnlyRole(OPERATOR_ROLE_1, caller),
      ).toThrow('AccessControl: unauthorized account');
    });
  });

  describe('_checkRole', () => {
    beforeEach(() => {
      accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1);
      accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT);
    });

    describe.each(operatorTypes)(
      'when the operator is a %s',
      (_operatorType, _operator) => {
        it(`should not throw if ${_operatorType} has role`, () => {
          expect(() =>
            accessControl._checkRole(OPERATOR_ROLE_1, _operator),
          ).not.toThrow();
        });
      },
    );

    it('should throw if operator is unauthorized', () => {
      expect(() =>
        accessControl._checkRole(OPERATOR_ROLE_1, Z_UNAUTHORIZED),
      ).toThrow('AccessControl: unauthorized account');
    });
  });

  describe('getRoleAdmin', () => {
    it('should return default admin role if admin role not set', () => {
      expect(accessControl.getRoleAdmin(OPERATOR_ROLE_1)).toEqual(
        DEFAULT_ADMIN_ROLE,
      );
    });

    it('should return custom admin role if set', () => {
      accessControl._setRoleAdmin(OPERATOR_ROLE_1, CUSTOM_ADMIN_ROLE);
      expect(accessControl.getRoleAdmin(OPERATOR_ROLE_1)).toEqual(
        CUSTOM_ADMIN_ROLE,
      );
    });
  });

  describe('grantRole', () => {
    beforeEach(() => {
      accessControl._grantRole(DEFAULT_ADMIN_ROLE, Z_ADMIN);
      caller = ADMIN;
    });

    it('admin should grant role', () => {
      accessControl.grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller);
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);
    });

    it('admin should grant multiple roles', () => {
      for (let i = 0; i < operatorRoles.length; i++) {
        // length - 1 because we test ContractAddress separately
        for (let j = 0; j < operatorPKs.length - 1; j++) {
          accessControl.grantRole(operatorRoles[i], operatorPKs[j], caller);
          expect(accessControl.hasRole(operatorRoles[i], operatorPKs[j])).toBe(
            true,
          );
        }
      }
    });

    it('should throw if operator grants role', () => {
      accessControl.grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller);

      caller = OPERATOR_1;
      expect(() => {
        accessControl.grantRole(OPERATOR_ROLE_1, Z_UNAUTHORIZED, caller);
      }).toThrow('AccessControl: unauthorized account');
    });

    it('should throw if admin grants role to ContractAddress', () => {
      expect(() => {
        accessControl.grantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT, caller);
      }).toThrow('AccessControl: unsafe role approval');
    });
  });

  describe('revokeRole', () => {
    beforeEach(() => {
      accessControl._grantRole(DEFAULT_ADMIN_ROLE, Z_ADMIN);
      accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1);
      accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT);
    });

    describe.each(operatorTypes)(
      'when the operator is a %s',
      (_operatorType, _operator) => {
        it('admin should revoke role', () => {
          caller = ADMIN;

          accessControl.revokeRole(OPERATOR_ROLE_1, _operator, caller);
          expect(accessControl.hasRole(OPERATOR_ROLE_1, _operator)).toBe(false);
        });

        it('should throw if operator revokes role', () => {
          caller = callerTypes[_operatorType];

          expect(() => {
            accessControl.revokeRole(OPERATOR_ROLE_1, Z_UNAUTHORIZED, caller);
          }).toThrow('AccessControl: unauthorized account');
        });
      },
    );

    it('admin should revoke multiple roles', () => {
      caller = ADMIN;

      for (let i = 0; i < operatorRoles.length; i++) {
        for (let j = 0; j < operatorPKs.length; j++) {
          accessControl._unsafeGrantRole(operatorRoles[i], operatorPKs[j]);
          accessControl.revokeRole(operatorRoles[i], operatorPKs[j], caller);
          expect(accessControl.hasRole(operatorRoles[i], operatorPKs[j])).toBe(
            false,
          );
        }
      }
    });
  });

  describe('renounceRole', () => {
    beforeEach(() => {
      accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1);
      caller = OPERATOR_1;
    });

    it('should allow operator to renounce own role', () => {
      accessControl.renounceRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller);
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(false);
    });

    it('ContractAddress renounce should throw', () => {
      caller = OPERATOR_CONTRACT;
      accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT);

      expect(() => {
        accessControl.renounceRole(
          OPERATOR_ROLE_1,
          Z_OPERATOR_CONTRACT,
          caller,
        );
      }).toThrow('AccessControl: bad confirmation');
    });

    it('unauthorized renounce should throw', () => {
      caller = UNAUTHORIZED;
      expect(() => {
        accessControl.renounceRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller);
      }).toThrow('AccessControl: bad confirmation');
    });
  });

  describe('_setRoleAdmin', () => {
    beforeEach(() => {
      accessControl._setRoleAdmin(OPERATOR_ROLE_1, CUSTOM_ADMIN_ROLE);
    });

    it('should set role admin', () => {
      expect(accessControl.getRoleAdmin(OPERATOR_ROLE_1)).toEqual(
        CUSTOM_ADMIN_ROLE,
      );
    });

    it('should set multiple role admins', () => {
      accessControl._setRoleAdmin(OPERATOR_ROLE_2, CUSTOM_ADMIN_ROLE);
      accessControl._setRoleAdmin(OPERATOR_ROLE_3, CUSTOM_ADMIN_ROLE);

      expect(accessControl.getRoleAdmin(OPERATOR_ROLE_1)).toEqual(
        CUSTOM_ADMIN_ROLE,
      );
      expect(accessControl.getRoleAdmin(OPERATOR_ROLE_2)).toEqual(
        CUSTOM_ADMIN_ROLE,
      );
      expect(accessControl.getRoleAdmin(OPERATOR_ROLE_3)).toEqual(
        CUSTOM_ADMIN_ROLE,
      );
    });

    it('should authorize new admin to grant / revoke roles', () => {
      caller = CUSTOM_ADMIN;

      accessControl._grantRole(CUSTOM_ADMIN_ROLE, Z_CUSTOM_ADMIN);
      accessControl._setRoleAdmin(OPERATOR_ROLE_1, CUSTOM_ADMIN_ROLE);

      expect(() =>
        accessControl.grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller),
      ).not.toThrow();
      expect(() =>
        accessControl.revokeRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller),
      ).not.toThrow();
    });

    it('should disallow previous admin from granting / revoking roles', () => {
      caller = ADMIN;

      accessControl._grantRole(DEFAULT_ADMIN_ROLE, Z_ADMIN);
      accessControl._grantRole(CUSTOM_ADMIN_ROLE, Z_CUSTOM_ADMIN);
      accessControl._setRoleAdmin(OPERATOR_ROLE_1, CUSTOM_ADMIN_ROLE);

      expect(() =>
        accessControl.grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller),
      ).toThrow('AccessControl: unauthorized account');
      expect(() =>
        accessControl.revokeRole(OPERATOR_ROLE_1, Z_OPERATOR_1, caller),
      ).toThrow('AccessControl: unauthorized account');
    });
  });

  describe('_grantRole', () => {
    it('should grant role', () => {
      expect(accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(
        true,
      );
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);
    });

    it('should return false if hasRole already', () => {
      expect(accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(
        true,
      );
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);

      expect(accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(
        false,
      );
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);
    });

    it('should fail to grant role to a ContractAddress', () => {
      expect(() => {
        accessControl._grantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT);
      }).toThrow('AccessControl: unsafe role approval');
    });

    it('should grant multiple roles', () => {
      for (let i = 0; i < operatorRoles.length; i++) {
        // length - 1 because we test ContractAddress in the above test
        for (let j = 0; j < operatorPKs.length - 1; j++) {
          accessControl._grantRole(operatorRoles[i], operatorPKs[j]);
          expect(accessControl.hasRole(operatorRoles[i], operatorPKs[j])).toBe(
            true,
          );
        }
      }
    });
  });

  describe('_unsafeGrantRole', () => {
    it('should grant role', () => {
      expect(
        accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_1),
      ).toBe(true);
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);
    });

    it('should return false if hasRole already', () => {
      expect(
        accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_1),
      ).toBe(true);
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);

      expect(
        accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_1),
      ).toBe(false);
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(true);
    });

    it('should grant role to a ContractAddress', () => {
      expect(
        accessControl._unsafeGrantRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT),
      ).toBe(true);
      expect(accessControl.hasRole(OPERATOR_ROLE_1, Z_OPERATOR_CONTRACT)).toBe(
        true,
      );
    });

    it('should grant multiple roles', () => {
      for (let i = 0; i < operatorRoles.length; i++) {
        for (let j = 0; j < operatorPKs.length; j++) {
          expect(
            accessControl._unsafeGrantRole(operatorRoles[i], operatorPKs[j]),
          ).toBe(true);
          expect(accessControl.hasRole(operatorRoles[i], operatorPKs[j])).toBe(
            true,
          );
        }
      }
    });
  });

  describe('_revokeRole', () => {
    describe.each(operatorTypes)(
      'when the operator is a %s',
      (_, _operator) => {
        it('should revoke role', () => {
          accessControl._unsafeGrantRole(OPERATOR_ROLE_1, _operator);
          expect(accessControl._revokeRole(OPERATOR_ROLE_1, _operator)).toBe(
            true,
          );
          expect(accessControl.hasRole(OPERATOR_ROLE_1, _operator)).toBe(false);
        });
      },
    );

    it('should return false if account does not have role', () => {
      expect(accessControl._revokeRole(OPERATOR_ROLE_1, Z_OPERATOR_1)).toBe(
        false,
      );
    });

    it('should revoke multiple roles', () => {
      for (let i = 0; i < operatorRoles.length; i++) {
        for (let j = 0; j < operatorPKs.length; j++) {
          accessControl._unsafeGrantRole(operatorRoles[i], operatorPKs[j]);
          expect(
            accessControl._revokeRole(operatorRoles[i], operatorPKs[j]),
          ).toBe(true);
          expect(accessControl.hasRole(operatorRoles[i], operatorPKs[j])).toBe(
            false,
          );
        }
      }
    });
  });
});
