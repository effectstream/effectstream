---
slug: wallets-device-key-pairs
title: "Frictionless Wallets, Part 1: Device-Specific Key-Pairs"
authors: [effectstream]
tags: [wallets, ux, cardano, delegation, key-pairs]
---

This is part one of a three-part series on making on-chain wallets feel like normal apps. Part one is the foundation: a **device-specific key-pair** that a player's wallet delegates signing to, so an app can submit actions on their behalf without a pop-up every time. Part two adds [social login with a 2-of-3 secret](#whats-next), and part three adds [biometric unlock](#whats-next) - both build on the key-pair described here.

This is a Cardano capability first: it works with the standard Cardano browser wallets (Lace, Eternl, Nami, NuFi), and the same code works across the other chains EffectStream supports.

<!-- truncate -->

## See it in action

The demo below runs the whole flow: a Cardano wallet (Lace) signs a message with a pop-up, the device key signs the same kind of message instantly, and then three production games run pop-up-free because the device key is signing every move behind the scenes.

<iframe width="100%" height="415" src="https://www.youtube.com/embed/TlE7Pt4x2Wc" title="Device-specific key-pairs for wallets" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

## Two kinds of transactions

The idea rests on a distinction every game makes whether it says so or not:

- **Financial transactions** - moving assets, minting, anything that spends value - always require explicit approval from the player's real wallet.
- **Non-financial transactions** - game moves, messages, state updates - carry no value and just need to prove the player authored them.

Asking the player to approve the second kind in a wallet pop-up is what makes on-chain apps feel like filling in forms. The device key-pair removes exactly that friction, and only that.

## Creating the key-pair in the browser

When a session starts, the app generates a fresh key-pair **on the device**, in the browser, and keeps it in encrypted local storage. Nothing about it touches a server. The player then connects their real Cardano wallet once and signs a single **delegation certificate** that authorises the device key to submit non-financial transactions on their behalf.

That delegated key is deliberately limited:

- **Scoped** - it can only submit non-financial inputs. It can never move funds; financial transactions still route through the real Cardano wallet.
- **Time-bounded** - it expires with the session.
- **Revocable** - the player can cancel the delegation at any time.

So the security guarantee players expect is preserved - nobody moves their assets without an explicit signature - while the per-action friction disappears.

## The code

The delegation lifecycle lives in [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets): key generation, certificate signing, session management, and silent signing of non-financial inputs. The flow is four steps:

```typescript
import { WalletMode, walletLogin, allInjectedWallets } from "@effectstream/wallets";

// 1. Create the device-local session key-pair, generated in the browser
//    and held in encrypted local storage. preferBatchedMode turns on
//    delegated (silent) signing.
const session = await walletLogin({
  mode: WalletMode.EvmEthers,
  preferBatchedMode: true,
  connection: {
    metadata: { name: "session", displayName: "Session Wallet" },
    api: await getLocalSignerFromStorage(),
  },
});

// 2. The player connects their real Cardano wallet (Lace, Eternl, Nami,
//    NuFi...). This is the only step that shows a pop-up.
const injected = await allInjectedWallets({ signatureSupport: false, transactionSupport: false });
const cardanoWallet = injected[WalletMode.Cardano][0];
const realWallet = await walletLogin({
  mode: WalletMode.Cardano,
  preference: { name: cardanoWallet.metadata.name },
});

// 3. One-time delegation: the Cardano wallet signs a certificate
//    authorising the device key to submit non-financial inputs.
await effectStreamService.connectWallets(session.result, realWallet.result);

// 4. Every later action is signed by the device key - no more pop-ups.
await sendGameMove({ move: "x10y20" });
```

The signing model is uniform across chains: swap `WalletMode.Cardano` for `WalletMode.Midnight`, `WalletMode.EvmInjected`, or any other supported mode and the rest of the flow is identical. Full reference is in the [wallets documentation](/docs/home/components/wallets).

## Live today

This is not a prototype - the device key-pair is in production on [midnight.fun](https://midnight.fun/games), powering three games where pop-ups per action would make play impossible:

- [Safe Solver](https://safesolver.midnight.fun/) - rapid puzzle move submission
- [Kachina Kolosseum](https://kachina.midnight.fun/) - real-time PvP combat
- [Block Kart Legends](https://blockkart.paimastudios.com/) - dozens of state updates per race

## What's next

The device key-pair is the building block for the rest of this series:

- **Part 2 - Social login (2-of-3).** Back the device key with a recoverable 2-of-3 secret so a player can restore access without a seed phrase.
- **Part 3 - Biometric login.** Unlock the device key with the platform's biometric authenticator.

## Source

- Package: https://www.npmjs.com/package/@effectstream/wallets
- Framework code: https://github.com/effectstream/effectstream
- Related: [Auto-Sign: eliminating wallet pop-ups](/blog/auto-sign)
