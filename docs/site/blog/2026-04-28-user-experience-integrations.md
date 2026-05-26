---
slug: user-experience-integrations
title: "AI-Powered Gameplay: Integrating Deterministic LLMs with On-Chain Games"
authors: [effectstream]
tags: [ai, shinkai, wallets, game-templates]
---

What happens when you put an AI engine inside an on-chain game? Not a cloud API call that could return different results each time, but a deterministic LLM that runs locally and produces verifiable, reproducible outputs. We integrated [Shinkai](https://shinkai.com/), a deterministic LLM engine, into an EffectStream game template to find out.

<!-- truncate -->

## The determinism problem

Standard LLM APIs (OpenAI, Anthropic, etc.) are non-deterministic: the same prompt can produce different outputs on each call. For off-chain apps that's fine, but on-chain games need reproducibility. If a game's state machine processes an AI response, every node running that state machine must produce the same result. Non-deterministic AI breaks consensus.

Shinkai solves this by running models locally with deterministic inference. Same input, same output, every time. That makes it compatible with on-chain state machines where every participant must agree on the result.

## Quest for Tokens: AI NPC gameplay

To show what AI-powered on-chain gameplay looks like, we built **Quest for Tokens**, a game where an AI NPC judges player answers and awards tokens based on response quality.

<iframe width="100%" height="415" src="https://www.youtube.com/embed/QZkM4W8Md-E" title="Quest for Tokens: AI-powered on-chain gameplay" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

![Quest for Tokens: title screen with floating castle and "Enter the Kingdom"](/img/blog/taiko1.png)

Here's the game flow:

1. The player enters the game world and encounters an AI NPC (a tiger guardian)
2. The NPC asks a question, drawn from game state so it varies based on context
3. The player types their answer
4. The AI evaluates the response and decides how many tokens to award

![AI gameplay: tiger NPC asking a question with wallet signature popup](/img/blog/taiko2.png)

The wallet signature popup in the screenshot shows the on-chain integration. The player's answer is signed and submitted as a blockchain transaction. The AI's evaluation is also processed on-chain, so the token award is verifiable and permanent.

![AI NPC response: evaluating the player's answer and awarding tokens](/img/blog/taiko3.png)

The AI doesn't just give a score; it explains its reasoning. Players can see why their answer earned or lost tokens, which creates an engaging feedback loop that feels more like a conversation than a multiple-choice quiz.

- [Play live](https://tokenquest.zkdojo.com/)
- [Template code](https://github.com/effectstream/effectstream/tree/v-next/templates/shinkai-v2)

## Why this matters for on-chain games

AI NPCs open up game mechanics that weren't possible with deterministic-only logic:

- **Dynamic content** - AI generates questions, dialog, and scenarios that vary with game state; no two playthroughs are the same
- **Natural interaction** - players type freeform responses instead of picking from a menu; the AI parses intent and evaluates quality
- **Emergent gameplay** - the AI's judgment creates situations that the game designer didn't explicitly program

And because Shinkai's inference is deterministic, all of this works in an on-chain context. Every node processing the game state gets the same AI output, maintaining consensus across the network.

## The integration architecture

Three systems connect together:

| Component | Role |
|-----------|------|
| **EffectStream** | Game state machine: processes moves, tracks tokens, manages the game world |
| **Shinkai** | Deterministic LLM engine: evaluates player inputs and generates NPC responses |
| **Blockchain** | Settlement layer: records player actions and token awards permanently |

The player's input flows from the browser → wallet signature → blockchain transaction → EffectStream state machine → Shinkai evaluation → state update → token award. The entire pipeline is on-chain and verifiable.

## Wallet and session management

The game uses EffectStream's [`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets) package for wallet connections. Players connect their wallet to sign game actions, with the option of auto-sign delegation for a smoother experience (no wallet popup on every move).

The wallet layer supports multiple chains, so the same game template could run on EVM, Cardano, or Midnight. The AI integration and game logic stay the same no matter which settlement chain you pick.

## Building AI-powered games

Quest for Tokens is a starting point. The template has the full pipeline from AI evaluation to on-chain settlement. Fork it and customize the AI's evaluation criteria, the reward structure, the game context (what the NPC asks), and the NPC personality. The [game templates repository](https://github.com/PaimaStudios/paima-game-templates) has the full source code, ready to deploy.
