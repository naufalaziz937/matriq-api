const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const KampusPtn = sequelize.define(
  "KampusPtn",
  {
    id: {
      type: DataTypes.SMALLINT,
      primaryKey: true,
      allowNull: false,
    },

    nama: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
    },

    singkatan: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },

    jenis: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    kota: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },

    provinsi_kode: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: "32",
    },

    aktif: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "kampus_ptn",
    timestamps: false,
  },
);

module.exports = KampusPtn;
