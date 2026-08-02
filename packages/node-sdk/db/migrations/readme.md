# Effectstream DB Management

`System Migrations` create and update the DB structure to run with specific
versions of Effectstream.\
All migrations are applied that are <= than the current version.

> Note v0.0.0 is a special migration that gets applied once before the chain
> sync

### Migration Files

Files must be named as the version where they will be applied.\
E.g.,

- system-up-v-0.3.20
- system-up-v-1.0.0

### Version

`EFFECTSTREAM_ENGINE_VERSION` in `system-version.ts` is the System Version - it
decides which migrations get applied. It is hardcoded there because the engine
cannot read a package manifest at runtime, so it must be bumped by hand whenever
a migration for a new version is added.

### `assets.ts`

The `.sql` files in this directory are not readable at runtime once the package
is published, so they are inlined into `assets.ts` as base64. **`assets.ts` is
generated - never edit it by hand.** After adding or changing a `.sql` file,
list it in `../assets-config.json` (if new) and regenerate from the repo root:

```bash
bun run assets:generate
```

To verify the bundle matches the `.sql` sources without rewriting it:

```bash
bun run assets:check
```

The generator is [`scripts/generate-assets.ts`](../../../../scripts/generate-assets.ts).
It replaced `deno run jsr:@codemonument/asset-builder`, whose current versions
emit an import of `jsr:@std/encoding` that Bun cannot resolve. `assets:check`
also runs in CI, and `test/assets-bundle.test.ts` asserts each bundled entry
still matches its `.sql` file.
