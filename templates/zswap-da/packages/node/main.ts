// NOTE & TODO:
// Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// Loading this package in a dependency makes the onchain-runtime wasm
// fail in runtime when trying to parse the state.
// This side-effect import ensures the wasm bundle is registered.
import "@midnight-ntwrk/onchain-runtime";

// NOTE: This is a fix for Midnight ZSwap.
import { ZswapChainState } from "@midnight-ntwrk/ledger-v7";

const origTryApply = ZswapChainState.prototype.tryApply;
ZswapChainState.prototype.tryApply = function (...args) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return origTryApply.apply(this as any, args as any);
  } catch {
    return [this, new Map()];
  }
};

import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";

import { localhostConfig } from "./config.ts";
import { migrationTable } from "@zswap-da/database";
import { apiRouter } from "./api.ts";
import { gameStateTransitions, grammar } from "./state-machine.ts";

// ─── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting ZSwap DA Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "zswap-da",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});

// // NOTE & TODO:
// // Importing "@midnight-ntwrk/onchain-runtime" here is a workaround.
// // Loading this package in a dependency makes the onchain-runtime wasm
// // fail in runtime when trying to parse the state.
// // This side-effect import ensures the wasm bundle is registered.
// import "@midnight-ntwrk/onchain-runtime";
// // NOTE: This is a fix for Midnight ZSwap.
// import { ZswapChainState, Transaction, type UnprovenTransaction } from '@midnight-ntwrk/ledger-v7';
// import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";

// const origTryApply = ZswapChainState.prototype.tryApply;
// ZswapChainState.prototype.tryApply = function (...args) {
//   try {
//     return origTryApply.apply(this, args);
//   } catch {
//     return [this, new Map()];
//   }
// };

// import {
//   init,
//   start,
//   type StartConfigApiRouter,
//   type StartConfigGameStateTransitions,
// } from "@effectstream/runtime";
// import { main, suspend } from "effection";
// import {
//   toSyncProtocolWithNetwork,
//   withEffectstreamStaticConfig,
// } from "@effectstream/config";

// import type { GrammarDefinition } from "@effectstream/concise";
// import type { SyncStateUpdateStream } from "@effectstream/coroutine";
// import { World } from "@effectstream/coroutine";
// import { PaimaSTM } from "@effectstream/sm";
// import type { BaseStfInput } from "@effectstream/sm";
// import { builtinGrammars } from "@effectstream/sm/grammar";

// import { dirname } from "node:path";
// import { Buffer } from "node:buffer";
// import {
//   buildWalletAndWaitForFunds,
//   configureMidnightNodeProviders,
// } from "@effectstream/midnight-contracts";
// import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
// import { CompiledContract } from "@midnight-ntwrk/compact-js";
// import { findDeployedContract, type FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
// import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
// import { OfferFilesContract, witnesses } from "../midnight-contracts/contract-offer-files/src/index.ts";
// import {
//   type buildCompletionRefAsync,
//   extractMidnightLedgerSnapshot,
//   normalizeHex32,
// } from "./zswap-logic.ts";
// import { midnightContract } from "./config.ts";

// import { CELESTIA_RPC_URL, CELESTIA_NAMESPACE, CELESTIA_FEE, CELESTIA_GAS_LIMIT } from "./config.ts";
// import { localhostConfig } from "./config.ts";
// import {
//   insertOfferFile,
//   insertOfferFileToken,
//   getOfferFiles,
//   getOfferFileTokens,
//   getKnownTokens,
//   insertKnownToken,
//   insertOfferFileNullifier,
//   migrationTable,
// } from "@zswap-da/database";


// // ─── Grammar ─────────────────────────────────────────────────────────────────
// //
// // We reuse the built-in Celestia generic grammar.
// // Blobs arrive as { payload: { suppliedValue: string } } where suppliedValue
// // is the raw bytes decoded as UTF-8 (our JSON-encoded ZSWAP).

// const grammar = {
//   "celestia-zswap": builtinGrammars.celestiaGeneric,
//   "midnight-zswap": builtinGrammars.midnightGeneric,
// } as const satisfies GrammarDefinition;

// // ─── Runtime Config ───────────────────────────────────────────────────────────



// // ─── DB ref (set by apiRouter before sync starts) ─────────────────────────────

// // deno-lint-ignore no-explicit-any
// let _dbConn: any = null;
// // deno-lint-ignore no-explicit-any
// let _contractInstance: any; //  FoundContract<OfferFilesContract.Contract>;
// // deno-lint-ignore no-explicit-any
// let _walletResult: any;
// let _wallet2Bech32: string | null = null;

