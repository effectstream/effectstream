# Template README format

Every template README follows this structure. It is the single source of truth for that
template: `docs/site/scripts/sync-template-readmes.ts` generates the template's page on the
docs site from this file, so anything written here is published, and anything published is
written here.

Companion documents:

- [`effectstream-template-guidelines.md`](./effectstream-template-guidelines.md) — how a
  template is *built* (layout, packages, orchestrator, migrations). This file is about how a
  template is *described*.
- [`AGENTS.md`](./AGENTS.md) — instructions for agents working inside a template.

## Rules

1. **Every section below is required, in this order.** Omit a section only when it genuinely
   does not apply (a template with no contracts has no contracts row) — never reorder.
2. **The H1 is the template's display name**, and the blockquote under it is a single
   sentence. The sync script strips both: the H1 becomes the page title, the blockquote the
   page description and the index card's one-liner. Keep the sentence under ~160 characters
   and make it stand alone — it is read in a list, away from this page.
3. **Assert nothing you have not checked.** Every path, port, script, endpoint, command and
   package name must exist. Paths are written relative to the template root
   (`packages/node/state-machine.ts`), because the generated page is anchored to the
   template directory and a path checker resolves them from there.
4. **Screenshots live in the template**, under `docs/`, and are referenced relatively
   (`![Gameplay](./docs/gameplay.png)`). The sync script copies them next to the generated
   page and rewrites the link, so the same markdown renders on GitHub and on the docs site.
5. **Prefer showing the template's own code** over describing it. Short excerpts, quoted
   accurately, beat paraphrase.
6. **Legacy templates still get a full README.** A template pinned to the unpublished
   `@paimaexample` scope cannot be installed, so its Quick start section carries the warning
   described below and the sync script marks its page as a draft automatically.

## Skeleton

```markdown
# <Display Name>

> <One sentence: what this template is and what it demonstrates.>

<One or two short paragraphs. What problem it solves, what a reader will learn from it,
and who it is for. No headings, no lists.>

## What this template shows

<The distinctive thing. Every template has one idea worth copying — the reason this
template exists rather than being a variation of `minimal`. Name it, explain why it is
done that way, and point at the file where it lives. Two or three paragraphs, or a short
bulleted list of the specific mechanisms. This is the most important section: it is what
makes the template worth reading rather than cloning blindly.>

## Effectstream features used

<A table mapping framework capability -> where this template uses it -> what for. Only
rows that are actually true of this template. This is what lets a reader scan the template
list and find the one that demonstrates the feature they need.>

| Feature | Where | Used for |
| --- | --- | --- |
| `@effectstream/sm` state machine | `packages/node/state-machine.ts` | ... |
| EVM sync via `PrimitiveTypeEVMEffectstreamL2` | `packages/node/config.dev.ts` | ... |
| Batcher (`@effectstream/batcher-sdk`) | `packages/batcher/` | ... |

## Quick start

<Prerequisites first when the template needs more than Bun — Foundry, the Compact
compiler, Docker, a Rust toolchain. Then the commands, in a single fenced block. Then the
local URLs as a table (Service | URL), taken from the orchestrator config and the
Dockerfile, not assumed.>

## Project structure

<A fenced tree of `packages/*` with a one-line purpose per entry. Only real directories.>

## How it works

<The walkthrough. Subsections as the template needs them — typical ones:>

### Grammar
### State machine
### Contracts
### API
### Database

<Quote real code. Name real files. If the template has a distinctive flow — an intent
being filled, a swap settling, a scheduled transition firing — trace it end to end here.>

## Configuration

<Environment variables the template reads, networks it targets, and how to point it at a
real network instead of the local stack. Omit when the template has none beyond defaults.>

## Testing

<How to run this template's tests, and what they cover.>

## Where to go next

<Two to five links: the docs pages most relevant to what this template demonstrates, and
sibling templates that build on it. Use full docs-site URLs (https://…) so the links work
from GitHub as well as from the generated page.>
```

## Legacy templates

A template that still depends on `@paimaexample/*` cannot be installed — that scope is no
longer published. Its README keeps the full structure above, and its Quick start section
opens with:

```markdown
> [!WARNING]
> This template still depends on the unpublished `@paimaexample/*` packages and **cannot be
> installed as-is**. It is kept as a reference implementation until it is migrated to
> `@effectstream/*`. The walkthrough below still describes how it works.
```

The sync script detects these by scanning the template's `package.json` files for the
`@paimaexample` scope and sets `draft: true` on the generated page, so they are excluded
from the published site. Migrating a template publishes its page automatically — no flag to
flip by hand.
