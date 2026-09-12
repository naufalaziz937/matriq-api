const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const PilihanKampus = sequelize.define(
  "PilihanKampus",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    kampus: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    prodi: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
  },
  {
    tableName: "pilihan_kampus",
    timestamps: false,
  },
);

module.exports = PilihanKampus;
