// Midnight transaction policy — shared introspection helpers + declarative rules.
//
// A multi-product ("multi-tenant") balancing batcher authorizes work by CONTENT:
// the operator declares, per product/target, which transactions are valid.
// There are no tokens or client-side changes — the batcher inspects the
// submitted transaction itself.
//
// This module is exported from the SDK (`@effectstream/batcher-sdk/midnight-policy`)
// so that custom filters (`policy.allowCustomFinalFilter`) are written against
// the SAME helpers the declarative rules are implemented with.
//
// Evaluation order enforced by MidnightBalancingAdapter:
//   size cap → deserialize → declarative rules → allowCustomFinalFilter (final)
//
// Every helper is defensive: the ledger getters are WASM-backed and can throw
// on unusual transaction shapes. Introspection failures surface as `null`/throw
// and the policy evaluator fails CLOSED (reject), never open.

import type { DefaultBatcherInput } from "../core/types.ts";
import type { ValidationResult } from "./adapter.ts";

// ---------------------------------------------------------------------------
// Structural transaction type
// ---------------------------------------------------------------------------

/**
 * The subset of the ledger `Transaction` surface policies inspect. Structural
 * so the same code works for all three delegated stages (unproven / unbound /
 * finalized) and so tests can supply fixtures without WASM.
 */
export interface PolicyInspectableTx {
  intents?: Map<number, PolicyIntent> | undefined;
  guaranteedOffer?: PolicyZswapOffer | undefined;
  fallibleOffer?: Map<number, PolicyZswapOffer> | undefined;
}

export interface PolicyIntent {
  /** ContractCall | ContractDeploy | MaintenanceUpdate */
  actions?: PolicyContractAction[];
  guaranteedUnshieldedOffer?: PolicyUnshieldedOffer | undefined;
  fallibleUnshieldedOffer?: PolicyUnshieldedOffer | undefined;
  /**
   * Expiry. TTL lives HERE, not on the transaction — which is why a pure
   * shielded transfer (zero intents) has no TTL and cannot expire. Arrives as
   * a Date, epoch ms or bigint depending on the delegated stage.
   */
  ttl?: Date | number | bigint | undefined;
}

export interface PolicyContractAction {
  address?: unknown;
  /** Present only on ContractCall — absent on deploys/maintenance updates. */
  entryPoint?: Uint8Array | string;
}

export interface PolicyZswapOffer {
  /** input coin values − output coin values, per token type */
  deltas?: Map<string, bigint>;
  inputs?: unknown[];
  outputs?: unknown[];
  transients?: unknown[];
}

export interface PolicyUnshieldedOffer {
  inputs?: { type?: unknown; value?: bigint }[];
  outputs?: { type?: unknown; value?: bigint }[];
}

// ---------------------------------------------------------------------------
// Policy types
// ---------------------------------------------------------------------------

export interface ContractCallRef {
  /** Contract address, normalized (lowercase hex, no 0x). */
  contract: string;
  /** Circuit / entry point name, normalized to a UTF-8 string. */
  entryPoint: string;
}

export interface PolicyVerdict {
  valid: boolean;
  /** Name of the rule that decided the verdict (for logs + error messages). */
  rule?: string;
  /** Human-readable reason when invalid. */
  reason?: string;
}

export interface CustomFilterContext<TTx = PolicyInspectableTx> {
  tx: TTx;
  txStage: "unproven" | "unbound" | "finalized";
  input: DefaultBatcherInput;
  /** Verdict of the declarative rules, which always run first. */
  declarativeVerdict: PolicyVerdict;
}

export type CustomFinalFilter<TTx = PolicyInspectableTx> = (
  ctx: CustomFilterContext<TTx>,
) => boolean | ValidationResult | Promise<boolean | ValidationResult>;

