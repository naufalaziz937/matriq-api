const router=require('express').Router();
const auth=require('../middlewares/auth.middleware');
const allowRoles=require('../middlewares/role.middleware');
const { sequelize }=require('../config/database');
const cloudinary=require('../config/cloudinary');
const service=require('../services/settings.service');
const pkg=require('../../package.json');
router.use(auth,allowRoles(1));
const fail=(res,error)=>{if(!error.status) console.error('SETTINGS ERROR:',error);res.status(error.status||500).json({success:false,message:error.status?error.message:'Gagal memproses pengaturan.'});};
router.get('/system-status',async(req,res)=>{
  let database='disconnected';
  try { await sequelize.authenticate(); database='connected'; } catch {}
  const configured=Boolean(cloudinary.config().cloud_name && cloudinary.config().api_key && cloudinary.config().api_secret);
  res.json({success:true,data:{api:'online',database,cloudinary:configured?'configured':'not_configured',environment:process.env.NODE_ENV||'development',version:pkg.version}});
});
router.get('/',async(req,res)=>{try{res.json({success:true,data:await service.getAllSettings(),meta:Object.fromEntries(Object.entries(service.registry).map(([key,spec])=>[key,{applied:spec.applied!==false}]))});}catch(error){fail(res,error);}});
router.put('/',async(req,res)=>{try{res.json({success:true,message:'Pengaturan berhasil disimpan.',data:await service.setSettingsBulk(req.body,req.user.user_id)});}catch(error){fail(res,error);}});
module.exports=router;
