import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  getIntentByOrderId,
  type IGetIntentByOrderIdResult,
  insertIntent,
  insertTransfer,
  getTransferToMatchIntent,
  type IGetTransferToMatchIntentResult,
  getIntentToMatchTransfer,
  getLatestOpenIntentByToken,
  getTransferById,
  getSomeUnusedTransfer,
  updateTransferUsed,
  updateIntentResolved,
  getBestQuoteForOrder,
} from "@night-bitcoin/database";
import { transferFunds } from "@night-bitcoin/contracts-bitcoin/transfer-funds";
import { transferFunds as transferFundsMidnight } from "@night-bitcoin/contracts-midnight/transfer-funds";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { MidnightBech32m } from "@midnightntwrk/wallet-sdk-address-format";
import { grammar } from "./grammar.ts";

// Convert a Midnight bech32m unshielded address (`mn_addr_*`) to its raw 32-byte
// payload as a lowercase hex string. This is the same format the state machine's
// contract event indexer stores in the `transfers.to_address` column (the new
// midnight-js representation hands us Bytes<N> fields as hex strings, and
// `decodeToByteString` returns them with any leading "0x" stripped).
const unshieldedBech32mToHex = (addr: string): string => {
  const parsed = MidnightBech32m.parse(addr);
  const bytes = Uint8Array.prototype.slice.call(parsed.data, 0, 32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const stm = new Stm<typeof grammar, {}>(grammar);

const CHAIN_IDS = {
  BITCOIN: "1",
  MIDNIGHT: "9999",
  EVM: "2",
};
const TOKENS = {
  BTC: "btc",
  M20: "m20",
};

// Decode hex string to raw bytes (Uint8Array). Tolerates a leading "0x".
const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
};

// Contract events arrive with Bytes<N> fields as either:
//   - hex string (`"6d6e5f73…"`)        — new midnight-js representation
//   - object-of-bytes (`{ "0": 0x6d… }`) — old representation
// decodeToByteString returns a *DB-safe identifier* for a field — it does
// NOT try to interpret bytes as utf-8 text. For raw 32-byte addresses this
// is what you want (treat them as opaque hex IDs). For fields that semantic
// utf-8 strings (bech32 addresses, JSON), use `decodeBytesUtf8` instead.
const decodeToByteString = (x: unknown): string => {
  if (typeof x === "string") return x.startsWith("0x") ? x.slice(2) : x;
  if (x && typeof x === "object") {
    const obj = x as { [key: string]: number };
    return Array(Object.keys(obj).length)
      .fill(0)
      .map((_, i) => obj[i])
      .join("")
      .trim();
  }
  return "";
};

// For utf-8 text stored in a Bytes<N> field (bech32 addresses, JSON
// payloads, etc.): decode the hex payload to bytes, strip the trailing
// NUL-padding Compact applies to fixed-width Bytes<N>, then utf-8 decode.
const decodeBytesUtf8 = (x: unknown): string => {
  if (typeof x !== "string") return "";
  const bytes = hexToBytes(x);
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
};

// Backwards-compat wrapper: in the new payload format, decodeToByteString
// returns the raw hex string and the utf-8 decode happens here. In the old
// payload format, the inner join produced a decimal-digit string that still
// needs the legacy 2/3-digit byte parser.
const decodePaddedString = (encodedString: string): string => {
  if (!encodedString) return "";
  // Hex chars only → new format; decode hex to utf-8 directly.
  if (/^[0-9a-fA-F]+$/.test(encodedString) && encodedString.length % 2 === 0) {
    return decodeBytesUtf8(encodedString);
  }
  // Decimal-only → old format; parse 2/3-digit bytes.
  if (!/^\d+$/.test(encodedString)) return encodedString;
  const bytes: number[] = [];
  let i = 0;
  while (i < encodedString.length) {
    const char = encodedString[i];
    if (char === "0") break;
    if (char === "1") {
      bytes.push(parseInt(encodedString.substring(i, i + 3), 10));
      i += 3;
    } else if (char >= "2" && char <= "9") {
      bytes.push(parseInt(encodedString.substring(i, i + 2), 10));
      i += 2;
    } else {
      break;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};

type CheckParamsType =
  | {
      type: "intent-received";
      orderId: string;
    }
  | {
      type: "transfer-received";
      id: number;
      amount: string;
      token: string;
    };

// Filler definitions matching start.dev.ts
const FILLER_DEFINITIONS = [
  { name: "Alpha Liquidity", port: 16101, walletIndex: 0 },
  { name: "Omega Swap", port: 16102, walletIndex: 1 },
  { name: "Quantum Pools", port: 16103, walletIndex: 2 },
];

// Helper to map filler names to ports
function getFillerPort(name: string): number {
  const filler = FILLER_DEFINITIONS.find((f) => f.name === name);
  // Default to first one if not found (fallback)
  return filler ? filler.port : 16101;
}

// Preload all filler wallets at module initialization.
// `import.meta.dirname` resolves to `packages/node/`. Wallets are generated by
// the contracts-* packages into their respective `generated/` directories.
const currentDir = import.meta.dirname!;
const walletBasePaths = {
  bitcoin: resolve(currentDir, "../contracts-bitcoin/generated"),
  midnight: resolve(currentDir, "../contracts-midnight/generated"),
};

type FillerWalletAddresses = {
  btc: string;
  midnight: string;            // shielded bech32m (legacy field, kept for compat)
  midnightUnshielded: string;  // unshielded bech32m (mn_addr_*) — used as M20 mint target
  midnightUnshieldedHex: string; // 32-byte hex of unshielded address — matches DB indexer format
};

const preloadedFillerWallets = new Map<string, FillerWalletAddresses>();

try {
  for (const filler of FILLER_DEFINITIONS) {
    try {
      const bitcoinWalletPath = `${walletBasePaths.bitcoin}/wallet-${filler.walletIndex}.json`;
      const midnightWalletPath = `${walletBasePaths.midnight}/wallet-${filler.walletIndex}.json`;

      const bitcoinWalletData = JSON.parse(readFileSync(bitcoinWalletPath, "utf8"));
      const midnightWalletData = JSON.parse(readFileSync(midnightWalletPath, "utf8"));

      // wallet-N.json schema: { seed, shieldedAddress, unshieldedAddress }.
      // The previous `.address` lookup was undefined — fix that here.
      const shielded: string = midnightWalletData.shieldedAddress ?? "";
      const unshielded: string = midnightWalletData.unshieldedAddress ?? "";
      const unshieldedHex = unshielded ? unshieldedBech32mToHex(unshielded) : "";

      preloadedFillerWallets.set(filler.name, {
        btc: bitcoinWalletData.derivedAddress,
        midnight: shielded,
        midnightUnshielded: unshielded,
        midnightUnshieldedHex: unshieldedHex,
      });

      console.log(
        `Preloaded wallets for filler: ${filler.name} (BTC: ${bitcoinWalletData.derivedAddress}, ` +
          `Midnight shielded: ${shielded}, unshielded: ${unshielded}, hex: ${unshieldedHex})`,
      );
    } catch (error) {
      console.error(`Failed to preload wallets for filler ${filler.name}:`, error);
    }
  }
} catch (error) {
  console.error("Error during wallet preloading:", error);
}

function getFillerWalletAddresses(fillerName: string): FillerWalletAddresses | null {
  return preloadedFillerWallets.get(fillerName) || null;
}

function* checkAndTransferFunds(params: CheckParamsType) {
  // If it was a payment, let's check if there is intent waiting.
  let intentData: IGetIntentByOrderIdResult | undefined;
  let paymentData: IGetTransferToMatchIntentResult | undefined;

  if (params.type === "intent-received") {
    const [intent] = yield* World.resolve(getIntentByOrderId, {
      order_id: params.orderId,
    });

    if (intent) {
      intentData = intent;
    } else {
      console.error("Critical error: No intent found", params);
      return;
    }

    // For M20 intents the payment arrives via the midnight-unshielded-spend
    // primitive (native unshielded UTXO move by the user, fee-sponsored by
    // the balancing batcher). The spend handler inserts a synthetic transfer
    // row matched to the filler's unshielded address (hex). Look it up here.
    // For BTC intents the payment is observed via the bitcoin-transaction
    // primitive deposited to SYSTEM_WALLET_BTC.
    const [quoteForLookup] = yield* World.resolve(getBestQuoteForOrder, {
      order_id: intent.order_id,
    });
    const fillerForLookup = quoteForLookup
      ? getFillerWalletAddresses(quoteForLookup.filler)
      : null;

    const SYSTEM_WALLET_BTC = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";

    let expectedToAddress: string;
    if (intent.max_spent_token === TOKENS.M20) {
      if (!fillerForLookup?.midnightUnshieldedHex) {
        console.error(
          "No filler unshielded address available for M20 intent matching",
          { orderId: intent.order_id, filler: quoteForLookup?.filler },
        );
        return;
      }
      expectedToAddress = fillerForLookup.midnightUnshieldedHex;
    } else {
      expectedToAddress = SYSTEM_WALLET_BTC;
    }

    const [payment] = yield* World.resolve(getTransferToMatchIntent, {
      to_address: expectedToAddress,
      amount: intent.max_spent_amount,
      token: intent.max_spent_token,
      chain_id: intent.max_spent_chain_id,
    });

    if (payment) {
      paymentData = payment;
    } else {
      console.error("No payment found", { ...params, expectedToAddress });
      return;
    }
  } else if (params.type === "transfer-received") {
    const [payment] = yield* World.resolve(getTransferById, {
      id: params.id,
    });
    if (payment) {
      paymentData = payment;
    } else {
      console.error("Critical error: No payment found", params);
      return;
    }

    // TODO This is missing the chain id check.
    const [intent] = yield* World.resolve(getIntentToMatchTransfer, {
      max_spent_amount: params.amount,
      max_spent_token: params.token,
    });

    if (intent) {
      intentData = intent;
    } else {
      console.error("No intent found", params);
      return;
    }
  }

  // These are just guards, we know they are defined.
  if (!intentData) return;
  if (!paymentData) return;

  const toChainId = intentData.min_received_chain_id;
  const fromChainId = intentData.max_spent_chain_id;

  const fromAddress = intentData.max_spent_recipient;
  const toAddress = intentData.min_received_recipient;

  const fromToken = intentData.max_spent_token;
  const toToken = intentData.min_received_token;

  const fromAmount = intentData.max_spent_amount;
  const toAmount = intentData.min_received_amount;

  // TODO This should be done by the fillers.
  const [quote] = yield* World.resolve(getBestQuoteForOrder, {
    order_id: intentData.order_id,
  });
  if (!quote) {
    console.error("Critical error: No quote found", intentData);
    return;
  }

  yield* World.resolve(updateTransferUsed, {
    id: paymentData.id,
  });

  yield* World.resolve(updateIntentResolved, {
    order_id: intentData.order_id,
    resolved_by: quote.filler,
  });

  // Run outside the State machine.
  setTimeout(async () => {
    // NOTIFY FILLER to Pay the user
    const fillerPort = getFillerPort(quote.filler);
    const fillerEndpoint = `http://localhost:${fillerPort}/api/notify-filler-intent-payment`;

    console.log(`Notifying filler ${quote.filler} (port ${fillerPort}) to pay user`, {
      toAddress,
      toAmount,
      toToken,
    });

    try {
      const response = await fetch(fillerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: intentData!.order_id,
          toAddress: toAddress,
          amount: parseFloat(toAmount), // Converting string to number as expected by schema
          token: toToken,
          chainId: toChainId,
        }),
      });
      const data = await response.json();
      console.log("Filler notified:", data);
    } catch (err) {
      console.error("Failed to notify filler:", err);
    }
  }, 0);

  // Run outside the State machine.
  setTimeout(() => {
    try {
      // Pay the filler
      // NOTE: This logic remains here as the Effectstream "System" paying the filler back.
      // For now we keep the simulation of "paying the filler back" using the system wallet.

      // Get preloaded wallet addresses for the filler
      const fillerWallets = getFillerWalletAddresses(quote.filler);

      if (!fillerWallets) {
        console.error(`No wallet addresses found for filler: ${quote.filler}`);
        return;
      }

      if (fromToken === TOKENS.BTC) {
        transferFunds("filler-wallet-btc", fillerWallets.btc, fromAmount);
      } else if (fromToken === TOKENS.M20) {
        transferFundsMidnight("filler-midnight-wallet", fillerWallets.midnight, fromAmount);
      } else {
        console.error("No valid transfer found (0x02)", {
          toChainId,
          fromChainId,
          fromToken,
          toToken,
          fromAddress,
          toAddress,
          fromAmount,
          toAmount,
        });
      }
    } catch (error) {
      console.error("Processing error", error);
    }
  }, 0);
}

