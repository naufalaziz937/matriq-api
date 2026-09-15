const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('StudyPlan', {
  plan_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: false },
  type: { type: DataTypes.ENUM('material', 'practice', 'review', 'tryout_recap', 'target', 'milestone', 'personal'), allowNull: false },
  subtest: { type: DataTypes.ENUM('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM'), allowNull: true },
  material_id: { type: DataTypes.INTEGER, allowNull: true },
  target_questions: { type: DataTypes.INTEGER, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  start_at: { type: DataTypes.DATE, allowNull: false },
  end_at: { type: DataTypes.DATE, allowNull: true },
  duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'missed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  repeat_type: { type: DataTypes.ENUM('none', 'daily', 'weekly'), allowNull: false, defaultValue: 'none' },
  repeat_until: { type: DataTypes.DATE, allowNull: true },
  reminder_minutes: { type: DataTypes.INTEGER, allowNull: true },
  source: { type: DataTypes.ENUM('manual', 'roadmap', 'auto_plan'), allowNull: false, defaultValue: 'manual' },
  roadmap_stage: { type: DataTypes.INTEGER, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'study_plans', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ fields: ['user_id', 'start_at'] }, { fields: ['user_id', 'status'] }] });
