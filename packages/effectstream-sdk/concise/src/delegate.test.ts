import { assertEquals } from "jsr:@std/assert";
import { accountMessages } from "./delegate.ts";
import type { WalletAddress } from "@effectstream/utils";

const MOCK_ADDRESS = "0x1234567890123456789012345678901234567890" as WalletAddress;
const MOCK_ADDRESS_2 = "0x0987654321098765432109876543210987654321" as WalletAddress;

Deno.test("accountMessages.linkAccount - formats correctly", () => {
  const msg = accountMessages.linkAccount(1, MOCK_ADDRESS, true);
  assertEquals(msg, `link:1:${MOCK_ADDRESS}:true`);
});

Deno.test("accountMessages.linkAccount - formats correctly with false", () => {
    const msg = accountMessages.linkAccount(1, MOCK_ADDRESS, false);
    assertEquals(msg, `link:1:${MOCK_ADDRESS}:false`);
});

Deno.test("accountMessages.unlinkAccountWithPrimary - formats correctly without new primary", () => {
    const msg = accountMessages.unlinkAccountWithPrimary(1, MOCK_ADDRESS);
    assertEquals(msg, `unlink:1:${MOCK_ADDRESS}:`);
});

Deno.test("accountMessages.unlinkAccountWithPrimary - formats correctly with new primary", () => {
    const msg = accountMessages.unlinkAccountWithPrimary(1, MOCK_ADDRESS, MOCK_ADDRESS_2);
    assertEquals(msg, `unlink:1:${MOCK_ADDRESS}:${MOCK_ADDRESS_2}`);
});

