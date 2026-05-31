import { assert } from "../helpers.ts";
import { contractAddressesEvmMain } from "@dice/contracts-evm";

export async function deployTest() {
  await assert("EffectstreamL2 contract deployed with valid address", async () => {
    const addrs = contractAddressesEvmMain();
    const addr = addrs.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
    return addr !== undefined && addr.startsWith("0x") && addr.length === 42;
  });

  await assert("AccountNft (ERC721) deployed with valid address", async () => {
    const addrs = contractAddressesEvmMain();
    const addr = addrs.chain31337["AccountNft#AnnotatedMintNft"];
    return addr !== undefined && addr.startsWith("0x") && addr.length === 42;
  });
}
