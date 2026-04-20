// Source for test_event_contract.wasm
// See BUILD.md for compilation instructions.

use near_sdk::{env, near};

#[near(contract_state)]
#[derive(Default)]
pub struct Contract {}

#[near]
impl Contract {
    /// Emits a custom NEP-297 event for NEAR:Generic primitive testing.
    pub fn emit_event(&self, message: String) {
        let event = format!(
            r#"EVENT_JSON:{{"standard":"test","version":"1.0.0","event":"test_event","data":[{{"message":"{}"}}]}}"#,
            message
        );
        env::log_str(&event);
    }

    /// Emits a DIP-4 token_diff event for NEAR:Intent primitive testing.
    /// Mimics the intents.near Verifier contract settlement event.
    pub fn settle_intent(
        &self,
        account_id: String,
        intent_hash: String,
        token_a_id: String,
        token_a_amount: String,
        token_b_id: String,
        token_b_amount: String,
    ) {
        let event = format!(
            r#"EVENT_JSON:{{"standard":"dip4","version":"0.3.0","event":"token_diff","data":[{{"account_id":"{}","intent_hash":"{}","diff":{{"{}":"{}","{}":"{}"}}}}]}}"#,
            account_id, intent_hash, token_a_id, token_a_amount, token_b_id, token_b_amount
        );
        env::log_str(&event);
    }

    /// Emits a NEP-141 ft_transfer event for NEAR:NEP141 primitive testing.
    /// Shape matches the spec: fields old_owner_id, new_owner_id, amount (all strings).
    pub fn emit_nep141_transfer(
        &self,
        old_owner_id: String,
        new_owner_id: String,
        amount: String,
    ) {
        let event = format!(
            r#"EVENT_JSON:{{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{{"old_owner_id":"{}","new_owner_id":"{}","amount":"{}"}}]}}"#,
            old_owner_id, new_owner_id, amount
        );
        env::log_str(&event);
    }

    /// Emits a NEP-171 nft_transfer event for NEAR:NEP171 primitive testing.
    /// Wraps a single token_id in the token_ids array as per the spec.
    pub fn emit_nep171_transfer(
        &self,
        old_owner_id: String,
        new_owner_id: String,
        token_id: String,
    ) {
        let event = format!(
            r#"EVENT_JSON:{{"standard":"nep171","version":"1.0.0","event":"nft_transfer","data":[{{"old_owner_id":"{}","new_owner_id":"{}","token_ids":["{}"]}}]}}"#,
            old_owner_id, new_owner_id, token_id
        );
        env::log_str(&event);
    }
}
