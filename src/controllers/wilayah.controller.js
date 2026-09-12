const { Provinsi, KotaKab } = require("../models");

// ======================================
// GET SEMUA PROVINSI
// ======================================

const getAllProvinsi = async (req, res) => {
  try {
    const provinsi = await Provinsi.findAll({
      attributes: ["kode", "nama"],

      order: [["nama", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Data provinsi berhasil diambil",
      data: provinsi,
    });
  } catch (error) {
    console.error("GET PROVINSI ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data provinsi",
    });
  }
};

// ======================================
// GET KOTA/KAB BERDASARKAN PROVINSI
// ======================================

const getKotaKabByProvinsi = async (req, res) => {
  try {
    const { provinsi_kode } = req.query;

    if (!provinsi_kode) {
      return res.status(400).json({
        success: false,
        message: "provinsi_kode wajib diisi",
      });
    }

    // cek provinsi
    const provinsi = await Provinsi.findByPk(provinsi_kode);

    if (!provinsi) {
      return res.status(404).json({
        success: false,
        message: "Provinsi tidak ditemukan",
      });
    }

    const kotaKab = await KotaKab.findAll({
      where: {
        provinsi_kode,
      },

      attributes: ["kode", "provinsi_kode", "jenis", "nama"],

      order: [
        ["jenis", "ASC"],
        ["nama", "ASC"],
      ],
    });

    const data = kotaKab.map((item) => ({
      kode: item.kode,
      provinsi_kode: item.provinsi_kode,
      jenis: item.jenis,
      nama: item.nama,

      // buat dropdown FE
      label: `${item.jenis} ${item.nama}`,
    }));

    return res.status(200).json({
      success: true,

      provinsi: {
        kode: provinsi.kode,
        nama: provinsi.nama,
      },

      data,
    });
  } catch (error) {
    console.error("GET KOTA/KAB ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data kota/kabupaten",
    });
  }
};

module.exports = {
  getAllProvinsi,
  getKotaKabByProvinsi,
};
