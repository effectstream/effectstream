# Achievements

EffectStream ships **storage primitives for tracking player achievements**: a system table and two prepared queries you can call from your State Transition Functions. These are the building blocks for implementing [PRC-1](../400-paima-standards/prc1.md), the open standard for exposing in-game achievements.

:::warning What is and isn't built in
The engine provides the **storage layer only** — the `effectstream.achievement_progress` table and the `getAchievementProgress` / `setAchievementProgress` queries.

There is **no built-in achievement HTTP API**, and no `Achievement` / `AchievementMetadata` type or `achievements` export convention. Defining achievement metadata and serving PRC-1 endpoints is something you implement in your own [API router](./103-api.md). Earlier versions of this page described such an API; it does not exist in the engine.
:::

### The storage model

Progress is stored in one system table, keyed by account and achievement name:

```sql
CREATE TABLE effectstream.achievement_progress(
  account_id      INTEGER NOT NULL REFERENCES effectstream.accounts(id),
  name            TEXT NOT NULL,
  completed_date  TIMESTAMP,
  progress        INTEGER,
  total           INTEGER,
  PRIMARY KEY (account_id, name)
);
```

Note that rows are keyed by **`account_id`**, not by wallet address. An account can have several addresses linked to it (see [Accounts](./116-accounts.md)), so achievements follow the player, not a single wallet. Use `getAddressByAddress` from `@effectstream/db` to resolve an address to its `account_id`.

| Column | Meaning |
| --- | --- |
| `account_id` | The player's account (FK to `effectstream.accounts`). |
| `name` | Your identifier for the achievement, e.g. `"win-10-battles"`. |
| `completed_date` | Timestamp when the achievement was completed; `NULL` while in progress. |
| `progress` | Current progress value. |
| `total` | Value of `progress` that counts as complete. |

### Reading and writing progress

Both queries are exported from `@effectstream/db`:

- `getAchievementProgress({ account_id, names })` — `names` accepts a list of achievement names, or `["*"]` to return every achievement for the account.
- `setAchievementProgress({ account_id, name, completed_date, progress, total })` — upserts on `(account_id, name)`.

Inside an STF you run them through `World.resolve`, which queues the operation so it is applied atomically with the rest of the state transition:

```ts
import { Stm } from "@effectstream/sm";
import { World } from "@effectstream/coroutine";
import { getAchievementProgress, setAchievementProgress } from "@effectstream/db";

const TOTAL_BATTLES = 10;

stm.addStateTransition("battle_win", function* (data) {
  const { accountId, blockTimestamp } = data;
  const name = "win-10-battles";

  // `accountId` is optional on the STF input — it is only set for inputs that
  // arrived from a signed, account-linked address.
  if (accountId == null) return;

  // 1. Read the player's current progress.
  const rows = yield* World.resolve(getAchievementProgress, {
    account_id: accountId,
    names: [name],
  });
  const current = rows[0];

  // Already completed — nothing to do.
  if (current?.completed_date) return;

  // 2. Write the new progress, stamping the completion date on the final step.
  const progress = (current?.progress ?? 0) + 1;
  yield* World.resolve(setAchievementProgress, {
    account_id: accountId,
    name,
    progress,
    total: TOTAL_BATTLES,
    // `blockTimestamp` is epoch milliseconds; the column is a TIMESTAMP.
    completed_date: progress >= TOTAL_BATTLES ? new Date(blockTimestamp) : null,
  });
});
```

### Exposing achievements over HTTP

To make achievements readable by frontends or third-party tools, add routes to your own API router. A PRC-1 shaped implementation would define the static metadata (names, display names, descriptions, icons) in your application code and join it with the progress rows above.

See [API](./103-api.md) for how to define routes, and [PRC-1](../400-paima-standards/prc1.md) for the response format the standard specifies.
