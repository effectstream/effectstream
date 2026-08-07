# Template README

Every template MUST include a `README.md` at its root, and it is the **single source of
truth** for that template's documentation: the docs site generates the template's page from
it via `docs/site/scripts/sync-template-readmes.ts`. Never write a docs-site page for a
template by hand — write the README, register the template (below), and the page is
generated.

The authority on the format is `templates/README-FORMAT.md`. Read it before writing a
README. A validator in `sync-template-readmes.ts` enforces the structure — a README that
drifts from it fails `bun run --cwd docs/site sync-readmes:check` and CI. Reference
implementations: `templates/minimal/README.md`, `templates/chess-v2/README.md`.

## Required structure

Sections are required **in this exact order and casing** (the check is a case-sensitive
`indexOf`, so `## Quick Start` fails where `## Quick start` passes):

```markdown
# <Display Name>                       H1 = the template's display name → page title

> <One sentence, ≤160 chars.>          Blockquote directly under the H1 → page
                                       description + the index card's one-liner.
                                       Must stand alone when read in a list.

<Intro: one or two short paragraphs. No headings, no lists.>

## What this template shows            The one idea worth copying — why this template
                                       exists rather than being a variation of minimal.
                                       Name the mechanism, point at the file it lives in.

## Effectstream features used          Table with EXACTLY this header:
                                       | Feature | Where | Used for |
                                       Only rows actually true of this template.

## Quick start                         Prerequisites (if more than Bun), then the
                                       commands in one fenced block, then a
                                       Service | URL table taken from the orchestrator
                                       config — not assumed.

## Project structure                   Fenced tree of packages/* with one-line purposes.
                                       Only real directories.

## How it works                        The walkthrough. Subsections as needed (Grammar,
                                       State machine, Contracts, API, Database). Quote
                                       real code, name real files, trace the distinctive
                                       flow end to end.

## Configuration                       Env vars, target networks, pointing at a real
                                       chain. OMIT if nothing beyond defaults — the only
                                       omittable section.

## Testing                             How to run the tests and what they cover.

## Where to go next                    2–5 links: relevant docs pages + sibling
                                       templates that build on this one.
```

Prefer showing the template's own code over describing it — short excerpts, quoted
accurately. There is no length cap; conforming READMEs run 400–600 lines. Tables over
prose for structured data (services, env vars, grammar keys); second-person imperative.

## Rules the validator enforces

- **Every path must exist.** Paths are written relative to the template root
  (`packages/node/state-machine.ts`) and a path checker resolves them from there — both
  link targets and backticked paths in prose. Gitignored/generated paths (e.g.
  `packages/contracts-evm/mod.ts`, `build/`) are tolerated. For a path that is
  deliberately absent, declare it: `<!-- allow-missing: packages/node -->`.
- **Screenshots live in the template**, under `templates/<name>/docs/`, referenced
  relatively: `![Gameplay](./docs/gameplay.png)`. The sync script copies them next to the
  generated page and rewrites the link; a reference to a missing screenshot fails the
  check.
- **Docs links use full URLs** (`https://effectstream.github.io/docs/...`) so they work
  from GitHub and from the generated page. Other relative links are rewritten to GitHub
  blob/tree URLs — fine for pointing at files in the template.
- **Avoid `<http://…>` autolinks.** MDX parses them as JSX. The sync script expands them,
  but prefer plain markdown links.
- Assert nothing you have not checked: every port, script, endpoint and package name must
  match what `start.dev.ts` and the orchestrator actually configure.

## Registering a NEW template

A README alone is not enough — an unregistered template fails the docs check
("unregistered template(s)") and is silently never tested:

1. Add it to the `TEMPLATES` array in `docs/site/scripts/sync-template-readmes.ts` —
   `dir`, `slug`, `file` number, sidebar `position`, and `group`
   (start/multichain/game/chain/app).
2. Add it to the `ENABLED` array in `templates/run-template-tests.ts` (CI consumes this
   list too — the runner does NOT auto-discover templates).
3. Run `bun run --cwd docs/site sync-readmes:check` and fix until green.

## Legacy (@paimaexample) templates

A template whose `package.json` files still reference `@paimaexample` gets `draft: true`
on its generated page automatically — no flag to set, and migrating it publishes the page
on the next sync. Its README keeps the full structure above, and its Quick start opens
with the standard warning:

```markdown
> [!WARNING]
> This template still depends on the unpublished `@paimaexample/*` packages and **cannot be
> installed as-is**. It is kept as a reference implementation until it is migrated to
> `@effectstream/*`. The walkthrough below still describes how it works.
```
