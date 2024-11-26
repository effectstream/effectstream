/*
  @name getAchievementProgress
  @param names -> (...)
*/
SELECT * FROM achievement_progress
WHERE wallet = :wallet!
AND ('*' in :names OR name IN :names)
;

/* @name setAchievementProgress */
INSERT INTO achievement_progress (wallet, name, completed_date, progress, total)
VALUES (:wallet!, :name!, :completed_date, :progress, :total)
ON CONFLICT (wallet, name)
DO UPDATE SET
  completed_date = LEAST(achievement_progress.completed_date, EXCLUDED.completed_date::TIMESTAMP),
  progress = EXCLUDED.progress,
  total = EXCLUDED.total;
