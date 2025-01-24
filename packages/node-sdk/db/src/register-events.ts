import type { PoolClient } from "pg";
import {
  getEventByTopic,
  getTopics,
  registerEventType,
} from "./sql/events.queries.ts";

export async function registerEventTypes(
  pool: PoolClient,
  eventDescriptions: { topic: string; name: string }[],
): Promise<boolean> {
  const allStoredTopics = await getTopics.run(undefined, pool);

  // check that no events were deleted.
  for (const storedTopic of allStoredTopics) {
    const found = eventDescriptions.find((ed) =>
      ed.topic === storedTopic.topic
    );

    if (found === undefined) {
      return false;
    }
  }

  for (const event of eventDescriptions) {
    const registeredTopic = await getEventByTopic.run(
      { topic: event.topic },
      pool,
    );

    if (registeredTopic.length === 0) {
      await registerEventType.run(
        { name: event.name, topic: event.topic },
        pool,
      );
    }
  }

  return true;
}
