# Polkadot & Substrate

EffectStream provides wallet connection and cryptographic verification support for the Polkadot ecosystem and Substrate-based chains.

> **Note**: Full Read (Sync) and Write (Batcher) support for generic Polkadot chains is currently in development.

## 1. Browser Wallets (Connect)

You can connect to Polkadot-compatible wallets (like Polkadot.js, Talisman, SubWallet) using `WalletMode.Polkadot`.

```typescript
import { walletLogin, WalletMode } from "@effectstream/wallets";

const result = await walletLogin({
  mode: WalletMode.Polkadot,
  // Optional: prefer a specific extension
  preference: { name: "polkadot-js" }, 
});

if (result.success) {
  const wallet = result.result;
  console.log("Connected Polkadot Address:", wallet.walletAddress);
}
```

## 2. Cryptography (Verify)

You can verify Substrate SS58 addresses and signatures (sr25519, ed25519) using the `CryptoManager`.

### Signing Messages
```typescript
import { signMessage } from "@effectstream/wallets";

const signature = await signMessage(wallet, "Hello Polkadot");
```

### Verifying Signatures
```typescript
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const crypto = CryptoManager.getCryptoManager(AddressType.POLKADOT);

// 1. Verify SS58 Address
const isValidAddr = crypto.verifyAddress("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");

// 2. Verify Signature
const isValidSig = await crypto.verifySignature(
  userAddress, 
  "Hello Polkadot", 
  signature
);
```