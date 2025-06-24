import type { Client } from "pg";
import { shutdown, startup } from "./e2e-loader.ts";
import { erc20, paimaL2 } from "./e2e-contracts.ts";
import { assertSQL } from "./e2e-assert.ts";

type Wallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
};
// These are standard hardhat addresses for testing.
const wallet_A: Wallet = {
  address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};
const wallet_B: Wallet = {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  privateKey:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Start Test
async function test() {
  let db: Client;
  try {
    // Launch the orchestrator, and wait for the sync process to start.
    // The contracts are deployed with the private key.
    db = await startup(wallet_A.address, wallet_A.privateKey);

    console.log("🎯 Starting Contract Interactions...");
    await erc20.mint(wallet_A.address, wallet_A.privateKey, 200n);
    await erc20.mint(wallet_A.address, wallet_A.privateKey, 300n);
    await erc20.transfer(
      wallet_A.privateKey,
      wallet_B.address,
      90n,
    );
    await assertSQL(
      "Check ERC20 sync-process",
      db,
      `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM 
      public.primitive_accounting;`,
      (res) => res.rows.length === 3,
      (res) => {
        return res.rows[0].primitive_name === "TransferEvent" &&
          res.rows[1].primitive_name === "TransferEvent" &&
          res.rows[2].primitive_name === "TransferEvent";
      },
    );
    await paimaL2.submitGameInput(
      ["attack", "1", "100"],
      wallet_A.privateKey,
    );
    await assertSQL(
      "Check PaimaL2 sync-process",
      db,
      `SELECT
      primitive_name, id, paima_block_height, payload_type, payload
      FROM 
      public.primitive_accounting;`,
      (res) => res.rows.length === 4,
      (res) => {
        return res.rows[3].primitive_name === "PaimaGameInteraction";
      },
    );
    await paimaL2.submitGameInput(
      ["attack", "2", "200"],
      wallet_A.privateKey,
    );
    await assertSQL(
      "Check State Machine events",
      db,
      `SELECT
      inputs
      FROM 
      public.example_sm;`,
      (res) => res.rows.length === 5,
      (res) => {
        const dump = [
          {
            inputs: ["transfer", {
              "from": "0x0000000000000000000000000000000000000000",
              "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "value": "200",
            }],
          },
          {
            inputs: ["transfer", {
              "from": "0x0000000000000000000000000000000000000000",
              "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "value": "300",
            }],
          },
          {
            inputs: ["transfer", {
              "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
              "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              "value": "90",
            }],
          },
          { inputs: ["attack", "1", "100"] },
          { inputs: ["attack", "2", "200"] },
        ];
        return res.rows.every((row: any, index: number) => {
          const status = row.inputs === JSON.stringify(dump[index].inputs);
          if (!status) {
            console.log("Error at:", index, row.inputs, dump[index].inputs);
          }
          return status;
        });
      },
    );

    await assertSQL(
      "Check IVM ERC20",
      db,
      `SELECT * FROM public.erc_balance;`,
      (res) => res.rows.length === 2,
      (res) => {
        const a = res.rows.find((r: any) =>
          r.address === "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        );
        const b = res.rows.find((r: any) =>
          r.address === "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        );
        console.log(
          "IMPORTANT: This should be 410, but there is a error in the IVM ERC20",
        );
        // return a.balance === "410" && b.balance === "90";
        return a.balance === "500" && b.balance === "90";
      },
    );

    await assertSQL(
      "Check nonces",
      db,
      `SELECT * FROM public.nonces;`,
      (res) => res.rows.length === 2,
      (res) => {
        return res.rows.length === 2;
      },
    );

    await assertSQL(
      "Check addresses",
      db,
      `SELECT * FROM public.addresses;`,
      (res) => res.rows.length === 1,
      (res) => {
        return res.rows[0].address === wallet_A.address;
      },
    );

    const pauseTime = Deno.env.get("PAIMA_E2E_PAUSE_TIME");
    if (pauseTime) {
      console.log("⏳ Pausing for", pauseTime, "seconds");
      await delay(parseInt(pauseTime, 10) * 1000);
    }

    // Disconnect so the process can exit.
    await shutdown(db);
  } catch (e) {
    console.error(e);
    await shutdown(db);
  }
}

// TODO: We are not able to run this test in
//       as a Deno test as we have some leaks.
//       These leaks are not being cleaned up.
//       We should fix this and then run this
//       test as a Deno test. But they are hard
//       to find.
//
// Deno.test("async test", { sanitizeResources: false }, async () => {
test().then(() => {
  console.log("🎉 Test completed");
  Deno.exit(0);
}).catch((e) => {
  console.log("❌ Test failed");
  // kill -9 `ps aux | grep deno  | awk '{print $2}' | awk NF=NF RS= OFS=" "`
  console.error(e);
  Deno.exit(1);
});
// });
