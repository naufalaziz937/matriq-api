const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const targetJoin = `LEFT JOIN user_targets ut ON ut.user_id=u.user_id
LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(ut.pilihan)='array' THEN ut.pilihan->0 END choice) first_choice ON true
LEFT JOIN prodi p ON p.kode_snbt=CASE
  WHEN jsonb_typeof(first_choice.choice) IN ('string','number') THEN first_choice.choice #>> '{}'
  WHEN jsonb_typeof(first_choice.choice)='object' THEN COALESCE(first_choice.choice->>'prodi_code',first_choice.choice->>'kode_snbt') END
LEFT JOIN kampus_ptn k ON k.id=COALESCE(p.kampus_id, CASE
  WHEN jsonb_typeof(first_choice.choice)='object' AND COALESCE(first_choice.choice->>'campus_id',first_choice.choice->>'kampus_id') ~ '^[0-9]{1,5}$'
  THEN COALESCE(first_choice.choice->>'campus_id',first_choice.choice->>'kampus_id')::integer END)`;
const recap = `LEFT JOIN LATERAL (SELECT COUNT(*)::int recap_count, MAX(total_score) best_score,
  ROUND(AVG(total_score),1) average_score,
  (ARRAY_AGG(total_score ORDER BY recap_at ASC,recap_id ASC))[1] first_score,
  (ARRAY_AGG(total_score ORDER BY recap_at DESC,recap_id DESC))[1] latest_score,
  MAX(recap_at) last_recap_at
  FROM tryout_recap WHERE user_id=u.user_id) r ON true`;
const columns = `u.user_id,u.nama,u.email,u.foto_profile,u.created_at,up.sekolah,up.kelas,
  ut.target_score,k.id campus_id,k.nama campus_name,k.singkatan campus_short,p.kode_snbt prodi_code,p.nama prodi_name,
  r.recap_count,r.best_score,r.average_score,r.first_score,r.latest_score,r.last_recap_at,
  CASE WHEN r.recap_count>=2 THEN r.latest_score-r.first_score END score_change,
  CASE WHEN ut.target_score IS NOT NULL AND r.latest_score IS NOT NULL THEN r.latest_score-ut.target_score END target_gap`;
const from = `FROM users u LEFT JOIN user_profiles up ON up.user_id=u.user_id ${targetJoin} ${recap}`;
const run = (sql,replacements={}) => sequelize.query(sql,{replacements,type:QueryTypes.SELECT});
const respond = fn => async (req,res) => { try { await fn(req,res); } catch(error) { console.error('Student progress:',error); res.status(500).json({success:false,message:'Gagal memuat progress siswa.'}); } };

exports.summary = respond(async (_req,res) => {
  const [data] = await run(`SELECT COUNT(*)::int total_students,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tryout_recap tr WHERE tr.user_id=u.user_id))::int students_with_recap,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM tryout_recap tr WHERE tr.user_id=u.user_id))::int students_without_recap,
    (SELECT ROUND(AVG(x.latest_score),1) FROM (SELECT DISTINCT ON (user_id) user_id,total_score latest_score FROM tryout_recap ORDER BY user_id,recap_at DESC,recap_id DESC) x JOIN users s ON s.user_id=x.user_id WHERE s.role=2) average_latest_score
    FROM users u WHERE u.role=2`);
  res.json({success:true,data});
});

exports.list = respond(async (req,res) => {
  const page = Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));
  const limit = Math.max(1,Math.min(100,parseInt(req.query.limit,10)||12));
  const conditions = ['u.role=2']; const replacements={limit,offset:(page-1)*limit};
  if(req.query.search){conditions.push('(u.nama ILIKE :search OR u.email ILIKE :search OR up.sekolah ILIKE :search)');replacements.search=`%${String(req.query.search).trim().slice(0,100)}%`;}
  if(req.query.campus_id){const id=Number(req.query.campus_id);if(!Number.isInteger(id)||id<1||id>32767)return res.status(400).json({success:false,message:'Filter kampus tidak valid'});conditions.push('k.id=:campus_id');replacements.campus_id=id;}
  const status=String(req.query.status||'');
  if(status==='with_recap')conditions.push('r.recap_count>0');
  else if(status==='without_recap')conditions.push('r.recap_count=0');
  else if(status==='improving')conditions.push('r.recap_count>=2 AND r.latest_score>r.first_score');
  else if(status==='needs_attention')conditions.push('r.recap_count>=2 AND r.latest_score<r.first_score');
  else if(status)return res.status(400).json({success:false,message:'Filter status tidak valid'});
  const where=`WHERE ${conditions.join(' AND ')}`;
  const order={recent:'r.last_recap_at DESC NULLS LAST,u.user_id DESC',name:'u.nama ASC,u.user_id',highest:'r.best_score DESC NULLS LAST,u.user_id',lowest:'r.latest_score ASC NULLS LAST,u.user_id',improvement:'score_change DESC NULLS LAST,u.user_id'}[req.query.sort]||'r.last_recap_at DESC NULLS LAST,u.user_id DESC';
  const [count]=await run(`SELECT COUNT(*)::int total ${from} ${where}`,replacements);
  const data=await run(`SELECT ${columns} ${from} ${where} ORDER BY ${order} LIMIT :limit OFFSET :offset`,replacements);
  res.json({success:true,data,pagination:{page,limit,total:count.total,total_pages:Math.max(1,Math.ceil(count.total/limit))}});
});

exports.detail = respond(async (req,res) => {
  const id=Number(req.params.userId);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'ID siswa tidak valid'});
  const [student]=await run(`SELECT ${columns} ${from} WHERE u.role=2 AND u.user_id=:id`,{id});
  if(!student)return res.status(404).json({success:false,message:'Siswa tidak ditemukan'});
  const history=await run(`SELECT recap_id,total_score,pu,ppu,pbm,pk,lbi,lbe,pm,platform,tryout_name,recap_at
    FROM tryout_recap WHERE user_id=:id ORDER BY recap_at DESC,recap_id DESC LIMIT 100`,{id});
  res.json({success:true,data:{student,history,trend:[...history].reverse().map(({recap_id,total_score,recap_at})=>({recap_id,total_score,recap_at}))}});
});