stm.addStateTransition("bitcoin-transaction", function* (data) {
  console.log(
    "[BITCOIN] Wallet change:",
    JSON.stringify(data.parsedInput),
  );

  const toAddress: string = data.parsedInput.address;
  const amount: number = data.parsedInput.valueSats;

  yield* World.resolve(insertTransfer, {
    from_address: "",
    to_address: toAddress,
    amount,
    token: TOKENS.BTC,
    chain_id: CHAIN_IDS.BITCOIN,
  });

  const [payment] = yield* World.resolve(getSomeUnusedTransfer, {
    from_address: "",
    to_address: toAddress,
    amount: String(amount),
    token: TOKENS.BTC,
    chain_id: CHAIN_IDS.BITCOIN,
  });

  const SYSTEM_WALLET_BTC = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";

  if (toAddress === SYSTEM_WALLET_BTC) {
    if (!payment) {
      console.error("Could not retrieve inserted bitcoin transfer", { toAddress, amount });
      return;
    }
    yield* checkAndTransferFunds({
      type: "transfer-received",
      id: payment.id,
      amount: String(amount),
      token: TOKENS.BTC,
    });
  } else {
    console.error("Transfer is not for system wallet", {
      toAddress,
      token: TOKENS.BTC,
      amount: String(amount),
    });
  }
});

