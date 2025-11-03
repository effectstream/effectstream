/* @name getEvents */
SELECT * FROM effectstream.event WHERE
  COALESCE(block_height >= :from, 1=1) AND
  COALESCE(block_height <= :to, 1=1) AND
  COALESCE(address = :address, 1=1) AND
  topic = :topic!;

/* @name insertEvent */
INSERT INTO effectstream.event (
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
INSERT INTO effectstream.registered_event (
  name,
  topic
) VALUES (
  :name!,
  :topic!
);

/* @name getTopicsForEvent */
SELECT topic FROM effectstream.registered_event WHERE name = :name!;

/* @name getTopics */
SELECT name, topic FROM effectstream.registered_event;

/* @name getEventByTopic */
SELECT name FROM effectstream.registered_event WHERE topic = :topic!;