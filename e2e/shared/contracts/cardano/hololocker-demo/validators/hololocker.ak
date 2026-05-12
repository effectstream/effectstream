use aiken/bytearray
use aiken/cbor
use aiken/dict
use aiken/hash.{blake2b_256}
use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/list
use aiken/transaction.{
  Datum, InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Spend,
  Transaction,
}
use aiken/transaction/credential.{Address, PaymentCredential, ScriptCredential}
use aiken/transaction/value.{
  AssetName, PolicyId, Value, from_minted_value, merge, quantity_of, to_dict,
  without_lovelace,
}

/// The datum for the locked assets
type State {
  /// The owner has the rights to withdrawal the full or
  /// partial amount
  owner: Owner,
  /// Whether the assets are locked or unlocking with a wait time
  status: Status,
}

/// Used to describe what state
/// some locked assets are in.
type Status {
  /// Assets are locked and no withdrawal attempt has been made
  Locked
  /// A withdrawal request has been made but
  /// things can only be unlocked after interval
  Unlocking {
    /// To support creating multiple "Unlocking" in a single transaction,
    /// We need to properly tag which Unlocking is for which hololocker
    out_ref: OutputReference,
    /// note: this interval is in slots and not in blocks, since that's all we can access from Plutus
    for_how_long: Int,
  }
}

/// This contract supports
/// many different kinds of owners
type Owner {
  /// Owner is a public key hash
  PKH(ByteArray)
  /// Owner is an NFT. Meaning
  /// whoever can spend this NFT can unlock.
  NFT(PolicyId, AssetName)
  /// A uniquely minted asset created on lock.
  /// Whoever can burn it can unlock.
  Receipt(AssetName)
}

/// Tells us if we are withdrawing everything or doing
/// a partial withdraw. It also tells us which input
/// an NFT resides in, this is only relevant for NFT owners
/// hence it's `Option`.
type Redeem {
  /// not optional since None and Bool are the same onchain size anyway
  partial_withdraw: Bool,
  nft_input_owner: Option<OutputReference>,
  new_receipt_owner: Option<AssetName>,
}

type MintRedeemer {
  MintTokens { total: Int }
  BurnTokens
}

/// Demo version: minimum_lock_time = 5 for fast e2e testing
/// (production uses 300000 = 5 minutes)
const minimum_lock_time = 5

const ada_policy = ""

const ada_token_name = ""

