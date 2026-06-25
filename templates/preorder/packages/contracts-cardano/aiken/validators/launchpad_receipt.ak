use aiken/collection/dict
use aiken/collection/list
use aiken/interval.{Finite}
use cardano/address.{Script, VerificationKey}
use cardano/assets.{PolicyId, lovelace_of, tokens}
use cardano/transaction.{Output, Transaction}

/// Purchase intent. NOTE: this is the REDEEMER (validators cannot read metadata),
/// so the data the policy enforces must live here.
pub type PurchaseRedeemer {
  buyer: ByteArray,
  // verification-key hash of the buyer (28 bytes)
  referrer: ByteArray,
  // verification-key hash of the referrer (28 bytes), or #"" for no referrer.
  // Mirrors the EVM launchpad's `referrer` arg.
  claimed_lovelace: Int,
}

// payment_credential_hash : payment part of the launchpad CARDANO_PAYMENT_ADDRESS
// referrer_reward_bps     : referrer reward in basis points (matches the EVM `referrerRewardBps`)
// sale_start / sale_end    : POSIX milliseconds bounding the sale window
validator launchpad_receipt(
  payment_credential_hash: ByteArray,
  referrer_reward_bps: Int,
  sale_start: Int,
  sale_end: Int,
) {
  mint(redeemer: PurchaseRedeemer, policy_id: PolicyId, self: Transaction) {
    let Transaction { outputs, mint, extra_signatories, validity_range, .. } =
      self

    // (1) buyer authorized the transaction
    let buyer_signed = list.has(extra_signatories, redeemer.buyer)

    // (2) tx validity range fully inside [sale_start, sale_end]
    let within_window =
      when (
        validity_range.lower_bound.bound_type,
        validity_range.upper_bound.bound_type,
      ) is {
        (Finite(lo), Finite(hi)) -> lo >= sale_start && hi <= sale_end
        _ -> False
      }

    // (3) some output pays >= claimed_lovelace to the launchpad payment address
    let paid_enough =
      list.any(
        outputs,
        fn(o) {
          pays_to(o, payment_credential_hash) && lovelace_of(o.value) >= redeemer.claimed_lovelace
        },
      )

    // (4) referral (mirrors the EVM launchpad): if a referrer is set, it must NOT be the buyer
    //     and must receive at least `claimed_lovelace * referrer_reward_bps / 10000`.
    let has_referrer = redeemer.referrer != #""
    let referral_ok =
      if has_referrer {
        let reward = redeemer.claimed_lovelace * referrer_reward_bps / 10000
        let not_self = redeemer.referrer != redeemer.buyer
        let referrer_paid =
          list.any(
            outputs,
            fn(o) {
              pays_to(o, redeemer.referrer) && lovelace_of(o.value) >= reward
            },
          )
        not_self && referrer_paid
      } else {
        True
      }

    // (5) EXACTLY one receipt minted under this policy: assetName == buyer pkh, qty 1
    let minted = tokens(mint, policy_id) |> dict.to_pairs()
    let mint_ok = minted == [Pair(redeemer.buyer, 1)]

    and {
      buyer_signed?,
      within_window?,
      paid_enough?,
      referral_ok?,
      mint_ok?,
    }
  }

  else(_) {
    fail
  }
}

fn pays_to(o: Output, hash: ByteArray) -> Bool {
  when o.address.payment_credential is {
    VerificationKey(h) -> h == hash
    Script(h) -> h == hash
  }
}
