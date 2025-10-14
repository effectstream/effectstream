import { beforeEach, describe, expect, it } from 'vitest';
import { PausableSimulator } from './simulators/PausableSimulator.js';

let pausable: PausableSimulator;

describe('Pausable', () => {
  beforeEach(() => {
    pausable = new PausableSimulator();
  });

  describe('when not paused', () => {
    it('should not be paused in initial state', () => {
      expect(pausable.isPaused()).toBe(false);
    });

    it('should throw when calling assertPaused', () => {
      expect(() => {
        pausable.assertPaused();
      }).toThrow('Pausable: not paused');
    });

    it('should not throw when calling assertNotPaused', () => {
      pausable.assertNotPaused();
    });

    it('should pause from unpaused state', () => {
      pausable.pause();
      expect(pausable.isPaused()).toBe(true);
    });

    it('should throw when unpausing in an unpaused state', () => {
      expect(() => {
        pausable.unpause();
      }).toThrow('Pausable: not paused');
    });
  });

  describe('when paused', () => {
    beforeEach(() => {
      pausable.pause();
    });

    it('should not throw when calling assertPaused', () => {
      pausable.assertPaused();
    });

    it('should throw when calling assertNotPaused', () => {
      expect(() => {
        pausable.assertNotPaused();
      }).toThrow('Pausable: paused');
    });

    it('should unpause from paused state', () => {
      pausable.unpause();
      expect(pausable.isPaused()).toBe(false);
    });

    it('should throw when pausing in an paused state', () => {
      expect(() => {
        pausable.pause();
      }).toThrow('Pausable: paused');
    });
  });

  describe('Multiple Operations', () => {
    it('should handle pause → unpause → pause sequence', () => {
      pausable.pause();
      expect(pausable.isPaused()).toBe(true);

      pausable.unpause();
      expect(pausable.isPaused()).toBe(false);

      pausable.pause();
      expect(pausable.isPaused()).toBe(true);
    });
  });
});
