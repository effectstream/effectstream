import { assert } from "../helpers.ts";

export async function deployTest() {
  await assert("contractAddressesEvmMain() has valid addresses", async () => {
    const mod = await import("@chess-v2/contracts-evm");
    const addresses = (mod as any).contractAddressesEvmMain();
    const chain31337 = addresses?.chain31337;
    if (!chain31337) return false;
    const l2Addr = chain31337["EffectstreamL2Module#MyEffectstreamL2"];
    return typeof l2Addr === "string" && l2Addr.startsWith("0x");
  });
}
