const router=require('express').Router();
const auth=require('../middlewares/auth.middleware');
const allowRoles=require('../middlewares/role.middleware');
const c=require('../controllers/tutorInsights.controller');
router.use(auth,allowRoles(3));
router.get('/dashboard',c.dashboard);router.get('/analytics',c.analytics);router.get('/student-insights',c.studentInsights);router.get('/moderation',c.moderation);
module.exports=router;
