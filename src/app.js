const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const onboardingRoutes = require("./routes/onboarding.routes");
const wilayahRoutes = require("./routes/wilayah.routes");
const pilihanRoutes = require("./routes/pilihan.routes");
const kampusRoutes = require("./routes/kampus.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "MatrIQ API is running 🚀",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/wilayah", wilayahRoutes);
app.use("/api/pilihan", pilihanRoutes);
app.use("/api/kampus", kampusRoutes);
module.exports = app;
