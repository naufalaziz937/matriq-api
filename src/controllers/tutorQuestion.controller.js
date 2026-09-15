const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Question, User } = require('../models');
const notifications = require('../services/notification.service');
const { validateQuestion, materialError } = require('./adminQuestion.controller');
const creator = { model: User, as: 'created_by', attributes: ['user_id','nama','role','foto_profile'] };
const reviewer = { model: User, as: 'reviewer', attributes: ['user_id','nama','role'] };
const fail = (res,status,message) => res.status(status).json({ success:false,message });
const idOf = value => Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;

async function summary(req,res) {
  try {
    const [data] = await sequelize.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE status='review')::int review,
      COUNT(*) FILTER (WHERE status='active')::int active,
      COUNT(*) FILTER (WHERE status='rejected')::int rejected
      FROM questions WHERE created_by_id=:userId`, { replacements:{userId:req.user.user_id},type:QueryTypes.SELECT });
    res.json({success:true,data});
  } catch(error) { console.error('TUTOR QUESTION SUMMARY:',error);fail(res,500,'Gagal memuat ringkasan soal'); }
}

async function list(req,res) {
  const page=Math.max(1,parseInt(req.query.page,10)||1),limit=Math.min(50,Math.max(1,parseInt(req.query.limit,10)||10));
  try {
    const { count,rows }=await Question.findAndCountAll({ where:{created_by_id:req.user.user_id},include:[creator],order:[['created_at','DESC'],['id','DESC']],limit,offset:(page-1)*limit });
    res.json({success:true,data:rows,pagination:{page,limit,total:count,total_pages:Math.max(1,Math.ceil(count/limit))}});
  } catch(error) { console.error('TUTOR QUESTIONS:',error); fail(res,500,'Gagal memuat soal Tutor'); }
}
async function detail(req,res) {
  const id=idOf(req.params.id);if(!id)return fail(res,400,'ID soal tidak valid');
  try { const item=await Question.findOne({where:{id,created_by_id:req.user.user_id},include:[creator,reviewer]});if(!item)return fail(res,404,'Soal tidak ditemukan');res.json({success:true,data:item}); }
  catch(error){console.error('TUTOR QUESTION DETAIL:',error);fail(res,500,'Gagal memuat detail soal');}
}
async function create(req,res) {
  const requiresReview=await require('../services/settings.service').getSettingValue('tutor_submission_requires_review',true);
  const status=req.body?.status==='draft'?'draft':requiresReview?'review':'active';
  const result=validateQuestion({...req.body,status});if(result.error)return fail(res,400,result.error);
  try { const issue=await materialError(result.value);if(issue)return fail(res,400,issue);
    const item=await Question.create({...result.value,status,created_by_id:req.user.user_id,submitted_at:status==='draft'?null:new Date(),reviewed_by_id:null,reviewed_at:null,rejection_reason:null});
    const saved=await Question.findByPk(item.id,{include:[creator]});
    if(status==='review') await notifications.adminsAfterEvent({type:'new_question_review',title:'Soal Baru Menunggu Review',message:`${saved.created_by?.nama || 'Tutor'} mengirim soal ${String(saved.question).slice(0,80)}.`,actionUrl:'/moderation'});
    res.status(201).json({success:true,message:status==='draft'?'Soal draft berhasil dibuat':requiresReview?'Soal dikirim untuk review':'Soal berhasil diterbitkan',data:saved}); }
  catch(error){console.error('TUTOR QUESTION CREATE:',error);fail(res,500,'Gagal mengirim soal');}
}
async function update(req,res) {
  const id=idOf(req.params.id);if(!id)return fail(res,400,'ID soal tidak valid');
  try {
    const item=await Question.findOne({where:{id,created_by_id:req.user.user_id}});
    if(!item)return fail(res,404,'Soal tidak ditemukan');
    if(item.status==='active')return fail(res,400,'Soal aktif tidak dapat diedit langsung');
    if(item.status==='review' && !(await require('../services/settings.service').getSettingValue('tutor_can_edit_while_review',false))) return fail(res,400,'Soal yang sedang direview tidak dapat diedit');
    const result=validateQuestion({...item.toJSON(),...(req.body||{}),status:item.status});if(result.error)return fail(res,400,result.error);
    const issue=await materialError(result.value);if(issue)return fail(res,400,issue);
    const {status:_ignored,...content}=result.value;
    const [updated]=await Question.update(content,{where:{id,created_by_id:req.user.user_id,status:{[Op.in]:['draft','review','rejected']}}});
    if(!updated)return fail(res,409,'Status soal berubah. Muat ulang detail.');
    const saved=await Question.findByPk(id,{include:[creator,reviewer]});res.json({success:true,message:'Soal berhasil diperbarui',data:saved});
  } catch(error){console.error('TUTOR QUESTION UPDATE:',error);fail(res,500,'Gagal memperbarui soal');}
}
async function submit(req,res) {
  const id=idOf(req.params.id);if(!id)return fail(res,400,'ID soal tidak valid');
  const allowResubmit=await require('../services/settings.service').getSettingValue('allow_tutor_resubmit',true);
  const requiresReview=await require('../services/settings.service').getSettingValue('tutor_submission_requires_review',true);
  const targetStatus=requiresReview?'review':'active';
  try {
    const item=await Question.findOne({where:{id,created_by_id:req.user.user_id}});
    if(item && targetStatus==='active'){const issue=await materialError({...item.toJSON(),status:'active'});if(issue)return fail(res,400,issue);}
    const [updated]=await Question.update({status:targetStatus,submitted_at:new Date(),reviewed_by_id:null,reviewed_at:null,rejection_reason:null},{where:{id,created_by_id:req.user.user_id,status:{[Op.in]:allowResubmit?['draft','rejected']:['draft']}}});
    if(!updated){const item=await Question.findOne({where:{id,created_by_id:req.user.user_id}});return fail(res,item?.status==='rejected'&&!allowResubmit?403:item?400:404,item?.status==='rejected'&&!allowResubmit?'Pengiriman ulang soal ditolak dinonaktifkan':item?'Hanya draft atau soal ditolak yang dapat dikirim ulang':'Soal tidak ditemukan');}
    const saved=await Question.findByPk(id,{include:[creator]});
    if(targetStatus==='review') await notifications.adminsAfterEvent({type:'new_question_review',title:'Soal Baru Menunggu Review',message:`${saved.created_by?.nama || 'Tutor'} mengirim soal ${String(saved.question).slice(0,80)}.`,actionUrl:'/moderation'});
    res.json({success:true,message:requiresReview?'Soal dikirim untuk review':'Soal berhasil diterbitkan',data:saved});
  }catch(error){console.error('TUTOR QUESTION SUBMIT:',error);fail(res,500,'Gagal mengirim ulang soal');}
}
async function remove(req,res) {
  const id=idOf(req.params.id);if(!id)return fail(res,400,'ID soal tidak valid');
  try {
    const deleted=await Question.destroy({where:{id,created_by_id:req.user.user_id,status:{[Op.in]:['draft','rejected']}}});
    if(!deleted){const item=await Question.findOne({where:{id,created_by_id:req.user.user_id}});return fail(res,item?400:404,item?'Hanya draft atau soal ditolak yang dapat dihapus':'Soal tidak ditemukan');}
    res.json({success:true,message:'Soal berhasil dihapus'});
  } catch(error){console.error('TUTOR QUESTION DELETE:',error);fail(res,500,'Gagal menghapus soal');}
}
module.exports={summary,list,detail,create,update,submit,remove};
