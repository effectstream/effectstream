/* @name getERC20BalanceA */
SELECT primitive_name, address, balance
FROM primitives.erc20_balances_view_aribitrum_token;

/* @name getERC20BalanceB */
SELECT primitive_name, address, balance
FROM primitives.erc20_balances_view_eth_l1_erc20;

/* @name getERC721OwnershipA */
SELECT primitive_name, token_id, current_owner
FROM primitives.erc721_ownership_view_arbitrum_erc721;

/* @name getERC721OwnershipB */
SELECT primitive_name, token_id, current_owner
FROM primitives.erc721_ownership_view_l1_erc721_token;