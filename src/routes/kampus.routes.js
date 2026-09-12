const express = require("express");

const {
  getAllKampus,
  getProdiByKampus,
  getAllKampusWithProdi,
} = require("../controllers/kampus.controller");

const router = express.Router();

router.get("/", getAllKampus);

router.get("/with-prodi", getAllKampusWithProdi);

router.get("/:kampusId/prodi", getProdiByKampus);

module.exports = router;