export interface MidnightTxPolicy<TTx = PolicyInspectableTx> {
  /** Allow transfer-shaped transactions: no contract actions, at least one offer. */
  allowZswapTransfers?: boolean;
  /** Tighten the transfer rule to these token types (normalized hex). */
  allowedTokenTypes?: string[];
  /**
   * Allow any circuit CALL on these contract addresses.
   *
   * Calls only — deploys and maintenance updates on an allowlisted contract are
   * refused, because a maintenance update can rotate verifier keys and the
   * maintenance authority.
   */
  allowedContracts?: string[];
  /**
   * Allow only these (contract, entryPoint) pairs. An entry with an empty
   * `entryPoint` is ignored — it would otherwise match the empty entry point
   * that deploys and maintenance updates report.
   */
  allowedCircuits?: ContractCallRef[];
  /**
   * Custom FINAL filter. Runs strictly AFTER the declarative rules and receives
   * their verdict; its return value is the final decision (it can tighten OR
   * override). Throwing rejects the input (fail closed).
   *
   * MUST be deterministic and side-effect free: it runs at intake AND again
   * pre-spend (storage rows are untrusted, and policy may change across a
   * restart).
   */
  allowCustomFinalFilter?: CustomFinalFilter<TTx>;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const textDecoder = new TextDecoder();

/** Lowercase hex without a 0x prefix; non-strings are stringified first. */
export function normalizeHex(value: unknown): string {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const trimmed = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  return trimmed.toLowerCase();
}

/** Entry points come back as UTF-8 bytes or as a string depending on stage. */
export function normalizeEntryPoint(value: Uint8Array | string | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return textDecoder.decode(value).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

function intentList(tx: PolicyInspectableTx): PolicyIntent[] {
  const intents = tx.intents;
  if (!intents) return [];
  // Map-like (WASM) or a plain iterable of entries.
  if (typeof (intents as Map<number, PolicyIntent>).values === "function") {
    return [...(intents as Map<number, PolicyIntent>).values()];
  }
  return [];
}

function zswapOfferList(tx: PolicyInspectableTx): PolicyZswapOffer[] {
  const offers: PolicyZswapOffer[] = [];
  if (tx.guaranteedOffer) offers.push(tx.guaranteedOffer);
  const fallible = tx.fallibleOffer;
  if (fallible && typeof fallible.values === "function") {
    for (const offer of fallible.values()) {
      if (offer) offers.push(offer);
    }
  }
  return offers;
}

/**
 * Every contract ACTION in the transaction: calls, deploys and maintenance
 * updates. Deploys/maintenance updates have no entry point and are reported
 * with `entryPoint: ""` so allowlist rules reject them unless explicitly
 * permitted by a custom filter.
 */
export function contractActions(tx: PolicyInspectableTx): ContractCallRef[] {
  const result: ContractCallRef[] = [];
  for (const intent of intentList(tx)) {
    for (const action of intent.actions ?? []) {
      result.push({
        contract: normalizeHex(action?.address),
        entryPoint: normalizeEntryPoint(action?.entryPoint),
      });
    }
  }
  return result;
}

/** Contract CALLS only (actions carrying an entry point). */
export function contractCalls(tx: PolicyInspectableTx): ContractCallRef[] {
  return contractActions(tx).filter((a) => a.entryPoint !== "");
}

export function hasContractActions(tx: PolicyInspectableTx): boolean {
  return contractActions(tx).length > 0;
}

/**
 * True when the transaction carries no contract actions and at least one
 * transfer offer (shielded zswap or unshielded) — i.e. a pure transfer/swap.
 */
export function isZswapOnly(tx: PolicyInspectableTx): boolean {
  if (hasContractActions(tx)) return false;
  if (zswapOfferList(tx).length > 0) return true;
  return unshieldedOfferList(tx).length > 0;
}

function unshieldedOfferList(tx: PolicyInspectableTx): PolicyUnshieldedOffer[] {
  const offers: PolicyUnshieldedOffer[] = [];
  for (const intent of intentList(tx)) {
    if (intent.guaranteedUnshieldedOffer) offers.push(intent.guaranteedUnshieldedOffer);
    if (intent.fallibleUnshieldedOffer) offers.push(intent.fallibleUnshieldedOffer);
  }
  return offers;
}

/**
 * Every zswap NULLIFIER the transaction spends, lowercase hex.
 *
 * A nullifier is the public, unlinkable tag a shielded spend publishes. It
 * reveals nothing about the coin, but it is unique to it — so the ledger (and
 * the indexer mirroring it) can answer one question: has this coin already
 * been spent? A nullifier already recorded on chain means the input is gone
 * and the transaction can never apply.
 *
 * That makes it the one pre-flight check a SPONSOR can afford to care about:
 * amounts are hidden, but "these inputs are already spent" is knowable, and a
 * doomed transaction still costs the sponsor proving time and dust to
 * discover. Custom filters may be async, so the lookup fits directly:
 *
 * ```ts
 * allowCustomFinalFilter: async ({ tx }) => {
 *   const spent = await indexerSpentNullifiers(zswapNullifiers(tx));
 *   return spent.length === 0 ||
 *     { valid: false, error: `input already spent (${spent[0].slice(0, 12)}…)` };
 * }
 * ```
 *
 * Safe to run at intake AND again pre-spend even though it reads chain state:
 * "spent" is monotone, so the recheck can only ever get stricter — it never
 * flips a rejected input back to accepted.
 */
export function zswapNullifiers(tx: PolicyInspectableTx): string[] {
  const seen = new Set<string>();
  for (const offer of zswapOfferList(tx)) {
    for (const source of [offer.inputs, offer.transients]) {
      for (const entry of source ?? []) {
        const raw = (entry as { nullifier?: unknown } | undefined)?.nullifier;
        if (raw === undefined || raw === null) continue;
        const hex = normalizeHex(
          raw instanceof Uint8Array
            ? Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("")
            : String(raw),
        );
        if (hex) seen.add(hex);
      }
    }
  }
  return [...seen];
}

/**
 * Net SHIELDED token deltas across every zswap offer (inputs − outputs), with
 * zero entries removed. Dust fees are NOT included: they live in the intents'
 * dust actions, not in zswap offers — so a swap's deltas stay clean even after
 * the batcher balances fees.
 *
 * A matched swap of X tokenA for X tokenB yields exactly two entries with
 * equal magnitude and opposite sign.
 */
export function zswapTokenDeltas(tx: PolicyInspectableTx): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const offer of zswapOfferList(tx)) {
    const deltas = offer.deltas;
    if (!deltas || typeof deltas.entries !== "function") continue;
    for (const [token, value] of deltas.entries()) {
      const key = normalizeHex(token);
      totals.set(key, (totals.get(key) ?? 0n) + BigInt(value ?? 0n));
    }
  }
  for (const [token, value] of [...totals.entries()]) {
    if (value === 0n) totals.delete(token);
  }
  return totals;
}

