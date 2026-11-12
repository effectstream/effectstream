import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { ConfigNetworkType, ConfigSyncProtocolType } from "../src/mod.ts";
import { networkTypes } from "../src/schema/network/all.ts";
import { parallelSyncProtocolTypes } from "../src/schema/sync-protocols/all.ts";
import { SyncProtocolToNetwork } from "../src/schema/sync-protocols/types.ts";
import { caip2PrefixFor } from "../src/schema/network/utils.ts";

const hash = (n: string) => `0x${n.repeat(64)}`;
const ckbNetwork = {
  name: "devnet",
  type: ConfigNetworkType.CKB,
  rpcUrl: "http://127.0.0.1:8114",
  network: "devnet",
  genesisBlockHash: hash("0"),
};
const ckbProtocol = {
  name: "ckb-events",
  type: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
  startBlockHeight: 0,
  stopBlockHeight: null,
  pollingInterval: 1_000,
  requestTimeoutMs: 15_000,
  confirmationDepth: 6,
  reorgWindow: 24,
  targetScript: {
    role: "lock",
    script: { codeHash: hash("a"), hashType: "type", args: "0x1234" },
  },
  delayMs: 1_000,
  stepSize: 25,
};

test("CKB is registered as a network and parallel protocol with a genesis-bound namespace", () => {
  expect(Value.Check(networkTypes[ConfigNetworkType.CKB].allProperties(true), ckbNetwork)).toBe(true);
  expect(Value.Check(parallelSyncProtocolTypes[ConfigSyncProtocolType.CKB_RPC_PARALLEL].allProperties(true), ckbProtocol)).toBe(true);
  expect(SyncProtocolToNetwork[ConfigSyncProtocolType.CKB_RPC_PARALLEL]).toBe(ConfigNetworkType.CKB);
  expect(caip2PrefixFor(ckbNetwork as any)).toBe(`ckb:${hash("0").slice(2)}`);
  expect(caip2PrefixFor({ ...ckbNetwork, genesisBlockHash: `0x${"0".repeat(32)}${"1".repeat(32)}` } as any))
    .not.toBe(caip2PrefixFor(ckbNetwork as any));
});

test("CKB rejects malformed identity, unsupported network names, and invalid scripts", () => {
  expect(Value.Check(networkTypes[ConfigNetworkType.CKB].allProperties(true), {
    ...ckbNetwork,
    genesisBlockHash: "0x1234",
  })).toBe(false);
  expect(Value.Check(networkTypes[ConfigNetworkType.CKB].allProperties(true), {
    ...ckbNetwork,
    network: "preview",
  })).toBe(false);
  expect(Value.Check(parallelSyncProtocolTypes[ConfigSyncProtocolType.CKB_RPC_PARALLEL].allProperties(true), {
    ...ckbProtocol,
    targetScript: { ...ckbProtocol.targetScript, script: { ...ckbProtocol.targetScript.script, hashType: "data3" } },
  })).toBe(false);
});
