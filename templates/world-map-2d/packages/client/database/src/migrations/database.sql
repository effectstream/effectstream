-- world is Y by X matrix
--        0     1     2    X
--     |-----|-----|-----|
--  0  | 0,0 | 1,0 | 2,0 |
--  1  | 0,1 | 1,1 | 2,1 |
--  2  | 0,2 | 1,2 | 2,2 |
-- 
--  Y
-- 
CREATE TABLE global_world_state (
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  can_visit BOOLEAN NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (x, y)
);

CREATE TABLE global_user_state (
  wallet TEXT NOT NULL PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  FOREIGN KEY (x, y) REFERENCES global_world_state (x, y)
);
-- CREATE 10x10 Matrix for open world
--   
--     0 1 2 3 4 5 6 7 8 9
--  0  * * * * * * * * * * 
--  1  * * * * * * * * * * 
--  2  * * * * * * * * * *
--  3  * * * * * * * * * *
--  4  * * * * * * * * * *
--  5  * * * * * * * * * *
--  6  * * * * * * * * * *
--  7  * * * * * * * * * *
--  8  * * * * * * * * * *
--  9  * * * * * * * * * *
--


-- recall: migrations need to be repackaged with `npm run pack` when changed
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (0, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (1, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (2, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (3, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (4, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (5, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (6, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (7, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (8, 9, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 0, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 1, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 2, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 3, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 4, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 5, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 6, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 7, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 8, TRUE, 0);
INSERT INTO global_world_state (x, y, can_visit, counter) VALUES (9, 9, TRUE, 0);
