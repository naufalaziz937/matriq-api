const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const UserTarget = sequelize.define(
  "UserTarget",
  {
    target_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },

    pilihan: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },

    target_score: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "user_targets",
    timestamps: false,
  },
);

module.exports = UserTarget;
