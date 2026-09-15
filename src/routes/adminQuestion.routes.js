const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/adminQuestion.controller');

const router = express.Router();
router.use(authMiddleware, allowRoles(1));
router.get('/summary', controller.getSummary);
router.get('/', controller.getQuestions);
router.get('/:id', controller.getQuestionById);
router.post('/', controller.createQuestion);
router.put('/:id', controller.updateQuestion);
router.delete('/:id', controller.deleteQuestion);

module.exports = router;
