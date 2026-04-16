import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import {
  type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
  Transaction,
  type UnprovenTransaction,
} from "@midnight-ntwrk/ledger-v8";

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
import {
  decodeOffer,
  OFFER_HRP,
} from "mip-zswap-offer";
import { getContractInstance, getWalletInstance, getAvailableWallets, resolveWalletId } from "./midnight-api.ts";
import { OfferFilesContract } from "../midnight-contracts/contract-offer-files/src/index.ts";
import { eventBus, emitAppEvent } from "./event-bus.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getContract(walletId?: string) {
  if (!midnightContract) {
    throw new Error("Midnight contract metadata is not available");
  }
  return await getContractInstance(walletId);
}

function getWalletParam(request: any): string {
  return resolveWalletId((request.query as any)?.wallet);
}

/**
 * Waits until `tokenColor` appears with a non-zero balance in the wallet's
 * shielded state.  The wallet SDK emits a new state for every processed block,
 * so this resolves as soon as the mint tx is included on-chain.
 */
async function waitForTokenBalance(
  wallet: any,
  tokenColor: string,
  timeoutMs = 120_000,
): Promise<void> {
  await Rx.firstValueFrom(
    (wallet.state() as Rx.Observable<any>).pipe(
      Rx.filter((s: any) => {
        const bal = (s.shielded?.balances ?? {})[tokenColor];
        return typeof bal === "bigint" && bal > 0n;
      }),
      Rx.timeout({
        first: timeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(
              `Mint tx not confirmed after ${timeoutMs / 1000}s — transaction may have failed on-chain`,
            ),
          ),
      }),
    ),
  );
}

// ─── API Router ───────────────────────────────────────────────────────────────

