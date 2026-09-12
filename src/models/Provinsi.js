const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Provinsi = sequelize.define(
  "Provinsi",
  {
    kode: {
      type: DataTypes.CHAR(2),
      primaryKey: true,
      allowNull: false,
    },

    nama: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: "provinsi",
    timestamps: false,
  },
);

module.exports = Provinsi;
