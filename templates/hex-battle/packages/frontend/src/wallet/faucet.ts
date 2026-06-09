// Dev-only Hardhat faucet.
//
// This is the ONLY hardcoded private key left in the wallet module, and it is
// used purely as a *funding source*: a freshly-generated random "browser
// wallet" starts with 0 ETH, so it can't pay gas for Hex Battle's
// self-sequenced transactions. We top it up from Hardhat's well-known account
// #0 (public, deterministic, pre-funded on every Hardhat node) so the first
// createLobby has gas. The faucet key is NEVER a player identity.
//
// On a real network there is no faucet — real wallets bring their own gas, and
// a generated browser wallet would need funding out-of-band. `fundAddress`
// silently no-ops there because the RPC isn't Hardhat (the caller best-efforts
// it and continues).
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Hex,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {hardhat} from 'viem/chains';

const HARDHAT_RPC = 'http://localhost:8545';
// Hardhat well-known account #0 — local dev only; never use on real chains.
const FAUCET_KEY: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FUND_AMOUNT = parseEther('10');
const MIN_BALANCE = parseEther('1');

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(HARDHAT_RPC),
});

// Already funded? Skip the transfer so reloads (restore-from-session) don't
// drain the faucet or stack nonces. RPC unreachable → report not-funded; the
// caller best-efforts the send and swallows any error.
export async function hasBalance(address: string): Promise<boolean> {
  try {
    const bal = await publicClient.getBalance({
      address: address as `0x${string}`,
    });
    return bal >= MIN_BALANCE;
  } catch {
    return false;
  }
}

// Transfer gas to `address` from the Hardhat faucet account and wait for the
// receipt — this serialises the faucet nonce and guarantees the balance has
// settled before the wallet sends its first game tx.
export async function fundAddress(address: string): Promise<void> {
  const account = privateKeyToAccount(FAUCET_KEY);
  const faucet = createWalletClient({
    account,
    chain: hardhat,
    transport: http(HARDHAT_RPC),
  });
  const hash = await faucet.sendTransaction({
    to: address as `0x${string}`,
    value: FUND_AMOUNT,
  });
  await publicClient.waitForTransactionReceipt({hash});
}
