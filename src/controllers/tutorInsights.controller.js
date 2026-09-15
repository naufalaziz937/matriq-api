const {sequelize}=require('../config/database');
const {QueryTypes}=require('sequelize');
const query=(sql,userId)=>sequelize.query(sql,{bind:{userId},type:QueryTypes.SELECT});
const handle=fn=>async(req,res)=>{try{res.json({success:true,data:await fn(req.user.user_id)});}catch(error){console.error('TUTOR INSIGHTS:',error);res.status(500).json({success:false,message:'Gagal memuat data Tutor.'});}};

const dashboard=handle(async userId=>{
  const [summaryRows,recentContent,recentModeration,contributionTrend]=await Promise.all([
    query(`SELECT (SELECT COUNT(*)::int FROM questions WHERE created_by_id=$userId) total_questions,
      (SELECT COUNT(*)::int FROM materials WHERE created_by_id=$userId) total_materials,
      (SELECT COUNT(*)::int FROM questions WHERE created_by_id=$userId AND status='review') pending_review,
      (SELECT COUNT(*)::int FROM questions WHERE created_by_id=$userId AND status='active')+(SELECT COUNT(*)::int FROM materials WHERE created_by_id=$userId AND status='active') active_content,
      (SELECT COUNT(*)::int FROM questions WHERE created_by_id=$userId AND status='rejected') rejected_content,
      (SELECT COUNT(*)::int FROM questions WHERE created_by_id=$userId AND status='draft')+(SELECT COUNT(*)::int FROM materials WHERE created_by_id=$userId AND status='draft') draft_content`,userId),
    query(`SELECT * FROM (SELECT id,'Soal' AS type,LEFT(question,140) AS title,status::text,created_at FROM questions WHERE created_by_id=$userId UNION ALL SELECT id,'Materi',title,status::text,created_at FROM materials WHERE created_by_id=$userId) own ORDER BY created_at DESC,id DESC LIMIT 8`,userId),
    query(`SELECT id,'Soal' AS type,LEFT(question,140) AS title,status::text,rejection_reason,reviewed_at FROM questions WHERE created_by_id=$userId AND reviewed_at IS NOT NULL ORDER BY reviewed_at DESC,id DESC LIMIT 5`,userId),
    query(`SELECT date_trunc('week',created_at)::date AS week,COUNT(*) FILTER (WHERE type='Soal')::int questions,COUNT(*) FILTER (WHERE type='Materi')::int materials FROM (SELECT created_at,'Soal' AS type FROM questions WHERE created_by_id=$userId UNION ALL SELECT created_at,'Materi' FROM materials WHERE created_by_id=$userId) own WHERE created_at>=NOW()-INTERVAL '12 weeks' GROUP BY 1 ORDER BY 1`,userId),
  ]);
  return {summary:summaryRows[0],recent_content:recentContent,recent_moderation:recentModeration,contribution_trend:contributionTrend};
});
const analytics=handle(async userId=>{
  const [counts,topSubtests]=await Promise.all([
    query(`SELECT COUNT(*)::int total_questions,COUNT(*) FILTER(WHERE status='active')::int approved_questions,COUNT(*) FILTER(WHERE status='review')::int pending_questions,COUNT(*) FILTER(WHERE status='rejected')::int rejected_questions,(SELECT COUNT(*)::int FROM materials WHERE created_by_id=$userId) total_materials,(SELECT COUNT(*)::int FROM materials WHERE created_by_id=$userId AND status='active') active_materials FROM questions WHERE created_by_id=$userId`,userId),
    query(`SELECT subtest::text,COUNT(*)::int total FROM questions WHERE created_by_id=$userId GROUP BY subtest ORDER BY total DESC,subtest LIMIT 7`,userId),
  ]);
  return {...counts[0],top_subtests:topSubtests,total_attempts:null,average_accuracy:null,notice:'Data pengerjaan soal siswa belum tersedia.'};
});
const studentInsights=handle(async()=>({average_accuracy:null,hardest_subtests:[],hardest_categories:[],question_attempt_count:null,trend:[],available:false,notice:'Data pengerjaan soal siswa belum tersedia. Insights hanya akan menampilkan agregat saat data tersebut tercatat.'}));
const moderation=handle(async userId=>query(`SELECT * FROM (SELECT id,'Soal' AS type,LEFT(question,180) AS title,status::text,rejection_reason,submitted_at,reviewed_at,created_at FROM questions WHERE created_by_id=$userId UNION ALL SELECT id,'Materi',title,status::text,NULL::text,NULL::timestamp,NULL::timestamp,created_at FROM materials WHERE created_by_id=$userId) own ORDER BY COALESCE(reviewed_at,submitted_at,created_at) DESC,id DESC LIMIT 100`,userId));
module.exports={dashboard,analytics,studentInsights,moderation};
