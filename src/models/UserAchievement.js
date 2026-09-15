const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
module.exports = sequelize.define('UserAchievement', {
  user_achievement_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  achievement_id: { type: DataTypes.INTEGER, allowNull: false },
  progress_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  target_value: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  unlocked_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'user_achievements', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ unique: true, fields: ['user_id', 'achievement_id'] }, { fields: ['user_id', 'unlocked_at'] }] });
