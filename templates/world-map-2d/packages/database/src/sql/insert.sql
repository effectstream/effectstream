/*
  @name createGlobalWorldState
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
  @name createGlobalUserState
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
