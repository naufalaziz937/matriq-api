const router=require('express').Router();
const auth=require('../middlewares/auth.middleware');
const allowRoles=require('../middlewares/role.middleware');
const upload=require('../middlewares/materialUpload.middleware');
const c=require('../controllers/tutorMaterial.controller');
router.use(auth,allowRoles(3));
router.get('/',c.list);router.get('/:id/file',c.file);router.get('/:id',c.detail);
router.post('/',upload,c.create);router.put('/:id',upload,c.update);router.delete('/:id',c.remove);router.put('/:id/submit',c.submit);
module.exports=router;
