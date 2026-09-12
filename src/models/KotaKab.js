const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const KotaKab = sequelize.define(
  "KotaKab",
  {
    kode: {
      type: DataTypes.CHAR(5),
      primaryKey: true,
      allowNull: false,
    },

    provinsi_kode: {
      type: DataTypes.CHAR(2),
      allowNull: false,
    },

    jenis: {
      type: DataTypes.STRING(9),
      allowNull: false,
    },

    nama: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    tableName: "kota_kab",
    timestamps: false,
  },
);

module.exports = KotaKab;