/** Net UNSHIELDED token deltas (inputs − outputs), zero entries removed. */
export function unshieldedTokenDeltas(tx: PolicyInspectableTx): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const offer of unshieldedOfferList(tx)) {
    for (const input of offer.inputs ?? []) {
      const key = normalizeHex(input?.type);
      totals.set(key, (totals.get(key) ?? 0n) + BigInt(input?.value ?? 0n));
    }
    for (const output of offer.outputs ?? []) {
      const key = normalizeHex(output?.type);
      totals.set(key, (totals.get(key) ?? 0n) - BigInt(output?.value ?? 0n));
    }
  }
  for (const [token, value] of [...totals.entries()]) {
    if (value === 0n) totals.delete(token);
  }
  return totals;
}

/**
 * Structural shape of the shielded (zswap) side: how many inputs, outputs and
 * transients the transaction carries.
 *
 * This is the ONLY value-independent signal available for a balanced shielded
 * transfer: amounts are hidden by design, and a transfer that neither creates
 * nor destroys value reports NO token deltas at all. Structure is therefore
 * what a policy can bound — e.g. "sponsor simple two-party payments, not
 * 50-output fan-outs".
 */
export function zswapOfferShape(
  tx: PolicyInspectableTx,
): { inputs: number; outputs: number; transients: number } {
  let inputs = 0, outputs = 0, transients = 0;
  for (const offer of zswapOfferList(tx)) {
    inputs += offer.inputs?.length ?? 0;
    outputs += offer.outputs?.length ?? 0;
    transients += offer.transients?.length ?? 0;
  }
  return { inputs, outputs, transients };
}

