# Algorand

Effectstream supports wallet connections and cryptographic verification for Algorand.

> **Note**: Full Read (Sync) and Write (Batcher) support for Algorand is currently in development.

## 1. Browser Wallets (Connect)

You can connect to Algorand wallets (like Pera Wallet) using `WalletMode.Algorand`.

```typescript
import { walletLogin, WalletMode } from "@effectstream/wallets";

const result = await walletLogin({
  mode: WalletMode.Algorand,
});

if (result.success) {
  const wallet = result.result;
  console.log("Connected Algorand Address:", wallet.walletAddress);
}
```

## 2. Cryptography (Verify)

You can verify Algorand addresses and transaction signatures using the `CryptoManager`.

### Signing Messages
```typescript
import { signMessage } from "@effectstream/wallets";

const signature = await signMessage(wallet, "Hello Algorand");
```

### Verifying Signatures
```typescript
import { CryptoManager } from "@effectstream/crypto";
import { AddressType } from "@effectstream/utils";

const crypto = CryptoManager.getCryptoManager(AddressType.ALGORAND);

// 1. Verify Address
const isValidAddr = crypto.verifyAddress("HZ5...");

// 2. Verify Signature
const isValidSig = await crypto.verifySignature(
  userAddress, 
  "Hello Algorand", 
  signature
);
```