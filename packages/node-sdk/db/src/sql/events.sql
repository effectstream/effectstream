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

/* @name getAllEvents */
SELECT
    e.id,
    re.name AS event_name,
    e.topic,
    e.address,
    e.data,
    e.block_height,
    e.tx_index,
    e.log_index
FROM
    paima.event e
LEFT JOIN
    paima.registered_event re ON e.topic = re.topic
WHERE
    (:after_id::INT IS NULL OR e.id > :after_id::INT)
ORDER BY
    e.id ASC
LIMIT COALESCE(:limit, 100);