/** Every token type touched by the transaction (shielded + unshielded). */
export function tokenTypesUsed(tx: PolicyInspectableTx): Set<string> {
  const types = new Set<string>();
  for (const offer of zswapOfferList(tx)) {
    const deltas = offer.deltas;
    if (!deltas || typeof deltas.entries !== "function") continue;
    for (const [token] of deltas.entries()) types.add(normalizeHex(token));
  }
  for (const offer of unshieldedOfferList(tx)) {
    for (const io of [...(offer.inputs ?? []), ...(offer.outputs ?? [])]) {
      types.add(normalizeHex(io?.type));
    }
  }
  return types;
}

/**
 * True when the transaction has at least one contract action and EVERY action
 * is a CALL on an allowlisted contract.
 *
 * Deploys and maintenance updates are contract actions too, and they report an
 * empty entry point — so an earlier version, which matched on address alone,
 * authorized them. A maintenance update can rotate a contract's verifier keys
 * and its maintenance authority; sponsoring one is nothing like sponsoring "any
 * circuit on this contract". They are refused here and need their own explicit
 * option if they are ever to be supported.
 */
export function callsOnlyContracts(tx: PolicyInspectableTx, allowlist: string[]): boolean {
  const allowed = new Set(allowlist.map(normalizeHex));
  const actions = contractActions(tx);
  if (actions.length === 0) return false;
  // EVERY action must be a CALL and target an allowlisted contract.
  //
  // Deploys and maintenance updates are contract actions carrying the
  // contract's address, and they report an empty entry point. Matching on
  // address alone therefore authorized them — and a maintenance update can
  // rotate a contract's verifier keys and its maintenance authority, which is
  // categorically not "any circuit on this contract". If deploys or
  // maintenance are ever to be sponsored, they need their own explicit option.
  return actions.every((a) => a.entryPoint !== "" && allowed.has(a.contract));
}

/**
 * True when the transaction has at least one contract action and EVERY action
 * is an allowlisted (contract, entryPoint) pair. Entry-point matching is exact
 * (case-sensitive) — a deploy (no entry point) never matches.
 */
export function callsOnlyCircuits(
  tx: PolicyInspectableTx,
  allowlist: ContractCallRef[],
): boolean {
  // An allowlist entry with an empty entry point is dropped rather than
  // honoured: it would otherwise match the empty entry point that deploys and
  // maintenance updates report, quietly authorizing them. Same reasoning as
  // callsOnlyContracts — those need their own explicit option.
  const allowed = new Set(
    allowlist
      .filter((c) => c.entryPoint !== "")
      .map((c) => `${normalizeHex(c.contract)}#${c.entryPoint}`),
  );
  const actions = contractActions(tx);
  if (actions.length === 0) return false;
  return actions.every((a) =>
    a.entryPoint !== "" && allowed.has(`${a.contract}#${a.entryPoint}`)
  );
}

