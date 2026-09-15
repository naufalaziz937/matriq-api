const router=require('express').Router();
const authMiddleware=require('../middlewares/auth.middleware');
const allowRoles=require('../middlewares/role.middleware');
const controller=require('../controllers/adminStudentProgress.controller');
router.use(authMiddleware,allowRoles(1));
router.get('/summary',controller.summary);
router.get('/user/:userId',controller.detail);
router.get('/',controller.list);
module.exports=router;
