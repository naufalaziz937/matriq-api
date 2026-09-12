const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
  User,
  UserProfile,
} = require("../models");

// ======================================================
// REGISTER
// ======================================================

const register = async (req, res) => {
  try {
    const {
      nama,
      email,
      password,
    } = req.body;

    if (!nama || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama, email, dan password wajib diisi",
      });
    }

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    const existingUser = await User.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10,
    );

    const user = await User.create({
      nama: String(nama).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 2,
      is_activate: false,
    });

    return res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      data: {
        user_id: user.user_id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        is_activate: user.is_activate,
      },
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

// ======================================================
// LOGIN
// ======================================================

const login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi",
      });
    }

    const normalizedEmail = String(email)
      .trim()
      .toLowerCase();

    const user = await User.findOne({
      where: {
        email: normalizedEmail,
      },

      include: [
        {
          model: UserProfile,
          as: "profile",
          required: false,
        },
      ],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password,
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
      });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // Convert instance Sequelize -> object biasa
    // supaya field BOOLEAN is_activate ikut terkirim.
    const userData = user.toJSON();

    delete userData.password;

    return res.status(200).json({
      success: true,
      message: "Login berhasil",

      data: {
        token,
        user: userData,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

// ======================================================
// CURRENT USER
// ======================================================

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id, {
      attributes: {
        exclude: ["password"],
      },
      include: [
        {
          model: UserProfile,
          as: "profile",
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
    console.error("GET CURRENT USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

// ======================================================
// RESET PASSWORD
// ======================================================

const resetPassword = async (req, res) => {
  try {
    const userId =
      req.user.user_id;

    const {
      password_lama,
      password_baru,
      konfirmasi_password,
    } = req.body;

    if (
      !password_lama ||
      !password_baru ||
      !konfirmasi_password
    ) {
      return res.status(400).json({
        success: false,
        message: "Semua field password wajib diisi",
      });
    }

    if (
      password_baru !==
      konfirmasi_password
    ) {
      return res.status(400).json({
        success: false,
        message: "Konfirmasi password tidak cocok",
      });
    }

    if (
      String(password_baru).length <
      8
    ) {
      return res.status(400).json({
        success: false,
        message: "Password baru minimal 8 karakter",
      });
    }

    const user = await User.findByPk(
      userId,
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const passwordMatch =
      await bcrypt.compare(
        password_lama,
        user.password,
      );

    if (!passwordMatch) {
      return res.status(400).json({
        success: false,
        message: "Password lama salah",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password_baru,
        10,
      );

    await user.update({
      password: hashedPassword,
    });

    return res.status(200).json({
      success: true,
      message: "Password berhasil diubah",
    });
  } catch (error) {
    console.error(
      "RESET PASSWORD ERROR:",
      error,
    );

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  resetPassword,
};
