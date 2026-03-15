import { test, expect } from "bun:test";
import {
  AddressType,
  type TimestampMsStr,
  type WalletAddress,
} from "@effectstream/utils";
import {
  createBatcherSubunit,
  createMessageForBatcher,
  hashBatchSubunit,
} from "./batcher.ts";

const MOCK_ADDRESS = "0x1234567890123456789012345678901234567890" as WalletAddress;
const MOCK_TIMESTAMP = "1234567890000" as TimestampMsStr;
const MOCK_SIGNATURE = "0xsignature";
const MOCK_INPUT = "some-input";

test("createBatcherSubunit - creates valid subunit for EVM", () => {
  const subunit = createBatcherSubunit(
    MOCK_TIMESTAMP,
    MOCK_ADDRESS,
    AddressType.EVM,
    MOCK_SIGNATURE,
    MOCK_INPUT
  );

  expect(subunit.addressType).toEqual(AddressType.EVM);
  expect(subunit.address).toEqual(MOCK_ADDRESS);
  expect(subunit.signature).toEqual(MOCK_SIGNATURE);
  expect(subunit.input).toEqual(MOCK_INPUT);
  expect(subunit.timestamp).toEqual(MOCK_TIMESTAMP);
});

test("createBatcherSubunit - throws for unsupported address type", () => {
  expect(
    () => {
      createBatcherSubunit(
        MOCK_TIMESTAMP,
        MOCK_ADDRESS,
        999 as AddressType, // Unsupported type
        MOCK_SIGNATURE,
        MOCK_INPUT
      );
    },
  ).toThrow("Unsupported address type");
});

test("createMessageForBatcher - creates valid message", () => {
  const msg = createMessageForBatcher(
    "namespace",
    MOCK_TIMESTAMP,
    MOCK_ADDRESS,
    AddressType.EVM,
    MOCK_INPUT
  );

  expect(typeof msg).toEqual("string");
  expect(msg.includes("namespace")).toEqual(true);
  expect(msg.includes(MOCK_INPUT.toLowerCase())).toEqual(true);
});

test("hashBatchSubunit - returns hash starting with 0x", () => {
   const subunit = createBatcherSubunit(
    MOCK_TIMESTAMP,
    MOCK_ADDRESS,
    AddressType.EVM,
    MOCK_SIGNATURE,
    MOCK_INPUT
  );

  const hash = hashBatchSubunit(subunit);
  expect(hash.startsWith("0x")).toEqual(true);
  expect(hash.length > 10).toEqual(true);
});

test("hashBatchSubunit - throws for unsupported address type", () => {
    const subunit = {
        addressType: 999 as AddressType,
        address: MOCK_ADDRESS,
        signature: MOCK_SIGNATURE,
        input: MOCK_INPUT,
        timestamp: MOCK_TIMESTAMP
    };

    expect(() => hashBatchSubunit(subunit)).toThrow("Unsupported address type");
});
