import {
  addLinkedAddress,
  assert,
  assertSQL,
  erc20Builder,
  erc721Builder,
  paimaL2Builder,
  type SharedState,
  wallets,
} from "@e2e/engine";
import type { Client } from "pg";
import { AddressType } from "@paima/utils";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
import { ENV } from "@paima/utils";
import { createBatcherSubunit, createMessageForBatcher } from "@paima/concise";

// Start Test
export async function generalTest(db: Client, sharedState: SharedState) {
  // Lazy load the contracts.
  const erc20 = erc20Builder(sharedState);
  const erc721 = erc721Builder(sharedState);
  const paimaL2 = paimaL2Builder(sharedState);

  const multiplier = 10n ** 18n;

  const erc20_a = 200n * multiplier;
  const erc20_b = 300n * multiplier;
  const erc20_c = 90n * multiplier;
  await erc20.a.mint(
    wallets[0].address,
    wallets[0].privateKey,
    erc20_a,
  );
  await erc20.a.mint(
    wallets[0].address,
    wallets[0].privateKey,
    erc20_b,
  );
  await erc20.a.transfer(
    wallets[0].privateKey,
    wallets[1].address,
    erc20_c,
  );
  await assertSQL<{ primitive_name: string }>(
    "Check ERC20 sync-process",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      paima.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[sharedState.primitive_accounting_counter - 3]
            .primitive_name === "Aribitrum_Token" &&
        res.rows[sharedState.primitive_accounting_counter - 2]
            .primitive_name === "Aribitrum_Token" &&
        res.rows[sharedState.primitive_accounting_counter - 1]
            .primitive_name === "Aribitrum_Token";
    },
  );
  await paimaL2.submitGameInput(
    ["attack", "1", "100"],
    wallets[0].privateKey,
  );

  await assertSQL<{ primitive_name: string }>(
    "Check PaimaL2 sync-process",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      paima.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[sharedState.primitive_accounting_counter - 1]
        .primitive_name ===
        "PaimaGameInteraction";
    },
  );
  await paimaL2.submitGameInput(
    ["attack", "2", "200"],
    wallets[0].privateKey,
  );
  await assertSQL<{ inputs: string }>(
    "Check State Machine events",
    db,
    `SELECT
      inputs
      FROM
      user_state_machine;`,
    (res) => res.rows.length === sharedState.paima_state_machine_counter,
    (res) => {
      const dump = [
        {
          inputs:
            "transfer 200000000000000000000 from 0x0000000000000000000000000000000000000000 to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        },
        {
          inputs:
            "transfer 300000000000000000000 from 0x0000000000000000000000000000000000000000 to 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        },
        {
          inputs:
            "transfer 90000000000000000000 from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 to 0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        },
        { inputs: "attack playerId: 1 with moveId: 100" },
        { inputs: "attack playerId: 2 with moveId: 200" },
      ];
      return res.rows.every((row: any, index: number) => {
        const status = row.inputs === dump[index].inputs;
        if (!status) {
          console.log("Error at:", index, row.inputs, dump[index].inputs);
        }
        return status;
      });
    },
  );

  await assertSQL<{ address: string; balance: string }>(
    "Check IVM ERC20",
    db,
    `SELECT * FROM primitives.erc20_balances_view_aribitrum_token;`,
    (res) => res.rows.length === 2,
    (res) => {
      // TODO
      // Should we store the addresses in lowercase?
      const firstWallet = res.rows.find((r: any) =>
        r.address ===
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase()
      );
      const secondWallet = res.rows.find((r: any) =>
        r.address ===
          "0x70997970C51812dc3A010C7d01b50e0d17dc79C8".toLowerCase()
      );
      if (!firstWallet || !secondWallet) {
        throw new Error(
          "Address not found: " + firstWallet + " " + secondWallet,
        );
      }
      return firstWallet.balance ===
          String(
            sharedState
              .address_erc20_balances[String(erc20.id_a)][
                wallets[0].address.toLowerCase()
              ],
          ) &&
        secondWallet.balance ===
          String(
            sharedState
              .address_erc20_balances[String(erc20.id_a)][
                wallets[1].address.toLowerCase()
              ],
          );
    },
  );

  // Only wallet A has sent game inputs
  await assertSQL<{ address: string }>(
    "Check addresses",
    db,
    `SELECT * FROM paima.addresses;`,
    (res) => res.rows.length === 1,
    (res) => {
      return res.rows[0].address === wallets[0].address.toLowerCase();
    },
  );

  // Test Promises in State Machine
  // length = number of 'attack' inputs
  // sums = Array(length).fill(0).map((_, i) => 3 * (i + 1)) => 3,6,9...
  const attackInputCount = 2;
  await assertSQL<{ sum: number }>(
    "Check Promises in State Machine",
    db,
    `SELECT * FROM another_example_table order by block_height asc;`,
    (res) => res.rows.length === attackInputCount,
    (res) => {
      // The first value is random - 3;
      // Between 10 and 99.
      const initialValue = res.rows[0].sum - 3;
      if (initialValue < 10 || initialValue > 99) {
        return false;
      }
      return res.rows.every((row, index) =>
        row.sum === initialValue + 3 * (index + 1)
      );
    },
  );
  // Test Batcher
  const timestamp = Date.now().toString();
  const privateKey = generatePrivateKey();

  // Create account and wallet client
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(),
  });

  await paimaL2.submitGameInput(
    ["throw_error"],
    wallets[0].privateKey,
  );
  // This command does not increment the paima_state_machine_counter.
  sharedState.paima_state_machine_counter -= 1;

  await assertSQL<{ primitive_name: string }>(
    "Wait for error to be processed",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      paima.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
  );

  console.log("Created random account", account.address);
  const gameInput = JSON.stringify(["attack", "999", "777"]);
  let nonce_counter = 0;
  // Send a batched message.
  const signature = await walletClient.signMessage({
    message: createMessageForBatcher(
      null,
      timestamp,
      account.address,
      AddressType.EVM,
      gameInput,
    ),
  });
  await fetch(`http://localhost:${ENV.BATCHER_PORT}/send-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createBatcherSubunit(
      timestamp,
      account.address,
      AddressType.EVM,
      signature,
      gameInput,
    )),
  });
  nonce_counter += 1;
  sharedState.primitive_accounting_counter += 1;
  sharedState.paima_state_machine_counter += 1;
  // Manually add into accounts
  addLinkedAddress(sharedState, account.address, false, null);

  await assertSQL<
    { primitive_name: string; payload: { data: string } }
  >(
    "Check Batcher",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      paima.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[sharedState.primitive_accounting_counter - 1]
            .primitive_name ===
          "PaimaGameInteraction" &&
        res.rows[sharedState.primitive_accounting_counter - 1].payload
        // ["attack","999","777"]
            .data === "0x5b2261747461636b222c22393939222c22373737225d";
    },
  );

  // Send a batched message.
  const badSignature = await walletClient.signMessage({
    message: "bad-message",
  });
  await fetch(`http://localhost:${ENV.BATCHER_PORT}/send-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createBatcherSubunit(
      timestamp,
      account.address,
      AddressType.EVM,
      badSignature,
      gameInput,
    )),
  });
  // This message should not change the state of the database.
  // If this test fails, it will probably reflected in the next test.
  // As we cannot wait until the state does not change.
  await assertSQL<
    { primitive_name: string; payload: { data: string } }
  >(
    "Batcher Message with bad signature: should not be processed",
    db,
    `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM
      paima.primitive_accounting;`,
    (res) => res.rows.length === sharedState.primitive_accounting_counter,
    (res) => {
      return res.rows[sharedState.primitive_accounting_counter - 1]
            .primitive_name ===
          "PaimaGameInteraction" &&
        res.rows[sharedState.primitive_accounting_counter - 1].payload
        // ["attack","999","777"]
            .data === "0x5b2261747461636b222c22393939222c22373737225d";
    },
  );

  // We should have a single nonce for the batched message.
  await assertSQL<{ nonce: string }>(
    "Check nonces",
    db,
    `SELECT * FROM paima.nonces;`,
    (res) => res.rows.length === nonce_counter,
    (res) => {
      return res.rows.length === nonce_counter;
    },
  );

  // Let's test the scheduled data created throught the state machine.
  await paimaL2.submitGameInput(
    ["schedule", "1", "block", "111"],
    wallets[0].privateKey,
  );
  // This should increment the state machine indirectly.

  await assertSQL<{ inputs: string; block_height: number }>(
    "Check Scheduled Data - block",
    db,
    `SELECT inputs, block_height from user_state_machine`,
    (res) => res.rows.length === sharedState.paima_state_machine_counter,
    (res) => {
      return res.rows[sharedState.paima_state_machine_counter - 1].inputs ===
        "attack playerId: 111 with moveId: 1";
    },
  );

  // Let's test the scheduled data - timestamp - created throught the state machine.
  await paimaL2.submitGameInput(
    ["schedule", "1", "timestamp", "222"],
    wallets[0].privateKey,
  );
  // This should increment the state machine indirectly.

  await assertSQL<{ inputs: string; block_height: number }>(
    "Check Scheduled Data - timestamp",
    db,
    `SELECT inputs, block_height from user_state_machine`,
    (res) => res.rows.length === sharedState.paima_state_machine_counter,
    (res) => {
      return res.rows[sharedState.paima_state_machine_counter - 1].inputs ===
        "attack playerId: 222 with moveId: 1";
    },
  );

  await assert("Check User Defined API", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/api/my-game-state`,
    );
    const data = await response.json();
    // 3 ERC20 updates
    // 2 PaimaL2 updates
    // 1 Batcher update
    return data.length === sharedState.paima_state_machine_counter;
  });

  await assert("Health Check", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/health`,
    );
    const data = await response.json();
    return data.status === "ok";
  });

  await assert("Check System API Table Schema", async () => {
    const response = await fetch(
      `http://localhost:${ENV.PAIMA_API_PORT}/table-schema/user_state_machine`,
    );
    const data = await response.json();
    return data.every((row: any) =>
      row.column_name === "id" ||
      row.column_name === "inputs" ||
      row.column_name === "block_height"
    );
  });

  await assert("Check System API Table Data", async () => {
    const allData = [];
    let nextCursor: string | undefined = undefined;

    do {
      let url =
        `http://localhost:${ENV.PAIMA_API_PORT}/tables/user_state_machine?limit=10`;
      if (nextCursor) {
        url += `&after=${nextCursor}`;
      }

      const response = await fetch(url);
      const { data, pagination } = await response.json();
      allData.push(...data);
      nextCursor = pagination.nextCursor;
    } while (nextCursor);

    const dataLengthAsserts =
      allData.length === sharedState.paima_state_machine_counter;
    if (!dataLengthAsserts) {
      console.error(
        "Data length mismatch: Data length",
        allData.length,
        "expected (sharedState.paima_state_machine_counter)",
        sharedState.paima_state_machine_counter,
      );
    }
    return dataLengthAsserts;
  });

  const tokens = {
    tokenA: 1n,
    tokenB: 2n,
    tokenC: 3n,
    tokenD: 4n,
  } as const;
  await erc721.a.mint(wallets[0].privateKey, tokens.tokenA);
  await erc721.a.mint(wallets[1].privateKey, tokens.tokenB);
  await erc721.a.mint(wallets[0].privateKey, tokens.tokenC);
  await erc721.a.mint(wallets[1].privateKey, tokens.tokenD);
  await erc721.a.transfer(
    wallets[0].privateKey,
    wallets[1].address,
    tokens.tokenC,
  );
  await erc721.a.transfer(
    wallets[1].privateKey,
    wallets[0].address,
    tokens.tokenD,
  );
  // Cannot burn a token?
  // await erc721.burn(wallet_X.privateKey, tokens.tokenD);
  await assertSQL<
    { token_id: string; primitive_name: string; current_owner: string }
  >(
    "Check ERC721 sync-process",
    db,
    `SELECT * FROM primitives.erc721_ownership_view_arbitrum_erc721;`,
    (res) => res.rows.length === 4,
    (res) => {
      return res.rows.every((row: any) => {
        // [...{
        // primitive_name: "Arbitrum_ERC721",
        // token_id: "1",
        // current_owner: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
        // }...]
        Object.entries(sharedState.address_erc721_ownership[erc721.id_a])
          .forEach(
            ([tokenId, owner]: [string, string]) => {
              const row = res.rows.find(
                (
                  r: {
                    token_id: string;
                    primitive_name: string;
                    current_owner: string;
                  },
                ) => r.token_id === tokenId,
              );
              if (!row) {
                throw new Error(`Token ${tokenId} not found`);
              }
              if (row.current_owner.toLowerCase() !== owner.toLowerCase()) {
                throw new Error(
                  `Token ${tokenId} has incorrect owner: ${row.current_owner} !== ${owner}`,
                );
              }
            },
          );
        return true;
      });
    },
  );
  await assertSQL<{ primitive_name: string }>(
    "Check PaimaL2 sync-process (ERC721)",
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
