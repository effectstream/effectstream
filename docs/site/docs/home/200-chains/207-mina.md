# Mina Protocol

EffectStream supports wallet connections and cryptographic verification for the Mina Protocol.

> **Note**: Full Read (Sync) and Write (Batcher) support for Mina is currently in development.

## 1. Browser Wallets (Connect)

You can connect to the Auro Wallet using `WalletMode.Mina`.

```typescript
import { walletLogin, WalletMode } from "@effectstream/wallets";

const result = await walletLogin({
  mode: WalletMode.Mina,
});

if (result.success) {
  const wallet = result.result;
  console.log("Connected Mina Address:", wallet.walletAddress);
}
```

## 2. Cryptography (Verify)

You can verify Mina addresses and signed messages using the `CryptoManager`.

### Signing Messages
```typescript
import { signMessage } from "@effectstream/wallets";

// Returns a complex signature structure (field, scalar, network)
const signature = await signMessage(wallet, "Hello Mina");
```

### Verifying Signatures
```typescript
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const crypto = CryptoManager.getCryptoManager(AddressType.MINA);

// 1. Verify Address
const isValidAddr = crypto.verifyAddress("B62...");

// 2. Verify Signature
const isValidSig = await crypto.verifySignature(
  userAddress, 
  "Hello Mina", 
  signature
);
```