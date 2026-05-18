/**
 * Account linking tests.
 * Uses wallets[5..9] to avoid conflicts with EVM sync tests that used wallets[0..2].
 */
import { assert, assertSQL2, type SharedState } from "@e2e/engine";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import { accountPayload, accountMessages, signMessage as internalSignMessage, BuiltinGrammarPrefix } from "@effectstream/concise";
import { AddressType } from "@effectstream/utils";
import type { Client } from "pg";

// Use wallets 5-10 (unused by EVM sync tests)
const w5 = { address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as `0x${string}`, privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as `0x${string}` };
const w6 = { address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as `0x${string}`, privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e" as `0x${string}` };
const w7 = { address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as `0x${string}`, privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356" as `0x${string}` };
const w8 = { address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as `0x${string}`, privateKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97" as `0x${string}` };
const w9 = { address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as `0x${string}`, privateKey: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as `0x${string}` };
const w10 = { address: "0xBcd4042DE499D14e55001CcbB24a551F3b954096" as `0x${string}`, privateKey: "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897" as `0x${string}` };

const effectstreamL2Abi = [
  { inputs: [{ name: "data", type: "bytes" }], name: "effectstreamSubmitGameInput", outputs: [], stateMutability: "payable", type: "function" },
] as const;

async function submit(input: (string | number | boolean)[], pk: `0x${string}`) {
  const addr = contractAddressesEvmMain().chain31337["EffectstreamL2ContractModule#MyEffectstreamL2Contract"];
  const account = privateKeyToAccount(pk);
  const wc = createWalletClient({ account, chain: hardhat, transport: http() });
  const pc = createPublicClient({ chain: hardhat, transport: http() });
  const hash = await wc.writeContract({
    address: addr, abi: effectstreamL2Abi, functionName: "effectstreamSubmitGameInput",
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

  // ── Error path tests ─────────────────────────────────────────────────────

  // 6. Duplicate account creation (w5 already has an account) — should fail
  await submit(await accountPayload.createAccount(), w5.privateKey);

  await checkState(db, "Account: duplicate create for w5 rejected", (addrs, accts) => {
    // State should be unchanged — still only one account for w5
    const w5Addrs = addrs.filter((a: any) => a.address === w5.address.toLowerCase());
    return w5Addrs.length === 1 && w5Addrs[0].account_id === acctId;
  });

  // 7. Link to non-existent account (account 999) — should fail
  await submit(
    await accountPayload.linkAddress(
      w5.privateKey, AddressType.EVM,
      w8.privateKey, AddressType.EVM,
      w5.address, w8.address,
      999, false,
    ),
    w8.privateKey,
  );

  // Wait for w8 to appear in addresses before checking (it was seen on-chain)
  await assertSQL2<any, any>("Account: link to non-existent account rejected", db,
    {
      query: `SELECT address FROM effectstream.addresses WHERE address = '${w8.address.toLowerCase()}'`,
      check: (res) => res.rows.length >= 1,
    },
    {
      query: `SELECT
        (SELECT json_agg(json_build_object('address', address, 'account_id', account_id)) FROM effectstream.addresses) as addresses,
        (SELECT json_agg(json_build_object('id', id, 'primary_address', primary_address)) FROM effectstream.accounts) as accounts`,
      check: (res) => {
        const addrs = res.rows[0]?.addresses || [];
        const a8 = findAddr(addrs, w8.address);
        return a8 != null && a8.account_id === null;
      },
    },
  );

  // 8. Unlink address from account you don't own — should fail
  // Create a second account with w9 first
  await submit(await accountPayload.createAccount(), w9.privateKey);

  await checkState(db, "Account: create account for w9", (addrs, accts) => {
    const acct = findAcctByAddr(addrs, accts, w9.address);
    return acct != null && acct.primary_address === w9.address.toLowerCase();
  });

  const acctId2Res = await db.query(`SELECT account_id FROM effectstream.addresses WHERE address = $1`, [w9.address.toLowerCase()]);
  const acctId2 = acctId2Res.rows[0]?.account_id;

  await submit(
    await accountPayload.unlinkAddress(
      w7.privateKey, AddressType.EVM,  // w7 is primary of acctId
      acctId2, w9.address, AddressType.EVM,  // trying to unlink w9 from acctId2
      null, null,
    ),
    w7.privateKey,
  );

  await checkState(db, "Account: unlink from wrong account rejected", (addrs, accts) => {
    const a9 = findAddr(addrs, w9.address);
    return a9 != null && a9.account_id === acctId2;
  });

  // 9. Link with invalid primary signature — should fail
  const badSignature = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234";

  await submit([
    BuiltinGrammarPrefix.linkAddress,
    String(acctId),
    badSignature, // invalid signature from primary
    w10.address,
    await internalSignMessage(
      accountMessages.linkAccount(acctId, w7.address, false),
      w10.privateKey,
    ),
    "false",
  ], w10.privateKey);

  await checkState(db, "Account: link with bad primary sig rejected", (addrs, accts) => {
    const a10 = findAddr(addrs, w10.address);
    // w10 should exist but NOT be linked
    return a10 != null && a10.account_id === null;
  });

  // 10. Link with invalid new-address signature — should fail
  await submit([
    BuiltinGrammarPrefix.linkAddress,
    String(acctId2),
    await internalSignMessage(
      accountMessages.linkAccount(acctId2, w10.address, false),
      w9.privateKey,
    ),
    w10.address,
    badSignature, // invalid signature from new address
    "false",
  ], w10.privateKey);

  await checkState(db, "Account: link with bad new-addr sig rejected", (addrs, accts) => {
    const a10 = findAddr(addrs, w10.address);
    return a10 != null && a10.account_id === null;
  });

  // 11. Link with wrong account ID in signature — should fail
  await submit([
    BuiltinGrammarPrefix.linkAddress,
    String(acctId),
    await internalSignMessage(
      accountMessages.linkAccount(acctId2, w10.address, false), // wrong account ID
      w7.privateKey,
    ),
    w10.address,
    await internalSignMessage(
      accountMessages.linkAccount(acctId, w7.address, false),
      w10.privateKey,
    ),
    "false",
  ], w10.privateKey);

  await checkState(db, "Account: link with wrong acct ID in sig rejected", (addrs, accts) => {
    const a10 = findAddr(addrs, w10.address);
    return a10 != null && a10.account_id === null;
  });

  // 12. Unlink with invalid primary signature — should fail
  await submit([
    BuiltinGrammarPrefix.unlinkAddress,
    String(acctId),
    badSignature, // invalid signature from primary
    w5.address,
    "",
  ], w5.privateKey);

  await checkState(db, "Account: unlink with bad primary sig rejected", (addrs, accts) => {
    const a5 = findAddr(addrs, w5.address);
    return a5 != null && a5.account_id === acctId;
  });

  // 13. unlinkSelf as primary with other addresses still in account — should fail
  await submit(
    await accountPayload.unlinkSelf(acctId),
    w7.privateKey, // w7 is primary
  );

  await checkState(db, "Account: unlinkSelf primary with others rejected", (addrs, accts) => {
    const a7 = findAddr(addrs, w7.address);
    const acct = accts.find((ac: any) => ac.id === acctId);
    return a7?.account_id === acctId && acct?.primary_address === w7.address.toLowerCase();
  });

  // 14. Successfully link w10 to account 2, then unlinkSelf as non-primary — should succeed
  await submit(
    await accountPayload.linkAddress(
      w9.privateKey, AddressType.EVM,
      w10.privateKey, AddressType.EVM,
      w9.address, w10.address,
      acctId2, false,
    ),
    w10.privateKey,
  );

  await checkState(db, "Account: link w10 to account 2", (addrs, accts) => {
    const a10 = findAddr(addrs, w10.address);
    return a10 != null && a10.account_id === acctId2;
  });

  await submit(
    await accountPayload.unlinkSelf(acctId2),
    w10.privateKey, // w10 is non-primary
  );

  await checkState(db, "Account: unlinkSelf non-primary succeeds", (addrs, accts) => {
    const a10 = findAddr(addrs, w10.address);
    return a10 != null && a10.account_id === null;
  });
}