// // ─── Celestia Submission Helper ───────────────────────────────────────────────

// function namespaceToBase64(hex: string): string {
//   const clean = hex.replace(/^0x/, "");
//   const bytes = new Uint8Array(29); // 1-byte version prefix + 28-byte namespace ID
//   const hexBytes = (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16));
//   bytes.set(hexBytes, 29 - hexBytes.length);
//   let binary = "";
//   for (const byte of bytes) binary += String.fromCharCode(byte);
//   return btoa(binary);
// }

// async function submitToCelestia(
//   data: string,
// ): Promise<{ txhash: string; height: string } | null> {
//   const ns64 = namespaceToBase64(CELESTIA_NAMESPACE);
//   const b64 = btoa(unescape(encodeURIComponent(data)));
//   try {
//     const res = await fetch(CELESTIA_RPC_URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         jsonrpc: "2.0",
//         id: 1,
//         method: "blob.Submit",
//         params: [
//           [{ namespace: ns64, data: b64, share_version: 0 }],
//           { fee: CELESTIA_FEE, gasLimit: CELESTIA_GAS_LIMIT },
//         ],
//       }),
//     });
//     const json = await res.json();
//     if (json.error) throw new Error(JSON.stringify(json.error));
//     return json.result;
//   } catch (e) {
//     console.error("[Celestia submit error]", e);
//     return null;
//   }
// }

// // ─── State Machine ────────────────────────────────────────────────────────────

// const stm = new PaimaSTM<typeof grammar, {}>(grammar);

// stm.addStateTransition("celestia-zswap", function* (data) {
  
//   const { payload } = data.parsedInput;
//   const raw = payload.suppliedValue;

//   let parsed: any;
//   try {
//     parsed = JSON.parse(raw);
//   } catch {
//     console.error("[ZSWAP] Failed to parse payload", raw);
//     return;
//   }

//   if (parsed.version !== 1 || typeof parsed.transaction !== "string" || !Array.isArray(parsed.wants) || !Array.isArray(parsed.gives)) {
//     console.error("[ZSWAP] Invalid payload", parsed);
//     return;
//   }

//   try {
//     const offerFileRes = yield* World.resolve(
//       insertOfferFile,
//         {
//           celestia_height: data.blockHeight,
//           transaction_hex: parsed.transaction,
//           metadata_created_at: parsed.metadata?.createdAt,
//           metadata_expires_at: parsed.metadata?.expiresAt,
//           metadata_maker_note: parsed.metadata?.makerNote,
//           auth_signer_public_key: parsed.auth?.signerPublicKey,
//           auth_signature: parsed.auth?.signature,
//           auth_scheme: parsed.auth?.scheme,
//           is_active: true,
//       });

//     const offerFileId = offerFileRes[0].id;

//     let raw: Uint8Array;
//     try {
//       raw = Uint8Array.from(atob(parsed.transaction), (c) => c.charCodeAt(0));
//       const offerTx = Transaction.deserialize(
//         "signature" as const,
//         "pre-proof" as const,
//         "pre-binding" as const,
//         raw,
//       ) as UnprovenTransaction;

//       const nullifiers: string[] = offerTx.guaranteedOffer ? offerTx.guaranteedOffer.inputs.map((input: any) => input.nullifier) : [];
//       for (const nullifier of nullifiers) {
//             const a = Buffer.from(nullifier).toString('hex');
//             yield* World.resolve(
//               insertOfferFileNullifier,
//               {
//                 offer_file_id: offerFileId,
//                 nullifier: Buffer.from(a, 'hex').toString('ascii').padStart(72, '0')
//               }
//             );
//       }
//     } catch (e) {
//       console.error("[ZSWAP] Failed to parse transaction to extract nullifiers", e);
//     }

//     for (const want of parsed.wants) {
//       yield* World.resolve(
//         insertOfferFileToken,
//           {
//             offer_file_id: offerFileId,
//             token_color: want.token,
//             amount: want.amount.toString(),
//             direction: "WANTING",
//           }
//       );
//     }

//     for (const give of parsed.gives) {
//       yield* World.resolve(
//         insertOfferFileToken,
//           {
//             offer_file_id: offerFileId,
//             token_color: give.token,
//             amount: give.amount.toString(),
//             direction: "GIVING",
//           }
//       );
//     }

