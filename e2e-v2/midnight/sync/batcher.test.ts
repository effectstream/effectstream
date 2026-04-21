import { assert } from "@e2e-v2/engine";
import { AddressType } from "@effectstream/utils";
import { ENV } from "@effectstream/utils/node-env";

const BATCHER_URL = `http://localhost:${ENV.getNumber("BATCHER_PORT", 3334)}`;

async function sendMintToBatcher(
  amount: number | string,
  confirmationLevel: string = "no-wait",
): Promise<number> {
  const account = {
    is_left: true,
    left: {
      bytes: "0x00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
    },
    right: {
      bytes: "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  };
  const input = JSON.stringify({
    circuit: "mint",
    args: [account, amount],
  });
  const body = {
    data: {
      target: "midnight_eip20",
      address: "placeholderaddress",
      addressType: AddressType.MIDNIGHT,
      input,
      timestamp: Date.now(),
    },
    confirmationLevel,
  };
  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok) {
    console.log("Mint sent to batcher successfully");
  } else {
    console.error("[ERROR] Sending mint to batcher:", result);
  }
  return response.status;
}

export async function batcherTest(): Promise<void> {
  // Valid mint: expect 200.
  const statusOk = await sendMintToBatcher(20000);
  console.log("🪙 Correct mint sent to batcher, status:", statusOk);
  await assert("Midnight batcher: valid mint accepted (200)", () =>
    Promise.resolve(statusOk === 200));

  // Invalid input (not a number): expect 400.
  const statusBadInput = await sendMintToBatcher("not a number");
  console.log("🪙 Invalid mint input, status:", statusBadInput);
  await assert("Midnight batcher: invalid input rejected (400)", () =>
    Promise.resolve(statusBadInput === 400));

  // Unknown confirmation level: expect 400.
  const statusBadCL = await sendMintToBatcher(20000, "wrong-confirmation-level");
  console.log("🪙 Invalid confirmation level, status:", statusBadCL);
  await assert("Midnight batcher: bad confirmation level rejected (400)", () =>
    Promise.resolve(statusBadCL === 400));
}
