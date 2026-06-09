import type { DBMigrations } from "@effectstream/runtime";
import databaseSql from "./migrations/000-init.sql" with { type: "text" };
import configAndPaymentsSql from "./migrations/001-config-and-payments.sql" with { type: "text" };
import coinsSql from "./migrations/002-coins.sql" with { type: "text" };
import referralRewardsSql from "./migrations/003-referral-rewards.sql" with { type: "text" };
import nftMintsSql from "./migrations/004-nft-mints.sql" with { type: "text" };

export const migrationTable: DBMigrations[] = [
  {
    name: "000-init.sql",
    sql: databaseSql,
  },
  {
    name: "001-config-and-payments.sql",
    sql: configAndPaymentsSql,
  },
  {
    name: "002-coins.sql",
    sql: coinsSql,
  },
  {
    name: "003-referral-rewards.sql",
    sql: referralRewardsSql,
  },
  {
    name: "004-nft-mints.sql",
    sql: nftMintsSql,
  },
];