//     console.log(`🌌 [ZSWAP] Saved at Celestia block ${data.blockHeight}`);
//   } catch (e) {
//     console.error("[ZSWAP] Failed to save offer file", e);
//   }
// });

// stm.addStateTransition("midnight-zswap", function* (data) {
//   if (!_dbConn) return;
//   const snapshot = extractMidnightLedgerSnapshot(data.parsedInput.payload);
//   if (!snapshot) return;

//   console.log(`🌌 [MIDNIGHT] Ledger snapshot at block ${data.blockHeight}`, snapshot);
// });

// // ─── Game State Transitions ───────────────────────────────────────────────────

// const gameStateTransitions: StartConfigGameStateTransitions = function* (
//   _blockHeight: number,
//   input: BaseStfInput,
// ): SyncStateUpdateStream<void> {
//   yield* stm.processInput(input);
// };

// // ─── API Router ───────────────────────────────────────────────────────────────

// async function getContract() {
//   if (!midnightContract) {
//     throw new Error("Midnight contract metadata is not available");
//   }
//   if (!_contractInstance) {
//     _contractInstance = await (async () => {
//       setNetworkId(midnightNetworkConfig.id);

//       const networkUrls = {
//         indexer: midnightNetworkConfig.indexer,
//         indexerWS: midnightNetworkConfig.indexerWS,
//         node: midnightNetworkConfig.node,
//         proofServer: midnightNetworkConfig.proofServer,
//         id: midnightNetworkConfig.id,
//       };

//       const walletResult = await buildWalletAndWaitForFunds(
//         networkUrls,
//         midnightNetworkConfig.walletSeed ??
//           "0000000000000000000000000000000000000000000000000000000000000001",
//         midnightNetworkConfig.id,
//       );
//       _walletResult = walletResult;
//       const addr = await walletResult.wallet.shielded.getAddress();
//       _wallet2Bech32 = MidnightBech32m.encode(midnightNetworkConfig.id, addr)
//         .asString();

//       const providers = configureMidnightNodeProviders(
//         walletResult.wallet,
//         walletResult.zswapSecretKeys,
//         walletResult.walletZswapSecretKeys,
//         walletResult.dustSecretKey,
//         walletResult.walletDustSecretKey,
//         networkUrls,
//         "offerFilesPrivateState",
//         midnightContract.zkConfigPath,
//         walletResult.unshieldedKeystore,
//       );

//       const compiledContract = CompiledContract.make(
//         "contract-offer-files",
//         OfferFilesContract.Contract as any,
//       ).pipe(
//         CompiledContract.withWitnesses(witnesses as unknown as never),
//         CompiledContract.withCompiledFileAssets(
//           dirname(midnightContract!.zkConfigPath),
//         ),
//       );

//       const contract = await findDeployedContract(
//         providers,
//         {
//           contractAddress: midnightContract!.contractAddress,
//           compiledContract: compiledContract as any,
//           privateStateId: "offerFilesPrivateState",
//           initialPrivateState: {},
//         },
//       ) as any;
//       console.log("Contract joined successfully");
//       return contract;
//     })();
//   }
//   return _contractInstance;
// }

// export const apiRouter: StartConfigApiRouter = async function (
//   server: any,
//   dbConn: any,
// ): Promise<void> {
//   // Store ref for state machine DB writes
//   _dbConn = dbConn;

//   // GET /api/zswaps — list all ZSWAPs ordered by newest first
//   server.get("/api/zswaps", async () => {
//     const offers = await getOfferFiles.run(undefined, dbConn);
//     const result: {
//       id: number;
//       celestia_height: string;
//       transaction_hex: string;
//       metadata_created_at: Date | null;
//       metadata_expires_at: Date | null;
//       metadata_maker_note: string | null;
//       auth_signer_public_key: string | null;
//       auth_signature: string | null;
//       auth_scheme: string | null;
//       is_active: boolean| null;
//       created_at: Date | null;
//       gives: { token: string; amount: string }[];
//       wants: { token: string; amount: string }[];
//     }[] = [];
//     for (const offer of offers) {
//       const tokens = await getOfferFileTokens.run({ offer_file_id: offer.id }, dbConn);
//       const gives = tokens.filter(t => t.direction === 'GIVING').map(t => ({ token: t.token_color, amount: t.amount }));
//       const wants = tokens.filter(t => t.direction === 'WANTING').map(t => ({ token: t.token_color, amount: t.amount }));
//       result.push({ ...offer, gives, wants });
//     }
//     return result;
//   });

