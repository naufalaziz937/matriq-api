const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/userStudyPlan.controller');

router.use(auth, allowRoles(2));
router.get('/study-plan', controller.list);
router.get('/study-plan/day', controller.day);
router.get('/study-plan/week-summary', controller.week);
router.get('/study-plan/recommendations', controller.recommendations);
router.get('/study-plan/materials', controller.materials);
router.post('/study-plan/generate', controller.generate);
router.post('/study-plan/generate/save', controller.saveGenerated);
router.post('/study-plan', controller.create);
router.put('/study-plan/:id/complete', controller.complete);
router.put('/study-plan/:id', controller.update);
router.delete('/study-plan/:id', controller.remove);
module.exports = router;
