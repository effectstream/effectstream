/* @name insertStateMachineInput */
INSERT INTO custom.user_state_machine 
(inputs, block_height) 
VALUES 
(:inputs!, :block_height!) 
;

/* @name getStateMachineInput */
SELECT * FROM custom.user_state_machine
ORDER BY id ASC
;

/* @name getStateMachineInputByBlockHeight */
SELECT * FROM custom.user_state_machine
WHERE block_height = :block_height!
ORDER BY id ASC
;


/* @name getLastSumFromExampleTable */
SELECT sum FROM custom.another_example_table 
ORDER BY block_height DESC
LIMIT 1
;

/* @name insertSumIntoExampleTable */
INSERT INTO custom.another_example_table 
(sum, block_height) 
VALUES 
(:sum!, :block_height!) 
;