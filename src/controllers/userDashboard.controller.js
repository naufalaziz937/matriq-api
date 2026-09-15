const {QueryTypes}=require('sequelize');
const {sequelize}=require('../config/database');
const {User,UserProfile}=require('../models');
const {getSettingValue}=require('../services/settings.service');
const query=(sql,userId)=>sequelize.query(sql,{bind:{userId},type:QueryTypes.SELECT});
const SUBTEST_LABELS={pu:'Penalaran Umum',ppu:'Pengetahuan dan Pemahaman Umum',pbm:'Pemahaman Bacaan dan Menulis',pk:'Pengetahuan Kuantitatif',lbi:'Literasi Bahasa Indonesia',lbe:'Literasi Bahasa Inggris',pm:'Penalaran Matematika'};

async function getUserDashboard(req,res){
  const userId=req.user.user_id;
  try{
    const [user,profile,targetRows,progressRows,dailyRows,studyDays,studyProgress,tryoutRows,latestRows,trendRows,activityRows,activeMaterials,dailyTarget]=await Promise.all([
      User.findByPk(userId,{attributes:['user_id','nama','foto_profile','role','is_activate']}),
      UserProfile.findOne({where:{user_id:userId},attributes:['sekolah','kelas','tahun_lulus','provinsi','kota_kab']}),
      query(`SELECT k.nama AS campus,k.singkatan AS campus_short,p.nama AS program,ut.target_score FROM user_targets ut LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(ut.pilihan)='array' THEN ut.pilihan->0 END AS choice) first_choice ON true LEFT JOIN prodi p ON p.kode_snbt=CASE WHEN jsonb_typeof(first_choice.choice) IN ('string','number') THEN first_choice.choice #>> '{}' WHEN jsonb_typeof(first_choice.choice)='object' THEN COALESCE(first_choice.choice->>'prodi_code',first_choice.choice->>'kode_snbt') END LEFT JOIN kampus_ptn k ON k.id=COALESCE(p.kampus_id,CASE WHEN first_choice.choice #>> '{}' ~ '^\\d{1,3}$' THEN (first_choice.choice #>> '{}')::int END) WHERE ut.user_id=$userId LIMIT 1`,userId),
      query(`SELECT COALESCE(SUM(soal_dikerjakan),0)::int total_questions,COALESCE(SUM(soal_benar),0)::int total_correct,COALESCE(SUM(soal_salah),0)::int total_wrong,CASE WHEN SUM(soal_dikerjakan)>0 THEN ROUND(100.0*SUM(soal_benar)/SUM(soal_dikerjakan),1) END average_accuracy,COALESCE(SUM(waktu_belajar),0)::int total_study_minutes,COUNT(DISTINCT materi_id)::int completed_materials FROM study_progress WHERE user_id=$userId`,userId),
      query(`SELECT COALESCE(SUM(soal_dikerjakan),0)::int completed_questions,COALESCE(SUM(waktu_belajar),0)::int study_minutes FROM study_progress WHERE user_id=$userId AND (created_at AT TIME ZONE 'Asia/Jakarta')::date=(NOW() AT TIME ZONE 'Asia/Jakarta')::date`,userId),
      query(`SELECT DISTINCT day FROM (SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date AS day FROM study_progress WHERE user_id=$userId UNION SELECT (completed_at AT TIME ZONE 'Asia/Jakarta')::date AS day FROM study_plans WHERE user_id=$userId AND status='completed' AND completed_at IS NOT NULL) activity_days ORDER BY day DESC LIMIT 90`,userId),
      query(`SELECT sp.progress_id,sp.materi_id,m.title AS materi,sp.soal_dikerjakan,sp.soal_benar,sp.soal_salah,sp.waktu_belajar,sp.created_at FROM study_progress sp LEFT JOIN materials m ON m.id=sp.materi_id WHERE sp.user_id=$userId ORDER BY sp.created_at DESC,sp.progress_id DESC LIMIT 10`,userId),
      query(`SELECT COUNT(*)::int total_recap,MAX(total_score) AS best_score,ROUND(AVG(total_score),1) AS average_score,${Object.keys(SUBTEST_LABELS).map(key=>`ROUND(AVG(${key}),1) AS ${key}`).join(',')} FROM tryout_recap WHERE user_id=$userId`,userId),
      query(`SELECT total_score AS latest_score,recap_at,platform,tryout_name FROM tryout_recap WHERE user_id=$userId ORDER BY recap_at DESC,recap_id DESC LIMIT 1`,userId),
      query(`SELECT recap_id,recap_at,total_score,platform,tryout_name FROM tryout_recap WHERE user_id=$userId ORDER BY recap_at DESC,recap_id DESC LIMIT 10`,userId),
      query(`SELECT * FROM (SELECT 'study' AS kind,sp.progress_id AS id,m.title AS title,sp.soal_dikerjakan AS questions,CASE WHEN sp.soal_dikerjakan>0 THEN ROUND(100.0*sp.soal_benar/sp.soal_dikerjakan,1) END AS accuracy,NULL::numeric AS score,NULL::text AS platform,sp.created_at AS occurred_at FROM study_progress sp LEFT JOIN materials m ON m.id=sp.materi_id WHERE sp.user_id=$userId UNION ALL SELECT 'tryout',recap_id,tryout_name,NULL::int,NULL::numeric,total_score,platform,recap_at FROM tryout_recap WHERE user_id=$userId) activities ORDER BY occurred_at DESC,id DESC LIMIT 8`,userId),
      sequelize.query("SELECT COUNT(*)::int total FROM materials WHERE status='active'",{type:QueryTypes.SELECT}),
      getSettingValue('default_daily_question_target',50),
    ]);
    if(!user)return res.status(404).json({success:false,message:'User tidak ditemukan.'});
    const total=progressRows[0],daily=dailyRows[0],scores=tryoutRows[0];
    const today=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Jakarta'}));today.setHours(0,0,0,0);
    let cursor=today,streak=0;
    for(const row of studyDays){const day=new Date(`${row.day}T00:00:00`);if(streak===0&&day.getTime()===cursor.getTime()-86400000)cursor=day;if(day.getTime()!==cursor.getTime())break;streak++;cursor=new Date(cursor.getTime()-86400000);}
    const performance=Object.entries(SUBTEST_LABELS).map(([key,label])=>({code:key.toUpperCase(),label,average_score:scores[key]==null?null:Number(scores[key])}));
    const observed=performance.filter(item=>item.average_score!=null).sort((a,b)=>a.average_score-b.average_score);
    const weakest=observed[0],strongest=observed.at(-1);
    const recommendation=weakest?{tag:'Rekomendasi Belajar',title:`Fokus ke ${weakest.label} minggu ini.`,description:`Rata-rata skor ${weakest.code} dari rekap tryoutmu ${weakest.average_score}.`,action_text:'Lihat Rekap'}:null;
    const target=targetRows[0]||null;
    const response={
      user:user.toJSON(),profile:profile?.toJSON()||null,
      target:target?{campus:target.campus||null,campus_short:target.campus_short||null,program:target.program||null,target_score:target.target_score}:null,
      stats:{streak_days:streak,total_study_minutes:total.total_study_minutes,total_questions:total.total_questions,total_correct:total.total_correct,total_wrong:total.total_wrong,average_accuracy:total.average_accuracy==null?null:Number(total.average_accuracy)},
      daily_progress:{target_questions:dailyTarget,completed_questions:daily.completed_questions,study_minutes:daily.study_minutes},
      study_progress:studyProgress,
      category_progress:{completed_materials:total.completed_materials,total_materials:activeMaterials[0].total},
      tryout:{total_recap:scores.total_recap,latest_score:latestRows[0]?.latest_score==null?null:Number(latestRows[0].latest_score),best_score:scores.best_score==null?null:Number(scores.best_score),average_score:scores.average_score==null?null:Number(scores.average_score)},
      tryout_trend:trendRows.reverse().map(row=>({...row,total_score:Number(row.total_score)})),
      subtest_performance:performance,strongest_subtest:strongest||null,weakest_subtest:weakest||null,
      recent_activities:activityRows,recommendations:recommendation?[recommendation]:[],
    };
    res.json({success:true,data:response});
  }catch(error){console.error('USER DASHBOARD:',error);res.status(500).json({success:false,message:'Gagal memuat dashboard.'});}
}
module.exports={getUserDashboard};
