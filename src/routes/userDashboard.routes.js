const router=require('express').Router();
const auth=require('../middlewares/auth.middleware');
const allowRoles=require('../middlewares/role.middleware');
const {getUserDashboard}=require('../controllers/userDashboard.controller');
router.use(auth,allowRoles(2));
router.get('/dashboard',getUserDashboard);
module.exports=router;
