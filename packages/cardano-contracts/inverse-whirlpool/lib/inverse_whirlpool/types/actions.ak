use cardano/transaction.{OutputReference}
use aiken/merkle_patricia_forestry.{Proof}
use cardano/address.{Credential}

// Validator: Whirl
pub type MintActions {
  InitMerkle
  CreateAccount {
    account: Credential,
    merkle_proof_block: Proof,
    output_index: Int,
  }
  BurnAccount
}

pub type ValidateActions {
  SpendMerkleRoot
  IncrementAccount(Int)
  DestroyAccount
}


// Validator: Paima
pub type MintActionType {
  MintToken(OutputReference, TransactionBodyPieces, Metadata)
  BurnToken
}

pub type Metadata =
  ByteArray

/// Ref: https://github.com/IntersectMBO/cardano-ledger/blob/master/eras/babbage/impl/cddl-files/babbage.cddl
pub type TransactionBodyPieces {
  /// 7:  auxiliary_data_hash
  metadata_hash: ByteArray,
  /// 13: set<transaction_input>
  collateral_inputs: ByteArray,
  /// 16: transaction_output
  collateral_output: ByteArray,
  /// 17: coin
  collateral_fee: ByteArray,
}

// Spend validator to update the datum or retrieve ada or asset from address
pub type SpendActions {
  Admin { action: AdminActionTypes }
  Minter { action: MintActionType }
}

pub type AdminActionTypes {
  UpdateDatum
}
