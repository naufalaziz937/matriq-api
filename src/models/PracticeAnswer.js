const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('PracticeAnswer', {
  answer_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  session_id: { type: DataTypes.INTEGER, allowNull: false },
  question_id: { type: DataTypes.INTEGER, allowNull: false },
  selected_answer: { type: DataTypes.ENUM('A', 'B', 'C', 'D', 'E'), allowNull: true },
  is_correct: { type: DataTypes.BOOLEAN, allowNull: true },
  time_spent_seconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  answered_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'practice_answers', timestamps: true, createdAt: 'created_at', updatedAt: false, indexes: [{ unique: true, fields: ['session_id', 'question_id'] }, { fields: ['question_id'] }] });
