import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import * as bip32 from "bip32";
import * as path from "node:path";
import { waitForBlock } from "./wait-for-block.ts";

/** 
 *  This script creates a specified number of wallets and funds them with BTC.
 *  Usage:
 *  deno run -A create-wallets.ts 1.5 10 101 0xf8d62248c2abdacd7550e7a6cd5a9de
 * 
 *  Arguments:
 *  - 1. Initial BTC amount
 *  - 2. Number of wallets to create
 *  - 3. Block height to wait for
 *  - 4. Seed prefix
 */

const NETWORK = bitcoin.networks.regtest;
const BIP32 = bip32.BIP32Factory(ecc);

const getRandomString = (bytes: number) => {
  const stringArray: string[] = [];
  const possibleChars: string[] = "abcdef0123456789".split("");
  for (let i = 0; i < bytes / 8; i++) {
    const randomIndex = Math.floor(Math.random() * possibleChars.length);
    stringArray.push(possibleChars[randomIndex]!);
  }
  return `0x${stringArray.join("")}`;
};

type WalletData = {
  seed: string;
  mainAddress: string;
  mainPrivateKey: string;
  derivationPath: string;
  derivedAddress: string;
  derivedPrivateKey: string;
  createdAt: string;
};

const generateWallet = async (
  _seed?: string | undefined
): Promise<WalletData> => {
  const seedString = _seed || getRandomString(256);
  const seed = Buffer.from(seedString.replace("0x", ""), "hex");
  const masterNode = BIP32.fromSeed(seed, NETWORK);

  // ------------------------------------------------------------
  // Use this value to import in Sparrow
  // Type: Master Private Key BIP32
  // Derivation Path: m/84'/1'/0'
  //
  const xpriv = masterNode.toBase58();
  //
  // ------------------------------------------------------------

  const xpub = masterNode.neutered().toBase58(); // Neutered gets the public key only
  const xpubPath = "m/84'/1'/0'/0/0";
  const derivedAccount = masterNode.derivePath(xpubPath);
  const derivedAddress = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(derivedAccount.publicKey!),
    network: NETWORK,
  }).address;
  const derivedPrivateKey = derivedAccount.toBase58();

  console.log(`
--------------------------------
  ${"Seed:".padEnd(30, " ")} ${seedString}
  ${"Master Private Key (xpriv):".padEnd(30, " ")} ${xpriv}
  ${"Master Public Key (xpub):".padEnd(30, " ")} ${xpub}
  ${"Private Key [${xpubPath}]".padEnd(30, " ")} ${derivedPrivateKey}
  ${"Address [${xpubPath}]".padEnd(30, " ")} ${derivedAddress}
  ${"Created At:".padEnd(30, " ")} ${new Date().toISOString()}
--------------------------------`);
  return {
    seed: seedString,
    mainAddress: xpub,
    mainPrivateKey: xpriv,
    derivationPath: xpubPath,
    derivedAddress: derivedAddress!,
    derivedPrivateKey: derivedPrivateKey!,
    createdAt: new Date().toISOString(),
  };
};

// Helper function to make Bitcoin RPC calls
const bitcoinRpcCall = async (
  method: string,
  params: any[] = [],
  walletName?: string
) => {
  // console.log('Calling RPC method:', method);
  const url = walletName
    ? `http://127.0.0.1:18443/wallet/${walletName}`
    : "http://127.0.0.1:18443";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + btoa("dev:devpassword"),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RPC call failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }
  return data.result;
};

const transferFunds = async (toAddress: string, amount: number) => {
  let walletName: string | undefined;
  const wallets = await bitcoinRpcCall("listwallets", []);
  if (wallets && wallets.length > 0) {
    walletName = wallets[0];
  } else {
    walletName = "default";
    await bitcoinRpcCall("createwallet", [walletName]);
    console.log(`Created wallet: ${walletName}`);
  }

  console.log(
    `Sending ${amount} BTC from ${walletName} wallet to ${toAddress}`
  );
  const sendTxId = await bitcoinRpcCall(
    "sendtoaddress",
    [toAddress, amount],
    walletName
  );
  const tx = await bitcoinRpcCall("gettransaction", [sendTxId], walletName);
  console.log(
    "TX Details:",
    tx.details[0].address,
    tx.details[0].amount,
    "id:",
    tx.txid
  );
};

export async function createWalletsWithFunds(
  initialBTC: number = 1,
  numberOfWallets: number = 1,
  seedPrefix: string = "0xf8d62248c2abdacd7550e7a6cd5a9de"
): Promise<WalletData[]> {
  const wallets: WalletData[] = [];
  for (let i = 0; i < numberOfWallets; i++) {
    const seed = seedPrefix ? seedPrefix + String(i) : getRandomString(256);
    const data = await generateWallet(seed);
    await transferFunds(data.derivedAddress!, initialBTC);
    wallets.push(data);
  }
  return wallets;
}

// Usage
// deno run -A create-wallets.ts 1.5 10 101 0xf8d62248c2abdacd7550e7a6cd5a9de
if (import.meta.main) {
  const INITIAL_BTC = Deno.args[0] ? parseFloat(Deno.args[0]!) : 1;
  const NUMBER_OF_WALLETS = Deno.args[1] ? parseInt(Deno.args[1]!) : 1;
  const WAIT_FOR_BLOCK = Deno.args[2] ? parseInt(Deno.args[2]!) : undefined;
  const SEED_PREFIX = Deno.args[3] ?? undefined;

  if (WAIT_FOR_BLOCK) {
    await waitForBlock(WAIT_FOR_BLOCK);
  }

  const wallets = await createWalletsWithFunds(
    INITIAL_BTC,
    NUMBER_OF_WALLETS,
    SEED_PREFIX
  );

  const currentDir = Deno.cwd();
  await Deno.mkdir(path.join(currentDir, "generated"), { recursive: true });
  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const outputPath = path.join(currentDir, "generated", `wallet-${i}.json`);
    Deno.writeTextFileSync(outputPath, JSON.stringify(wallet, null, 2));
    console.log(`Wallet saved to ${outputPath}`);
  }

}
