/*
  @name getAchievementProgress
  @param names -> (...)
*/
SELECT * FROM effectstream.achievement_progress
WHERE account_id = :account_id!
AND ('*' in :names OR name IN :names)
;

/* @name setAchievementProgress */
INSERT INTO effectstream.achievement_progress (account_id, name, completed_date, progress, total)
VALUES (:account_id!, :name!, :completed_date, :progress, :total)
ON CONFLICT (account_id, name)
DO UPDATE SET
  completed_date = EXCLUDED.completed_date,
  progress = EXCLUDED.progress,
  total = EXCLUDED.total;
