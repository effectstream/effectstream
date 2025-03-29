use cardano/address.{Credential}
use cardano/assets.{PolicyId}

pub type State {
  Merkle { root: ByteArray, own_hash: PolicyId }
  Account(Credential, Int)
}
