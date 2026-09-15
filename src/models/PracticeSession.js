const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('PracticeSession', {
  session_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  subtest: { type: DataTypes.ENUM('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM'), allowNull: false },
  material_id: { type: DataTypes.INTEGER, allowNull: false },
  difficulty_level: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 4 } },
  question_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  question_count: { type: DataTypes.INTEGER, allowNull: false },
  correct_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  wrong_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  unanswered_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  accuracy: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  duration_seconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('in_progress', 'completed', 'abandoned'), allowNull: false, defaultValue: 'in_progress' },
  started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'practice_sessions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ fields: ['user_id', 'started_at'] }, { fields: ['material_id', 'difficulty_level'] }] });
