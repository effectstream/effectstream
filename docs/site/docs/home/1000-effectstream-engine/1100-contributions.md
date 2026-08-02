# Contributing to EffectStream

We welcome and appreciate contributions from the community! Whether you're fixing a bug, adding a new feature, or improving documentation, your help is valuable. This guide provides a simple, step-by-step process for submitting your changes.

## The Contribution Workflow
We use the standard "Fork & Pull Request" model for contributions.

* Fork the Repository
* Create a New Branch
* Make Your Changes
* Test Your Changes — see [Running the tests](#running-the-tests) below
* Commit & Push your Changes
* Open a Pull Request

In your PR description, please include:

* A clear explanation of what your changes do.
* The reason or why these changes are needed.
* Any relevant information for the reviewers.

Once you submit the Pull Request, our team will review your contribution, provide feedback if necessary, and merge it once it's ready. Thank you for helping to improve EffectStream

## Running the tests

### Unit tests

```bash
bun test ./packages
```

To run a single file, pass its path: `bun test packages/path/to/file.test.ts`.

### End-to-end tests

The e2e suites boot real local chains, so they run **serially** — the chain processes share ports and cannot overlap.

```bash
cd e2e && bun run runner.ts
```

There are eleven suites, each a directory under `e2e/`:

`evm`, `bitcoin`, `cardano`, `midnight`, `avail`, `celestia`, `near`, `solana`, `features`, `wallets` (the `wallets-ui` app), and `sync-repro`.

Pass suite names to run a subset, or exclude them with `DISABLE_<NAME>` environment variables:

```bash
bun run e2e/runner.ts celestia            # run only celestia
bun run e2e/runner.ts evm bitcoin         # run a subset
DISABLE_EVM=1 DISABLE_AVAIL=1 bun run e2e/runner.ts   # run everything except these
```

A failing suite is retried once by default; set `E2E_MAX_RETRIES` to change that.

:::warning Free the ports first
Always run `orchestrator stop` before starting the orchestrator again or launching the e2e tests, so ports from the previous run are released.
:::

## Editing package documentation

The pages under **Packages** are **generated** from each package's `README.md` by `docs/site/scripts/sync-package-readmes.ts`. Editing a file in `docs/site/docs/home/500-packages/**` directly will be silently overwritten the next time the site is built.

To change a package's documentation, edit its `README.md` and re-run the sync:

```bash
bun run --cwd docs/site sync-readmes
```

`bun run --cwd docs/site build` runs the sync automatically. A `--check` flag verifies the generated pages are current without writing, which is what CI uses.

## Publishing

Releases are cut by `.github/publish-bun.effectstream.ts`, which discovers every non-private, non-deprecated package under `packages/`, temporarily rewrites `workspace:*` dependencies to concrete versions, publishes, then restores them. It also runs automatically on a GitHub Release via `.github/workflows/release.yaml`.

It is **dry-run by default** — you must pass `--publish` for a real release.

```bash
bun run .github/publish-bun.effectstream.ts                      # dry run
bun run .github/publish-bun.effectstream.ts --publish            # real publish
```

| Flag | Effect |
| --- | --- |
| `--publish` | Perform a real publish instead of `bun publish --dry-run`. |
| `--release-version <ver>` | Validate a semver greater than the current root version, use it for the publish, and write it into the root `package.json`. |
| `--allow-uncommitted` | Skip the git-clean check. |
| `--allow-missing-readme` | Skip the per-package README presence and 400-character minimum check. |

To deprecate or unpublish a bad release, `unpublish-bun.effectstream.ts` in the repository root follows the same dry-run-by-default convention.

See [Versioning](../300-deployment/302-versioning.md) for how the shared version across all 38 packages is managed.

## Working on templates

Each template under `templates/` is an independent Bun monorepo, not part of the root workspace. A few shared files support them:

| File | Purpose |
| --- | --- |
| `templates/effectstream-template-guidelines.md` | The canonical template specification. All templates share one flat layout, where complexity is additive (more packages) rather than structural (deeper nesting). Read this before adding a template. |
| `templates/AGENTS.md` | Orientation for automated tooling working in this directory. |
| `templates/run-template-tests.ts` | Runs `bun run test` in each enabled template, serially, and prints a pass/fail summary. |
| `templates/update-packages.ts` | Bulk-updates the `@effectstream/*` dependency versions across templates. |
| `templates/check.sh` | Verifies the system dependencies a template needs are installed. |

```bash
bun run templates/run-template-tests.ts                     # every enabled template
bun run templates/run-template-tests.ts preorder shinkai-v2 # named templates only

bun run templates/update-packages.ts --version 0.102.0 --all-packages --dry-run
bun run templates/update-packages.ts --version 0.102.0 --all-packages --apply
```

`run-template-tests.ts` exports its `ENABLED` array so CI (`.github/ci-changes.ts`) can tell which templates a push actually affects; `--skip-disabled` makes a run exit 0 when the named templates are all disabled. `update-packages.ts` is dry-run unless you pass `--apply`.
