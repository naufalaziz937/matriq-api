const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload.middleware");

const { completeOnboarding } = require("../controllers/onboarding.controller");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  upload.single("foto_profile"),
  completeOnboarding,
);

module.exports = router;
