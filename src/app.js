const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const onboardingRoutes = require("./routes/onboarding.routes");
const wilayahRoutes = require("./routes/wilayah.routes");
const pilihanRoutes = require("./routes/pilihan.routes");
const kampusRoutes = require("./routes/kampus.routes");
const adminUserRoutes = require("./routes/adminUser.routes");
const adminQuestionRoutes = require('./routes/adminQuestion.routes');
const adminMaterialRoutes = require('./routes/adminMaterial.routes');
const adminCampusRoutes = require('./routes/adminCampus.routes');
const adminTryoutRecapRoutes = require('./routes/adminTryoutRecap.routes');
const adminStudentProgressRoutes = require('./routes/adminStudentProgress.routes');
const adminAnalyticsRoutes = require('./routes/adminAnalytics.routes');
const adminModerationRoutes = require('./routes/adminModeration.routes');
const adminReportsRoutes = require('./routes/adminReports.routes');
const adminSettingsRoutes = require('./routes/adminSettings.routes');
const publicSettingsRoutes = require('./routes/publicSettings.routes');
const maintenanceMiddleware = require('./middlewares/maintenance.middleware');
const tutorQuestionRoutes = require('./routes/tutorQuestion.routes');
const tutorMaterialRoutes = require('./routes/tutorMaterial.routes');
const tutorInsightsRoutes = require('./routes/tutorInsights.routes');
const userDashboardRoutes = require('./routes/userDashboard.routes');
const userRoadmapRoutes = require('./routes/userRoadmap.routes');
const userStudyPlanRoutes = require('./routes/userStudyPlan.routes');
const userPracticeRoutes = require('./routes/userPractice.routes');
const userTryoutRecapRoutes = require('./routes/userTryoutRecap.routes');
const userAnalyticsRoutes = require('./routes/userAnalytics.routes');
const userMaterialsRoutes = require('./routes/userMaterials.routes');
const userAchievementsRoutes = require('./routes/userAchievements.routes');
const questionMaterialsRoutes = require('./routes/questionMaterials.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const profileRoutes = require('./routes/profile.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MatrIQ API is running 🚀",
  });
});

app.use('/api', maintenanceMiddleware);
app.use("/api/auth", authRoutes);
app.use('/api/settings', publicSettingsRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/wilayah", wilayahRoutes);
app.use("/api/pilihan", pilihanRoutes);
app.use("/api/kampus", kampusRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use('/api/admin/questions', adminQuestionRoutes);
app.use('/api/admin/materials', adminMaterialRoutes);
app.use('/api/admin/campuses', adminCampusRoutes);
app.use('/api/admin/tryout-recap', adminTryoutRecapRoutes);
app.use('/api/admin/student-progress', adminStudentProgressRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/admin/moderation', adminModerationRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/tutor/questions', tutorQuestionRoutes);
app.use('/api/tutor/materials', tutorMaterialRoutes);
app.use('/api/tutor', tutorInsightsRoutes);
app.use('/api/user', userDashboardRoutes);
app.use('/api/user', userRoadmapRoutes);
app.use('/api/user', userStudyPlanRoutes);
app.use('/api/user/practice', userPracticeRoutes);
app.use('/api/user/tryout-recap', userTryoutRecapRoutes);
app.use('/api/user/analytics', userAnalyticsRoutes);
app.use('/api/user/materials', userMaterialsRoutes);
app.use('/api/user/achievements', userAchievementsRoutes);
app.use('/api/question-materials', questionMaterialsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/profile', profileRoutes);
module.exports = app;
