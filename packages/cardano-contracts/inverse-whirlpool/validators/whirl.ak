use aiken/builtin
use aiken/collection/dict
use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{blake2b_256}
use aiken/merkle_patricia_forestry.{from_root, insert}
use aiken/option.{map}
use aiken/primitive/bytearray
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}
use inverse_whirlpool/conversion.{
  convert_extra_signatories, convert_fee, convert_inputs, convert_mint,
  convert_outputs,
}
use inverse_whirlpool/types/actions.{
  BurnToken, MintActionType, MintToken, TransactionBodyPieces,
  BurnAccount, CreateAccount, DestroyAccount, IncrementAccount,
  InitMerkle, MintActions, SpendMerkleRoot, ValidateActions
}
use inverse_whirlpool/types/state.{Account, Merkle, State}
use inverse_whirlpool/utils.{get_inline_datum, list_at, skip_to}
use inverse_whirlpool/validation.{init_merkle}

validator merkle(init_ref: OutputReference) {
  mint(rdmr: MintActions, own_policy: PolicyId, tx: Transaction) {
    trace @"Running Merkle Mint Validatator"

    let expected_address = Address(Script(own_policy), None)

    // Use empty asset name as the master token
    let expected_value = assets.from_asset(own_policy, "", 1)

    trace @"Preamble Complete"

    when rdmr is {
      InitMerkle -> {
        trace @"InitMerkle"
        init_merkle(init_ref, tx, own_policy, expected_address, expected_value)
      }

      CreateAccount { account, merkle_proof_block, output_index } -> {
        trace @"CreateAccount"
        let account_hash =
          account |> builtin.serialise_data |> crypto.blake2b_256

        expect Some(merkle_input) =
          tx.inputs
            |> list.find(fn(input) { input.output.address == expected_address })

        let Output { value: input_value, datum: input_data, .. } =
          merkle_input.output

        expect Merkle { root: input_root, .. }: State =
          get_inline_datum(input_data)

        expect [merkle_output,
          user_account_output, ..] = skip_to(tx.outputs, output_index)

        let Output {
          address: output_address,
          value: output_value,
          datum: output_data,
          ..
        } = merkle_output

        expect Merkle { root: output_root, own_hash }: State =
          get_inline_datum(output_data)

        let Output {
          address: account_address,
          value: account_value,
          datum: account_data,
          ..
        } = user_account_output

        let expected_account_value =
          assets.from_asset(own_policy, account_hash, 1)

        // Control mint value
        expect [Pair(minted_token, 1)] =
          tx.mint
            |> assets.tokens(own_policy)
            |> dict.to_pairs

        // trace concat(@"Account Hash: ", account_hash |> bytearray.to_hex())
        // trace concat(@"Minted Token: ", minted_token |> bytearray.to_hex())

        // // trace concat(@"Own output_address: ", output_address)
        // // trace concat(@"Own expected_address: ", expected_address |> bytearray.to_hex())
        // trace concat(@"Own Hash: ", own_hash |> bytearray.to_hex())
        // trace concat(@"Own Policy: ", own_policy |> bytearray.to_hex())

        // trace concat(@"input_root: ", input_root |> bytearray.to_hex())
        // trace concat(@"account_hash: ", account_hash |> bytearray.to_hex())
        // trace concat(@"Outputroot: ", output_root |> bytearray.to_hex())

        and {
          // Verify new and old merkle roots
          insert(
            input_root |> from_root,
            account_hash |> crypto.blake2b_256,
            account_hash,
            merkle_proof_block,
          ) == from_root(output_root),
          // Verify utxo is preserved
          assets.without_lovelace(input_value) == expected_value,
          output_address == expected_address,
          assets.without_lovelace(output_value) == expected_value,
          own_hash == own_policy,
          // Verify account token is created
          minted_token == account_hash,
          // Verify account utxo is created
          account_address.payment_credential == Script(own_policy),
          assets.without_lovelace(account_value) == expected_account_value,
          account_data == InlineDatum(Account(account, 1)),
        }
      }

      // Fairly Positive this is GOOD
      BurnAccount -> {
        trace @"BurnAccount"

        expect [Pair(_, amount)] =
          tx.mint
            |> assets.tokens(own_policy)
            |> dict.to_pairs
        amount == -1
      }
    }
  }

  spend(
    datum: Option<State>,
    rdmr: ValidateActions,
    own_ref: OutputReference,
    transaction: Transaction,
  ) {
    when rdmr is {
      SpendMerkleRoot -> {
        trace @"SpendMerkleRoot"
        // Depend on the execution of the mint contract to ensure spend validation
        expect Some(Merkle(_, policy_id)) = datum

        // trace concat(@"Policy ID: ", policy_id |> bytearray.to_hex())

        expect [Pair(_, amount)] =
          transaction.mint
            |> assets.tokens(policy_id)
            |> dict.to_pairs

        amount == 1
      }
      IncrementAccount(output_index) -> {
        trace @"IncrementAccount"

        expect Some(Account(credential, current_amount)) = datum

        expect Some(own_input) =
          list.find(
            transaction.inputs,
            fn(input) { input.output_reference == own_ref },
          )
            |> map(fn(input) { input.output })

        let Output { address: input_address, value: input_value, .. } =
          own_input

        let Output {
          address: output_address,
          value: output_value,
          datum: output_data,
          ..
        } = list_at(transaction.outputs, output_index)

        and {
          when credential is {
            VerificationKey(vk) -> list.has(transaction.extra_signatories, vk)

            sh -> pairs.has_key(transaction.withdrawals, sh)
          },
          input_address == output_address,
          assets.without_lovelace(input_value) == assets.without_lovelace(
            output_value,
          ),
          output_data == InlineDatum(Account(credential, current_amount + 1)),
        }
      }
      DestroyAccount -> {
        trace @"DestroyAcc"
        // Depend on the execution of the mint contract to ensure spend validation
        expect Some(Account(credential, _)) = datum

        expect Some(own_script_hash) =
          transaction.inputs
            |> list.find(fn(input) { input.output_reference == own_ref })
            |> option.map(
                fn(input) {
                  when input.output.address.payment_credential is {
                    Script(own_script_hash) -> own_script_hash
                    _ -> fail @"Impossible"
                  }
                },
              )

        expect [Pair(token_name, amount)] =
          transaction.mint
            |> assets.tokens(own_script_hash)
            |> dict.to_pairs

        and {
          amount == -1,
          token_name == (
            credential
              |> builtin.serialise_data
              |> crypto.blake2b_256
          ),
          when credential is {
            VerificationKey(vk) -> list.has(transaction.extra_signatories, vk)

            sh -> pairs.has_key(transaction.withdrawals, sh)
          },
        }
      }
    }
  }

  else(_) {
    fail
  }
}

