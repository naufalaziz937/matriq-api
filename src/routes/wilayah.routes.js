const express = require("express");

const {
  getAllProvinsi,
  getKotaKabByProvinsi,
} = require("../controllers/wilayah.controller");

const router = express.Router();

router.get("/provinsi", getAllProvinsi);

router.get("/kota-kab", getKotaKabByProvinsi);

module.exports = router;
