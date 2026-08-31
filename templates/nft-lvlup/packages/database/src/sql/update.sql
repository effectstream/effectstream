/*
  @name lvlUpCharacter
*/
UPDATE characters
SET
level = level + 1
WHERE nft_id = :nft_id! AND address = :address!;