stm.addStateTransition("midnightContractStateERC20", function* (data) {
  console.log(
    "[MIDNIGHT] Transaction receipt (erc20):",
    JSON.stringify(data.parsedInput.payload),
  );

  const payload: any = data.parsedInput.payload;

  if (payload.actionName === "1001") {
    const targetWallet = decodeToByteString(payload.actionTarget.left.bytes);
    const initiatorWallet = "0";

    // Mint action — issuing the user their initial M20 supply.
    // Payment matching for swaps is handled by the midnight-unshielded-spend
    // transition below, fired when the user actually spends M20 to the filler.
    console.log("[MIDNIGHT] Mint action", { targetWallet, amount: payload.actionValue });
    yield* World.resolve(insertTransfer, {
      from_address: initiatorWallet,
      to_address: targetWallet,
      amount: parseInt(payload.actionValue, 10),
      token: TOKENS.M20,
      chain_id: CHAIN_IDS.MIDNIGHT,
    });
  }

  if (payload.actionName === "1002") {
    // Transfer action
    const targetWallet = decodeToByteString(payload.actionTarget.left.bytes);
    const initiatorWallet = decodeToByteString(payload.actionInitiator.left.bytes);
    const amountTransferred: string = payload.actionValue;
    console.log("[MIDNIGHT] Transfer action", {
      initiatorWallet,
      targetWallet,
      amountTransferred,
    });

    const SYSTEM_WALLET_MIDNIGHT =
      "220166137110127226240106199190331042231369820222674119411322414010010938131779810395";

    yield* World.resolve(insertTransfer, {
      from_address: initiatorWallet,
      to_address: targetWallet,
      amount: parseInt(amountTransferred, 10),
      token: TOKENS.M20,
      chain_id: CHAIN_IDS.MIDNIGHT,
    });

    const [payment] = yield* World.resolve(getSomeUnusedTransfer, {
      from_address: initiatorWallet,
      to_address: targetWallet,
      amount: amountTransferred,
      token: TOKENS.M20,
      chain_id: CHAIN_IDS.MIDNIGHT,
    });

    if (targetWallet === SYSTEM_WALLET_MIDNIGHT) {
      if (!payment) {
        console.error("Could not retrieve inserted midnight transfer", {
          targetWallet,
          amountTransferred,
        });
        return;
      }
      // TODO Check target wallet is validator wallet
      yield* checkAndTransferFunds({
        type: "transfer-received",
        id: payment.id,
        amount: amountTransferred,
        token: TOKENS.M20,
      });
    } else {
      console.error("Transfer is not for system wallet", {
        targetWallet,
        token: TOKENS.M20,
        amount: String(amountTransferred),
      });
    }
  }
});

