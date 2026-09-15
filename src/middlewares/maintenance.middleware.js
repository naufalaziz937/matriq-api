const jwt=require('jsonwebtoken');
const {getSettingValue}=require('../services/settings.service');
module.exports=async(req,res,next)=>{
  if (req.path==='/auth/login' || req.path==='/settings/public') return next();
  const enabled=await getSettingValue('maintenance_mode',false);
  if(!enabled) return next();
  try { const token=req.headers.authorization?.split(' ')[1]; if(token && Number(jwt.verify(token,process.env.JWT_SECRET)?.role)===1) return next(); } catch {}
  const message=await getSettingValue('maintenance_message','MatrIQ sedang dalam pemeliharaan. Silakan coba lagi nanti.');
  res.status(503).json({success:false,code:'MAINTENANCE_MODE',message});
};
