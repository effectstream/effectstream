---
slug: wallets-social-login-2of3
title: "Frictionless Wallets, Part 2: Social Login with a 2-of-3 Secret"
authors: [effectstream]
tags: [wallets, ux, cardano, social-login, secret-sharing]
---

This is part two of a three-part series on making on-chain wallets feel like normal apps. [Part one](/blog/wallets-device-key-pairs) covered device-specific key-pairs - a browser key your main wallet delegates non-financial signing to. Part two answers the next question: **where does the main wallet come from in the first place?** For most people, "write down 24 words" is where onboarding ends. Social login replaces that with a sign-in they already use - backed by a 2-of-3 secret so no single party ever holds the wallet.

This is a Cardano capability first: the wallet derives a standard Cardano wallet (CIP-1852, payment and stake addresses) alongside EVM and Midnight wallets, all from one identity.

<!-- truncate -->

## See it in action

<iframe width="100%" height="415" src="https://www.youtube.com/embed/Gwdos60B9mM" title="Social login with a 2-of-3 wallet" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

The demo runs the whole flow: sign in with Google, watch the master entropy get reconstructed from two shares, see EVM + Cardano + Midnight wallets derived from it, and a demo dApp request and receive a signature.

## The 2-of-3 design

A 256-bit master secret is split into shares using threshold secret sharing - **any two of the three shares reconstruct the secret; any single share is useless on its own.**

- One share is stored in the user's **Google Drive** (reached through the OAuth sign-in - the app never sees the account password).
- One share stays **with the user** (device/local).
- The third share serves as backup, so losing any one share is recoverable.

Sign in with Google, combine two shares client-side, and the master entropy exists again - in the browser, never on a server. Lose the device? Sign in with Google from a new one and recover. There is no seed phrase to write down, and no single point of failure: Google alone cannot reconstruct the wallet, and neither can a stolen device.

## Real wallets, not an account abstraction

From the reconstructed entropy, the wallet derives standard wallets per chain:

- **Cardano** - CIP-1852 derivation: payment address, stake address, reward address. A first-class Cardano wallet any Cardano dApp can use.
- **EVM** - secp256k1 at the standard derivation path.
- **Midnight** - Zswap/Night/Dust key set.

One Google identity, three chains, deterministic derivation - the same entropy always derives the same addresses.

## Connecting to a dApp

A demo dApp connects to the wallet, requests a message signature, and gets it - the wallet panel shows the connected Google identity backing the EVM, Cardano, and Midnight addresses, and the signed event carries the Cardano payment and reward addresses. The integration shape is the same wallet API as the rest of the [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets) family, so a dApp built against part one's device key-pairs picks up social login without rework.

## The series

- [Part 1 - Device-specific key-pairs](/blog/wallets-device-key-pairs): the delegation that removes per-action pop-ups.
- **Part 2 - Social login (this post)**: where the wallet comes from, with no seed phrase.
- Part 3 - Biometric login: unlocking with the platform authenticator (passkeys).

## Source

- 2-of-3 social wallet: https://github.com/effectstream/social-wallet-2of3
- Wallets package: https://www.npmjs.com/package/@effectstream/wallets
