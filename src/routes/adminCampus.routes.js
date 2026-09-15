const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/adminCampus.controller');

const router = express.Router();
router.use(authMiddleware, allowRoles(1));
router.get('/summary', controller.getSummary);
router.get('/', controller.getCampuses);
router.get('/:id', controller.getCampusById);
router.post('/', controller.createCampus);
router.put('/:id', controller.updateCampus);
router.delete('/:id', controller.deactivateCampus);
router.get('/:id/prodi', controller.getPrograms);
router.post('/:id/prodi', controller.createProgram);
router.put('/:id/prodi/:code', controller.updateProgram);
router.delete('/:id/prodi/:code', controller.deactivateProgram);

module.exports = router;
