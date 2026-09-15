const User = require("./User");
const UserProfile = require("./UserProfile");
const UserTarget = require("./UserTarget");
const Question = require('./Question');
const Material = require('./Material');
const TryoutRecap = require('./TryoutRecap');
const ReportExport = require('./ReportExport');
const AppSetting = require('./AppSetting');
const StudyProgress = require('./StudyProgress');
const StudyPlan = require('./StudyPlan');
const PracticeSession = require('./PracticeSession');
const PracticeAnswer = require('./PracticeAnswer');
const UserMaterialProgress = require('./UserMaterialProgress');
const Achievement = require('./Achievement');
const UserAchievement = require('./UserAchievement');
const Notification = require('./Notification');
const TutorProfile = require('./TutorProfile');

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

User.hasMany(Question, { foreignKey: 'created_by_id', as: 'questions' });
Question.belongsTo(User, { foreignKey: 'created_by_id', as: 'created_by' });
Question.belongsTo(User, { foreignKey: 'reviewed_by_id', as: 'reviewer' });
User.hasMany(Material, { foreignKey: 'created_by_id', as: 'materials' });
Material.belongsTo(User, { foreignKey: 'created_by_id', as: 'created_by' });
User.hasMany(TryoutRecap, { foreignKey: 'user_id', as: 'tryout_recaps' });
TryoutRecap.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(StudyProgress,{foreignKey:'user_id',as:'study_progress'});
StudyProgress.belongsTo(User,{foreignKey:'user_id',as:'user'});
User.hasMany(StudyPlan,{foreignKey:'user_id',as:'study_plans'});
StudyPlan.belongsTo(User,{foreignKey:'user_id',as:'user'});
User.hasMany(PracticeSession,{foreignKey:'user_id',as:'practice_sessions'});
PracticeSession.belongsTo(User,{foreignKey:'user_id',as:'user'});
Material.hasMany(Question,{foreignKey:'material_id',as:'practice_questions'});
Question.belongsTo(Material,{foreignKey:'material_id',as:'material'});
Material.hasMany(PracticeSession,{foreignKey:'material_id',as:'practice_sessions'});
PracticeSession.belongsTo(Material,{foreignKey:'material_id',as:'material'});
PracticeSession.hasMany(PracticeAnswer,{foreignKey:'session_id',as:'answers'});
PracticeAnswer.belongsTo(PracticeSession,{foreignKey:'session_id',as:'session'});
PracticeAnswer.belongsTo(Question,{foreignKey:'question_id',as:'question'});
User.hasMany(UserMaterialProgress,{foreignKey:'user_id',as:'material_progress'});
UserMaterialProgress.belongsTo(User,{foreignKey:'user_id',as:'user'});
Material.hasMany(UserMaterialProgress,{foreignKey:'material_id',as:'learning_progress'});
UserMaterialProgress.belongsTo(Material,{foreignKey:'material_id',as:'material'});
User.hasMany(UserAchievement,{foreignKey:'user_id',as:'achievements'});
UserAchievement.belongsTo(User,{foreignKey:'user_id',as:'user'});
Achievement.hasMany(UserAchievement,{foreignKey:'achievement_id',as:'unlocks'});
UserAchievement.belongsTo(Achievement,{foreignKey:'achievement_id',as:'achievement'});
User.hasMany(Notification,{foreignKey:'user_id',as:'notifications'});
Notification.belongsTo(User,{foreignKey:'user_id',as:'user'});
User.hasOne(TutorProfile,{foreignKey:'user_id',as:'tutor_profile',onDelete:'CASCADE'});
TutorProfile.belongsTo(User,{foreignKey:'user_id',as:'user'});

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
  Question,
  Material,
  TryoutRecap,
  ReportExport,
  AppSetting,
  StudyProgress,
  StudyPlan,
  PracticeSession,
  PracticeAnswer,
  UserMaterialProgress,
  Achievement,
  UserAchievement,
  Notification,
  TutorProfile,
  Provinsi,
  KotaKab,
  KampusPtn,
  Prodi,
};
