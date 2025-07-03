/* @name insertStateMachineInput */
INSERT INTO paima_state_machine 
(inputs, block_height) 
VALUES 
(:inputs!, :block_height!) 
;

/* @name getStateMachineInput */
SELECT * FROM paima_state_machine 
;

/* @name getStateMachineInputByBlockHeight */
SELECT * FROM paima_state_machine 
WHERE block_height = :block_height!
;
