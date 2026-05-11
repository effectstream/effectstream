# Environment Variables

Environment variables are a powerful way to configure your EffectStream node.  
They are used to configure the different components of your node, such as the blockchains, databases, and services.
Setting them allows to have different runtime scripts for different environments.

## System Environments

> This is optional, but we recommend setting this pattern to allow for different runtime configurations for different environments.

* `EFFECTSTREAM_ENV` sets the `system environment`.
* `node:start:${EFFECTSTREAM_ENV}` should load the `main.{env}.ts` file.
* `.env.${EFFECTSTREAM_ENV}` is loaded automatically.
* Optionally `config.{env}.ts` can be created to load specific configuration for the environment, this file is imported by `main.{env}.ts`.

The main entry point for the node is located at: `/packages/client/node/deno.json`.  
For example, if you have 2 environments: `local` and `testnet`
```ts
{
    "name": "@my-project-name/node",
    "tasks": {
        "node:start:local": "deno run -A --inspect --unstable-raw-imports src/main.local.ts",
        "node:start:testnet": "deno run -A --inspect --unstable-raw-imports src/main.testnet.ts",

        "local": "EFFECTSTREAM_ENV=local NODE_ENV=development deno run -A --check --unstable-raw-imports scripts/start.local.ts",
        "testnet": "EFFECTSTREAM_ENV=testnet deno run -A --check --unstable-raw-imports scripts/start.testnet.ts",
        ...
    }
}
```

By running `deno task testnet`:
1. `.env.testnet` is loaded
2. `start.testnet.ts` is launch all the processes, once completed it will call `node:start:testnet`
> IMPORTANT: `node:start:testnet` must match the `EFFECTSTREAM_ENV=testnet` value.


## Reading ENV values

System default ENV are read by using
```ts
import { ENV } from "@effectstream/utils/node-env";

// For system defaults:
const host=ENV.DB_HOST;

// For custom envs in your .env.${EFFECTSTREAM_ENV} file:
const myCustomEnv=ENV.getString("MY_CUSTOM_ENV");

```

## Important ENV variables

| name | description |
|------|-------------|
| DB_HOST | EffectStream Engine Postgres Host URL. Default: 'localhost' |
| DB_NAME | EffectStream Engine Postgres Database Name. Default: 'postgres' |
| DB_PORT | EffectStream Engine Postgres Port. Default: '5432' |
| DB_PW   | EffectStream Engine Postgres Password. Default: 'postgres' |
| DB_USER | EffectStream Engine Postgres User. Default: 'postgres' |
