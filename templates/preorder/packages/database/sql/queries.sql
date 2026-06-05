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

/* @name upsertCampaign */
INSERT INTO offchain_campaigns (
  campaign_id, slug, name, description, image, launchpad_address, receiver,
  cardano_payment_address, cardano_payment_address_hex, referral_discount_bps,
  referrer_reward_bps, ts_start_whitelist, ts_start_public, ts_end_sale, status,
  admin, created_block
) VALUES (
  :campaign_id!, :slug!, :name!, :description!, :image, :launchpad_address!, :receiver!,
  :cardano_payment_address, :cardano_payment_address_hex, :referral_discount_bps!,
  :referrer_reward_bps!, :ts_start_whitelist, :ts_start_public!, :ts_end_sale!, :status!,
  :admin!, :created_block!
)
ON CONFLICT (campaign_id) DO UPDATE SET
  slug = :slug!, name = :name!, description = :description!, image = :image,
  launchpad_address = :launchpad_address!, receiver = :receiver!,
  cardano_payment_address = :cardano_payment_address,
  cardano_payment_address_hex = :cardano_payment_address_hex,
  referral_discount_bps = :referral_discount_bps!, referrer_reward_bps = :referrer_reward_bps!,
  ts_start_whitelist = :ts_start_whitelist, ts_start_public = :ts_start_public!,
  ts_end_sale = :ts_end_sale!, status = :status!, admin = :admin!;

/* @name endCampaign */
UPDATE offchain_campaigns SET status = 'ended' WHERE campaign_id = :campaign_id!;

/* @name getCampaignByReceiver */
SELECT * FROM offchain_campaigns WHERE receiver = :receiver! AND status = 'active';

/* @name getActiveCampaign */
SELECT * FROM offchain_campaigns WHERE status = 'active' ORDER BY created_block ASC LIMIT 1;

/* @name getCampaignBySlug */
SELECT * FROM offchain_campaigns WHERE slug = :slug!;

/* @name getCampaignById */
SELECT * FROM offchain_campaigns WHERE campaign_id = :campaign_id!;

/* @name getAllCampaigns */
SELECT * FROM offchain_campaigns ORDER BY created_block ASC;

/* @name upsertProduct */
INSERT INTO offchain_products (campaign_id, item_id, name, description, image, supply, kind, price)
VALUES (:campaign_id!, :item_id!, :name!, :description!, :image, :supply, :kind!, :price!)
ON CONFLICT (campaign_id, item_id) DO UPDATE SET
  name = :name!, description = :description!, image = :image, supply = :supply, kind = :kind!, price = :price!;

/* @name getProductsByCampaign */
SELECT * FROM offchain_products WHERE campaign_id = :campaign_id! ORDER BY item_id ASC;

/* @name upsertCoin */
INSERT INTO offchain_coins (token, symbol, chain, payment_token, type, x, n, decimals)
VALUES (:token!, :symbol!, :chain!, :payment_token!, :type!, :x!, :n!, :decimals!)
ON CONFLICT (token) DO UPDATE SET
  symbol = :symbol!, chain = :chain!, payment_token = :payment_token!, type = :type!, x = :x!, n = :n!, decimals = :decimals!;

/* @name getCoins */
SELECT * FROM offchain_coins ORDER BY token ASC;

/* @name upsertCuratedPackage */
INSERT INTO offchain_curated_packages (campaign_id, package_name, description)
VALUES (:campaign_id!, :package_name!, :description!)
ON CONFLICT (campaign_id, package_name) DO UPDATE SET description = :description!;

/* @name upsertCuratedPackageItem */
INSERT INTO offchain_curated_package_items (campaign_id, package_name, item_id, quantity)
VALUES (:campaign_id!, :package_name!, :item_id!, :quantity!)
ON CONFLICT (campaign_id, package_name, item_id) DO UPDATE SET quantity = :quantity!;

/* @name getCuratedPackagesByCampaign */
SELECT * FROM offchain_curated_packages WHERE campaign_id = :campaign_id!;

/* @name getCuratedPackageItemsByCampaign */
SELECT * FROM offchain_curated_package_items WHERE campaign_id = :campaign_id!;

/* @name insertPayment */
INSERT INTO payments (
  campaign_id, chain, wallet, payment_token, amount, item_ids, item_quantities,
  tx_hash, output_index, block_height, status, reason, created_block
) VALUES (
  :campaign_id!, :chain!, :wallet!, :payment_token!, :amount!, :item_ids!, :item_quantities!,
  :tx_hash!, :output_index, :block_height!, :status!, :reason!, :created_block!
);

/* @name getPaymentsByCampaign */
SELECT * FROM payments WHERE campaign_id = :campaign_id! ORDER BY id DESC;

/* @name getPaymentsByWallet */
SELECT * FROM payments WHERE campaign_id = :campaign_id! AND wallet = :wallet! ORDER BY id DESC;

/* @name getPaymentsByStatus */
SELECT * FROM payments WHERE campaign_id = :campaign_id! AND status = :status! ORDER BY id DESC;

/* @name insertReferralReward */
INSERT INTO referral_rewards (
  campaign_id, referrer, buyer, chain, payment_token, amount, tx_hash, block_height, created_block
) VALUES (
  :campaign_id!, :referrer!, :buyer!, :chain!, :payment_token!, :amount!, :tx_hash!, :block_height!, :created_block!
);

/* @name getReferralRewardsByCampaign */
SELECT * FROM referral_rewards WHERE campaign_id = :campaign_id! ORDER BY id DESC;

/* @name getMintableItems */
SELECT ui.wallet, ui.item_id, ui.quantity, u.chain
FROM launchpad_user_items ui
JOIN launchpad_users u ON u.launchpad = ui.launchpad AND u.wallet = ui.wallet
WHERE ui.launchpad = :launchpad!;

/* @name insertNftMint */
INSERT INTO nft_mints (campaign_id, chain, wallet, item_id, quantity, status, created_block)
VALUES (:campaign_id!, :chain!, :wallet!, :item_id!, :quantity!, 'pending', :created_block!)
ON CONFLICT (campaign_id, chain, wallet, item_id) DO NOTHING;
