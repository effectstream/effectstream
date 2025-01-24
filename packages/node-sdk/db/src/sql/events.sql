/* @name getEvents */
SELECT * FROM event WHERE
  COALESCE(block_height >= :from, 1=1) AND
  COALESCE(block_height <= :to, 1=1) AND
  COALESCE(address = :address, 1=1) AND
  topic = :topic!;

/* @name insertEvent */
INSERT INTO event (
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
INSERT INTO registered_event (
  name,
  topic
) VALUES (
  :name!,
  :topic!
);

/* @name getTopicsForEvent */
SELECT topic FROM registered_event WHERE name = :name!;

/* @name getTopics */
SELECT name, topic FROM registered_event;

/* @name getEventByTopic */
SELECT name FROM registered_event WHERE topic = :topic!;