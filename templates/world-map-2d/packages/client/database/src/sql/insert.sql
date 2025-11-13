/* 
  @name create_global_world_state
*/
INSERT INTO global_world_state (
  x,
  y,
  can_visit
) VALUES (
 :x!,
 :y!,
 :can_visit!
) 
ON CONFLICT(x, y)
DO NOTHING;

/* 
  @name create_global_user_state
*/
INSERT INTO global_user_state (
  wallet, 
  x,
  y
) VALUES (
  :wallet!,
  :x!,
  :y!
)
ON CONFLICT (wallet)
DO NOTHING;
