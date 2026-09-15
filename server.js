require("dotenv").config();

const app = require("./src/app");
const { sequelize, connectDB } = require("./src/config/database");

require("./src/models");

const PORT = process.env.PORT || 8000;

const startServer = async () => {
  await connectDB();

  try {
    await require("./src/services/practiceMigration.service").preparePracticeSchema();
    await require("./src/services/userTryoutRecap.service").prepareSchema();
    await require("./src/services/userAnalytics.service").ensureIndexes();
    await require("./src/services/achievement.service").seedDefinitions();
    await require("./src/services/settings.service").seedDefaults();

    console.log("✅ Database synchronized");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`MatrIQ API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
  }
};

startServer();