/** True when every token type the transaction touches is allowlisted. */
/**
 * True when the transaction moves shielded coins whose token types the policy
 * layer CANNOT see.
 *
 * Shielded token types are only ever visible through `ZswapOffer.deltas`, and
 * deltas are NET SUMS — the offer's imbalance per token. They reveal that
 * *some* types moved; they cannot enumerate every type the coins span, because
 * any token that balances within the offer nets to zero and never appears.
 *
 * So the presence of coins, not the emptiness of the delta map, is what makes
 * the type set unknowable. A balanced transfer shows no deltas at all. An
 * unbalanced swap shows two — and may still be carrying a third token that
 * cancels inside it. Both are equally unenumerable; only the second *looks*
 * otherwise, which is what made an earlier version of this guard exploitable:
 * it accepted any offer that had at least one visible delta.
 *
 * Any offer carrying shielded coins therefore has an unobservable type set.
 * Unshielded offers carry their types directly and stay enforceable, so
 * `allowedTokenTypes` remains meaningful there and only there.
 */
export function hasUnobservableShieldedTokens(tx: PolicyInspectableTx): boolean {
  for (const offer of zswapOfferList(tx)) {
    const coins = (offer.inputs?.length ?? 0) + (offer.outputs?.length ?? 0) +
      (offer.transients?.length ?? 0);
    if (coins > 0) return true;
  }
  return false;
}