export const apiRouter: StartConfigApiRouter = async function (
  server: any,
  dbConn: any,
): Promise<void> {
  // GET /api/wallets — list available wallet profiles
  server.get("/api/wallets", async () => {
    return { wallets: getAvailableWallets() };
  });

  // GET /api/zswaps — list ZSWAPs ordered by newest first, with optional filtering & pagination
  server.get("/api/zswaps", async (request: any) => {
    const query = request?.query ?? {};

    const rawLimit = Number.parseInt((query as any).limit ?? "", 10);
    const rawOffset = Number.parseInt((query as any).offset ?? "", 10);

    let limit = Number.isFinite(rawLimit) ? rawLimit : 100;
    if (limit <= 0) limit = 100;
    if (limit > 100) limit = 100;

    let offset = Number.isFinite(rawOffset) ? rawOffset : 0;
    if (offset < 0) offset = 0;

    const token = (query as any).token as string | undefined;
    const directionRaw = ((query as any).direction as string | undefined)
      ?.toUpperCase();
    const direction =
      directionRaw === "GIVING" || directionRaw === "WANTING"
        ? directionRaw
        : undefined;

    const effectiveToken = token ?? "";
    const effectiveDirection = direction ?? "ANY";

    const offers = await getOfferFiles.run(
      {
        token: effectiveToken,
        direction: effectiveDirection,
        limit,
        offset,
      } as any,
      dbConn,
    );

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

  // POST /api/token/mint-shielded
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
            name: { type: "string" },
          },
        },
      },
    },
    async (request: any) => {
      const walletId = getWalletParam(request);
      const tokenName = request.body.name?.trim().toUpperCase().slice(0, 16) || `SHIELDED_${Date.now()}`;

      const nameCheck = await dbConn.query(
        `SELECT 1 FROM known_tokens WHERE name = $1 LIMIT 1`,
        [tokenName],
      );
      if (nameCheck.rows.length > 0) {
        return { success: false, error: `Token name "${tokenName}" is already taken` };
      }

      const domainSep = normalizeHex32(request.body.domainSep);
      const domainSepHex = domainSep.replace(/^0x/, "");
      const domainSepBytes = Uint8Array.from(
        Buffer.from(domainSepHex, "hex"),
      );

      const amount = BigInt(request.body.amount);
      const nonce = BigInt(request.body.nonce);
      const contract = await getContract(walletId);

      if (!amount) return { success: false, error: "Invalid amount" };
      if (!nonce) return { success: false, error: "Invalid nonce" };

      const txData = await (contract as any).callTx.mint_shielded(
        domainSepBytes,
        amount,
        nonce,
      );

      const txHash: string = txData.public?.txHash ?? "";
      // mint_shielded returns { nonce, color, value } — color is the actual ledger token type
      const tokenColor = Buffer.from(txData.private.result.color as Uint8Array).toString("hex");

      // Wait for the token to appear in the wallet's shielded balance.
      // This confirms the transaction was included in a block before we register
      // the token or fire the SSE event — prevents phantom known_tokens entries
      // when a tx fails after submission (e.g. insufficient dust for fees).
      const { walletResult } = await getWalletInstance(walletId);
      await waitForTokenBalance(walletResult.wallet, tokenColor);

      const colorCheck = await dbConn.query(
        `SELECT name FROM known_tokens WHERE token_color = $1 LIMIT 1`,
        [tokenColor],
      );
      if (colorCheck.rows.length > 0) {
        return { success: false, error: `This token color already exists as "${colorCheck.rows[0].name}"` };
      }

      await insertKnownToken.run(
        { token_color: tokenColor, name: tokenName },
        dbConn,
      );

      emitAppEvent({ type: "token_minted", name: tokenName, color: tokenColor, wallet: walletId });
      return { success: true, txHash, color: tokenColor, name: tokenName };
    },
  );

  // POST /api/token/mint-unshielded
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
            name: { type: "string" },
          },
        },
      },
    },
    async (request: any) => {
      const walletId = getWalletParam(request);
      const tokenName = request.body.name?.trim().toUpperCase().slice(0, 16) || `UNSHIELDED_${Date.now()}`;

      const nameCheck = await dbConn.query(
        `SELECT 1 FROM known_tokens WHERE name = $1 LIMIT 1`,
        [tokenName],
      );
      if (nameCheck.rows.length > 0) {
        return { success: false, error: `Token name "${tokenName}" is already taken` };
      }

      const domainSep = normalizeHex32(request.body.domainSep);
      const amount = String(request.body.amount);

      const contract = await getContract(walletId);
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
        { token_color: colorHex, name: tokenName },
        dbConn,
      );
      emitAppEvent({ type: "token_minted", name: tokenName, color: colorHex, wallet: walletId });
      return { success: true, txHash, color: colorHex, name: tokenName };
    },
  );

  // GET /api/wallet/balance — Query shielded and unshielded balances of the node wallet
  server.get("/api/wallet/balance", async (request: any) => {
    const walletId = getWalletParam(request);
    const { walletResult } = await getWalletInstance(walletId);

    const [shieldedState, unshieldedState] = await Promise.all([
      walletResult.wallet.shielded.waitForSyncedState(),
      walletResult.wallet.unshielded.waitForSyncedState(),
    ]);

    const serializeBalances = (balances: Record<string, bigint>) =>
      Object.fromEntries(Object.entries(balances).map(([k, v]) => [k, v.toString()]));

    return {
      shielded: serializeBalances(shieldedState.balances),
      unshielded: serializeBalances(unshieldedState.balances),
    };
  });

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
      const walletId = getWalletParam(request);
      const { gives, wants } = request.body;

      await getContract(walletId); // ensure _walletResult is initialized

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

      const { walletResult } = await getWalletInstance(walletId);

      // For shielded outputs, use the shielded address (has coinPublicKey), not bech32
      const shieldedAddr = await walletResult.wallet.shielded.getAddress();

      const outputs = wants.map((entry: any) => ({
        type: entry.type,
        outputs: [{
          type: entry.token,
          amount: BigInt(entry.amount),
          receiverAddress: shieldedAddr,
        }],
      }));

      let offerRecipe: any;
      try {
        offerRecipe = await walletResult.wallet.initSwap(
          inputMap,
          outputs,
          {
            shieldedSecretKeys: walletResult.zswapSecretKeys,
            dustSecretKey: walletResult.dustSecretKey,
          },
          { ttl: new Date(Date.now() + 1000 * 60 * 60) },
        );
      } catch (e: any) {
        console.error(`[ZSWAP-CREATE] initSwap failed:`, e);
        const detail = e?.cause?.message ?? e?.message ?? String(e);
        throw new Error(
          `initSwap failed: ${detail} (wallet=${walletId})`,
        );
      }

      // Return raw bytes as Base64 for HTTP transport; the frontend decodes and
      // applies bech32m encoding via mip-zswap-offer.buildOffer() before submitting.
      const transactionBytes = offerRecipe.transaction.serialize().toBase64();
      return { success: true, transactionBytes };
    },
  );

  // POST /api/zswap/submit — validate a bech32m `zswapoffer1…` blob and forward
  // it to Celestia DA. The frontend produces the blob via encodeOffer().
  server.post(
    "/api/zswap/submit",
    {
      schema: {
        body: {
          type: "object",
          required: ["blob"],
          properties: {
            blob: { type: "string" },
          },
        },
      },
    },
    async (request: any) => {
      const { blob } = request.body;

      if (typeof blob !== "string" || !blob.startsWith(`${OFFER_HRP}1`)) {
        throw new Error("Invalid blob: not a zswapoffer bech32m string");
      }

      // Verify it decodes without error (checksum + HRP check).
      try {
        decodeOffer(blob);
      } catch (e: any) {
        throw new Error(`Invalid bech32m: ${e.message ?? String(e)}`);
      }

      const result = await submitToCelestia(blob);
      if (!result) {
        throw new Error("Failed to submit blob to Celestia");
      }

      return { success: true, blob, result };
    },
  );

  // GET /api/events — Server-Sent Events stream for real-time offer lifecycle updates
  server.get("/api/events", async (request: any, reply: any) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const send = (data: object) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch { /* client disconnected */ }
    };

    send({ type: "connected", timestamp: Date.now() });

    const listener = (event: object) => send({ ...event, timestamp: Date.now() });
    eventBus.on("app_event", listener);

    const heartbeat = setInterval(() => {
      try { reply.raw.write(": heartbeat\n\n"); } catch { /* noop */ }
    }, 30_000);

    request.raw.on("close", () => {
      eventBus.off("app_event", listener);
      clearInterval(heartbeat);
    });

    // Keep connection open — never resolve
    await new Promise(() => {});
  });

  // POST /api/zswap/:id/complete — mark a ZSWAP as done on Midnight.
  server.post("/api/zswap/:id/complete", async (request: any) => {
    const walletId = getWalletParam(request);
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Invalid zswap id");
    }

    await getContract(walletId); // ensure _walletResult is initialized

    const offerRes = await dbConn.query(
      `SELECT * FROM offer_file WHERE id = $1`,
      [id],
    );
    if (offerRes.rows.length === 0) {
      throw new Error("Offer not found");
    }
    const offerData = offerRes.rows[0];

    // transaction_hex now holds the bech32m `zswapoffer1...` string written by
    // the state machine. Decode it via mip-zswap-offer.decodeOffer().
    let raw: Uint8Array;
    try {
      raw = decodeOffer(offerData.transaction_hex);
    } catch (e: any) {
      throw new Error("Failed to decode transaction string: " + e.message);
    }

    const offerTx = Transaction.deserialize(
      "signature" as const,
      "pre-proof" as const,
      "pre-binding" as const,
      raw,
    ) as UnprovenTransaction;

    const { walletResult } = await getWalletInstance(walletId);
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

    return { success: true, txId };
  });
};
