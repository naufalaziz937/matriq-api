-- Extend the existing question table without replacing existing records.
ALTER TYPE "enum_questions_status" ADD VALUE IF NOT EXISTS 'rejected';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS reviewed_by_id INTEGER REFERENCES users(user_id);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
UPDATE questions SET submitted_at = created_at WHERE status = 'review' AND submitted_at IS NULL;
CREATE INDEX IF NOT EXISTS questions_moderation_queue_idx ON questions (status, submitted_at, id);
