/* @name newAddress */
INSERT INTO addresses (address) 
VALUES (:address!); 

/* @name newAddressWithId */
INSERT INTO addresses (address, id) 
VALUES (:address!, :id!); 

/* @name newDelegation */
INSERT INTO delegations (from_id, to_id) 
VALUES (:from_id!, :to_id!);

/* @name getAddressFromId */
SELECT * FROM addresses
WHERE id = :id!;

/* @name getAddressFromAddress */
SELECT * FROM addresses
WHERE address = :address!;

/* @name getDelegation */
SELECT * FROM delegations
WHERE from_id = :from_id!
AND to_id = :to_id!;

/* @name getDelegationsFrom */
SELECT * FROM delegations
WHERE from_id = :from_id!;

/* @name getDelegationsFromWithAddress */
SELECT id, from_id, to_id, address as to_address FROM delegations
INNER JOIN addresses ON addresses.id = delegations.to_id
WHERE from_id = :from_id!;

/* @name getDelegationsTo */
SELECT * FROM delegations
WHERE to_id = :to_id!;

/* @name getDelegationsToWithAddress */
SELECT id, from_id, to_id, address as from_address FROM delegations
INNER JOIN addresses ON addresses.id = delegations.from_id
WHERE to_id = :to_id!;

/* @name deleteDelegationsFrom */
DELETE FROM delegations
WHERE from_id = :from_id!;

/* @name deleteDelegationTo */
DELETE FROM delegations
WHERE to_id = :to_id!
and from_id = :from_id!;

/* @name deleteAddress */
DELETE FROM addresses
WHERE address = :address!;

/* @name deleteAddressId */
DELETE FROM addresses
WHERE id = :id!;

/* @name updateAddress */
UPDATE addresses
SET address = :new_address!
WHERE address = :old_address!;

/* @name updateDelegateTo */
UPDATE delegations 
SET to_id = :new_to!
WHERE to_id = :old_to!;

/* @name updateDelegateFrom */
UPDATE delegations 
SET from_id = :new_from!
WHERE from_id = :old_from! 
AND to_id = :old_to!;

/* @name getMainAddressFromAddress */
select addr.id           as to_id, 
       addr.address      as to_address,
       main_addr.id      as from_id,      
       main_addr.address as from_address
from addresses addr
left join delegations         on delegations.to_id   = addr.id
left join addresses main_addr on delegations.from_id = main_addr.id
where addr.address = :address!
;