/// Implemented as a multi-validator.
/// `spend` is for unlocking and claiming.
/// `mint` is only used in the case of `Receipt` owners.
validator {
  fn spend(datum: State, redeemer: Redeem, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, purpose } = ctx

    expect Spend(own_out_ref) = purpose

    let Transaction {
      inputs,
      outputs,
      mint,
      validity_range,
      extra_signatories,
      ..
    } = transaction

    expect Some(own_input) =
      list.find(inputs, fn(input) { input.output_reference == own_out_ref })

    let Input {
      output: Output { address: in_address, value: in_value, .. },
      ..
    } = own_input

    let State { owner, status } = datum

    // Checks current owner is valid and gets next owner
    let next_owner =
      when owner is {
        // An owner can be a public key, a spent NFT, or a burned receipt token that was minted by this script
        PKH(signer) -> {
          expect list.has(extra_signatories, signer)
          owner
        }
        // In this case the redeemer out ref refers to some other input that holds the nft
        // that we check is spent
        NFT(policy, token_name) -> {
          // look up the NFT to be used using `nft_input_owner` as a performance optimization
          expect Some(nft_input_owner) = redeemer.nft_input_owner

          expect Some(nft_input) =
            list.find(
              inputs,
              fn(input) { input.output_reference == nft_input_owner },
            )

          // note: we do not burn the NFT - only that it's included in a tx input
          expect quantity_of(nft_input.output.value, policy, token_name) == 1
          owner
        }

        Receipt(token_name) -> {
          let payc = in_address.payment_credential

          expect ScriptCredential(policy) = payc

          let mint = from_minted_value(mint)

          // ensure that we burn the previous receipt NFT
          expect quantity_of(mint, policy, token_name) == -1
          when status is {
            Locked -> {
              expect Some(next_receipt_name) = redeemer.new_receipt_owner

              // mint a new NFT so it can be used as the condition for withdrawing
              // note: `next_receipt_name` user input here is implicitly constained to match `create_expected_minted_nfts`
              //       since that's the only way a token can be minted from this policy 
              expect quantity_of(mint, policy, next_receipt_name) == 1
              Receipt(next_receipt_name)
            }
            Unlocking { .. } ->
              // no need to mint a new NFT if the user is withdrawing
              owner
          }
        }
      }

    let Interval { lower_bound, upper_bound } = validity_range

    when status is {
      Locked -> {
        let IntervalBound { bound_type, .. } = upper_bound

        expect Finite(upper) = bound_type

        // upper bound + minimum_lock_time = for_how_long
        let output_unlocking_datum =
          State {
            owner: next_owner,
            status: Unlocking {
              out_ref: own_out_ref,
              for_how_long: upper + minimum_lock_time,
            },
          }

        let outputs_offset =
          find_outputs_offset(outputs, InlineDatum(output_unlocking_datum))

        if redeemer.partial_withdraw {
          // case for partial withdraws
          check_partial_withdraw_outputs(outputs_offset, in_address, in_value)
        } else {
          check_full_withdraw_outputs(outputs_offset, in_address, in_value)
        }
      }

      Unlocking { for_how_long, .. } -> {
        // lower bound check
        let IntervalBound { bound_type, .. } = lower_bound

        expect Finite(lower) = bound_type

        for_how_long <= lower
      }
    }
  }

  /// If the owner is a `Receipt` then we'll need this
  /// to mint a unique asset that acts as the owner of the locked
  /// assets.
  fn mint(redeemer: MintRedeemer, ctx: ScriptContext) -> Bool {
    // get values from transaction and purpose
    let ScriptContext { transaction, purpose } = ctx

    expect Mint(policy_id) = purpose

    let Transaction { inputs, outputs, mint, .. } = transaction

    let mint = from_minted_value(mint)

    let minted_assets =
      mint
        |> value.tokens(policy_id)
        |> dict.to_list()

    when redeemer is {
      BurnTokens ->
        list.all(
          minted_assets,
          fn(asset) {
            let (_, amount) = asset
            amount == -1
          },
        )
      MintTokens { total } -> {
        expect [input, ..] = inputs

        // Base is created from serializing a utxo ref being spent. Thus this guarantees a unique base
        let base = cbor.serialise(input.output_reference)

        // Create a list of expected token names
        let expected_minted_token_names =
          create_expected_minted_nfts(base, total, [])

        // Support multiple receipt token creation by allowing a
        // 'number of tokens minted' == 'outputs with datum containing Receipt 'token name'
        check_mint_to_output_datums(
          minted_assets,
          outputs,
          expected_minted_token_names,
          ScriptCredential(policy_id),
        )
      }
    }
  }
}

// finds the output that contains the desired datum
// returns that output, along with all ouputs that come afterwards
fn find_outputs_offset(
  outputs: List<Output>,
  output_datum: Datum,
) -> List<Output> {
  expect [output, ..rest_outputs] = outputs

  // note: this implicitly checks out_ref equality
  if output.datum == output_datum {
    outputs
  } else {
    find_outputs_offset(rest_outputs, output_datum)
  }
}

fn check_partial_withdraw_outputs(
  outputs_offset: List<Output>,
  input_address: Address,
  input_value: Value,
) -> Bool {
  expect [unlocking_output, remainder_output, ..] = outputs_offset

  let Output { address: out_address, value: out_value, .. } = unlocking_output

  let Output {
    address: rem_address,
    value: rem_value,
    datum: remainder_datum,
    ..
  } = remainder_output

  // check funds that remain in the lock properly stay in the "Locked" state
  expect InlineDatum(remainder_datum) = remainder_datum
  // note: we don't enforce that it's the same owner type
  expect State { status, .. }: State = remainder_datum
  expect status == Locked
  // make sure no ADA is added to the state machine when unlocking
  expect [(in_ada_policy, in_ada_amount), ..in_rest_values] =
    input_value
      |> to_dict
      |> dict.to_list

  expect Some(in_ada_quantity) = dict.get(in_ada_amount, ada_token_name)

  expect [(rem_ada_policy, rem_ada_amount), ..] =
    rem_value
      |> to_dict
      |> dict.to_list

  expect [(out_ada_policy, out_ada_amount), ..] =
    out_value
      |> to_dict
      |> dict.to_list

  expect Some(out_ada_quantity) = dict.get(out_ada_amount, ada_token_name)
  expect Some(rem_ada_quantity) = dict.get(rem_ada_amount, ada_token_name)

  // <= instead of just equal to handle extra ADA having to be added to satisfy min UTXO
  expect in_ada_quantity <= rem_ada_quantity + out_ada_quantity
  expect
    in_ada_policy == ada_policy && out_ada_policy == ada_policy && rem_ada_policy == ada_policy
  // make sure native assets are exactly split between unlocking and funds remaining in the lock
  let rem_value_no_ada = rem_value |> without_lovelace
  let total_value_no_ada =
    out_value
      |> without_lovelace
      |> merge(rem_value_no_ada)
      |> to_dict
      |> dict.to_list

  // Check other values have value conserved
  expect in_rest_values == total_value_no_ada
  // Addresses are the same
  out_address == input_address && rem_address == input_address
}

