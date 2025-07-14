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
