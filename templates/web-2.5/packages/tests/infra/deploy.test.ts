import { assert } from "../helpers.ts";
import { contractAddressesEvmMain } from "@web-2.5/contracts-evm";

export async function deployTest() {
  await assert("EffectstreamL2 contract deployed with valid address", async () => {
    const addrs = contractAddressesEvmMain();
    const addr = addrs.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
    return addr !== undefined && addr.startsWith("0x") && addr.length === 42;
  });

  await assert("Batcher reachable on port 3334", async () => {
    try {
      const res = await fetch("http://localhost:3334/documentation/json");
      return res.ok;
    } catch {
      return false;
    }
  });
}