//   server.get("/api/known-tokens", async () => {
//     const result = await getKnownTokens.run(undefined, dbConn);
//     return result;
//   });

//   // POST /api/token/mint-shielded — mint a shielded token via mint_shielded circuit
//   server.post("/api/token/mint-shielded", {
//     schema: {
//       body: {
//         type: "object",
//         required: ["domainSep", "amount", "nonce"],
//         properties: {
//           domainSep: { type: "string" },
//           amount: { type: "string" },
//           nonce: { type: "string" },
//         },
//       },
//     },
//   }, async (request: any) => {
//     const DOMAIN_SEPARATOR = new Uint8Array(32).fill(1);

//     // const domainSep: Uint8Array /* new Uint8Array(32) */ = Uint8Array.from(Buffer.from(request.body.domainSep));
//     const amount = BigInt(request.body.amount);
//     const nonce = BigInt(request.body.nonce);
//     const contract = await getContract();

//     if (!amount) return { success: false, error: "Invalid amount" };
//     if (!nonce) return { success: false, error: "Invalid nonce" };

//     const txData = await contract.callTx.mint_shielded(
//       DOMAIN_SEPARATOR,
//       amount,
//       nonce,
//     );

//     const txHash: string = txData.public?.txHash ?? "";

//     await insertKnownToken.run(
//       {
//         token_color: Buffer.from(DOMAIN_SEPARATOR).toString("hex"),
//         name: `shielded_${Date.now()}`
//       },
//       dbConn
//     );

//     return { success: true, txHash };
//   });

//   // POST /api/token/mint-unshielded — mint an unshielded token via mint_unshielded circuit
//   server.post("/api/token/mint-unshielded", {
//     schema: {
//       body: {
//         type: "object",
//         required: ["domainSep", "amount"],
//         properties: {
//           domainSep: { type: "string" },
//           amount: { type: "string" },
//         },
//       },
//     },
//   }, async (request: any) => {
//     const domainSep = normalizeHex32(request.body.domainSep);
//     const amount = String(request.body.amount);

//     const contract = await getContract();
//     const domainSepBytes = Uint8Array.from(Buffer.from(domainSep.replace(/^0x/, ""), "hex"));
//     const txData = await contract.callTx.mint_unshielded(
//       domainSepBytes,
//       BigInt(amount),
//     );
//     const colorHex = Buffer.from(txData.private.result as Uint8Array).toString("hex");
//     const txHash: string = txData.public?.txHash ?? "";

//     await insertKnownToken.run(
//       {
//         token_color: colorHex,
//         name: `unshielded_${Date.now()}`
//       },
//       dbConn
//     );
//     return { success: true, txHash, color: colorHex };
//   });

//   // POST /api/zswap/create — Create an offer transaction payload using Midnight wallet
//   server.post("/api/zswap/create", {
//     schema: {
//       body: {
//         type: "object",
//         required: ["gives", "wants"],
//         properties: {
//           gives: { type: "array" },
//           wants: { type: "array" },
//         },
//       },
//     },
//   }, async (request: any) => {
//     const { gives, wants } = request.body;

//     await getContract(); // ensure _walletResult is initialized

//     // Build inputs from gives array
//     const shieldedInputs: Record<string, bigint> = {};
//     const unshieldedInputs: Record<string, bigint> = {};
//     for (const entry of gives) {
//       if (entry.type === "shielded") {
//         shieldedInputs[entry.token] = BigInt(entry.amount);
//       } else {
//         unshieldedInputs[entry.token] = BigInt(entry.amount);
//       }
//     }

//     const inputMap: Record<string, Record<string, bigint>> = {};
//     if (Object.keys(shieldedInputs).length > 0) {
//       inputMap.shielded = shieldedInputs;
//     }
//     if (Object.keys(unshieldedInputs).length > 0) {
//       inputMap.unshielded = unshieldedInputs;
//     }

//     // Build outputs from wants array
//     const outputs = wants.map((entry: any) => ({
//       type: entry.type,
//       outputs: [{
//         type: entry.token,
//         amount: BigInt(entry.amount),
//         receiverAddress: _wallet2Bech32, // _walletResult.unshieldedAddress,
//       }],
//     }));

//     const offerRecipe = await _walletResult.wallet.initSwap(
//       inputMap,
//       outputs,
//       {
//         shieldedSecretKeys: _walletResult.zswapSecretKeys,
//         dustSecretKey: _walletResult.dustSecretKey,
//       },
//       { ttl: new Date(Date.now() + 1000 * 60 * 60) },
//     );

