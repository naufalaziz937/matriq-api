const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const { getUserRoadmap } = require('../controllers/userRoadmap.controller');

router.get('/roadmap', auth, allowRoles(2), getUserRoadmap);
module.exports = router;
