/* @name getUserStats */
SELECT * FROM global_user_state
WHERE wallet = :wallet
;

/* @name getWorldStats */
SELECT * FROM global_world_state
WHERE x = :x AND y = :y
;

/* @name getAllWorldStats */
SELECT * FROM global_world_state
WHERE can_visit = TRUE
;