/* @name insertStateMachineInput */
INSERT INTO user_state_machine 
(inputs, block_height) 
VALUES 
(:inputs!, :block_height!) 
;

/* @name getStateMachineInput */
SELECT * FROM user_state_machine 
;

/* @name getStateMachineInputByBlockHeight */
SELECT * FROM user_state_machine 
WHERE block_height = :block_height!
;

/* @name getLastSumFromExampleTable */
SELECT sum FROM another_example_table 
ORDER BY block_height DESC
LIMIT 1
;

/* @name insertSumIntoExampleTable */
INSERT INTO another_example_table 
(sum, block_height) 
VALUES 
(:sum!, :block_height!) 
;

