/* @name tableExists */
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE  table_schema = 'public'
    AND    table_name   = 'quotes'
);

/* @name insertQuote */
INSERT INTO quotes 
(order_id, from_token, filler, to_token, from_amount, to_amount, fee) 
VALUES 
(:order_id!, :from_token!, :filler!, :to_token!, :from_amount!, :to_amount!, :fee!) 
;

/* @name getQuoteById */
SELECT * FROM quotes 
WHERE order_id = :order_id!
;

/* @name insertPayment */
INSERT INTO payments 
(amount, token, chain_id, to_wallet, from_wallet, order_id) 
VALUES 
(:amount!, :token!, :chain_id!, :to_wallet!, :from_wallet!, :order_id!) 
;

/* @name getPayments */
SELECT * FROM payments 
WHERE order_id = :order_id!
;

/* @name insertIntent */
INSERT INTO intents 
(
    order_id,
    user_address,
    origin_chain_id,
    open_deadline,
    fill_deadline,
    max_spent_token,
    max_spent_amount,
    max_spent_recipient,
    max_spent_chain_id,
    min_received_token,
    min_received_amount,
    min_received_recipient,
    min_received_chain_id,
    destination_chain_id,
    destination_settler,
    origin_data,
    status
)
VALUES 
(
    :order_id!,
    :user_address!,
    :origin_chain_id!,
    :open_deadline!,
    :fill_deadline!,
    :max_spent_token!,
    :max_spent_amount!,
    :max_spent_recipient!,
    :max_spent_chain_id!,
    :min_received_token!,
    :min_received_amount!,
    :min_received_recipient!,
    :min_received_chain_id!,
    :destination_chain_id!,
    :destination_settler!,
    :origin_data!,
    :status!
)
ON CONFLICT (order_id) DO UPDATE SET 
    user_address = EXCLUDED.user_address,
    origin_chain_id = EXCLUDED.origin_chain_id,
    open_deadline = EXCLUDED.open_deadline,
    fill_deadline = EXCLUDED.fill_deadline,
    max_spent_token = EXCLUDED.max_spent_token,
    max_spent_amount = EXCLUDED.max_spent_amount,
    max_spent_recipient = EXCLUDED.max_spent_recipient,
    max_spent_chain_id = EXCLUDED.max_spent_chain_id,
    min_received_token = EXCLUDED.min_received_token,
    min_received_amount = EXCLUDED.min_received_amount,
    min_received_recipient = EXCLUDED.min_received_recipient,
    min_received_chain_id = EXCLUDED.min_received_chain_id,
    destination_chain_id = EXCLUDED.destination_chain_id,
    destination_settler = EXCLUDED.destination_settler,
    origin_data = EXCLUDED.origin_data,
    status = EXCLUDED.status
;

/* @name getIntentByOrderId */
SELECT * FROM intents 
WHERE order_id = :order_id!
;


/* @name insertTransfer */
INSERT INTO transfers 
(from_address, to_address, amount, token, chain_id) 
VALUES 
(:from_address!, :to_address!, :amount!, :token!, :chain_id!) 
;

/* @name getSomeUnusedTransfer */
SELECT * FROM transfers 
WHERE 
    from_address = :from_address!
AND to_address = :to_address!
AND amount = :amount!
AND token = :token!
AND chain_id = :chain_id!
AND used = FALSE
;

/* @name updateTransferUsed */
UPDATE transfers 
SET used = TRUE 
WHERE id = :id!
;

/* @name getTransferToMatchIntent */
SELECT * FROM transfers 
WHERE 
    amount = :amount!
AND token = :token!
AND chain_id = :chain_id!
AND used = FALSE
AND to_address = :to_address!
;

/* @name getIntentToMatchTransfer */
SELECT * FROM intents 
WHERE  max_spent_token = :max_spent_token!
AND max_spent_amount = :max_spent_amount!
AND status = '0'
;

/* @name updateIntentResolved */
UPDATE intents 
SET resolved_by = :resolved_by!,  status = '3'
WHERE order_id = :order_id!
;

/* @name getTransferById */
SELECT * FROM transfers 
WHERE id = :id!
;

/* @name getBestQuoteForOrder */
SELECT * FROM quotes 
WHERE order_id = :order_id!
ORDER BY to_amount ASC
LIMIT 1
;