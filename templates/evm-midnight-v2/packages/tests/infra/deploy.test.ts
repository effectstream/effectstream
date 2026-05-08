import { assert } from "../helpers.ts";

export async function deployTest() {
  await assert("contractAddressesEvmMain() has valid addresses", async () => {
    const mod = await import("@evm-midnight/contracts-evm");
    const addresses = (mod as any).contractAddressesEvmMain();
    const chain31337 = addresses?.chain31337;
    if (!chain31337) return false;
    const erc721Addr = chain31337["Erc721DevModule#Erc721Dev"];
    return typeof erc721Addr === "string" && erc721Addr.startsWith("0x");
  });
}
