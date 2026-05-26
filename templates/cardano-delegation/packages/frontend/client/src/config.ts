export const API_BASE = "/api";
export const YACI_BASE = "/yaci";
export const DOLOS_BASE = "/dolos";
export const POLL_INTERVAL_MS = 2000;

export const YACI_GENESIS_POOL_HASH =
  "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57";
export const YACI_GENESIS_POOL_BECH32 =
  "pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy";

export const TEST_POOL_2_HASH =
  "82ec502f8c0a51e7c0db410e6722dd42df3b8e11f48e833f9fdf2941";
export const TEST_POOL_2_BECH32 =
  "pool1stk9qtuvpfg70sxmgy8xwgkagt0nhrs37j8gx0ulmu55zpe0l2m";

export const AVAILABLE_POOLS = [
  { name: "Genesis Pool", hash: YACI_GENESIS_POOL_HASH, bech32: YACI_GENESIS_POOL_BECH32 },
  { name: "Test Pool 2", hash: TEST_POOL_2_HASH, bech32: TEST_POOL_2_BECH32 },
];
