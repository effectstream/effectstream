#! /bin/bash
deno test packages/effectstream-sdk/crypto/
deno test packages/effectstream-sdk/utils/
deno test packages/effectstream-sdk/config/
deno test packages/effectstream-sdk/concise/
deno test --allow-env packages/effectstream-sdk/wallets/
deno test packages/batcher/
deno test --allow-env packages/node-sdk/db/src/pg-connection.test.ts
deno test --allow-env --allow-read packages/node-sdk/sm/
