const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

const { User, UserProfile, UserTarget } = require("../models");

// ======================================================
// GET ALL USERS
// ======================================================

const getAllUsers = async (req, res) => {
  try {
    const { search = "", role, page = 1, limit = 10 } = req.query;

    const parsedPage = Math.max(Number(page) || 1, 1);

    const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

    const offset = (parsedPage - 1) * parsedLimit;

    const where = {};

    // =========================
    // SEARCH
    // =========================

    if (search) {
      where[Op.or] = [
        {
          nama: {
            [Op.iLike]: `%${search}%`,
          },
        },

        {
          email: {
            [Op.iLike]: `%${search}%`,
          },
        },

        {
          no_hp: {
            [Op.iLike]: `%${search}%`,
          },
        },
      ];
    }

    // =========================
    // ROLE FILTER
    // =========================

    if (role) {
      where.role = Number(role);
    }

    const { count, rows } = await User.findAndCountAll({
      where,

      attributes: {
        exclude: ["password"],
      },

      include: [
        {
          model: UserProfile,

          as: "profile",

          required: false,
        },

        {
          model: UserTarget,

          as: "target",

          required: false,
        },
      ],

      order: [["created_at", "DESC"]],

      limit: parsedLimit,

      offset,

      distinct: true,
    });

    const totalPages = Math.ceil(count / parsedLimit);

    return res.status(200).json({
      success: true,

      message: "Data user berhasil diambil",

      data: rows,

      pagination: {
        page: parsedPage,

        limit: parsedLimit,

        total: count,

        total_pages: totalPages,
      },
    });
  } catch (error) {
    console.error("GET ALL USERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data user",
    });
  }
};

// ======================================================
// GET USER BY ID
// ======================================================

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: {
        exclude: ["password"],
      },

      include: [
        {
          model: UserProfile,

          as: "profile",

          required: false,
        },

        {
          model: UserTarget,

          as: "target",

          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("GET USER DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail user",
    });
  }
};

// ======================================================
// CREATE USER
// ======================================================

const createUser = async (req, res) => {
  try {
    const {
      nama,
      email,
      no_hp,
      password,
      gender,
      role = 2,
      is_activate = false,
    } = req.body;

    // =========================
    // VALIDATION
    // =========================

    if (!nama || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const validRoles = [1, 2, 3];

    const parsedRole = Number(role);

    if (!validRoles.includes(parsedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role tidak valid",
      });
    }

    const minimumLength=await require('../services/settings.service').getSettingValue('minimum_password_length',8);
    if (String(password).length < minimumLength) {
      return res.status(400).json({
        success: false,
        message: `Password minimal ${minimumLength} karakter`,
      });
    }

    const existingUser = await User.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email sudah digunakan",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await User.create({
      nama: String(nama).trim(),

      email: normalizedEmail,

      no_hp: no_hp || null,

      password: hashedPassword,

      gender: gender || null,

      role: parsedRole,

      is_activate: Boolean(is_activate),
    });

    const userData = createdUser.toJSON();

    delete userData.password;

    return res.status(201).json({
      success: true,

      message: "User berhasil dibuat",

      data: userData,
    });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal membuat user",
    });
  }
};

// ======================================================
// UPDATE USER
// ======================================================

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { nama, email, no_hp, password, gender, role, is_activate } =
      req.body;

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const updateData = {};

    // =========================
    // NAMA
    // =========================

    if (nama !== undefined) {
      updateData.nama = String(nama).trim();
    }

    // =========================
    // EMAIL
    // =========================

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();

      const emailUsed = await User.findOne({
        where: {
          email: normalizedEmail,

          user_id: {
            [Op.ne]: user.user_id,
          },
        },
      });

      if (emailUsed) {
        return res.status(409).json({
          success: false,
          message: "Email sudah digunakan user lain",
        });
      }

      updateData.email = normalizedEmail;
    }

    // =========================
    // NO HP
    // =========================

    if (no_hp !== undefined) {
      updateData.no_hp = no_hp || null;
    }

    // =========================
    // GENDER
    // =========================

    if (gender !== undefined) {
      if (gender && !["L", "P"].includes(gender)) {
        return res.status(400).json({
          success: false,
          message: "Gender harus L atau P",
        });
      }

      updateData.gender = gender || null;
    }

    // =========================
    // ROLE
    // =========================

    if (role !== undefined) {
      const parsedRole = Number(role);

      if (![1, 2, 3].includes(parsedRole)) {
        return res.status(400).json({
          success: false,
          message: "Role tidak valid",
        });
      }

      updateData.role = parsedRole;
    }

    // =========================
    // IS ACTIVATE
    // =========================

    if (is_activate !== undefined) {
      updateData.is_activate =
        is_activate === true ||
        is_activate === "true" ||
        is_activate === 1 ||
        is_activate === "1";
    }

    // =========================
    // PASSWORD
    // =========================

    if (password) {
      const minimumLength=await require('../services/settings.service').getSettingValue('minimum_password_length',8);
      if (String(password).length < minimumLength) {
        return res.status(400).json({
          success: false,
          message: `Password minimal ${minimumLength} karakter`,
        });
      }

      updateData.password = await bcrypt.hash(password, 10);
    }

    await user.update(updateData);

    const updatedUser = await User.findByPk(user.user_id, {
      attributes: {
        exclude: ["password"],
      },

      include: [
        {
          model: UserProfile,

          as: "profile",

          required: false,
        },

        {
          model: UserTarget,

          as: "target",

          required: false,
        },
      ],
    });

    return res.status(200).json({
      success: true,

      message: "User berhasil diperbarui",

      data: updatedUser,
    });
  } catch (error) {
    console.error("UPDATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui user",
    });
  }
};

// ======================================================
// DELETE USER
// ======================================================

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const currentUserId = Number(req.user.user_id);

    const targetUserId = Number(id);

    // =========================
    // PREVENT DELETE SELF
    // =========================

    if (currentUserId === targetUserId) {
      return res.status(400).json({
        success: false,
        message: "Admin tidak dapat menghapus akun sendiri",
      });
    }

    const user = await User.findByPk(targetUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    await user.destroy();

    return res.status(200).json({
      success: true,
      message: "User berhasil dihapus",
    });
  } catch (error) {
    console.error("DELETE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus user",
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
