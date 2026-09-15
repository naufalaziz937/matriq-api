const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('TutorProfile', {
  tutor_profile_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  bio: { type: DataTypes.TEXT, allowNull: true },
  specialization: { type: DataTypes.STRING(200), allowNull: true },
  institution: { type: DataTypes.STRING(200), allowNull: true },
  experience_years: { type: DataTypes.INTEGER, allowNull: true },
  expertise_subtests: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
}, { tableName: 'tutor_profiles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
