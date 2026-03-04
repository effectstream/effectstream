import { Buffer } from "node:buffer";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import {
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
  Transaction,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v7";

import {
  getKnownTokens,
  getOfferFiles,
  getOfferFileTokens,
  insertKnownToken,
} from "@zswap-da/database";

import {
  midnightContract,
} from "./config.ts";
import { normalizeHex32 } from "./zswap-logic.ts";
import { submitToCelestia } from "./celestia-api.ts";
import { getContractInstance, getWalletInstance } from "./midnight-api.ts";

// ─── Midnight Contract Helper ─────────────────────────────────────────────────

async function getContract(): Promise<FoundContract<unknown>> {
  if (!midnightContract) {
    throw new Error("Midnight contract metadata is not available");
  }
  return await getContractInstance();
}

// ─── API Router ───────────────────────────────────────────────────────────────

export const apiRouter: StartConfigApiRouter = async function (
  server: any,
  dbConn: any,
): Promise<void> {
  // GET /api/zswaps — list all ZSWAPs ordered by newest first
  server.get("/api/zswaps", async () => {
    const offers = await getOfferFiles.run(undefined, dbConn);
    const result: {
      id: number;
      celestia_height: string;
      transaction_hex: string;
      metadata_created_at: Date | null;
      metadata_expires_at: Date | null;
      metadata_maker_note: string | null;
      auth_signer_public_key: string | null;
      auth_signature: string | null;
      auth_scheme: string | null;
      is_active: boolean | null;
      created_at: Date | null;
      gives: { token: string; amount: string }[];
      wants: { token: string; amount: string }[];
    }[] = [];
    for (const offer of offers) {
      const tokens = await getOfferFileTokens.run(
        { offer_file_id: offer.id },
        dbConn,
      );
      const gives = tokens
        .filter((t) => t.direction === "GIVING")
        .map((t) => ({ token: t.token_color, amount: t.amount }));
      const wants = tokens
        .filter((t) => t.direction === "WANTING")
        .map((t) => ({ token: t.token_color, amount: t.amount }));
      result.push({ ...offer, gives, wants });
    }
    return result;
  });

  server.get("/api/known-tokens", async () => {
    const result = await getKnownTokens.run(undefined, dbConn);
    return result;
  });

  // POST /api/token/mint-shielded — mint a shielded token via mint_shielded circuit
  server.post(
    "/api/token/mint-shielded",
    {
      schema: {
        body: {
          type: "object",
          required: ["domainSep", "amount", "nonce"],
          properties: {
            domainSep: { type: "string" },
            amount: { type: "string" },
            nonce: { type: "string" },
          },
        },
      },
    },
    async (request: any) => {
      const DOMAIN_SEPARATOR = new Uint8Array(32).fill(1);

      const amount = BigInt(request.body.amount);
      const nonce = BigInt(request.body.nonce);
      const contract = await getContract();

      if (!amount) return { success: false, error: "Invalid amount" };
      if (!nonce) return { success: false, error: "Invalid nonce" };

      const txData = await (contract as any).callTx.mint_shielded(
        DOMAIN_SEPARATOR,
        amount,
        nonce,
      );

      const txHash: string = txData.public?.txHash ?? "";

      await insertKnownToken.run(
        {
          token_color: Buffer.from(DOMAIN_SEPARATOR).toString("hex"),
          name: `shielded_${Date.now()}`,
        },
        dbConn,
      );

      return { success: true, txHash };
    },
  );

  // POST /api/token/mint-unshielded — mint an unshielded token via mint_unshielded circuit
  server.post(
    "/api/token/mint-unshielded",
    {
      schema: {
        body: {
          type: "object",
          required: ["domainSep", "amount"],
          properties: {
            domainSep: { type: "string" },
            amount: { type: "string" },
          },
        },
      },
    },
    async (request: any) => {
      const domainSep = normalizeHex32(request.body.domainSep);
      const amount = String(request.body.amount);

      const contract = await getContract();
      const domainSepBytes = Uint8Array.from(
        Buffer.from(domainSep.replace(/^0x/, ""), "hex"),
      );
      const txData = await (contract as any).callTx.mint_unshielded(
        domainSepBytes,
        BigInt(amount),
      );
      const colorHex = Buffer.from(
        txData.private.result as Uint8Array,
      ).toString("hex");
      const txHash: string = txData.public?.txHash ?? "";

      await insertKnownToken.run(
        {
          token_color: colorHex,
          name: `unshielded_${Date.now()}`,
        },
        dbConn,
      );
      return { success: true, txHash, color: colorHex };
    },
  );

  // POST /api/zswap/create — Create an offer transaction payload using Midnight wallet
  server.post(
    "/api/zswap/create",
    {
      schema: {
        body: {
          type: "object",
          required: ["gives", "wants"],
          properties: {
            gives: { type: "array" },
            wants: { type: "array" },
          },
        },
      },
    },
    async (request: any) => {
      const { gives, wants } = request.body;

      await getContract(); // ensure _walletResult is initialized

      // Build inputs from gives array
      const shieldedInputs: Record<string, bigint> = {};
      const unshieldedInputs: Record<string, bigint> = {};
      for (const entry of gives) {
        if (entry.type === "shielded") {
          shieldedInputs[entry.token] = BigInt(entry.amount);
        } else {
          unshieldedInputs[entry.token] = BigInt(entry.amount);
        }
      }

      const inputMap: Record<string, Record<string, bigint>> = {};
      if (Object.keys(shieldedInputs).length > 0) {
        inputMap.shielded = shieldedInputs;
      }
      if (Object.keys(unshieldedInputs).length > 0) {
        inputMap.unshielded = unshieldedInputs;
      }

      const { wallet2Bech32, walletResult } = await getWalletInstance();

      // Build outputs from wants array
      const outputs = wants.map((entry: any) => ({
        type: entry.type,
        outputs: [{
          type: entry.token,
          amount: BigInt(entry.amount),
          receiverAddress: wallet2Bech32, // _walletResult.unshieldedAddress,
        }],
      }));

      const offerRecipe = await walletResult.wallet.initSwap(
        inputMap,
        outputs,
        {
          shieldedSecretKeys: walletResult.zswapSecretKeys,
          dustSecretKey: walletResult.dustSecretKey,
        },
        { ttl: new Date(Date.now() + 1000 * 60 * 60) },
      );

      const serializedOffer = offerRecipe.transaction.serialize().toBase64();
      return { success: true, transaction: serializedOffer };
    },
  );

  // POST /api/zswap/submit — write a ZSWAP blob to Celestia DA
  server.post(
    "/api/zswap/submit",
    {
      schema: {
        body: {
          type: "object",
          required: ["transaction", "gives", "wants"],
          properties: {
            transaction: { type: "string" },
            gives: { type: "array" },
            wants: { type: "array" },
            metadata: { type: "object" },
            auth: { type: "object" },
          },
        },
      },
    },
    async (request: any) => {
      const { transaction, gives, wants, metadata, auth } = request.body;

      const blob = JSON.stringify({
        version: 1,
        transaction,
        gives,
        wants,
        metadata,
        auth,
      });

      const result = await submitToCelestia(blob);
      if (!result) {
        throw new Error("Failed to submit blob to Celestia");
      }

      return { success: true, blob, result: result };
    },
  );

  // POST /api/zswap/:id/complete — mark a ZSWAP as done on Midnight.
  server.post("/api/zswap/:id/complete", async (request: any) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Invalid zswap id");
    }

    await getContract(); // ensure _walletResult is initialized

    const offerRes = await dbConn.query(
      `SELECT * FROM offer_file WHERE id = $1`,
      [id],
    );
    if (offerRes.rows.length === 0) {
      throw new Error("Offer not found");
    }
    const offerData = offerRes.rows[0];

    const base64Str = offerData.transaction_hex;
    let raw: Uint8Array;
    try {
      raw = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
    } catch (e: any) {
      throw new Error("Failed to decode transaction string: " + e.message);
    }

    const offerTx = Transaction.deserialize(
      "signature" as const,
      "pre-proof" as const,
      "pre-binding" as const,
      raw,
    ) as UnprovenTransaction;

    const { walletResult } = await getWalletInstance();
    const balancedRecipe = await walletResult.wallet
      .balanceUnprovenTransaction(
        offerTx,
        {
          shieldedSecretKeys: walletResult.zswapSecretKeys,
          dustSecretKey: walletResult.dustSecretKey,
        },
        { ttl: new Date(Date.now() + 1000 * 60 * 60) },
      );

    const signedTx: UnprovenTransaction = await walletResult.wallet
      .signUnprovenTransaction(
        balancedRecipe.transaction,
        (payload: Uint8Array) =>
          walletResult.unshieldedKeystore.signData(payload),
      );

    const finalizedTx = await walletResult.wallet.finalizeTransaction(
      signedTx,
    );
    const txId = await walletResult.wallet.submitTransaction(finalizedTx);

    console.log({
      offerTx,
      balancedRecipe,
      signedTx,
      finalizedTx,
      txId,
    });

    await dbConn.query(
      `UPDATE offer_file SET is_active = FALSE WHERE id = $1`,
      [id],
    );

    return { success: true, txId };
  });
};