export function usesOnlyTokenTypes(tx: PolicyInspectableTx, allowlist: string[]): boolean {
  const allowed = new Set(allowlist.map(normalizeHex));
  for (const token of tokenTypesUsed(tx)) {
    if (!allowed.has(token)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Declarative rule evaluation
// ---------------------------------------------------------------------------

/** True when the policy declares no rules at all (allow-all, back-compat). */
export function isEmptyPolicy(policy: MidnightTxPolicy<never> | undefined): boolean {
  if (!policy) return true;
  return (
    !policy.allowZswapTransfers &&
    (policy.allowedContracts?.length ?? 0) === 0 &&
    (policy.allowedCircuits?.length ?? 0) === 0
  );
}

/**
 * True when the policy can reject anything at all — a declarative rule OR a
 * custom final filter.
 *
 * Deliberately distinct from `isEmptyPolicy`, which asks only about the
 * DECLARATIVE half: a filter-only policy is declaratively empty *by design*, so
 * that `evaluateDeclarativePolicy` hands the filter an `allow-all` verdict it
 * can then override. Use `isEmptyPolicy` to decide what the declarative rules
 * say; use this to decide whether a policy needs enforcing at all. Guarding an
 * enforcement point with `isEmptyPolicy` skips filter-only policies.
 */
export function isPolicyEnforced(policy: MidnightTxPolicy<never> | undefined): boolean {
  if (!policy) return false;
  return !isEmptyPolicy(policy) || typeof policy.allowCustomFinalFilter === "function";
}

/**
 * Evaluate the declarative rules. Rules are a UNION: a transaction is valid
 * when it satisfies at least one enabled rule (and the token-type tightening,
 * where applicable).
 *
 * Fails CLOSED: if introspection throws, the verdict is invalid.
 */
export function evaluateDeclarativePolicy(
  tx: PolicyInspectableTx,
  policy: MidnightTxPolicy<never> | undefined,
): PolicyVerdict {
  // No declarative rules configured: allow-all (a custom filter may still reject).
  if (isEmptyPolicy(policy)) return { valid: true, rule: "allow-all" };
  const p = policy!;

  try {
    if (p.allowZswapTransfers && isZswapOnly(tx)) {
      if (p.allowedTokenTypes?.length) {
        // Fail closed when the types cannot be seen at all. A balanced shielded
        // transfer reports NO deltas, so `tokenTypesUsed` is empty and the
        // allowlist below would pass it whatever token it actually moves.
        if (hasUnobservableShieldedTokens(tx)) {
          return {
            valid: false,
            rule: "allowedTokenTypes",
            reason:
              "this transaction carries shielded coins, whose token types are " +
              "not enumerable (deltas report only an offer's net imbalance, so " +
              "any token balancing inside it is invisible) — the allowlist " +
              "cannot be enforced. allowedTokenTypes constrains UNSHIELDED " +
              "offers only. Restrict this product to allowlisted contracts or " +
              "circuits, or drop allowedTokenTypes and accept any shielded token.",
          };
        }
        if (!usesOnlyTokenTypes(tx, p.allowedTokenTypes)) {
          return {
            valid: false,
            rule: "allowedTokenTypes",
            reason: `transfer touches a token type outside the allowlist (used: ${
              [...tokenTypesUsed(tx)].join(", ") || "none"
            })`,
          };
        }
      }
      return { valid: true, rule: "allowZswapTransfers" };
    }

    if (p.allowedContracts?.length && callsOnlyContracts(tx, p.allowedContracts)) {
      return { valid: true, rule: "allowedContracts" };
    }

    if (p.allowedCircuits?.length && callsOnlyCircuits(tx, p.allowedCircuits)) {
      return { valid: true, rule: "allowedCircuits" };
    }

    // Nothing matched — explain why in terms the submitter can act on.
    const actions = contractActions(tx);
    const detail = actions.length > 0
      ? `contract actions [${
        actions.map((a) => `${a.contract.slice(0, 12)}…#${a.entryPoint || "<deploy>"}`).join(", ")
      }] not allowlisted`
      : isZswapOnly(tx)
      ? "transfer-shaped transaction, but allowZswapTransfers is not enabled"
      : "transaction matches no configured rule (no offers and no contract actions?)";
    return { valid: false, rule: "no-rule-matched", reason: detail };
  } catch (error) {
    return {
      valid: false,
      rule: "introspection-failed",
      reason: `could not inspect transaction: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Full evaluation: declarative rules, then the custom final filter (if any).
 * The custom filter's verdict is final. Any throw inside it rejects.
 */
export async function evaluatePolicy<TTx extends PolicyInspectableTx>(
  ctx: {
    tx: TTx;
    txStage: "unproven" | "unbound" | "finalized";
    input: DefaultBatcherInput;
  },
  policy: MidnightTxPolicy<TTx> | undefined,
): Promise<PolicyVerdict> {
  const declarativeVerdict = evaluateDeclarativePolicy(
    ctx.tx,
    policy as MidnightTxPolicy<never> | undefined,
  );
  const custom = policy?.allowCustomFinalFilter;
  if (!custom) return declarativeVerdict;

  try {
    const outcome = await custom({ ...ctx, declarativeVerdict });
    if (typeof outcome === "boolean") {
      return outcome
        ? { valid: true, rule: "allowCustomFinalFilter" }
        : {
          valid: false,
          rule: "allowCustomFinalFilter",
          reason: "rejected by custom filter",
        };
    }
    return {
      valid: outcome.valid,
      rule: "allowCustomFinalFilter",
      reason: outcome.valid ? undefined : (outcome.error ?? "rejected by custom filter"),
    };
  } catch (error) {
    // Fail closed.
    return {
      valid: false,
      rule: "allowCustomFinalFilter",
      reason: `custom filter threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Convenience matcher for swap-shaped transfers: exactly two shielded token
 * deltas of equal magnitude and opposite sign (+X tokenA / −X tokenB).
 * Useful inside custom filters.
 */
export function isMatchedDeltaSwap(
  tx: PolicyInspectableTx,
  opts?: { tokens?: [string, string] },
): boolean {
  const deltas = zswapTokenDeltas(tx);
  if (deltas.size !== 2) return false;
  const [[tokenA, deltaA], [tokenB, deltaB]] = [...deltas.entries()];
  if (deltaA !== -deltaB) return false;
  if (deltaA === 0n) return false;
  if (opts?.tokens) {
    const wanted = new Set(opts.tokens.map(normalizeHex));
    if (!wanted.has(tokenA) || !wanted.has(tokenB)) return false;
  }
  return true;
}
