/* @name getUser */
SELECT * FROM launchpad_users
WHERE launchpad = :launchpad! AND wallet = :wallet!;

/* @name upsertUser */
INSERT INTO launchpad_users (launchpad, wallet, payment_token, total_amount, last_referrer, last_participation_valid, chain)
VALUES (:launchpad!, :wallet!, :payment_token!, :total_amount!, :last_referrer!, :last_participation_valid!, :chain!)
ON CONFLICT (launchpad, wallet)
DO UPDATE SET
  total_amount = (CAST(launchpad_users.total_amount AS NUMERIC) + CAST(:total_amount! AS NUMERIC))::TEXT,
  last_referrer = :last_referrer!,
  last_participation_valid = :last_participation_valid!;

/* @name insertParticipation */
INSERT INTO launchpad_participations (launchpad, wallet, payment_token, payment_amount, referrer, item_ids, item_quantities, tx_hash, block_height, preconditions_met, participation_valid, chain)
VALUES (:launchpad!, :wallet!, :payment_token!, :payment_amount!, :referrer!, :item_ids!, :item_quantities!, :tx_hash!, :block_height!, :preconditions_met!, :participation_valid!, :chain!);

/* @name getParticipations */
SELECT * FROM launchpad_participations
WHERE launchpad = :launchpad! AND wallet = :wallet!;

/* @name insertUserItems */
INSERT INTO launchpad_user_items (launchpad, wallet, item_id, quantity)
VALUES (:launchpad!, :wallet!, :item_id!, :quantity!)
ON CONFLICT (launchpad, wallet, item_id)
DO UPDATE SET quantity = :quantity!;

/* @name deleteUserItems */
DELETE FROM launchpad_user_items
WHERE launchpad = :launchpad! AND wallet = :wallet!;

/* @name getUserItems */
SELECT * FROM launchpad_user_items
WHERE launchpad = :launchpad! AND wallet = :wallet!;

/* @name getParticipatedAmountTotal */
SELECT COALESCE(SUM(CAST(payment_amount AS NUMERIC)), 0) AS sum
FROM launchpad_participations
WHERE launchpad = :launchpad! AND wallet = :wallet! AND payment_token = :payment_token! AND participation_valid = true;

/* @name getItemsPurchasedQuantityExceptUser */
SELECT COALESCE(SUM(quantity), 0) AS sum
FROM launchpad_user_items
WHERE launchpad = :launchpad! AND item_id = :item_id! AND wallet != :wallet!;

/* @name getAllItemsPurchasedQuantity */
SELECT item_id, SUM(quantity) AS sum
FROM launchpad_user_items
WHERE launchpad = :launchpad!
GROUP BY item_id;

/* @name insertCardanoPayment */
INSERT INTO cardano_payments (tx_hash, output_index, payment_address, amount, block_height)
VALUES (:tx_hash!, :output_index!, :payment_address!, :amount!, :block_height!);

/* @name getRefunds */
SELECT * FROM launchpad_participations
WHERE launchpad = :launchpad! AND wallet = :wallet! AND participation_valid = false AND preconditions_met = true;

/* @name getCardanoPayments */
SELECT * FROM cardano_payments
WHERE payment_address = :payment_address!;
