const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Material = sequelize.define('Material', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  subtest: { type: DataTypes.ENUM('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM'), allowNull: false },
  category: { type: DataTypes.STRING(100), allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'active'), allowNull: false, defaultValue: 'draft' },
  file_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  file_name: { type: DataTypes.STRING(255), allowNull: false },
  file_mime: { type: DataTypes.STRING(120), allowNull: false },
  file_size: { type: DataTypes.INTEGER, allowNull: false },
  created_by_id: { type: DataTypes.INTEGER, allowNull: false },
}, {
  tableName: 'materials', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['subtest'] }, { fields: ['category'] }, { fields: ['status'] }, { fields: ['created_at'] }],
});

module.exports = Material;
