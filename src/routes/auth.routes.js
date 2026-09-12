const express = require("express");

const {
  register,
  login,
  getCurrentUser,
  resetPassword,
} = require("../controllers/auth.controller");

const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", register);

router.post("/login", login);

router.get("/me", authMiddleware, getCurrentUser);

router.put("/reset-password", authMiddleware, resetPassword);

module.exports = router;
