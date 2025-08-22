/* @name newAddress */
INSERT INTO paima.addresses (address) 
VALUES (:address!);

/* @name newAddressWithId */
INSERT INTO paima.addresses (address, account_id) 
VALUES (:address!, :account_id!); 

/* @name newAccount */
INSERT INTO paima.accounts (primary_address) 
VALUES (:primary_address)
RETURNING id;

/* @name updateAddressAccount */
UPDATE paima.addresses
SET account_id = :account_id!
WHERE address = :address!;

/* @name removeAddressAccount */
UPDATE paima.addresses
SET account_id = NULL
WHERE address = :address!;

/* @name updatePrimaryAddress */
UPDATE paima.accounts
SET primary_address = :primary_address
WHERE id = :account_id!;

/* @name getAddressByAddress */
SELECT * FROM paima.addresses
WHERE address = :address!;

/* @name getAddressByAccountId */
SELECT * FROM paima.addresses
WHERE account_id = :account_id!;

/* @name getAccountById */
SELECT * FROM paima.accounts
WHERE id = :account_id!;

/* @name getAllAddresses */
SELECT 
    addresses.address as "address", 
    addresses.account_id as "account_id",
    accounts.primary_address as "primary_address"
FROM paima.addresses
LEFT JOIN paima.accounts ON paima.accounts.primary_address = paima.addresses.address
WHERE
    -- This clause is for the first page fetch when no cursor is provided
    (:after_account_id::INT IS NULL AND :after_address::TEXT IS NULL)
    OR
    (
        -- Case 1: The current row's account_id is "greater" than the cursor's.
        -- This handles two sub-cases:
        -- a) regular greater-than (e.g., 5 > 4)
        -- b) current is NULL but cursor is NOT NULL (since NULLS sort LAST)
        (addresses.account_id > :after_account_id::INT) OR (addresses.account_id IS NULL AND :after_account_id::INT IS NOT NULL)
    )
    OR
    (
        -- Case 2: The account_ids are equivalent, so we compare by the tie-breaker (address).
        -- This handles two sub-cases for equivalence:
        -- a) they are equal and not null (e.g., 5 = 5)
        -- b) they are both null
        (addresses.account_id = :after_account_id::INT OR (addresses.account_id IS NULL AND :after_account_id::INT IS NULL))
        AND
        (addresses.address > :after_address::TEXT)
    )
ORDER BY addresses.account_id ASC NULLS LAST, addresses.address ASC
LIMIT COALESCE(:limit, 1000);

/* @name getAllAddressesCount */
SELECT COUNT(*) as total
FROM paima.addresses;
