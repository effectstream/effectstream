import { expect, test } from "bun:test";
import { run } from "effection";
import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { NtpSyncState } from "../src/sync-protocols/ntp/state.ts";

const START_BLOCK_HEIGHT_PROVENANCE = Symbol.for(
  "@effectstream/config/start-block-height-provenance",
);

function ntpState(
  provenance: "latest" | "explicit",
  resolvedStart: number,
  liveTip: number,
) {
  const config = {
    networkType: ConfigNetworkType.NTP,
    syncProtocolType: ConfigSyncProtocolType.NTP_MAIN,
    network: {
      type: ConfigNetworkType.NTP,
      name: "clock",
      startTime: 0,
      blockTimeMS: 1_000,
    },
    syncProtocol: {
      type: ConfigSyncProtocolType.NTP_MAIN,
      name: "clock",
      startBlockHeight: resolvedStart,
      pollingInterval: 1_000,
      stepSize: 10,
    },
    primitives: [],
    [START_BLOCK_HEIGHT_PROVENANCE]: provenance,
  } as any;
  const fetcher = {
    getLatestPage: function* () {
      return liveTip;
    },
    intervalFromStart: (start: number) => ({ from: start, to: start + 9 }),
    previousInterval: (start: number) => ({ from: start - 10, to: start - 1 }),
    nextInterval: (end: number) => ({ from: end + 1, to: end + 10 }),
  } as any;
  return new NtpSyncState(undefined as any, config, fetcher, undefined as any);
}

test("latest NTP includes H and leaves a racing H+1 for the same first page", async () => {
  const input = await run(() => ntpState("latest", 42, 43).stateToInput());
  expect(input).toEqual({ from: 42, to: 43, isPresync: false });
});

test("explicit numeric NTP preserves historical page-1 presync", async () => {
  const input = await run(() => ntpState("explicit", 42, 100).stateToInput());
  expect(input).toEqual({ from: 1, to: 10, isPresync: true });
});
