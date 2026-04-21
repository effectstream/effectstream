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

Package Version is the System Version.\
Version in root `deno.json` must be kept in sync with `system-version.ts`, as we
cannot read this file from the executing engine.

### Deno JSR

At the time JSR requires to bundle assets in TS. This is automatically applied
when the Pgtyped is called

```
deno task pgtyped:update
```

generate assets.ts from packages/node-sdk/db directory

```
rm ./migrations/assets.ts && deno run --allow-read jsr:@codemonument/asset-builder --import-file assets-config.json  >> ./migrations/assets.ts
```
