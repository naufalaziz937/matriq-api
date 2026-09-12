const { KampusPtn, Prodi } = require("../models");

// ======================================
// GET SEMUA KAMPUS AKTIF
// ======================================

const getAllKampus = async (req, res) => {
  try {
    const data = await KampusPtn.findAll({
      where: {
        aktif: true,
      },

      attributes: ["id", "nama", "singkatan", "jenis", "kota", "provinsi_kode"],

      order: [["nama", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Data kampus berhasil diambil",
      data,
    });
  } catch (error) {
    console.error("GET KAMPUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data kampus",
    });
  }
};

// ======================================
// GET PRODI BERDASARKAN KAMPUS
// ======================================

const getProdiByKampus = async (req, res) => {
  try {
    const { kampusId } = req.params;

    const kampus = await KampusPtn.findOne({
      where: {
        id: kampusId,
        aktif: true,
      },

      attributes: ["id", "nama", "singkatan"],
    });

    if (!kampus) {
      return res.status(404).json({
        success: false,
        message: "Kampus tidak ditemukan",
      });
    }

    const data = await Prodi.findAll({
      where: {
        kampus_id: kampusId,

        aktif: true,
      },

      attributes: [
        "kode_snbt",
        "kampus_id",
        "nama",
        "daya_tampung_2024",
        "peminat_2023",
        "sumber_tahun",
      ],

      order: [["nama", "ASC"]],
    });

    return res.status(200).json({
      success: true,

      kampus,

      data,
    });
  } catch (error) {
    console.error("GET PRODI ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data program studi",
    });
  }
};

// ======================================
// OPTIONAL:
// GET SEMUA KAMPUS + PRODI SEKALIGUS
// ======================================

const getAllKampusWithProdi = async (req, res) => {
  try {
    const data = await KampusPtn.findAll({
      where: {
        aktif: true,
      },

      attributes: ["id", "nama", "singkatan", "jenis", "kota"],

      include: [
        {
          model: Prodi,
          as: "prodi",

          where: {
            aktif: true,
          },

          required: false,

          attributes: [
            "kode_snbt",
            "nama",
            "daya_tampung_2024",
            "peminat_2023",
          ],
        },
      ],

      order: [
        ["nama", "ASC"],
        [
          {
            model: Prodi,
            as: "prodi",
          },
          "nama",
          "ASC",
        ],
      ],
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET KAMPUS+PRODI ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data kampus dan prodi",
    });
  }
};

module.exports = {
  getAllKampus,
  getProdiByKampus,
  getAllKampusWithProdi,
};
