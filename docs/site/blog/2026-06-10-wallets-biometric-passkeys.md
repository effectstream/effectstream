---
slug: wallets-biometric-passkeys
title: "Frictionless Wallets, Part 3: Biometric Login with Passkeys"
authors: [effectstream]
tags: [wallets, ux, cardano, passkeys, biometrics, webauthn]
---

This is the final part of the series on making on-chain wallets feel like normal apps. [Part one](/blog/wallets-device-key-pairs) delegated non-financial signing to a device key-pair; [part two](/blog/wallets-social-login-2of3) replaced the seed phrase with a social login backed by a 2-of-3 secret. Part three removes the last piece of friction: **unlocking the wallet with the device's biometric authenticator** - Touch ID, Face ID, or a platform passkey - no seed phrase, no browser extension.

As with the rest of the series, this serves the Cardano ecosystem first and works across the chains EffectStream supports.

<!-- truncate -->

## See it in action

<iframe width="100%" height="415" src="https://www.youtube.com/embed/XrZLhV5YxmI" title="Biometric wallet login with passkeys" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

The demo is a consumer dApp that authenticates users through a cross-origin wallet iframe. The dApp requests a connection, the wallet offers passkey registration or sign-in, the OS biometric prompt fires, and the user is connected - with a DID, an access key, and message signing, all without a seed phrase or an extension.

## How it works

Three properties make the design worth copying:

1. **The dApp holds no key material.** The wallet runs in a **cross-origin iframe** on its own domain. The embedding page can request connections and signatures, but keys never leave the wallet origin - the same isolation model browsers enforce between sites.
2. **The passkey unlocks a root key; the root key authorizes access keys.** Registering creates a passkey with the platform authenticator (WebAuthn). That passkey gates a root key, and the root key signs an authorization for a **per-app access key**. The dApp sees the access key and the root key's authorization of it - a clean, auditable chain of custody.
3. **No seed phrase, no extension.** The authenticator is the device's own - synced by the platform (iCloud Keychain, Google Password Manager), so the usual passkey recovery story applies.

The result, visible in the demo: a DID for the identity, the access key public key, the root-key authorization with its timestamp, and a message signed through the embedded iframe with both raw and DER signatures.

## The series, complete

- [Part 1 - Device-specific key-pairs](/blog/wallets-device-key-pairs): one delegation, then no more pop-ups.
- [Part 2 - Social login (2-of-3)](/blog/wallets-social-login-2of3): a wallet from a Google sign-in, recoverable, no seed phrase.
- **Part 3 - Biometric login (this post)**: the wallet unlocks like a phone.

Together they make an on-chain app onboard and play like any consumer app - while keeping key custody honest, scoped, and revocable - for Cardano and every chain EffectStream supports.

## Source

- Passkeys wallet: https://github.com/effectstream/wallet-passkeys
- Demo dApp: https://github.com/effectstream/wallet-passkeys-app
- Wallets package: https://www.npmjs.com/package/@effectstream/wallets