fn check_full_withdraw_outputs(
  outputs_offset: List<Output>,
  input_address: Address,
  input_value: Value,
) -> Bool {
  expect [unlocking_output, ..] = outputs_offset

  let Output { address: out_address, value: out_value, .. } = unlocking_output

  expect [(in_ada_policy, in_ada_amount), ..in_rest_values] =
    input_value
      |> to_dict
      |> dict.to_list

  expect Some(in_ada_quantity) = dict.get(in_ada_amount, ada_token_name)

  expect [(out_ada_policy, out_ada_amount), ..out_rest_values] =
    out_value
      |> to_dict
      |> dict.to_list

  expect Some(out_ada_quantity) = dict.get(out_ada_amount, ada_token_name)

  // Check total ada quantity for the output is greater than or equal to input ada
  // <= instead of just equal to handle extra ADA having to be added to satisfy min UTXO
  expect
    in_ada_quantity <= out_ada_quantity && in_ada_policy == ada_policy && out_ada_policy == ada_policy
  // Check other values have value conserved
  expect in_rest_values == out_rest_values
  // Addresses are the same
  out_address == input_address
}

// Check each minted token name is in the expected list, has quantity of 1,
// and has a corresponding ouput with datum containing token name.
// Alternatively allow for token burning
// Otherwise fail
fn check_mint_to_output_datums(
  minted_assets: List<(ByteArray, Int)>,
  outputs: List<Output>,
  expected_assets: List<ByteArray>,
  validator_cred: PaymentCredential,
) -> Bool {
  when minted_assets is {
    [] -> True
    [(minted_asset_name, quantity), ..rest_assets] ->
      if quantity == 1 {
        // 1) ensure the expected asset exists 
        expect
          list.any(
            expected_assets,
            fn(expected_asset) { expected_asset == minted_asset_name },
          )
        // 2) ensure the expected asset is used as the lock for an output
        let expected_datum =
          InlineDatum(
            State { owner: Receipt(minted_asset_name), status: Locked },
          )

        expect
          list.any(
            outputs,
            fn(output) {
              let Output { address, datum, .. } = output
              datum == expected_datum && address.payment_credential == validator_cred
            },
          )
        check_mint_to_output_datums(
          rest_assets,
          outputs,
          expected_assets,
          validator_cred,
        )
      } else if quantity == -1 {
        // note: we skip the burn case
        // the reason we need to handle the burn case here by skipping instead of failing
        // is because `minted_assets` is global to the transaction, and not this specific script execution
        // and the transaction may contain multiple mints and burns in the same transaction! (separate redeemers)
        // notably, when unlocking a hololocker for the Receipt case, users will use this policy to both mint and burn at the same time
        check_mint_to_output_datums(
          rest_assets,
          outputs,
          expected_assets,
          validator_cred,
        )
      } else {
        False
      }
  }
}

// create N unique token names
// by taking a common base and appending a unique counter to each one
fn create_expected_minted_nfts(
  base: ByteArray,
  counter: Int,
  accum: List<ByteArray>,
) -> List<ByteArray> {
  if counter == 0 {
    accum
  } else {
    let token_name = blake2b_256(bytearray.push(base, counter))

    let accum =
      [token_name, ..accum]

    create_expected_minted_nfts(base, counter - 1, accum)
  }
}
