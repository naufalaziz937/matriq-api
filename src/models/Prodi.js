const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Prodi = sequelize.define(
  "Prodi",
  {
    kode_snbt: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false,
    },

    kampus_id: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },

    nama: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },

    daya_tampung_2024: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    peminat_2023: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    sumber_tahun: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 2024,
    },

    aktif: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "prodi",
    timestamps: false,
  },
);

module.exports = Prodi;
