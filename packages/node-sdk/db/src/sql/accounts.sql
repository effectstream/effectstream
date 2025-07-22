/* @name newAddress */
INSERT INTO addresses (address) 
VALUES (:address!);

/* @name newAddressWithId */
INSERT INTO addresses (address, account_id) 
VALUES (:address!, :account_id!); 

/* @name newAccount */
INSERT INTO accounts (primary_address) 
VALUES (:primary_address)
RETURNING id;

/* @name updateAddressAccount */
UPDATE addresses
SET account_id = :account_id!
WHERE address = :address!;

/* @name removeAddressAccount */
UPDATE addresses
SET account_id = NULL
WHERE address = :address!;

/* @name updatePrimaryAddress */
UPDATE accounts
SET primary_address = :primary_address
WHERE id = :account_id!;

/* @name getAddressByAddress */
SELECT * FROM addresses
WHERE address = :address!;

/* @name getAddressByAccountId */
SELECT * FROM addresses
WHERE account_id = :account_id!;

/* @name getAccountById */
SELECT * FROM accounts
WHERE id = :account_id!;

/* @name getAllAddresses */
SELECT 
    addresses.address as "address", 
    addresses.account_id as "account_id",
    accounts.primary_address as "primary_address"
FROM addresses
LEFT JOIN accounts ON accounts.primary_address = addresses.address
ORDER BY addresses.account_id;
