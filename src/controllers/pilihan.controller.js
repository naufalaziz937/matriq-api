const { PilihanKampus } = require("../models");

const getPilihanKampus = async (req, res) => {
  try {
    const data = await PilihanKampus.findAll({
      attributes: ["id", "kampus", "prodi"],

      order: [
        ["kampus", "ASC"],
        ["prodi", "ASC"],
      ],
    });

    const result = data.map((item) => ({
      id: item.id,

      nama: `${item.kampus} - ${item.prodi}`,
    }));

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET PILIHAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil pilihan kampus",
    });
  }
};

module.exports = {
  getPilihanKampus,
};
