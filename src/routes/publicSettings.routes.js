const router=require('express').Router();
const {getAllSettings}=require('../services/settings.service');
router.get('/public',async(req,res)=>{try{res.json({success:true,data:await getAllSettings({publicOnly:true})});}catch(error){console.error('PUBLIC SETTINGS:',error);res.status(500).json({success:false,message:'Gagal memuat pengaturan publik.'});}});
module.exports=router;
