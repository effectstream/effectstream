/* @name getEvents */
SELECT * FROM paima.event WHERE
  COALESCE(block_height >= :from, 1=1) AND
  COALESCE(block_height <= :to, 1=1) AND
  COALESCE(address = :address, 1=1) AND
  topic = :topic!;

/* @name insertEvent */
INSERT INTO paima.event (
  topic,
  address,
  data,
  block_height,
  tx_index,
  log_index
) VALUES (
  :topic!,
  :address!,
  :data!,
  :block_height!,
  :tx_index!,
  :log_index!
);

/* @name registerEventType */
INSERT INTO paima.registered_event (
  name,
  topic
) VALUES (
  :name!,
  :topic!
);

/* @name getTopicsForEvent */
SELECT topic FROM paima.registered_event WHERE name = :name!;

/* @name getTopics */
SELECT name, topic FROM paima.registered_event;

/* @name getEventByTopic */
SELECT name FROM paima.registered_event WHERE topic = :topic!;