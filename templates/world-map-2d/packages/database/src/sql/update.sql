/* @name updateWorldStateCounter */
UPDATE global_world_state
SET counter = counter + 1
WHERE can_visit = TRUE 
AND x = :x!
AND y = :y! 
;

/* @name updateWorldStateVisit */
UPDATE global_world_state
SET can_visit = :can_visit!
AND x = :x!
AND y = :y! 
;

/* @name updateUserGlobalPosition */
UPDATE global_user_state
SET 
x = :x!,
y = :y!
WHERE wallet = :wallet!
;
