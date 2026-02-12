#!/bin/bash
bun test \
  ./packages/effectstream-sdk/crypto/ \
  ./packages/effectstream-sdk/utils/ \
  ./packages/effectstream-sdk/config/ \
  ./packages/effectstream-sdk/concise/ \
  ./packages/effectstream-sdk/wallets/ \
  ./packages/batcher/ \
  ./packages/node-sdk/db/src/pg-connection.test.ts \
  ./packages/node-sdk/sm/
