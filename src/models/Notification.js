const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('Notification', {
  notification_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.STRING(50), allowNull: false },
  title: { type: DataTypes.STRING(150), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  action_url: { type: DataTypes.STRING(255), allowNull: true },
  is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  read_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'notifications', timestamps: false, indexes: [{ fields: ['user_id'] }, { fields: ['user_id', 'is_read'] }] });
