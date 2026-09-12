const express = require("express");

const { getPilihanKampus } = require("../controllers/pilihan.controller");

const router = express.Router();

router.get("/", getPilihanKampus);

module.exports = router;
