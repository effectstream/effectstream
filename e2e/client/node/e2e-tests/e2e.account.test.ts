import {
  type AccountState,
  addLinkedAddress,
  assertSQL,
  assertSQL2,
  paimaL2Builder,
  type SharedState,
  wallets,
} from "@e2e/engine";
import type { Client } from "pg";
import {
  accountMessages,
  accountPayload,
  BuiltinGrammarPrefix,
  signMessage as internalSignMessage,
} from "@paima/concise";

function validateAccountState(
  expectedState: AccountState,
  addressRows: { address: string; account_id: number | null }[],
  accountRows: { id: number; primary_address: string | null }[],
): boolean {
  // Check that all expected accounts exist with correct primary addresses
  for (
    const [accountIdStr, expectedAccount] of Object.entries(
      expectedState.accounts,
    )
  ) {
    const accountId = parseInt(accountIdStr);
    const actualAccount = accountRows.find((row) => row.id === accountId);

    if (!actualAccount) {
      console.error(`Account ${accountId} not found in accounts table`);
      return false;
    }

    if (actualAccount.primary_address !== expectedAccount.primaryAddress) {
      console.error(
        `Account ${accountId} has primary address ${actualAccount.primary_address}, expected ${expectedAccount.primaryAddress}`,
      );
      return false;
    }
  }

  // Check that all expected linked addresses exist and belong to correct accounts
  const expectedLinkedAddresses = new Set<string>();
  for (
    const [accountIdStr, expectedAccount] of Object.entries(
      expectedState.accounts,
    )
  ) {
    const accountId = parseInt(accountIdStr);
    for (const address of expectedAccount.addresses) {
      expectedLinkedAddresses.add(address);
      const actualAddress = addressRows.find((row) => row.address === address);

      if (!actualAddress) {
        console.error(`Address ${address} not found in addresses table`);
        return false;
      }

      if (actualAddress.account_id !== accountId) {
        console.error(
          `Address ${address} belongs to account ${actualAddress.account_id}, expected ${accountId}`,
        );
        return false;
      }
    }
  }

  // Check that all expected unlinked addresses exist with account_id = null
  for (const address of expectedState.unlinkedAddresses) {
    const actualAddress = addressRows.find((row) => row.address === address);

    if (!actualAddress) {
      console.error(`Unlinked address ${address} not found in addresses table`);
      return false;
    }

    if (actualAddress.account_id !== null) {
      console.error(
        `Unlinked address ${address} has account_id ${actualAddress.account_id}, expected null`,
      );
      return false;
    }
  }

  // Check for unexpected addresses
  const allExpectedAddresses = new Set([
    ...expectedLinkedAddresses,
    ...expectedState.unlinkedAddresses,
  ]);
  for (const actualAddress of addressRows) {
    if (!allExpectedAddresses.has(actualAddress.address)) {
      console.error(
        `Unexpected address ${actualAddress.address} found in addresses table`,
      );
      return false;
    }
  }

  return true;
}

async function assertAccountState(
  db: Client,
  expectedState: AccountState,
  description: string,
  expectedPrimitiveAccountingCount: number,
) {
  // Then validate the complete state
  await assertSQL2<
    { primitive_name: string },
    { addresses: any; accounts: any }
  >(
    description,
    db,
    {
      query:
        `SELECT primitive_name FROM paima.primitive_accounting ORDER BY id`,
      check: (res) => res.rows.length === expectedPrimitiveAccountingCount,
    },
    {
      query: `SELECT 
      (SELECT json_agg(json_build_object('address', address, 'account_id', account_id)) FROM paima.addresses) as addresses,
      (SELECT json_agg(json_build_object('id', id, 'primary_address', primary_address)) FROM paima.accounts) as accounts`,
      check: (res) => {
        const addressRows = res.rows[0].addresses || [];
        const accountRows = res.rows[0].accounts || [];
        return validateAccountState(expectedState, addressRows, accountRows);
      },
    },
  );
}

