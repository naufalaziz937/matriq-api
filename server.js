require("dotenv").config();

const app = require("./src/app");
const { sequelize, connectDatabase } = require("./src/config/database");

require("./src/models");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDatabase();

  try {
    await sequelize.sync({ alter: true });

    console.log("✅ Database synchronized");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
  }
};

startServer();
