const User = require("./User");
const UserProfile = require("./UserProfile");
const UserTarget = require("./UserTarget");

const Provinsi = require("./Provinsi");
const KotaKab = require("./KotaKab");
const KampusPtn = require("./KampusPtn");
const Prodi = require("./Prodi");

// ======================================
// USER -> PROFILE
// ======================================

User.hasOne(UserProfile, {
  foreignKey: "user_id",
  as: "profile",
  onDelete: "CASCADE",
});

UserProfile.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// ======================================
// USER -> TARGET
// ======================================

User.hasOne(UserTarget, {
  foreignKey: "user_id",
  as: "target",
  onDelete: "CASCADE",
});

UserTarget.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// ======================================
// PROVINSI -> KOTA/KAB
// ======================================

Provinsi.hasMany(KotaKab, {
  foreignKey: "provinsi_kode",
  sourceKey: "kode",
  as: "kota_kab",
});

KotaKab.belongsTo(Provinsi, {
  foreignKey: "provinsi_kode",
  targetKey: "kode",
  as: "provinsi",
});

KampusPtn.hasMany(Prodi, {
  foreignKey: "kampus_id",
  sourceKey: "id",
  as: "prodi",
});

Prodi.belongsTo(KampusPtn, {
  foreignKey: "kampus_id",
  targetKey: "id",
  as: "kampus",
});

module.exports = {
  User,
  UserProfile,
  UserTarget,
  Provinsi,
  KotaKab,
  KampusPtn,
  Prodi,
};
