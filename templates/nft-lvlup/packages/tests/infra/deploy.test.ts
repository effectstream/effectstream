import { assert } from "../helpers.ts";
import { contractAddressesEvmMain } from "@nft-lvlup/contracts-evm";

function isAddr(addr: string | undefined): boolean {
  return addr !== undefined && addr.startsWith("0x") && addr.length === 42;
}

export async function deployTest() {
  await assert("EffectstreamL2 contract deployed with valid address", async () => {
    const addrs = contractAddressesEvmMain();
    return isAddr(addrs.chain31337["EffectstreamL2Module#MyEffectstreamL2"]);
  });

  await assert("CharacterNft (ERC721) deployed with valid address", async () => {
    const addrs = contractAddressesEvmMain();
    return isAddr(addrs.chain31337["Character#CharacterNft"]);
  });

  await assert("Native character sale proxy deployed", async () => {
    const addrs = contractAddressesEvmMain();
    return isAddr(addrs.chain31337["Character#NativeCharacterSaleProxy"]);
  });

  await assert("ERC20 character sale proxy deployed", async () => {
    const addrs = contractAddressesEvmMain();
    return isAddr(addrs.chain31337["Character#Erc20CharacterSaleProxy"]);
  });

  await assert("Character payment ERC20 deployed", async () => {
    const addrs = contractAddressesEvmMain();
    return isAddr(addrs.chain31337["Character#CharacterPaymentToken"]);
  });
}
