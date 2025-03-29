use aiken/collection/dict
use aiken/collection/list
use aiken/merkle_patricia_forestry/merkling.{null_hash}
use cardano/address.{Address}
use cardano/assets.{PolicyId, Value}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use inverse_whirlpool/types/state.{Merkle}

pub fn init_merkle(
  init_ref: OutputReference,
  tx: Transaction,
  own_policy: PolicyId,
  expected_address: Address,
  expected_value: Value,
) -> Bool {
  expect Some(_) =
    tx.inputs |> list.find(fn(i) { i.output_reference == init_ref })

  let expected_data =
    null_hash
      |> Merkle(own_policy)
      |> InlineDatum

  expect [first_output, ..] = tx.outputs

  // Control mint value
  expect [Pair(_, 1)] =
    tx.mint
      |> assets.tokens(own_policy)
      |> dict.to_pairs

  let Output {
    address: actual_address,
    value: actual_value,
    datum: actual_data,
    ..
  } = first_output

  trace actual_data
  trace expected_data

  and {
    actual_address == expected_address,
    assets.without_lovelace(actual_value) == expected_value,
    actual_data == expected_data,
  }
}
