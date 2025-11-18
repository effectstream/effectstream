/* @name insertStateMachineInput */
INSERT INTO user_state_machine 
(inputs, block_height) 
VALUES 
(:inputs!, :block_height!) 
;

/* @name getStateMachineInput */
SELECT * FROM user_state_machine
ORDER BY id ASC
;

/* @name getStateMachineInputByBlockHeight */
SELECT * FROM user_state_machine
WHERE block_height = :block_height!
ORDER BY id ASC
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

/* @name insertAvailMessage */
INSERT INTO avail_messages 
(message, height) 
VALUES 
(:message!, :height!) 
;

/* @name getLatestAvailMessage */
SELECT * FROM avail_messages 
ORDER BY height DESC
LIMIT 1
;

/* @name insertCounterInput */
INSERT INTO counter_inputs
(counter, block_height) 
VALUES 
(:counter!, :block_height!) 
;

/* @name insertBitcoinTransaction */
INSERT INTO bitcoin_transactions
(block_height, direction, address, transaction_id, index, value_sats, utxo_txid, utxo_vout, label)
VALUES
(:block_height!, :direction!, :address!, :transaction_id!, :index!, :value_sats!, :utxo_txid!, :utxo_vout!, :label!)
;