validator paima_mint(merkle_policy: ByteArray, validate_match: Bool) {
  mint(action: Data, script_policy_id: PolicyId, transaction: Transaction) {
    let Transaction { inputs, outputs, extra_signatories, mint, fee, id, .. } =
      transaction

    // Deconstruct the transaction into its base components:
    // Inputs, Outputs, Inline Datum, and a list of Minted Tokens
    trace @"Mint Preamble Complete"

    // trace cbor.diagnostic(action)

    expect action: MintActionType = action

    when action is {
      BurnToken ->
        list.all(
          mint |> assets.tokens(script_policy_id) |> dict.to_pairs,
          fn(amount_map) {
            let Pair(_, amount) = amount_map
            amount == -1
          },
        )
      MintToken(input_ref, tx_body, metadata) -> {

        trace @"1"
        let TransactionBodyPieces {
          collateral_inputs,
          collateral_output,
          collateral_fee,
          metadata_hash,
        } = tx_body

        trace @"2"
        expect [Pair(script_data_hash, 1), ..] =
          mint // this is the script hash of true.mint
            // WARNING: this has to be updated if the true.mint compiled code changes
            
          |> assets.tokens(
                #"9fc33a6ffaa8d1f600c161aa383739d5af37807ed83347cc133521c9",
              )
            |> dict.to_pairs
        trace @"3"

        let inputs_cbor = convert_inputs(inputs) |> bytearray.concat(#"00", _)
        let outputs_cbor =
          convert_outputs(outputs) |> bytearray.concat(#"01", _)
        let fee_cbor = convert_fee(fee) |> bytearray.concat(#"02", _)
        let mint_cbor = convert_mint(mint) |> bytearray.concat(#"09", _)

        let script_data_hash_cbor =
          builtin.serialise_data(script_data_hash) |> bytearray.concat(#"0b", _)

        let extra_signatories_cbor =
          convert_extra_signatories(extra_signatories)
            |> bytearray.concat(#"0e", _)

        trace @"4"
        // let _ref_inputs_cbor =
        //  convert_inputs(reference_inputs) |> bytearray.concat(#"12", _)
        let collateral_inputs_cbor = bytearray.concat(#"0d", collateral_inputs)

        let collateral_output_cbor = bytearray.concat(#"10", collateral_output)
        let collateral_fee_cbor = bytearray.concat(#"11", collateral_fee)
        trace @"5"

        let tx_cbor =
          #"a9"
            |> bytearray.concat(inputs_cbor)
            |> bytearray.concat(outputs_cbor)
            |> bytearray.concat(fee_cbor)
            |> bytearray.concat(mint_cbor)
            |> bytearray.concat(script_data_hash_cbor)
            |> bytearray.concat(collateral_inputs_cbor)
            |> bytearray.concat(extra_signatories_cbor)
            |> bytearray.concat(collateral_output_cbor)
            |> bytearray.concat(collateral_fee_cbor)

        trace @"INFO CBOR SERIALIZED TX:"
        trace bytearray.to_hex(tx_cbor)

        trace tx_cbor |> builtin.blake2b_256 |> bytearray.to_hex

        trace bytearray.to_hex(id)

        expect Some(input) =
          list.find(inputs, fn(input) { input_ref == input.output_reference })

        let Input { output: Output { value, datum, .. }, .. } = input

        expect Account(credential, amount): State = get_inline_datum(datum)

        let expected_value =
          assets.from_asset(
            merkle_policy,
            credential |> builtin.serialise_data |> crypto.blake2b_256,
            1,
          )
        expect [Pair(token_name, 1)] =
          mint |> assets.tokens(script_policy_id) |> dict.to_pairs

        // let expected_metadata =
        //   "const format" |> bytearray.concat(url) |> bytearray.concat("ending")
        and {
          if validate_match {
            id == ( tx_cbor |> builtin.blake2b_256 )
          } else {
            id != ( tx_cbor |> builtin.blake2b_256 )
          }?,
          (assets.without_lovelace(value) == expected_value)?,
          (token_name == (
            credential
              |> builtin.serialise_data
              |> bytearray.concat(amount |> builtin.serialise_data)
              |> crypto.blake2b_256
          ))?,
          (blake2b_256(metadata) == metadata_hash)?,
          // Metadata validation here
          True,
        }
      }
    }
    // and {
    //   expected_value == assets.without_lovelace(value),
    //   token_name == (
    //     credential
    //       |> builtin.serialise_data
    //       |> bytearray.concat(amount |> builtin.serialise_data)
    //       |> crypto.blake2b_256
    //   ),
    // }
  }

  else(_) {
    fail
  }
}
