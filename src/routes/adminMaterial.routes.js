const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const upload = require('../middlewares/materialUpload.middleware');
const controller = require('../controllers/adminMaterial.controller');

const router = express.Router();
router.use(authMiddleware, allowRoles(1));
router.get('/summary', controller.getSummary);
router.get('/', controller.getMaterials);
router.get('/:id/file', controller.getFile);
router.get('/:id', controller.getMaterialById);
router.post('/', upload, controller.createMaterial);
router.put('/:id', upload, controller.updateMaterial);
router.delete('/:id', controller.deleteMaterial);

module.exports = router;