// Start Test
export async function accountTests(db: Client, sharedState: SharedState) {
  const paimaL2 = paimaL2Builder(sharedState);

  // wallet-0 is owner
  await paimaL2.submitGameInput(
    await accountPayload.createAccount(),
    wallets[0].privateKey,
  );

  // Update expected state: account 1 created with wallet-0 as primary

  addLinkedAddress(sharedState, wallets[0].address, true, 1);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After creating account for wallet-0",
    sharedState.primitive_accounting_counter,
  );

  // add wallet-1 as a secondary address
  await paimaL2.submitGameInput(
    await accountPayload.linkAddress(
      wallets[0].privateKey,
      wallets[1].privateKey,
      wallets[0].address,
      wallets[1].address,
      1,
      false,
    ),
    wallets[1].privateKey,
  );

  // Update expected state: add wallet-1 to account 1
  addLinkedAddress(sharedState, wallets[1].address, false, 1);

  await assertAccountState(
    db,
    sharedState.account_state,
    "After linking wallet-1 as secondary",
    sharedState.primitive_accounting_counter,
  );

  // add wallet-2 as primary address
  await paimaL2.submitGameInput(
    await accountPayload.linkAddress(
      wallets[0].privateKey,
      wallets[2].privateKey,
      wallets[0].address,
      wallets[2].address,
      1,
      true,
    ),
    wallets[2].privateKey,
  );

  addLinkedAddress(sharedState, wallets[2].address, true, 1);
  // Update expected state: add wallet-2 to account 1 and make it primary

  await assertAccountState(
    db,
    sharedState.account_state,
    "After linking wallet-2 as primary",
    sharedState.primitive_accounting_counter,
  );

  // add wallet-3 as a secondary address
  await paimaL2.submitGameInput(
    await accountPayload.linkAddress(
      wallets[2].privateKey,
      wallets[3].privateKey,
      wallets[2].address,
      wallets[3].address,
      1,
      false,
    ),
    wallets[2].privateKey,
  );

  // Update expected state: add wallet-3 to account 1
  addLinkedAddress(sharedState, wallets[3].address, false, 1);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After linking wallet-3 as secondary",
    sharedState.primitive_accounting_counter,
  );

  // unlink wallet-3
  await paimaL2.submitGameInput(
    await accountPayload.unlinkAddress(
      wallets[2].privateKey,
      1,
      wallets[3].address,
      "",
    ),
    wallets[0].privateKey,
  );

  // Update expected state: remove wallet-3 from account 1 and add to unlinked addresses

  addLinkedAddress(sharedState, wallets[3].address, false, null);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After unlinking wallet-3",
    sharedState.primitive_accounting_counter,
  );

  // unlink wallet-2, and make wallet-1 primary
  await paimaL2.submitGameInput(
    await accountPayload.unlinkAddress(
      wallets[2].privateKey,
      1,
      wallets[2].address,
      wallets[1].address,
    ),
    wallets[2].privateKey,
  );

  // Update expected state: remove wallet-2 from account 1, add to unlinked addresses, and make wallet-1 primary
  addLinkedAddress(sharedState, wallets[2].address, false, null);
  addLinkedAddress(sharedState, wallets[1].address, true, 1);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After unlinking wallet-2 and making wallet-1 primary",
    sharedState.primitive_accounting_counter,
  );

  // ============ NEW TESTS START HERE ============

  // Test 1: Create a new account with wallet-4
  await paimaL2.submitGameInput(
    await accountPayload.createAccount(),
    wallets[4].privateKey,
  );

  // Update expected state: account 2 created with wallet-4 as primary

  addLinkedAddress(sharedState, wallets[4].address, true, 2);

  await assertAccountState(
    db,
    sharedState.account_state,
    "After creating account for wallet-4",
    sharedState.primitive_accounting_counter,
  );

  // Test 2: Create another account with wallet-5
  await paimaL2.submitGameInput(
    await accountPayload.createAccount(),
    wallets[5].privateKey,
  );

  // Update expected state: account 3 created with wallet-5 as primary
  addLinkedAddress(sharedState, wallets[5].address, true, 3);

  await assertAccountState(
    db,
    sharedState.account_state,
    "After creating account for wallet-5",
    sharedState.primitive_accounting_counter,
  );

  // Test 3: Test unlinkSelf - wallet-1 unlinks itself from account 1
  await paimaL2.submitGameInput(
    await accountPayload.unlinkSelf(1),
    wallets[1].privateKey,
  );
  // This is invalid, as it's the main account and there are still other addresses in the account.
  // The user should use the unlinkAddressWithPrimary instead, by providing the signature.

  await assertAccountState(
    db,
    sharedState.account_state,
    "After wallet-1 unlinks itself",
    sharedState.primitive_accounting_counter,
  );

  await paimaL2.submitGameInput(
    await accountPayload.unlinkAddress(
      wallets[1].privateKey,
      1,
      wallets[1].address,
      wallets[0].address,
    ),
    wallets[1].privateKey,
  );
  // Update expected state: wallet-1 becomes unlinked, account 1 has no primary
  addLinkedAddress(sharedState, wallets[1].address, false, null);
  addLinkedAddress(sharedState, wallets[0].address, true, 1);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After wallet-1 unlinks itself",
    sharedState.primitive_accounting_counter,
  );

  await paimaL2.submitGameInput(
    await accountPayload.createAccount(),
    wallets[9].privateKey,
  );
  addLinkedAddress(sharedState, wallets[9].address, true, 4);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After creating account for wallet-9 and making it primary",
    sharedState.primitive_accounting_counter,
  );

  await paimaL2.submitGameInput(
    await accountPayload.unlinkAddress(
      wallets[9].privateKey,
      4,
      wallets[9].address,
      "",
    ),
    wallets[9].privateKey,
  );
  addLinkedAddress(sharedState, wallets[9].address, false, null);
  await assertAccountState(
    db,
    sharedState.account_state,
    "After unlinking wallet-9",
    sharedState.primitive_accounting_counter,
  );

  // Test 4: Try to link wallet-0 back to account 1 (should fail - account 1 has no primary address)
  await paimaL2.submitGameInput(
    await accountPayload.linkAddress(
      wallets[9].privateKey,
      wallets[9].privateKey,
      wallets[9].address,
      wallets[9].address,
      1,
      true, // make it primary since account 1 has no primary
    ),
    wallets[0].privateKey,
  );

  // Expected state should remain unchanged: account 1 is permanently unusable (no primary address)
  // and wallet-0 remains unlinked because the link operation should fail

  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to link wallet-0 back to account 1 (should fail - no primary address)",
    sharedState.primitive_accounting_counter,
  );

  // ============ BAD PAYLOAD TESTS START HERE ============

  // Test 5: Try to create account with wallet that already has an account (should fail)
  await paimaL2.submitGameInput(
    await accountPayload.createAccount(),
    wallets[4].privateKey, // wallet-4 already has account 2
  );

  // Expected state should remain unchanged (createAccount should fail)
  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to create duplicate account for wallet-4 (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // Test 6: Try to link address to non-existent account (should fail)
  await paimaL2.submitGameInput(
    await accountPayload.linkAddress(
      wallets[4].privateKey,
      wallets[6].privateKey,
      wallets[4].address,
      wallets[6].address,
      999, // non-existent account
      false,
    ),
    wallets[6].privateKey,
  );

  // wallet-6 should be added to unlinked addresses since it's a new address
  sharedState.account_state.unlinkedAddresses.add(
    wallets[6].address.toLowerCase(),
  );

  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to link to non-existent account (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // Test 7: Try to unlink address from account you don't own (should fail)
  await paimaL2.submitGameInput(
    await accountPayload.unlinkAddress(
      wallets[4].privateKey, // wallet-4 owns account 2
      3, // wallet-5's account
      wallets[5].address, // trying to unlink wallet-5's address
      "",
    ),
    wallets[4].privateKey,
  );

  // Expected state should remain unchanged (operation should fail)
  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to unlink address from account you don't own (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // ============ BAD SIGNATURE TESTS START HERE ============

  // Test 8: Try to link address with invalid signature from primary
  const badSignature =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234";

  await paimaL2.submitGameInput([
    BuiltinGrammarPrefix.linkAddress,
    String(2), // account 2 (wallet-4's account)
    badSignature, // invalid signature from primary
    wallets[7].address, // new address to link
    await internalSignMessage(
      accountMessages.linkAccount(2, wallets[4].address, false),
      wallets[7].privateKey,
    ), // valid signature from new address
    "false",
  ], wallets[7].privateKey);

  // wallet-7 should be added to unlinked addresses since it's a new address
  sharedState.account_state.unlinkedAddresses.add(
    wallets[7].address.toLowerCase(),
  );

  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to link with invalid primary signature (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // Test 9: Try to link address with invalid signature from new address
  await paimaL2.submitGameInput([
    BuiltinGrammarPrefix.linkAddress,
    String(2), // account 2 (wallet-4's account)
    await internalSignMessage(
      accountMessages.linkAccount(2, wallets[8].address, false),
      wallets[4].privateKey,
    ), // valid signature from primary
    wallets[8].address, // new address to link
    badSignature, // invalid signature from new address
    "false",
  ], wallets[8].privateKey);

  // wallet-8 should be added to unlinked addresses since it's a new address
  sharedState.account_state.unlinkedAddresses.add(
    wallets[8].address.toLowerCase(),
  );

  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to link with invalid new address signature (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // Test 10: Try to unlink address with invalid signature from primary
  await paimaL2.submitGameInput([
    BuiltinGrammarPrefix.unlinkAddress,
    String(2), // account 2 (wallet-4's account)
    badSignature, // invalid signature from primary
    wallets[4].address, // address to unlink
    "", // no new primary
  ], wallets[4].privateKey);

  // Expected state should remain unchanged (operation should fail)
  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to unlink with invalid primary signature (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // Test 11: Try to link address with wrong account ID in signature message
  await paimaL2.submitGameInput([
    BuiltinGrammarPrefix.linkAddress,
    String(2), // account 2 (wallet-4's account)
    await internalSignMessage(
      accountMessages.linkAccount(3, wallets[9].address, false), // wrong account ID in message
      wallets[4].privateKey,
    ), // signature from primary but for wrong account
    wallets[9].address, // new address to link
    await internalSignMessage(
      accountMessages.linkAccount(2, wallets[4].address, false),
      wallets[9].privateKey,
    ), // valid signature from new address
    "false",
  ], wallets[9].privateKey);

  // wallet-9 should be added to unlinked addresses since it's a new address
  sharedState.account_state.unlinkedAddresses.add(
    wallets[9].address.toLowerCase(),
  );

  await assertAccountState(
    db,
    sharedState.account_state,
    "After attempting to link with wrong account ID in signature (should fail)",
    sharedState.primitive_accounting_counter,
  );

  // Test 12: Successfully link wallet-10 to account 2 (valid operation for comparison)
  await paimaL2.submitGameInput(
    await accountPayload.linkAddress(
      wallets[4].privateKey,
      wallets[10].privateKey,
      wallets[4].address,
      wallets[10].address,
      2,
      false,
    ),
    wallets[10].privateKey,
  );

  // Update expected state: wallet-10 successfully linked to account 2
  sharedState.account_state.accounts[2].addresses.add(
    wallets[10].address.toLowerCase(),
  );
  sharedState.account_state.unlinkedAddresses.delete(
    wallets[10].address.toLowerCase(),
  );

  await assertAccountState(
    db,
    sharedState.account_state,
    "After successfully linking wallet-10 to account 2",
    sharedState.primitive_accounting_counter,
  );

  // Test 13: Test unlinkSelf with non-primary address - wallet-10 unlinks itself from account 2
  await paimaL2.submitGameInput(
    await accountPayload.unlinkSelf(2),
    wallets[10].privateKey,
  );

  addLinkedAddress(sharedState, wallets[10].address, false, null);
  // Update expected state: wallet-10 becomes unlinked, account 2 keeps wallet-4 as primary

  await assertAccountState(
    db,
    sharedState.account_state,
    "After wallet-10 (non-primary) unlinks itself from account 2",
    sharedState.primitive_accounting_counter,
  );

  // ============ Check if the primitive_accounting table is correct state after all tests ============

  await assertSQL<{ primitive_name: string }>(
    "Check PaimaL2 sync-process",
    db,
    `SELECT
        primitive_name, id, paima_block_height, payload_type, payload
        FROM
        paima.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows.length === sharedState.primitive_accounting_counter;
    },
  );
}
