import { beforeEach, describe, expect, it } from 'vitest';
import { InitializableSimulator } from './simulators/InitializableSimulator.js';

let initializable: InitializableSimulator;

describe('Initializable', () => {
  beforeEach(() => {
    initializable = new InitializableSimulator();
  });

  it('should generate the initial ledger state deterministically', () => {
    const initializable2 = new InitializableSimulator();
    expect(initializable.getCurrentPublicState()).toEqual(
      initializable2.getCurrentPublicState(),
    );
  });

  describe('initialize', () => {
    it('should not be initialized', () => {
      expect(
        initializable.getCurrentPublicState().Initializable__isInitialized,
      ).toEqual(false);
    });

    it('should initialize', () => {
      initializable.initialize();
      expect(
        initializable.getCurrentPublicState().Initializable__isInitialized,
      ).toEqual(true);
    });
  });

  it('should fail when re-initialized', () => {
    expect(() => {
      initializable.initialize();
      initializable.initialize();
    }).toThrow('Initializable: contract already initialized');
  });

  describe('assertInitialized', () => {
    it('should fail when not initialized', () => {
      expect(() => {
        initializable.assertInitialized();
      }).toThrow('Initializable: contract not initialized');
    });

    it('should not fail when initialized', () => {
      initializable.initialize();
      initializable.assertInitialized();
    });
  });

  describe('assertNotInitialized', () => {
    it('should fail when initialized', () => {
      initializable.initialize();
      expect(() => {
        initializable.assertNotInitialized();
      }).toThrow('Initializable: contract already initialized');
    });

    it('should not fail when not initialied', () => {
      initializable.assertNotInitialized();
    });
  });
});
