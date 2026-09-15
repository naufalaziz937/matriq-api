const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
module.exports = sequelize.define('Achievement', {
  achievement_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.STRING(50), allowNull: false },
  rarity: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'common' },
  icon: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Award' },
  condition_type: { type: DataTypes.STRING(100), allowNull: false },
  condition_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
  xp_reward: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'achievements', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ fields: ['category'] }, { fields: ['rarity'] }, { fields: ['is_active'] }] });
