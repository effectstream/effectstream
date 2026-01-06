import { buildModule } from "@nomicfoundation/ignition-core";
import type { IgnitionModuleBuilder } from '@nomicfoundation/ignition-core';

const L2Module = buildModule('L2Contract', m => {
  // https://github.com/NomicFoundation/hardhat-ignition/issues/673
  const l2Contract = m.contract('PaimaL2Contract', [m.getAccount(0), 1]);
  return { l2Contract };
});

function createNftAndProxy(m: IgnitionModuleBuilder) {
  // This address is the owner of the ProxyAdmin contract,
  // so it will be the only account that can upgrade the proxy when needed.
  // https://github.com/NomicFoundation/hardhat-ignition/issues/673
  const proxyAdminOwner = m.getAccount(0);

  const name = m.getParameter('name');
  const ticker = m.getParameter('ticker');
  const nftContract = m.contract('AnnotatedMintNft', [
    name,
    ticker,
    1_000_000_000,
    proxyAdminOwner,
  ]);
  // https://github.com/NomicFoundation/hardhat-ignition/issues/672
  // const baseUri = m.getParameter('baseUri');
  // m.call(nftContract, 'setBaseUri', [baseUri]);

  const nftSaleContract = m.contract('NativeNftSale', []);

  // https://github.com/NomicFoundation/hardhat-ignition/issues/672
  const price = m.getParameter('price');
  m.call(nftSaleContract, 'updatePrice', [price]);

  const nftSaleProxyContract = m.contract('NativeNftSaleProxy', [
    nftSaleContract,
    proxyAdminOwner,
    nftContract,
    price,
  ]);

  // make that the NFT can be bought through the sale contract (and only the sale contract)
  m.call(nftContract, 'setMinter', [nftSaleProxyContract]);

  return { nftContract, nftSaleProxyContract };
}

const accountModule = buildModule('AccountNft', m => {
  const result = createNftAndProxy(m);
  return {
    accountNftContract: result.nftContract,
    accountNftSaleProxyContract: result.nftSaleProxyContract,
  };
});

export default buildModule('deploy', m => {
  // https://github.com/NomicFoundation/hardhat-ignition/issues/675
  return {
    ...m.useModule(L2Module),
    ...m.useModule(accountModule),
  };
});
