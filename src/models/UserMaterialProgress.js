const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('UserMaterialProgress', {
  progress_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  material_id: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'not_started', validate: { isIn: [['not_started', 'in_progress', 'completed']] } },
  progress_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
  started_at: DataTypes.DATE,
  completed_at: DataTypes.DATE,
  last_accessed_at: DataTypes.DATE,
}, { tableName: 'user_material_progress', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ unique: true, fields: ['user_id', 'material_id'] }, { fields: ['user_id'] }, { fields: ['material_id'] }] });
