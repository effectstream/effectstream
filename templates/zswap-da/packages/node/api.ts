import type { StartConfigApiRouter } from "@effectstream/runtime";

import {
  getKnownTokens,
  getOfferFiles,
  getOfferFileTokens,
  insertKnownToken,
  isNullifierSpent,
  isUnshieldedSpent,
  isUnshieldedCreated,
  isKnownRoot,
} from "@zswap-da/database";

import { MIDNIGHT_NETWORK_ID, OFFER_MAX_BYTES, midnightContract } from "./env.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { submitBlobViaBatcher } from "./batcher-client.ts";
import { getBlankRefState, validateZswapOffer } from "@zswap-da/validator";
import { eventBus, emitAppEvent } from "./event-bus.ts";
import { quote, buildStats, buildDepth, buildHistory } from "./market-mock.ts";

// ─── API Router ───────────────────────────────────────────────────────────────

export const apiRouter: StartConfigApiRouter = async function (
  server: any,
  dbConn: any,
): Promise<void> {
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

  // GET /api/quote — synthetic price quote for from→to (see market-mock.ts).
  // Params: from_token, to_token (hex colors), from_amount (base units),
  // optional to_amount (a user-set receive amount → discount/sponsored vs it).
  // The frontend uses this so it never fabricates rates/sponsorship itself.
  server.get("/api/quote", async (request: any) => {
    const q = request?.query ?? {};
    const fromToken = String((q as any).from_token ?? "").toLowerCase();
    const toToken = String((q as any).to_token ?? "").toLowerCase();
    if (!fromToken || !toToken) {
      throw new Error("from_token and to_token are required");
    }
    const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");
    const fromAmount = BigInt(digits((q as any).from_amount) || "0");
    const toRaw = digits((q as any).to_amount);
    const toAmount = toRaw.length ? BigInt(toRaw) : undefined;
    return quote(fromToken, toToken, fromAmount, toAmount);
  });

  // GET /api/chart/{stats,depth,history} — synthetic per-pair market data
  // (see market-mock.ts). Params: base, quote (hex colors).
  const readPair = (request: any): { base: string; quote: string } => {
    const q = request?.query ?? {};
    const base = String((q as any).base ?? "").toLowerCase();
    const quoteToken = String((q as any).quote ?? "").toLowerCase();
    if (!base || !quoteToken) throw new Error("base and quote are required");
    return { base, quote: quoteToken };
  };
  server.get("/api/chart/stats", async (request: any) => {
    const { base, quote: quoteToken } = readPair(request);
    return buildStats(base, quoteToken);
  });
  server.get("/api/chart/depth", async (request: any) => {
    const { base, quote: quoteToken } = readPair(request);
    return buildDepth(base, quoteToken);
  });
  server.get("/api/chart/history", async (request: any) => {
    const { base, quote: quoteToken } = readPair(request);
    return buildHistory(base, quoteToken);
  });

  // POST /api/known-tokens — register a token name/color pair. The browser-wallet
  // mint path submits the contract call client-side and still needs the backend
  // DB to know the token name for indexing/display.
  server.post(
    "/api/known-tokens",
    {
      schema: {
        body: {
          type: "object",
          required: ["color", "name", "kind"],
          properties: {
            color: { type: "string" },
            name: { type: "string" },
            kind: { type: "string", enum: ["shielded", "unshielded"] },
          },
        },
      },
    },
    async (request: any) => {
      const color = String(request.body.color).toLowerCase().replace(/^0x/, "");
      const name = String(request.body.name).trim().toUpperCase().slice(0, 16);
      const kind = String(request.body.kind);
      if (!/^[0-9a-f]{64}$/.test(color)) {
        throw new Error("Invalid token color (expected 64 hex chars)");
      }
      if (!name) throw new Error("Invalid token name");
      if (kind !== "shielded" && kind !== "unshielded") {
        throw new Error('Invalid kind (expected "shielded" or "unshielded")');
      }

      const nameCheck = await dbConn.query(
        `SELECT 1 FROM known_tokens WHERE name = $1 LIMIT 1`,
        [name],
      );
      if (nameCheck.rows.length > 0) {
        throw new Error(`Token name "${name}" is already taken`);
      }
      const colorCheck = await dbConn.query(
        `SELECT name FROM known_tokens WHERE token_color = $1 LIMIT 1`,
        [color],
      );
      if (colorCheck.rows.length > 0) {
        throw new Error(`Token color already registered as "${colorCheck.rows[0].name}"`);
      }

      await insertKnownToken.run({ token_color: color, name, kind }, dbConn);
      emitAppEvent({ type: "token_minted", name, color, kind });
      return { success: true, color, name, kind };
    },
  );

  // GET /api/midnight/config — expose the public Midnight config the browser
  // contract client needs (contract address, indexer, proof server). Never
  // include secrets.
  server.get("/api/midnight/config", async () => {
    if (!midnightContract) {
      throw new Error("Midnight contract metadata is not available");
    }
    return {
      contractAddress: midnightContract.contractAddress,
      indexerUri: midnightNetworkConfig.indexer,
      indexerWsUri: midnightNetworkConfig.indexerWS,
      proofServerUri: midnightNetworkConfig.proofServer,
      networkId: midnightNetworkConfig.id,
    };
  });

  // POST /api/zswap/submit — fully validate a `zswapoffer1…` blob, then forward
  // it to Celestia DA via the batcher. We validate here so the frontend gets
  // fast, specific feedback; the batcher's validateInput hook re-validates as
  // the authoritative pre-fee gate. The frontend produces the blob via
  // encodeOffer().
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
    async (request: any, reply: any) => {
      const { blob } = request.body;

      // Structure + cryptographic proofs (steps 1–5).
      const validation = validateZswapOffer(blob, {
        refState: getBlankRefState(MIDNIGHT_NETWORK_ID),
        tblock: new Date(),
        maxBytes: OFFER_MAX_BYTES,
      });
      if (!validation.ok) {
        return reply
          .code(400)
          .send({ error: validation.code, reason: validation.reason });
      }

      // Liveness: never pay a Celestia fee for an offer whose coins are already
      // spent on chain (it can never settle). The spent_* sets are populated by
      // the node's midnight-* sync handlers.
      for (const nullifier of validation.nullifiers ?? []) {
        const spent = await isNullifierSpent.run({ nullifier }, dbConn);
        if (spent.length > 0) {
          return reply.code(400).send({
            error: "NULLIFIER_SPENT",
            reason: `nullifier already spent: ${nullifier}`,
          });
        }
      }
      for (const s of validation.unshieldedSpends ?? []) {
        const spent = await isUnshieldedSpent.run(
          { owner: s.owner, intent_hash: s.intentHash, output_no: s.outputNo },
          dbConn,
        );
        if (spent.length > 0) {
          return reply.code(400).send({
            error: "UTXO_SPENT",
            reason:
              `unshielded UTXO already spent: ${s.owner}/${s.intentHash}/${s.outputNo}`,
          });
        }
      }
      // Existence: the referenced unshielded UTXO must have been created.
      for (const s of validation.unshieldedSpends ?? []) {
        const created = await isUnshieldedCreated.run(
          { owner: s.owner, intent_hash: s.intentHash, output_no: s.outputNo },
          dbConn,
        );
        if (created.length === 0) {
          return reply.code(400).send({
            error: "UTXO_UNKNOWN",
            reason:
              `unshielded UTXO never created on chain: ${s.owner}/${s.intentHash}/${s.outputNo}`,
          });
        }
      }
      // Root-known: each shielded input must prove against a known recent root.
      for (const root of validation.inputRoots ?? []) {
        const known = await isKnownRoot.run({ root }, dbConn);
        if (known.length === 0) {
          return reply.code(400).send({
            error: "ROOT_UNKNOWN",
            reason: `input merkle root not a known recent chain root: ${root}`,
          });
        }
      }

      const result = await submitBlobViaBatcher(blob);
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
};
