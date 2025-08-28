# Achievements

> NOTE THIS IS A PREVIEW DOCUMENTATION. NYI.

Paima Engine includes a built-in implementation of the **Paima Request for Comments #1 (PRC-1)**, an open standard for exposing in-game achievements. By following this standard, your dApp can broadcast player accomplishments in a consistent, interoperable format.

This allows third-party tools, community-run leaderboards, and other dApps to easily integrate with your game, creating a richer, more engaging ecosystem for your players.

### How it Works

The achievement system is split into two main parts:
1.  **Static Metadata**: The list of all possible achievements in your game, including their names, descriptions, and icons. You define this once.
2.  **Dynamic Progress**: The per-player data, tracking which achievements a player has unlocked and their progress towards others. You update this from within your State Transition Functions (STFs).

Paima Engine takes care of the rest, automatically exposing this information through a standardized, PRC-1 compliant API.

### 1. Defining Achievement Metadata

To enable the achievement API, you must define the list of all possible achievements for your game. This is done in your `api.ts` file (or a similar entry point for your API logic) by exporting a constant named `achievements`.

**Example (`api.ts`):**
```ts
// Define all possible achievements for your game.
const achievementList: Achievement[] = [
    {
        name: "finish-chapter-1",
        displayName: "Over The River",
        description: "Finish Chapter 1.",
        isActive: true, // This achievement can currently be earned.
    },
    {
        name: "win-10-battles",
        displayName: "Battle Hardened",
        description: "Win 10 battles against any opponent.",
        isActive: true,
    },
];

// Create the full metadata object.
const metadata: AchievementMetadata = {
    game: {
        id: "my-awesome-game",
    },
    list: achievementList,
};

// Export the metadata to enable the Paima Engine's built-in achievement API.
export const achievements = Promise.resolve(metadata);
```

### 2. Updating Player Progress in an STF

Once your metadata is defined, the next step is to track player progress. This is done from within your **State Transition Functions (STFs)** by using special database queries provided by the `@paima/db` package.

When a player performs an action that should affect an achievement, you:
1.  **Get** their current progress for that achievement using `getAchievementProgress`.
2.  **Set** their new progress using `setAchievementProgress`.

This `set` operation generates a database update that the Paima Engine will apply atomically with the rest of your STF's state changes.

**Example (inside an STF in `state-machine.ts`):**
```ts
import { getAchievementProgress, setAchievementProgress } from '@paima/db';
import type { ISetAchievementProgressParams } from '@paima/db';

// Assume this function is called inside your STF when a player wins a battle.
async function handleBattleWin(walletId: number, blockTimestamp: Date, dbConn: Pool): Promise<SQLUpdate[]> {
  const achievementName = 'win-10-battles';

  // 1. Get the player's current progress for this achievement.
  const currentProgress = await getAchievementProgress.run({
    wallet: walletId,
    names: [achievementName]
  }, dbConn);

  const progressRow = currentProgress[0];

  // If the achievement is not yet completed...
  if (!progressRow?.completed_date) {
    const newProgress = (progressRow?.progress ?? 0) + 1;
    const isCompleted = newProgress >= 10;

    // 2. Return a command to update the progress in the database.
    // If the achievement is now complete, we also set the completion date.
    return [
      [setAchievementProgress, {
        name: achievementName,
        wallet: walletId,
        completed_date: isCompleted ? blockTimestamp : null,
        progress: newProgress,
        total: 10,
      } satisfies ISetAchievementProgressParams],
    ];
  }

  // The achievement is already complete, so no update is needed.
  return [];
}
```

### 3. Consuming the Achievement API

Once enabled, your Paima Engine node will automatically serve the PRC-1 compliant API endpoints. Other developers, services, or even your own frontend can then query this data.

*   **List All Achievements**:
    *   `GET /achievements/public/list`
    *   Returns a list of all defined achievements, their descriptions, and global completion statistics.

*   **Get a Player's Achievements**:
    *   `GET /achievements/wallet/:walletAddress`
    *   Returns the specific progress for a given wallet, including which achievements they have completed and their progress on others.

This open standard makes it incredibly easy for anyone in the ecosystem to build on top of your game's accomplishments, fostering a more connected and engaging community.