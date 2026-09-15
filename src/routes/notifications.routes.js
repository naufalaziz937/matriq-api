const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/notifications.controller');
router.use(auth);
router.get('/', controller.list);
router.put('/read-all', controller.readAll);
router.put('/:id/read', controller.read);
module.exports = router;
