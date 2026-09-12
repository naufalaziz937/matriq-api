const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const UserProfile = sequelize.define(
  "UserProfile",
  {
    profile_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },

    sekolah: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    kelas: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    tahun_lulus: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    provinsi: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    kota_kab: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: "user_profiles",
    timestamps: false,
  },
);

module.exports = UserProfile;
