const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/userAchievements.controller');
router.use(auth, allowRoles(2));
router.get('/', controller.overview);
module.exports = router;
