# Solidity Contracts

Solidity contracts provided as part of Effectstream.

Core contracts

<ul>
  <li>[PaimaL2Contract](#PaimaL2Contract): The main L2 contract for a Effectstream L2.</li>
</ul>
State-annotated contracts
<ul>
  <li>[AnnotatedMintNft](#AnnotatedMintNft): A standard ERC721 that accepts calldata in the mint function for any initialization data needed in a Effectstream dApp.</li>
  <li>[InverseBaseProjectedNft](#InverseBaseProjectedNft): Project game state into a ERC721 NFT on an EVM layer initiated on said base layer.</li>
  <li>[InverseAppProjectedNft](#InverseAppProjectedNft): Project game state into a ERC721 NFT on an EVM layer initiated on the app layer.</li>
  <li>[InverseBaseProjected1155](#InverseBaseProjected1155): Project game state into a ERC1155 on an EVM layer initiated on said base layer.</li>
  <li>[InverseAppProjected1155](#InverseAppProjected1155): Project game state into a ERC1155 on an EVM layer initiated on the app layer.</li>
</ul>
Facilitating monetization
<ul>
  <li>[NativeNftSale](#NativeNftSale): Facilitates selling NFTs that accepts extra data when buying for any initialization data needed in a Effectstream dApp.</li>
  <li>[GenericPayment](#GenericPayment): Facilitates accepting payment that accepts extra data to know what the payment was for inside a Effectstream dApp.</li>
  <li>[Erc20NftSale](#Erc20NftSale): Facilitates selling NFTs for specific ERC20s that accepts extra data when buying for any initialization data needed in a Effectstream dApp.</li>
  <li>[OrderbookDexProxy](#OrderbookDexProxy): Proxy for the orderbook DEX contract.</li>
  <li>[IOrderbookDex](#IOrderbookDex): Interface to facilitate trading inverse projected ERC1155 tokens.</li>
  <li>[OrderbookDex](#OrderbookDex): Facilitates trading inverse projected ERC1155 tokens.</li>
</ul>

## Core contracts

{{PaimaL2Contract}}

## State-annotated contracts

{{AnnotatedMintNft}}

{{IInverseProjectedNft}} {{IInverseBaseProjectedNft}}
{{InverseBaseProjectedNft}} {{IInverseAppProjectedNft}}
{{InverseAppProjectedNft}}

{{IInverseProjected1155}} {{IInverseBaseProjected1155}}
{{InverseBaseProjected1155}} {{IInverseAppProjected1155}}
{{InverseAppProjected1155}}

## Facilitating monetization

{{NativeNftSale}}

{{GenericPayment}}

{{Erc20NftSale}}

{{OrderbookDexProxy}}

{{IOrderbookDex}}

{{OrderbookDex}}

## Utilities

{{BaseState}}

{{State}}

{{IERC4906Agnostic}} {{ERC1967}}

{{IUri}} {{ITokenUri}}

{{NativeNftSaleProxy}}

{{GenericPaymentProxy}}

{{Erc20NftSaleProxy}}
