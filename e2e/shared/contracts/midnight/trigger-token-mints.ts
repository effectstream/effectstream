// Trigger for the Midnight:TokenMint primitive e2e: mint one shielded and one
// unshielded custom token via the deployed counter contract's mint circuits
// (callTx → proof server → regular Midnight transaction). Returns the
// wallet-visible token ids ("colors") so the test can assert they match the
// registry the primitive built — the exact token-id → contract mapping the
// primitive exists to provide.
//
// Ported from templates/zswap-da/packages/contracts-midnight/mint-test-tokens.ts.

import { dirname, resolve } from "node:path";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";
import { configureMidnightNodeProviders } from "@effectstream/midnight-contracts";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
// Path import (not the package name): the package's `.` export points at a
// non-existent `_index.ts` — same workaround as contract-counter-deploy.ts.
import {
  Counter,
  witnesses,
  type CounterPrivateState,
} from "./contract-counter/src/index.ts";
import {
  buildWalletFacade,
  registerNightForDust,
  syncAndWaitForFunds,
} from "./faucet.ts";

const TAG = "[trigger-token-mints]";

globalThis.WebSocket = WebSocket;

// Fixed domain separators (distinct from zswap-da's a1/b2/c3) → deterministic
// per-deployment token colors.
const SHIELDED_SEP = new Uint8Array(32).fill(0xd4);
const UNSHIELDED_SEP = new Uint8Array(32).fill(0xe5);
export const MINT_AMOUNT = 1_000_000n;

const currentDir = resolve(dirname(new URL(import.meta.url).pathname));

const contractConfig = {
  privateStateStoreName: "counter-private-state",
  zkConfigPath: resolve(currentDir, "contract-counter", "src", "managed"),
};

const compiledContract = CompiledContract.make(
  "contract-counter",
  Counter.Contract as any,
).pipe(
  CompiledContract.withWitnesses(witnesses as unknown as never),
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

const toHex = (u: Uint8Array): string =>
  Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");

const colorToHex = (raw: unknown, fallback: Uint8Array): string =>
  (raw instanceof Uint8Array
    ? toHex(raw)
    : String(raw ?? toHex(fallback)).replace(/^0x/, "")).toLowerCase();

function unshieldedToUserAddressBytes(unshieldedAddr: string): Uint8Array {
  if (!unshieldedAddr.startsWith("mn_addr_")) {
    throw new Error(
      `expected mn_addr_ bech32m unshielded address, got "${unshieldedAddr}"`,
    );
  }
  const parsed = MidnightBech32m.parse(unshieldedAddr);
  return Uint8Array.prototype.slice.call(parsed.data, 0, 32);
}

export interface MintedTokens {
  contractAddress: string;
  amount: string;
  shielded: { domainSep: string; color: string };
  unshielded: { domainSep: string; color: string };
}

export async function triggerTokenMints(
  networkUrls: {
    indexer: string;
    indexerWS: string;
    node: string;
    proofServer: string;
  },
  networkId: string,
): Promise<MintedTokens> {
  setNetworkId(networkId as any);

  const { contractAddress } = readMidnightContract("contract-counter", {
    networkId,
  });
  console.log(`${TAG} minting via counter contract at ${contractAddress}`);

  const walletResult = await buildWalletFacade(
    networkUrls as any,
    process.env["MIDNIGHT_WALLET_SEED"] ??
      "0000000000000000000000000000000000000000000000000000000000000001",
    networkId as any,
  );
  const wallet = walletResult.wallet;

  try {
    await syncAndWaitForFunds(wallet, { logLabel: "trigger-token-mints" });

    // Dust pays the circuit-call fees; prior registration is accepted only
    // when the v9 helper proves that spendable DUST is available.
    const dustReady = await registerNightForDust(walletResult);
    if (!dustReady) {
      throw new Error(`${TAG} no spendable DUST after NIGHT registration`);
    }

    const providers = (await configureMidnightNodeProviders(
      wallet,
      walletResult.zswapSecretKeys,
      walletResult.walletZswapSecretKeys,
      walletResult.dustSecretKey,
      walletResult.walletDustSecretKey,
      networkUrls,
      contractConfig.privateStateStoreName,
      contractConfig.zkConfigPath,
      walletResult.unshieldedKeystore,
    )) as any;

    const deployed = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: compiledContract as any,
      privateStateId: "counterPrivateState",
      initialPrivateState: { privateCounter: 0 } as CounterPrivateState,
    });
    console.log(`${TAG} joined contract`);

    // Nonces must be unique per run: re-minting the same (domain_sep, nonce)
    // recreates the identical coin commitment and the node rejects it as a
    // duplicate. Same separator + fresh nonce = same token color, new coins.
    const nonce = BigInt(Date.now());

    let t0 = Date.now();
    const stx = await (deployed.callTx as any).mint_shielded(
      SHIELDED_SEP,
      MINT_AMOUNT,
      nonce,
    );
    const sCoin = stx.private?.result;
    const shieldedColor = colorToHex(sCoin?.color ?? sCoin?.type, SHIELDED_SEP);
    console.log(
      `${TAG} ✅ mint_shielded color=${shieldedColor.slice(0, 16)}… (${
        ((Date.now() - t0) / 1000).toFixed(1)
      }s)`,
    );

    const recipientBytes = unshieldedToUserAddressBytes(
      walletResult.unshieldedAddress,
    );
    t0 = Date.now();
    const utx = await (deployed.callTx as any).mint_unshielded(
      UNSHIELDED_SEP,
      MINT_AMOUNT,
      { bytes: recipientBytes },
    );
    const unshieldedColor = colorToHex(utx.private?.result, UNSHIELDED_SEP);
    console.log(
      `${TAG} ✅ mint_unshielded color=${unshieldedColor.slice(0, 16)}… (${
        ((Date.now() - t0) / 1000).toFixed(1)
      }s)`,
    );

    const result: MintedTokens = {
      contractAddress,
      amount: MINT_AMOUNT.toString(),
      shielded: { domainSep: toHex(SHIELDED_SEP), color: shieldedColor },
      unshielded: { domainSep: toHex(UNSHIELDED_SEP), color: unshieldedColor },
    };
    console.log(`${TAG} MINTED ${JSON.stringify(result)}`);
    return result;
  } finally {
    await (wallet as any).stop?.().catch(() => {});
  }
}
