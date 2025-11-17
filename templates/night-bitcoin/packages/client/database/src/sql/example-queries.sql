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

/* @name insertDeposit */
INSERT INTO deposits 
(amount, token, chain_id, user_address) 
VALUES 
(:amount!, :token!, :chain_id!, :user_address!) 
;

/* @name updateDepositUsed */
UPDATE deposits 
SET used = TRUE 
WHERE user_address = :user_address!
AND token = :token!
AND chain_id = :chain_id!
AND amount = :amount!
;

/* @name getDeposits */
SELECT * FROM deposits 
WHERE user_address = :user_address!
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
