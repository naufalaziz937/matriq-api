const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const User = sequelize.define(
  "User",
  {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    nama: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
    },

    no_hp: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    gender: {
      type: DataTypes.ENUM("L", "P"),
      allowNull: true,
    },

    role: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
    },

    foto_profile: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    is_activate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = User;
