const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");

const allowRoles = require("../middlewares/role.middleware");

const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/adminUser.controller");

const router = express.Router();

// Semua endpoint di file ini
// hanya ADMIN
router.use(authMiddleware, allowRoles(1));

// GET ALL
router.get("/", getAllUsers);

// GET DETAIL
router.get("/:id", getUserById);

// CREATE
router.post("/", createUser);

// UPDATE
router.put("/:id", updateUser);

// DELETE
router.delete("/:id", deleteUser);

module.exports = router;
