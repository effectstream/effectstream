/* @name getUserCharacters */
SELECT * FROM characters
WHERE address = :address!
ORDER BY nft_id;

/* @name getCharacter */
SELECT * FROM characters
WHERE address = :address! AND nft_id = :nft_id!;

/* @name getCharacterByNftId */
SELECT * FROM characters
WHERE nft_id = :nft_id!;
