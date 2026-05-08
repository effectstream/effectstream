---
slug: user-experience-integrations
title: "Streamlining User Experience: AI, Delegated Wallets, and Social Login"
authors: [effectstream]
tags: [wallets, ai, authentication, onboarding]
---

`WRITE: Blockchain apps suffer from UX friction — constant wallet pop-ups, complex key management, no familiar login flows. This article covers a suite of integrations that make blockchain apps feel like regular web apps: AI-powered gameplay, delegated signing, social login, and biometrics.`

<!-- truncate -->

## Browser AI with Shinkai Visor

We released the [Shinkai Visor](`ADD LINK`) Chrome extension, which connects LLMs directly to the browser context. Users can bring their own AI models into applications — the extension provides a bridge between on-chain game state and AI inference.

`INVESTIGATE: Is Shinkai Visor still available? Is the API still running?`

`WRITE: Explain the value prop — AI agents that can see and interact with on-chain game state. What can a user do with this that they couldn't do before?`

## AI-Powered Game Template

To demonstrate what's possible when AI meets on-chain games, we built a game template that integrates Shinkai Visor for AI-driven game mechanics.

- [Taiko game (live)](https://taiko-demo.paimastudios.com/)
- [Template code](https://github.com/PaimaStudios/paima-game-templates/pull/78)

`INVESTIGATE: Does the Taiko game need redeployment? Is the Shinkai API still up?`

`DECISION: Open-source Token Heist (https://github.com/PaimaStudios/taiko-shinkai-game)?`

`WRITE: How does the game leverage the LLM? What decisions does the AI make? What's the player experience?`

`ADD VIDEO HERE showing the AI integration in gameplay`

## Device-Specific Key Pairs

One of the biggest UX problems in blockchain apps is wallet pop-ups. Every action that touches the chain requires the user to approve a signature. For games where you make dozens of moves per session, this is unacceptable.

Our solution: delegated wallet signing. Non-financial transactions use a local device key pair — no wallet pop-ups for routine actions. Only financial transactions (transfers, minting) require explicit wallet approval.

- [Documentation](https://docs.paimastudios.com/home/multichain-support/wallet-layer/delegate-wallet/introduction)

`WRITE: Explain the delegation model in detail — what gets delegated, what doesn't, and why this is safe. How is the device key pair generated and stored?`

`INVESTIGATE: Can we show the Tarochi integration? Note: Tarochi is currently down`

`ADD VIDEO HERE demonstrating the delegation flow — show a user approving delegation once, then interacting freely`

## Social Login

For users who don't have a crypto wallet at all, we integrated social login via the [thirdweb SDK](https://thirdweb.com/). This gives applications access to multiple authentication methods under a single SDK:

- In-memory wallets (free tier)
- Social login (email, Google, etc.)
- Multiple wallet providers

Users sign in with their email or social account once, then interact with the blockchain seamlessly — no wallet extension required.

- [Documentation](https://docs.paimastudios.com/home/multichain-support/wallet-layer/introduction)

`WRITE: Why we picked thirdweb — multiple wallet types under one SDK, free in-memory option, competitive paid social login tier. Compare briefly to alternatives.`

`BUILD DEMO: Need a working demo showing social login → game interaction`

`ADD VIDEO HERE`

## Biometric Authentication

`INVESTIGATE: What work by Lucas exists? Is there an implementation?`

The concept: use FaceID on iOS or Android's standard biometric authentication to sign blockchain transactions. Biometrics become another key source for the delegated key pair — combining the security of biometric verification with the convenience of automatic signing.

`DECISION: Can we demonstrate this? What's the current state of the implementation?`

`WRITE: How biometrics fit into the delegation model — another key source for the delegated key pair. What's the security model?`

`ADD VIDEO HERE if available`

## Conclusion

`WRITE: Together, these features remove the biggest UX barriers to blockchain adoption. A new user can sign in with their email (social login), approve delegation once (device key pairs), and then play a game with AI opponents (Shinkai Visor) — all without ever seeing a wallet pop-up or understanding what a private key is.`

`ADD VIDEO HERE: Close-out showing the full flow from social login to gameplay`
