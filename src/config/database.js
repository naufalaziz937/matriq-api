const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    dialect: "postgres",

    logging: process.env.NODE_ENV === "development" ? console.log : false,

    dialectOptions:
      process.env.NODE_ENV === "production"
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {},
  },
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed");
    console.error("Name:", error?.name);
    console.error("Message:", error?.message);
    console.error("Original:", error?.original?.message);
    console.error("Parent:", error?.parent?.message);

    process.exit(1);
  }
};

module.exports = {
  sequelize,
  connectDB,
};
