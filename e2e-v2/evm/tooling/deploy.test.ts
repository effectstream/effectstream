import { assert } from "@e2e-v2/engine";
import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";

export async function deployTest() {
  await assert("ERC20 contract deployed on chain 31337", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31337["EffectstreamErc20DevModule#EffectstreamErc20Dev"];
    return addr !== undefined && addr.startsWith("0x");
  });

  await assert("ERC721 contract deployed on chain 31337", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31337["Erc721DevModule#Erc721Dev"];
    return addr !== undefined && addr.startsWith("0x");
  });

  await assert("EffectstreamL2 contract deployed on chain 31337", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31337["EffectstreamL2ContractModule#MyEffectstreamL2Contract"];
    return addr !== undefined && addr.startsWith("0x");
  });

  await assert("Counter contract deployed on chain 31337", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31337["CounterModule#Counter"];
    return addr !== undefined && addr.startsWith("0x");
  });

  await assert("ERC1155 contract deployed on chain 31337", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31337["Erc1155DevModule#ERC1155Dev"];
    return addr !== undefined && addr.startsWith("0x");
  });

  await assert("ERC20 contract deployed on chain 31338", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31338["EffectstreamErc20DevModule#EffectstreamErc20Dev"];
    return addr !== undefined && addr.startsWith("0x");
  });

  await assert("ERC721 contract deployed on chain 31338", async () => {
    const addresses = contractAddressesEvmMain();
    const addr = addresses.chain31338["Erc721DevModule#Erc721Dev"];
    return addr !== undefined && addr.startsWith("0x");
  });
}
