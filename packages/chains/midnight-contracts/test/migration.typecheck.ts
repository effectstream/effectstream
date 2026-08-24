import {
  ZswapChainState,
  type Signature,
  type SignatureVerifyingKey,
  type SigningKey,
} from "@midnightntwrk/ledger-v9";

const signingKey: SigningKey = { tag: "schnorr", value: "00" };
const verifyingKey: SignatureVerifyingKey = { tag: "ecdsa", value: "00" };
const signature: Signature = { tag: "schnorr", value: "00" };
void [signingKey, verifyingKey, signature];

// The legacy string representation must stay rejected by ledger-v9 types.
// @ts-expect-error ledger-v9 signing keys are tagged values
const legacySigningKey: SigningKey = "00";
// @ts-expect-error ledger-v9 verifying keys are tagged values
const legacyVerifyingKey: SignatureVerifyingKey = "00";
// @ts-expect-error ledger-v9 signatures are tagged values
const legacySignature: Signature = "00";
void [legacySigningKey, legacyVerifyingKey, legacySignature];

if (false) {
  const state = new ZswapChainState();
  state.postBlockUpdate(new Date(), 60n);
  // @ts-expect-error ledger-v9 requires retentionDuration
  state.postBlockUpdate(new Date());
}
