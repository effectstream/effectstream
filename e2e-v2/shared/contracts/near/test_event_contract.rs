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
}
