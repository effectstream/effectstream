import { describe, expect, test } from 'bun:test';
import {
  buildFaucetUrl,
  DEFAULT_FAUCET_URL,
  DEFAULT_MIDNIGHT_NETWORK_ID,
} from './faucetUrl';

describe('external faucet URL', () => {
  test('uses the published service and preprod when nothing is configured', () => {
    expect(buildFaucetUrl(undefined, undefined)).toBe(
      `${DEFAULT_FAUCET_URL}?network=${DEFAULT_MIDNIGHT_NETWORK_ID}`,
    );
  });

  test.each(['mainnet', 'preview', 'preprod', 'undeployed'])(
    'preserves an explicit %s network',
    (network) => {
      expect(buildFaucetUrl(undefined, network)).toBe(
        `${DEFAULT_FAUCET_URL}?network=${network}`,
      );
    },
  );

  test('accepts the display network name used by the navigation state', () => {
    expect(buildFaucetUrl(undefined, 'Preview')).toBe(
      `${DEFAULT_FAUCET_URL}?network=preview`,
    );
  });

  test('replaces network and preserves other configured query parameters', () => {
    expect(
      buildFaucetUrl(
        'https://78001abb.mint-test-tokens.pages.dev/?source=offer-files&network=preview',
        'undeployed',
      ),
    ).toBe(
      'https://78001abb.mint-test-tokens.pages.dev/?source=offer-files&network=undeployed',
    );
  });
});
