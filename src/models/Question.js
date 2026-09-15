const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Question = sequelize.define('Question', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  question: { type: DataTypes.TEXT, allowNull: false },
  question_type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'multiple_choice' },
  subtest: { type: DataTypes.ENUM('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM'), allowNull: false },
  category: { type: DataTypes.STRING(100), allowNull: false },
  difficulty: { type: DataTypes.ENUM('easy', 'medium', 'hard'), allowNull: false },
  difficulty_level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1, max: 4 } },
  material_id: { type: DataTypes.INTEGER, allowNull: true },
  options: { type: DataTypes.JSONB, allowNull: false },
  correct_answer: { type: DataTypes.ENUM('A', 'B', 'C', 'D', 'E'), allowNull: false },
  explanation: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'active', 'review', 'rejected'), allowNull: false, defaultValue: 'draft' },
  created_by_id: { type: DataTypes.INTEGER, allowNull: false },
  reviewed_by_id: { type: DataTypes.INTEGER, allowNull: true },
  reviewed_at: { type: DataTypes.DATE, allowNull: true },
  rejection_reason: { type: DataTypes.TEXT, allowNull: true },
  submitted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'questions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['subtest'] },
    { fields: ['difficulty'] },
    { fields: ['material_id', 'difficulty_level'] },
    { fields: ['status'] },
    { fields: ['category'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Question;
