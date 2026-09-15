const { sequelize } = require('../config/database');

async function preparePracticeSchema() {
  if (!(await sequelize.getQueryInterface().tableExists('questions'))) return;
  await sequelize.query('ALTER TABLE IF EXISTS questions ADD COLUMN IF NOT EXISTS material_id INTEGER');
  await sequelize.query("ALTER TABLE IF EXISTS questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) NOT NULL DEFAULT 'multiple_choice'");
  await sequelize.query('ALTER TABLE IF EXISTS questions ADD COLUMN IF NOT EXISTS difficulty_level INTEGER NOT NULL DEFAULT 1');
  await sequelize.query("UPDATE questions SET difficulty_level=CASE difficulty WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 1 END WHERE material_id IS NULL AND difficulty_level=1 AND difficulty IN ('medium','hard')");
  if (await sequelize.getQueryInterface().tableExists('materials')) await sequelize.query(`WITH matches AS (SELECT q.id,MIN(m.id) AS material_id FROM questions q JOIN materials m ON m.status='active' AND m.subtest::text=q.subtest::text AND LOWER(TRIM(m.title))=LOWER(TRIM(q.category)) WHERE q.material_id IS NULL GROUP BY q.id HAVING COUNT(*)=1) UPDATE questions q SET material_id=matches.material_id FROM matches WHERE q.id=matches.id`);
  await sequelize.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_difficulty_level_check') THEN ALTER TABLE questions ADD CONSTRAINT questions_difficulty_level_check CHECK (difficulty_level BETWEEN 1 AND 4); END IF; END $$`);
}
module.exports = { preparePracticeSchema };
