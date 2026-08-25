import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import { getContractAddress } from "../infra/midnight-utils.ts";
import path from "path";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const MIDNIGHT_NETWORK_ID = process.env["MIDNIGHT_NETWORK_ID"] || "undeployed";

export async function midnightPropertyTest(db: Client) {
  const contractAddress = getContractAddress();
  if (!contractAddress) {
    console.log("[SKIP] Midnight property test: no contract address found");
    return;
  }

  const erc721ContractAddress = await getEvmContractAddress();

  const networkUrls = {
    indexer: "http://127.0.0.1:8088/api/v3/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
    node: "http://127.0.0.1:9944",
    proofServer: "http://127.0.0.1:6300",
  };

  const GENESIS_SEED =
    "0000000000000000000000000000000000000000000000000000000000000001";

  await assert(
    "Midnight property: indexer reachable before wallet build",
    async () => {
      const res = await fetch(networkUrls.indexer, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      return res.ok;
    },
  );

  await assert(
    "Midnight property: build wallet via @effectstream/wallets MidnightLocal (facade mode) and sync funds",
    async () => {
      // Build the wallet through the unified @effectstream/wallets entry point.
      // Supplying `networkUrls` switches MidnightLocal from signing-only to the
      // full WalletFacade (shielded + dust + unshielded sub-wallets connected
      // to the live indexer + node + proof server). The facade ends up at
      // `api.walletFacade`; the raw `WalletResult` (secret keys, keystore,
      // addresses) ends up at `api.walletResult` for advanced flows like the
      // manual balance/sign/finalize loop below.
      const { MidnightLocalConnector } = await import(
        "@effectstream/wallets/midnight-local"
      );
      const { syncAndWaitForFunds } = await import(
        "@effectstream/midnight-contracts"
      );
      const { CompiledContract } = await import("@midnight-ntwrk/compact-js");
      const { findDeployedContract } = await import(
        "@midnight-ntwrk/midnight-js-contracts"
      );
      const { indexerPublicDataProvider } = await import(
        "@midnight-ntwrk/midnight-js-indexer-public-data-provider"
      );
      const { httpClientProofProvider } = await import(
        "@midnight-ntwrk/midnight-js-http-client-proof-provider"
      );
      const { NodeZkConfigProvider } = await import(
        "@midnight-ntwrk/midnight-js-node-zk-config-provider"
      );
      const { levelPrivateStateProvider } = await import(
        "@midnight-ntwrk/midnight-js-level-private-state-provider"
      );
      const { setNetworkId } = await import(
        "@midnight-ntwrk/midnight-js-network-id"
      );

      setNetworkId(MIDNIGHT_NETWORK_ID as any);

      console.log("  Building wallet via MidnightLocalConnector...");
      const provider = await MidnightLocalConnector.instance().connectFromSeed({
        seed: GENESIS_SEED,
        networkId: MIDNIGHT_NETWORK_ID,
        networkUrls,
      });
      const api = provider.getConnection().api as any;
      const walletResult = api.walletResult as Awaited<
        ReturnType<
          typeof import("@effectstream/midnight-contracts")["buildWalletFacade"]
        >
      >;
      if (walletResult == null) {
        throw new Error(
          "MidnightLocalConnector did not return walletResult — facade mode wiring is broken.",
        );
      }
      console.log("  Wallet built. Syncing funds...");
      // Engine's syncAndWaitForFunds takes the bare WalletFacade; pull it off
      // walletResult.wallet (which is the same object exposed as api.walletFacade).
      const { shieldedBalance, dustBalance } = await syncAndWaitForFunds(
        walletResult.wallet,
        { timeoutMs: 300_000 },
      );
      console.log(
        `  Wallet synced: shielded=${shieldedBalance}, dust=${dustBalance}`,
      );

      const walletAndMidnightProvider = {
        getCoinPublicKey: () => walletResult.zswapSecretKeys.coinPublicKey,
        getEncryptionPublicKey: () =>
          walletResult.zswapSecretKeys.encryptionPublicKey,
        async balanceTx(tx: any, ttl?: Date) {
          const recipe = await walletResult.wallet.balanceUnboundTransaction(
            tx,
            {
              shieldedSecretKeys: walletResult.walletZswapSecretKeys,
              dustSecretKey: walletResult.walletDustSecretKey,
            },
            { ttl: ttl ?? new Date(Date.now() + 3600_000) },
          );
          const signed = await walletResult.wallet.signRecipe(
            recipe,
            (payload: Uint8Array) =>
              walletResult.unshieldedKeystore.signDataAsync(payload),
          );
          return walletResult.wallet.finalizeRecipe(signed);
        },
        submitTx: (tx: any) => walletResult.wallet.submitTransaction(tx),
      };

      const privateStateProvider = levelPrivateStateProvider({
        privateStoragePasswordProvider: async () => "EffectstreamStorage1!",
        accountId: walletResult.unshieldedAddress || "test-account",
      } as any);

      const publicDataProvider = indexerPublicDataProvider(
        networkUrls.indexer,
        networkUrls.indexerWS,
      );

      const managedDir = path.resolve(
        import.meta.dirname!,
        "../../../packages/contracts-midnight/contract-round-value/src/managed",
      );
      console.log(`  ZK config dir: ${managedDir}`);
      const zkConfigProvider = new NodeZkConfigProvider(managedDir);
      const proofProvider = httpClientProofProvider(
        networkUrls.proofServer,
        zkConfigProvider,
      );

      const providers = {
        privateStateProvider,
        publicDataProvider,
        zkConfigProvider,
        proofProvider,
        walletProvider: walletAndMidnightProvider,
        midnightProvider: walletAndMidnightProvider,
      };

      const { Counter, witnesses } = await import(
        "@evm-midnight/midnight-contract"
      );
      const compiledContract = CompiledContract.make(
        "contract-round-value",
        Counter.Contract,
      ).pipe(
        CompiledContract.withWitnesses(witnesses as never),
        CompiledContract.withCompiledFileAssets(managedDir),
      );

      console.log(
        `  Finding deployed contract at ${contractAddress.slice(0, 16)}...`,
      );
      const counterContract = await findDeployedContract(providers, {
        contractAddress,
        compiledContract: compiledContract as any,
        privateStateId: "counterPrivateState",
        initialPrivateState: {},
      });
      console.log("  Contract found. Calling increment...");

      const toEncodedString = (str: string, length = 32) =>
        Uint8Array.from(
          str
            .padEnd(length, " ")
            .split("")
            .map((c) => c.charCodeAt(0)),
        );

      const txResult = await counterContract.callTx.increment(
        toEncodedString(erc721ContractAddress, 64),
        toEncodedString("100", 64),
        toEncodedString("testProp", 32),
        toEncodedString("testValue", 32),
      );

      console.log(
        `  Midnight tx: ${txResult.public.txId} (block ${txResult.public.blockHeight})`,
      );
      return true;
    },
  );

  await assertSQL(
    "Midnight property: property synced to evm_midnight_properties",
    db,
    `SELECT * FROM evm_midnight_properties
     WHERE token_id = '100' AND property_name = 'testProp'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.value === "testValue";
    },
  );

  await assert(
    "Midnight property: /api/erc721 includes the new property",
    async () => {
      const res = await fetch(`http://localhost:${API_PORT}/api/erc721`);
      const data = (await res.json()) as any[];
      return data.some(
        (row: any) =>
          row.token_id === "100" &&
          row.property_name === "testProp" &&
          row.value === "testValue",
      );
    },
  );
}

async function getEvmContractAddress(): Promise<string> {
  const mod = await import("@evm-midnight/contracts-evm");
  const addresses = (mod as any).contractAddressesEvmMain();
  return addresses.chain31337["Erc721DevModule#Erc721Dev"];
}
