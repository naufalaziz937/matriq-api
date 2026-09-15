const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('TryoutRecap', {
  recap_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  pu: DataTypes.DECIMAL(8, 2), ppu: DataTypes.DECIMAL(8, 2),
  pbm: DataTypes.DECIMAL(8, 2), pk: DataTypes.DECIMAL(8, 2),
  lbi: DataTypes.DECIMAL(8, 2), lbe: DataTypes.DECIMAL(8, 2),
  pm: DataTypes.DECIMAL(8, 2),
  total_score: { type: DataTypes.DECIMAL(8, 2), allowNull: false },
  recap_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  platform: DataTypes.STRING(100),
  tryout_name: DataTypes.STRING(150),
  notes: DataTypes.TEXT,
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'tryout_recap', timestamps: false });
