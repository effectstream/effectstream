import { test, expect } from "bun:test";
import { accountMessages } from "./delegate.ts";
import type { WalletAddress } from "@effectstream/utils/types";

const MOCK_ADDRESS = "0x1234567890123456789012345678901234567890" as WalletAddress;
const MOCK_ADDRESS_2 = "0x0987654321098765432109876543210987654321" as WalletAddress;

test("accountMessages.linkAccount - formats correctly", () => {
  const msg = accountMessages.linkAccount(1, MOCK_ADDRESS, true);
  expect(msg).toEqual(`link:1:${MOCK_ADDRESS}:true`);
});

test("accountMessages.linkAccount - formats correctly with false", () => {
    const msg = accountMessages.linkAccount(1, MOCK_ADDRESS, false);
    expect(msg).toEqual(`link:1:${MOCK_ADDRESS}:false`);
});

test("accountMessages.unlinkAccountWithPrimary - formats correctly without new primary", () => {
    const msg = accountMessages.unlinkAccountWithPrimary(1, MOCK_ADDRESS);
    expect(msg).toEqual(`unlink:1:${MOCK_ADDRESS}:`);
});

test("accountMessages.unlinkAccountWithPrimary - formats correctly with new primary", () => {
    const msg = accountMessages.unlinkAccountWithPrimary(1, MOCK_ADDRESS, MOCK_ADDRESS_2);
    expect(msg).toEqual(`unlink:1:${MOCK_ADDRESS}:${MOCK_ADDRESS_2}`);
});
