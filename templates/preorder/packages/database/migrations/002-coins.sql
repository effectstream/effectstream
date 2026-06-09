-- Allowed payment coins, one row each. An item's price is now a single UNITLESS INTEGER P
-- (think "≈ USD"); the on-chain amount in a coin's smallest unit is computed as exactly
-- P * x * 10^n using integer/BigInt math, so prices never suffer floating-point approximation.
-- x and n are admin-updatable on-chain via the EffectstreamL2 `set-coin` command.
CREATE TABLE offchain_coins (
  token TEXT NOT NULL,          -- 'eth' | 'usdc' | 'ada'
  symbol TEXT NOT NULL,         -- display symbol
  chain TEXT NOT NULL,          -- 'evm' | 'cardano'
  payment_token TEXT NOT NULL,  -- on-chain token address (zero address for native ETH / ADA)
  type TEXT NOT NULL,           -- smallest-unit name: 'wei' | 'microusdc' | 'lovelace'
  x BIGINT NOT NULL,            -- multiplier
  n INTEGER NOT NULL,           -- exponent → amount = P * x * 10^n
  decimals INTEGER NOT NULL,    -- token decimals (for display only)
  PRIMARY KEY (token)
);

-- Seed: 1 unitless unit ≈ 1 USD. (Reference rates: 1 ETH ≈ 2002.80 USD, 1 ADA ≈ 0.23 USD.)
--   eth : P * 5 * 10^14 wei      (5e14 wei ≈ 0.0005 ETH ≈ 1 USD)
--   usdc: P * 1 * 10^6 microUSDC (1e6 = 1 USDC = 1 USD)
--   ada : P * 435 * 10^4 lovelace (4 350 000 lovelace ≈ 4.35 ADA ≈ 1 USD)
INSERT INTO offchain_coins (token, symbol, chain, payment_token, type, x, n, decimals) VALUES
  ('eth',  'ETH',  'evm',     '0x0000000000000000000000000000000000000000', 'wei',       5,   14, 18),
  ('usdc', 'USDC', 'evm',     '0x5fbdb2315678afecb367f032d93f642f64180aa3', 'microusdc', 1,   6,  6),
  ('ada',  'ADA',  'cardano', '0x0000000000000000000000000000000000000000', 'lovelace',  435, 4,  6);

-- Items now carry one unitless integer price P (standard items) or unlock threshold (reward items).
ALTER TABLE offchain_products ADD COLUMN price BIGINT NOT NULL DEFAULT 0;

-- The per-token price table is superseded by the unitless price + coins model above.
DROP TABLE offchain_product_prices;