//     const nullifiers: string[] = offerRecipe.transaction.guaranteedOffer.inputs.map((input: any) => input.nullifier);

//     const serializedOffer = offerRecipe.transaction.serialize().toBase64();
//     return { success: true, transaction: serializedOffer };
//   });

//   // POST /api/zswap/submit — write a ZSWAP blob to Celestia DA
//   server.post("/api/zswap/submit", {
//     schema: {
//       body: {
//         type: "object",
//         required: ["transaction", "gives", "wants"],
//         properties: {
//           transaction: { type: "string" },
//           gives: { type: "array" },
//           wants: { type: "array" },
//           metadata: { type: "object" },
//           auth: { type: "object" },
//         },
//       },
//     },
//   }, async (request: any) => {
//     const { transaction, gives, wants, metadata, auth } = request.body;

//     const blob = JSON.stringify({
//       version: 1,
//       transaction,
//       gives,
//       wants,
//       metadata,
//       auth
//     });

//     const result = await submitToCelestia(blob);
//     if (!result) {
//       throw new Error("Failed to submit blob to Celestia");
//     }

//     return { success: true, blob, result: result };
//   });

//   // POST /api/zswap/:id/complete — mark a ZSWAP as done on Midnight.
//   server.post("/api/zswap/:id/complete", async (request: any) => {
//     const id = Number(request.params.id);
//     if (!Number.isInteger(id) || id <= 0) {
//       throw new Error("Invalid zswap id");
//     }

//     await getContract(); // ensure _walletResult is initialized

//     const offerRes = await dbConn.query(`SELECT * FROM offer_file WHERE id = $1`, [id]);
//     if (offerRes.rows.length === 0) {
//       throw new Error("Offer not found");
//     }
//     const offerData = offerRes.rows[0];

//     const base64Str = offerData.transaction_hex;
//     let raw: Uint8Array;
//     try {
//       raw = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
//     } catch (e: any) {
//       throw new Error("Failed to decode transaction string: " + e.message);
//     }

//     const offerTx = Transaction.deserialize(
//       "signature" as const,
//       "pre-proof" as const,
//       "pre-binding" as const,
//       raw,
//     ) as UnprovenTransaction;

//     // const nullifiers = offerTx.guaranteedOffer ? offerTx.guaranteedOffer.inputs.map((input: any) => input.nullifier) : [];
//     // for (const nullifier of nullifiers) {
//     //   await dbConn.query(
//     //     `INSERT INTO offer_file_nullifiers (offer_file_id, nullifier) VALUES ($1, $2) ON CONFLICT (nullifier) DO NOTHING`,
//     //     [id, Buffer.from(nullifier).toString('hex')]
//     //   );
//     // }

//     const balancedRecipe = await _walletResult.wallet
//       .balanceUnprovenTransaction(
//         offerTx,
//         {
//           shieldedSecretKeys: _walletResult.zswapSecretKeys,
//           dustSecretKey: _walletResult.dustSecretKey,
//         },
//         { ttl: new Date(Date.now() + 1000 * 60 * 60) },
//       );

//     const signedTx: UnprovenTransaction = await _walletResult.wallet
//       .signUnprovenTransaction(
//         balancedRecipe.transaction,
//         (payload: Uint8Array) =>
//           _walletResult.unshieldedKeystore.signData(payload),
//       );

//     const finalizedTx = await _walletResult.wallet.finalizeTransaction(
//       signedTx,
//     );
//     const txId = await _walletResult.wallet.submitTransaction(finalizedTx);

//     console.log({
//       offerTx, 
//       balancedRecipe,
//       signedTx,
//       finalizedTx,
//       txId,
//     })


//     await dbConn.query(
//       `UPDATE offer_file SET is_active = FALSE WHERE id = $1`,
//       [id]
//     );

//     return { success: true, txId };
//   });

// };

// // ─── Main ─────────────────────────────────────────────────────────────────────

// main(function* () {
//   yield* init();
//   console.log("Starting ZSwap DA Node");

//   yield* withEffectstreamStaticConfig(localhostConfig, function* () {
//     yield* start({
//       appName: "zswap-da",
//       appVersion: "1.0.0",
//       syncInfo: toSyncProtocolWithNetwork(localhostConfig),
//       gameStateTransitions,
//       migrations: migrationTable,
//       apiRouter,
//       grammar,
//     });
//   });

//   yield* suspend();
// });
