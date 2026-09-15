require("dotenv").config();

const app = require("./src/app");
const { sequelize, connectDatabase } = require("./src/config/database");

require("./src/models");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDatabase();

  try {
    await require('./src/services/practiceMigration.service').preparePracticeSchema();
    await require('./src/services/userTryoutRecap.service').prepareSchema();
    await sequelize.sync({ alter: true });
    await require('./src/services/userAnalytics.service').ensureIndexes();
    await require('./src/services/achievement.service').seedDefinitions();
    await require('./src/services/settings.service').seedDefaults();

    console.log("✅ Database synchronized");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
  }
};

startServer();
