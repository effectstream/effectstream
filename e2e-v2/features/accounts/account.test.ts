/**
 * Account linking tests.
 * Uses wallets[5..9] to avoid conflicts with EVM sync tests that used wallets[0..2].
 */
import { assert, assertSQL2, type SharedState } from "@e2e-v2/engine";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";
import { accountPayload } from "@effectstream/concise";
import { AddressType } from "@effectstream/utils";
import type { Client } from "pg";

// Use wallets 5-9 (unused by EVM sync tests)
const w5 = { address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as `0x${string}`, privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as `0x${string}` };
const w6 = { address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as `0x${string}`, privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e" as `0x${string}` };
const w7 = { address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as `0x${string}`, privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356" as `0x${string}` };

const paimaL2Abi = [
  { inputs: [{ name: "data", type: "bytes" }], name: "paimaSubmitGameInput", outputs: [], stateMutability: "payable", type: "function" },
] as const;

async function submit(input: (string | number | boolean)[], pk: `0x${string}`) {
  const addr = contractAddressesEvmMain().chain31337["PaimaL2ContractModule#MyPaimaL2Contract"];
  const account = privateKeyToAccount(pk);
  const wc = createWalletClient({ account, chain: hardhat, transport: http() });
  const pc = createPublicClient({ chain: hardhat, transport: http() });
  const hash = await wc.writeContract({
    address: addr, abi: paimaL2Abi, functionName: "paimaSubmitGameInput",
    args: [toHex(JSON.stringify(input.map(String)))],
    value: parseEther("0.0000000001"),
  });
  await pc.waitForTransactionReceipt({ hash });
  await new Promise((r) => setTimeout(r, 3000));
}

function findAddr(rows: any[], address: string) {
  return rows.find((a: any) => a.address === address.toLowerCase());
}

function findAcctByAddr(addrs: any[], accts: any[], address: string) {
  const a = findAddr(addrs, address);
  if (!a || a.account_id == null) return null;
  return accts.find((ac: any) => ac.id === a.account_id);
}

async function checkState(db: Client, desc: string, check: (addrs: any[], accts: any[]) => boolean) {
  await assertSQL2<any, any>(desc, db,
    { query: "SELECT 1", check: () => true },
    {
      query: `SELECT
        (SELECT json_agg(json_build_object('address', address, 'account_id', account_id)) FROM effectstream.addresses) as addresses,
        (SELECT json_agg(json_build_object('id', id, 'primary_address', primary_address)) FROM effectstream.accounts) as accounts`,
      check: (res) => check(res.rows[0]?.addresses || [], res.rows[0]?.accounts || []),
    },
  );
}

export async function accountTest(db: Client, sharedState: SharedState, apiPort: number) {
  // 1. Create account for w5
  await submit(await accountPayload.createAccount(), w5.privateKey);

  await checkState(db, "Account: create account for w5", (addrs, accts) => {
    const acct = findAcctByAddr(addrs, accts, w5.address);
    return acct != null && acct.primary_address === w5.address.toLowerCase();
  });

  // Get the account ID dynamically
  const getW5AccountId = async (): Promise<number> => {
    const res = await db.query(`SELECT account_id FROM effectstream.addresses WHERE address = $1`, [w5.address.toLowerCase()]);
    return res.rows[0]?.account_id;
  };

  const acctId = await getW5AccountId();

  // 2. Link w6 as secondary
  await submit(
    await accountPayload.linkAddress(
      w5.privateKey, AddressType.EVM,
      w6.privateKey, AddressType.EVM,
      w5.address, w6.address,
      acctId, false,
    ),
    w6.privateKey,
  );

  await checkState(db, "Account: link w6 as secondary", (addrs, accts) => {
    const a = findAddr(addrs, w6.address);
    return a != null && a.account_id === acctId;
  });

  // 3. Link w7 as new primary
  await submit(
    await accountPayload.linkAddress(
      w5.privateKey, AddressType.EVM,
      w7.privateKey, AddressType.EVM,
      w5.address, w7.address,
      acctId, true,
    ),
    w7.privateKey,
  );

  await checkState(db, "Account: link w7 as new primary", (addrs, accts) => {
    const acct = accts.find((a: any) => a.id === acctId);
    return acct != null && acct.primary_address === w7.address.toLowerCase();
  });

  // 4. Unlink w6
  await submit(
    await accountPayload.unlinkAddress(
      w7.privateKey, AddressType.EVM,
      acctId, w6.address, AddressType.EVM,
      null, null,
    ),
    w5.privateKey,
  );

  await checkState(db, "Account: unlink w6", (addrs, accts) => {
    const a = findAddr(addrs, w6.address);
    return a != null && a.account_id === null;
  });

  // 5. Verify final state: w5 and w7 in account, w6 unlinked
  await checkState(db, "Account: final state correct", (addrs, accts) => {
    const a5 = findAddr(addrs, w5.address);
    const a7 = findAddr(addrs, w7.address);
    const a6 = findAddr(addrs, w6.address);
    return a5?.account_id === acctId
        && a7?.account_id === acctId
        && a6?.account_id === null;
  });
}