stm.addStateTransition("midnightContractStateERC7683", function* (data) {
  console.log(
    "[MIDNIGHT] Transaction receipt (erc7683):",
    JSON.stringify(data.parsedInput.payload),
  );

  const payload: any = data.parsedInput.payload;

  let originData = {
    targetWallet: "",
    status: "",
  };

  try {
    originData = JSON.parse(
      decodePaddedString(decodeToByteString(payload.lastIntentEvent.originData)),
    );
    originData.status = "ok";
  } catch (error) {
    console.error(
      "Malformed origin data:",
      error,
      payload.lastIntentEvent.originData,
    );
    return;
  }

  const parsedPayload = {
    lastIntentType: payload.lastIntentType,
    lastIntentEvent: {
      // `user` is a bech32 address ("mn_shield-addr_…") stored as utf-8
      // bytes — same shape as the other recipient/token fields below.
      user: decodePaddedString(decodeToByteString(payload.lastIntentEvent.user)),
      orderId: decodePaddedString(decodeToByteString(payload.lastIntentOrderId)),

      originChainId: payload.lastIntentEvent.originChainId,
      destinationChainId: payload.lastIntentEvent.destinationChainId,

      openDeadline: payload.lastIntentEvent.openDeadline,
      fillDeadline: payload.lastIntentEvent.fillDeadline,

      maxSpent_token: decodePaddedString(
        decodeToByteString(payload.lastIntentEvent.maxSpent_token),
      ),
      maxSpent_amount: payload.lastIntentEvent.maxSpent_amount,
      maxSpent_recipient: decodePaddedString(
        decodeToByteString(payload.lastIntentEvent.maxSpent_recipient),
      ),
      maxSpent_chainId: payload.lastIntentEvent.maxSpent_chainId,

      minReceived_token: decodePaddedString(
        decodeToByteString(payload.lastIntentEvent.minReceived_token),
      ),
      minReceived_amount: payload.lastIntentEvent.minReceived_amount,
      minReceived_recipient: decodePaddedString(
        decodeToByteString(payload.lastIntentEvent.minReceived_recipient),
      ),
      minReceived_chainId: payload.lastIntentEvent.minReceived_chainId,

      destinationSettler: decodeToByteString(payload.lastIntentEvent.destinationSettler),
      originData: JSON.stringify(originData),
      status: payload.lastIntentEvent.status,
    },
  };
  console.log(
    "[MIDNIGHT] Transaction receipt parsed:",
    JSON.stringify(parsedPayload),
  );

  yield* World.resolve(insertIntent, {
    order_id: parsedPayload.lastIntentEvent.orderId as string,
    user_address: parsedPayload.lastIntentEvent.user as string,
    origin_chain_id: parsedPayload.lastIntentEvent.originChainId as string,
    open_deadline: parsedPayload.lastIntentEvent.openDeadline as string,
    fill_deadline: parsedPayload.lastIntentEvent.fillDeadline as string,
    max_spent_token: parsedPayload.lastIntentEvent.maxSpent_token as string,
    max_spent_amount: parsedPayload.lastIntentEvent.maxSpent_amount as string,
    max_spent_recipient: parsedPayload.lastIntentEvent.maxSpent_recipient as string,
    max_spent_chain_id: parsedPayload.lastIntentEvent.maxSpent_chainId as string,
    min_received_token: parsedPayload.lastIntentEvent.minReceived_token as string,
    min_received_amount: parsedPayload.lastIntentEvent.minReceived_amount as string,
    min_received_recipient: parsedPayload.lastIntentEvent.minReceived_recipient as string,
    min_received_chain_id: parsedPayload.lastIntentEvent.minReceived_chainId as string,
    destination_chain_id: parsedPayload.lastIntentEvent.destinationChainId as string,
    destination_settler: parsedPayload.lastIntentEvent.destinationSettler as string,
    origin_data: parsedPayload.lastIntentEvent.originData,
    status: parsedPayload.lastIntentEvent.status as string,
  });

  yield* checkAndTransferFunds({
    type: "intent-received",
    orderId: parsedPayload.lastIntentEvent.orderId as string,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Native unshielded UTXO spend on Midnight (PrimitiveTypeMidnightUnshieldedSpend)
//
// Fires once per UTXO that gets spent on Midnight's unshielded ledger.
// Payload (after primitive normalization): { owner, intentHash, outputIndex, txHash }.
//
// In the M20 → BTC swap flow, this fires when the frontend's m20_transferFrom
// (via the balancing batcher) consumes the user's M20 UTXO and lands a new
// M20 output at the filler's unshielded address. The spend event does NOT
// carry amount or recipient info — those live in the tx outputs which the
// indexer doesn't expose here. So we use the spend as a signal that:
//
//   "user `owner` just spent at least one unshielded UTXO; if they have an
//   open M20 intent matched to one of our known fillers, treat this spend
//   as the payment for that intent."
//
// We synthesize a `transfers` row matched to the filler's hex address +
// intent.max_spent_amount, so the existing intent-matching pipeline (which
// queries getTransferToMatchIntent by to_address+amount+token) picks it up.
// ─────────────────────────────────────────────────────────────────────────────
stm.addStateTransition("midnight-unshielded-spend", function* (data) {
  const payload: any = (data.parsedInput as any).payload;
  const ownerRaw: unknown = payload?.owner;

  // Normalize owner to 32-byte hex (the indexer can hand us bech32m, raw
  // bytes, or hex depending on which code path).
  let owner: string;
  if (ownerRaw instanceof Uint8Array) {
    owner = Array.from(ownerRaw)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } else if (typeof ownerRaw === "string") {
    if (ownerRaw.startsWith("mn_")) {
      try {
        owner = unshieldedBech32mToHex(ownerRaw);
      } catch {
        owner = ownerRaw.toLowerCase();
      }
    } else {
      owner = ownerRaw.toLowerCase().replace(/^0x/, "");
    }
  } else {
    console.warn("[MIDNIGHT] Unshielded-spend: unrecognized owner type", payload);
    return;
  }

  console.log("[MIDNIGHT] Unshielded UTXO spent", {
    owner,
    intentHash: payload?.intentHash,
    outputIndex: payload?.outputIndex,
    txHash: payload?.txHash,
  });

  // Pick the most recent open M20 intent. The spend event doesn't carry
  // amount or recipient info (the indexer's unshieldedSpentOutputs field
  // only exposes spend identifiers, not output details), so we assume:
  //   - There is at most one outstanding M20 intent at a time per app instance
  //   - The spend's amount matches that intent's max_spent_amount
  // This is sufficient for the demo flow and can be tightened later (e.g.
  // by storing the user's unshielded address in originData and matching by
  // that, or by re-fetching the tx's outputs from the indexer for verification).
  const [intent] = yield* World.resolve(getLatestOpenIntentByToken, {
    max_spent_token: TOKENS.M20,
  });
  if (!intent) {
    console.log("[MIDNIGHT] Unshielded-spend: no open M20 intent to match", { owner });
    return;
  }

  const [quote] = yield* World.resolve(getBestQuoteForOrder, {
    order_id: intent.order_id,
  });
  const filler = quote ? getFillerWalletAddresses(quote.filler) : null;
  if (!filler?.midnightUnshieldedHex) {
    console.warn("[MIDNIGHT] Unshielded-spend: no filler hex for matched intent", {
      orderId: intent.order_id,
      filler: quote?.filler,
    });
    return;
  }

  // Insert a synthetic transfer row pointing at the filler's address with
  // the intent's expected amount. The existing intent-received handler will
  // find it via getTransferToMatchIntent on next intent processing, and the
  // transfer-received path we trigger below also matches it via getSomeUnusedTransfer.
  yield* World.resolve(insertTransfer, {
    from_address: owner,
    to_address: filler.midnightUnshieldedHex,
    amount: parseInt(String(intent.max_spent_amount), 10),
    token: TOKENS.M20,
    chain_id: CHAIN_IDS.MIDNIGHT,
  });

  const [insertedPayment] = yield* World.resolve(getSomeUnusedTransfer, {
    from_address: owner,
    to_address: filler.midnightUnshieldedHex,
    amount: String(intent.max_spent_amount),
    token: TOKENS.M20,
    chain_id: CHAIN_IDS.MIDNIGHT,
  });
  if (!insertedPayment) {
    console.error("[MIDNIGHT] Unshielded-spend: failed to retrieve inserted transfer", {
      owner,
      to_address: filler.midnightUnshieldedHex,
    });
    return;
  }

  yield* checkAndTransferFunds({
    type: "transfer-received",
    id: insertedPayment.id,
    amount: String(intent.max_spent_amount),
    token: TOKENS.M20,
  });
});

/**
 * Routes between different State Transition Functions based on block height.
 * Allows the node to maintain backwards compatibility with old history when
 * new logic is introduced.
 */
export const appStateTransitions: StartConfigAppStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
