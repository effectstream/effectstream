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

