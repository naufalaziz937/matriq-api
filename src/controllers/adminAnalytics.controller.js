const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const periods = { '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1y': 365 };
const emptyStudy = { available: false, reason: 'Data aktivitas latihan, akurasi, dan durasi belajar belum dicatat di database.' };
const run = (sql, replacements = {}) => sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
const endpoint = fn => async (req, res) => {
  try { res.json({ success: true, data: await fn(req) }); }
  catch (error) { console.error('Admin analytics:', error); res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memuat analytics.' }); }
};

function context(query = {}) {
  const period = String(query.period || '30d');
  const days = periods[period];
  if (!days && period !== 'custom') throw Object.assign(new Error('Periode tidak valid'), { status: 400 });
  const to = query.date_to ? new Date(`${query.date_to}T23:59:59.999Z`) : new Date();
  const from = query.date_from ? new Date(`${query.date_from}T00:00:00.000Z`) : new Date(to.getTime() - ((days || 30) - 1) * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 366 * 86400000)
    throw Object.assign(new Error('Rentang tanggal tidak valid (maksimal satu tahun)'), { status: 400 });
  const values = { from: from.toISOString(), to: to.toISOString() };
  const where = ['u.created_at <= :to'];
  if (query.role) {
    const role = Number(query.role);
    if (![2, 3].includes(role)) throw Object.assign(new Error('Role tidak valid'), { status: 400 });
    values.role = role; where.push('u.role = :role');
  } else where.push('u.role IN (2,3)');
  if (query.province) { values.province = String(query.province).trim().slice(0, 100); where.push('(up.provinsi = :province OR pr.nama = :province)'); }
  if (query.campus_id) {
    const id = Number(query.campus_id);
    if (!Number.isInteger(id) || id < 1 || id > 32767) throw Object.assign(new Error('Kampus tidak valid'), { status: 400 });
    values.campus_id = id; where.push('k.id = :campus_id');
  }
  if (query.prodi_code) { values.prodi_code = String(query.prodi_code).slice(0, 10); where.push('p.kode_snbt = :prodi_code'); }
  const users = `WITH selected_users AS (
    SELECT u.user_id,u.nama,u.role,u.created_at,u.is_activate,up.provinsi,up.sekolah,
      COALESCE(pr.nama,up.provinsi) province_name,k.id campus_id,k.nama campus_name,k.singkatan campus_short,
      p.kode_snbt prodi_code,p.nama prodi_name,ut.target_score,
      (up.user_id IS NOT NULL AND ut.user_id IS NOT NULL) onboarding_complete
    FROM users u LEFT JOIN user_profiles up ON up.user_id=u.user_id
    LEFT JOIN provinsi pr ON pr.kode=up.provinsi
    LEFT JOIN user_targets ut ON ut.user_id=u.user_id
    LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(ut.pilihan)='array' THEN ut.pilihan->0 END choice) first_choice ON true
    LEFT JOIN prodi p ON p.kode_snbt=CASE
      WHEN jsonb_typeof(first_choice.choice) IN ('string','number') THEN first_choice.choice #>> '{}'
      WHEN jsonb_typeof(first_choice.choice)='object' THEN COALESCE(first_choice.choice->>'prodi_code',first_choice.choice->>'kode_snbt') END
    LEFT JOIN kampus_ptn k ON k.id=COALESCE(p.kampus_id,CASE
      WHEN jsonb_typeof(first_choice.choice)='object' AND COALESCE(first_choice.choice->>'campus_id',first_choice.choice->>'kampus_id') ~ '^[0-9]{1,5}$'
      THEN COALESCE(first_choice.choice->>'campus_id',first_choice.choice->>'kampus_id')::integer END)
    WHERE ${where.join(' AND ')}
  )`;
  const recaps = `${users}, selected_recaps AS (
    SELECT tr.*,su.nama,su.role,su.campus_name,su.campus_short,su.prodi_name
    FROM tryout_recap tr JOIN selected_users su ON su.user_id=tr.user_id
    WHERE tr.recap_at BETWEEN :from AND :to
  )`;
  return { values, users, recaps, from, to };
}

exports.overview = endpoint(async req => {
  const c = context(req.query);
  const [users] = await run(`${c.users} SELECT COUNT(*)::int total_users,
    COUNT(*) FILTER (WHERE created_at BETWEEN :from AND :to)::int new_users,
    COUNT(*) FILTER (WHERE onboarding_complete)::int onboarding_complete,
    COUNT(*) FILTER (WHERE is_activate)::int activated_users FROM selected_users`, c.values);
  const [activity] = await run(`${c.recaps} SELECT COUNT(DISTINCT user_id)::int active_users,
    COUNT(*)::int total_tryout_recaps,ROUND(AVG(total_score),1) average_score FROM selected_recaps`, c.values);
  const [previous] = await run(`${c.users} SELECT COUNT(*)::int previous_new_users FROM selected_users
    WHERE created_at >= :from::timestamptz - (:to::timestamptz - :from::timestamptz) AND created_at < :from`, c.values);
  const growth = previous.previous_new_users ? Math.round((users.new_users - previous.previous_new_users) / previous.previous_new_users * 1000) / 10 : null;
  return { ...users, ...activity, new_users_change_percent: growth,
    total_study_activity: null, average_accuracy: null,
    active_definition: 'User unik yang mencatat rekap tryout eksternal selama periode.',
    unavailable: emptyStudy.reason };
});
exports.userGrowth = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.users}, days AS (SELECT generate_series(date_trunc('day',:from::timestamptz),date_trunc('day',:to::timestamptz),interval '1 day')::date AS bucket_date)
    SELECT d.bucket_date AS day,COUNT(s.user_id) FILTER (WHERE s.role=2)::int students,
      COUNT(s.user_id) FILTER (WHERE s.role=3)::int tutors,COUNT(s.user_id)::int total
    FROM days d LEFT JOIN selected_users s ON s.created_at::date=d.bucket_date
    GROUP BY d.bucket_date ORDER BY d.bucket_date`, c.values);
});
exports.activeTrend = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.users}, days AS (SELECT generate_series(date_trunc('day',:from::timestamptz),date_trunc('day',:to::timestamptz),interval '1 day')::date AS bucket_date)
    SELECT d.bucket_date AS day,
      (SELECT COUNT(DISTINCT tr.user_id)::int FROM tryout_recap tr JOIN selected_users s ON s.user_id=tr.user_id WHERE tr.recap_at >= d.bucket_date AND tr.recap_at < d.bucket_date+1) dau,
      (SELECT COUNT(DISTINCT tr.user_id)::int FROM tryout_recap tr JOIN selected_users s ON s.user_id=tr.user_id WHERE tr.recap_at >= d.bucket_date-6 AND tr.recap_at < d.bucket_date+1) wau,
      (SELECT COUNT(DISTINCT tr.user_id)::int FROM tryout_recap tr JOIN selected_users s ON s.user_id=tr.user_id WHERE tr.recap_at >= d.bucket_date-29 AND tr.recap_at < d.bucket_date+1) mau
    FROM days d ORDER BY d.bucket_date`, c.values);
});
exports.roleDistribution = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.users} SELECT role,COUNT(*)::int total FROM selected_users GROUP BY role ORDER BY role`, c.values);
});
exports.geography = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.users} SELECT COALESCE(NULLIF(province_name,''),'Belum diisi') label,COUNT(*)::int total
    FROM selected_users GROUP BY 1 ORDER BY total DESC,label LIMIT 10`, c.values);
});
exports.campusTargets = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.users} SELECT campus_id,COALESCE(campus_short,campus_name) label,COUNT(*)::int total
    FROM selected_users WHERE campus_id IS NOT NULL GROUP BY campus_id,campus_short,campus_name ORDER BY total DESC,label LIMIT 10`, c.values);
});
exports.programTargets = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.users} SELECT prodi_code,prodi_name label,COUNT(*)::int total
    FROM selected_users WHERE prodi_code IS NOT NULL GROUP BY prodi_code,prodi_name ORDER BY total DESC,label LIMIT 10`, c.values);
});
exports.tryoutTrend = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps}, daily AS (
    SELECT recap_at::date AS bucket_date,ROUND(AVG(total_score),1) average_score,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_score)::numeric,1) median_score,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_score) p90
    FROM selected_recaps GROUP BY 1)
    SELECT d.bucket_date AS day,d.average_score,d.median_score,
      (SELECT ROUND(AVG(r.total_score),1) FROM selected_recaps r WHERE r.recap_at::date=d.bucket_date AND r.total_score>=d.p90) top_ten_average
    FROM daily d ORDER BY d.bucket_date`, c.values);
});
exports.scoreDistribution = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps}, buckets AS (SELECT CASE WHEN total_score<500 THEN 1 WHEN total_score<600 THEN 2 WHEN total_score<650 THEN 3 WHEN total_score<700 THEN 4 WHEN total_score<750 THEN 5 ELSE 6 END bucket,COUNT(*)::int total FROM selected_recaps GROUP BY 1)
    SELECT x.label,COALESCE(b.total,0)::int total FROM (VALUES (1,'<500'),(2,'500–599'),(3,'600–649'),(4,'650–699'),(5,'700–749'),(6,'750+')) x(bucket,label)
    LEFT JOIN buckets b ON b.bucket=x.bucket ORDER BY x.bucket`, c.values);
});
exports.subtests = endpoint(async req => {
  const c = context(req.query);
  const [data] = await run(`${c.recaps} SELECT ${['pu','ppu','pbm','pk','lbi','lbe','pm'].map(x => `ROUND(AVG(${x}),1) ${x}`).join(',')} FROM selected_recaps`, c.values);
  return data;
});
exports.studyProgress = endpoint(async () => emptyStudy);
exports.studyTime = endpoint(async () => emptyStudy);
exports.accuracyDistribution = endpoint(async () => emptyStudy);
exports.activityHeatmap = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps} SELECT EXTRACT(ISODOW FROM recap_at AT TIME ZONE 'Asia/Jakarta')::int AS weekday,
    EXTRACT(HOUR FROM recap_at AT TIME ZONE 'Asia/Jakarta')::int AS hour_of_day,COUNT(*)::int total
    FROM selected_recaps GROUP BY 1,2 ORDER BY 1,2`, c.values);
});
exports.platforms = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps} SELECT COALESCE(NULLIF(INITCAP(LOWER(TRIM(platform))),''),'Tidak diketahui') label,
    COUNT(*)::int total,ROUND(100.0*COUNT(*)/NULLIF(SUM(COUNT(*)) OVER (),0),1) percentage
    FROM selected_recaps GROUP BY 1 ORDER BY total DESC,label`, c.values);
});
exports.leaderboard = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps}, best AS (SELECT DISTINCT ON (user_id) user_id,nama,campus_short,campus_name,prodi_name,total_score best_score,platform
    FROM selected_recaps ORDER BY user_id,total_score DESC,recap_at DESC,recap_id DESC)
    SELECT *,ROW_NUMBER() OVER (ORDER BY best_score DESC,user_id)::int rank FROM best ORDER BY best_score DESC,user_id LIMIT 10`, c.values);
});
exports.mostImproved = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps}, changes AS (SELECT user_id,MAX(nama) nama,MAX(campus_short) campus_short,MAX(campus_name) campus_name,MAX(prodi_name) prodi_name,
    COUNT(*)::int recap_count,(ARRAY_AGG(total_score ORDER BY recap_at ASC,recap_id ASC))[1] first_score,
    (ARRAY_AGG(total_score ORDER BY recap_at DESC,recap_id DESC))[1] latest_score
    FROM selected_recaps GROUP BY user_id HAVING COUNT(*)>=2)
    SELECT *,latest_score-first_score improvement FROM changes ORDER BY improvement DESC,user_id LIMIT 10`, c.values);
});
exports.funnel = endpoint(async req => {
  const c = context(req.query);
  const [row] = await run(`${c.users} SELECT COUNT(*)::int registered,
    COUNT(*) FILTER (WHERE onboarding_complete)::int onboarding,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tryout_recap tr WHERE tr.user_id=selected_users.user_id))::int has_recap,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM tryout_recap tr WHERE tr.user_id=selected_users.user_id AND tr.recap_at >= date_trunc('month',:to::timestamptz) AND tr.recap_at <= :to))::int active_month
    FROM selected_users`, c.values);
  return [{ label:'Terdaftar',total:row.registered },{ label:'Onboarding lengkap',total:row.onboarding },
    { label:'Memiliki rekap tryout',total:row.has_recap },{ label:'Mencatat rekap bulan ini',total:row.active_month }];
});
exports.recentActivity = endpoint(async req => {
  const c = context(req.query);
  return run(`${c.recaps} SELECT nama,'Menambahkan rekap tryout' activity,
    COALESCE(NULLIF(platform,''),'Platform tidak diketahui') category,recap_at timestamp
    FROM selected_recaps ORDER BY recap_at DESC,recap_id DESC LIMIT 12`, c.values);
});
exports.insights = endpoint(async req => {
  const c = context(req.query);
  const [score] = await run(`${c.recaps} SELECT COUNT(*)::int total,ROUND(AVG(total_score),1) average_score FROM selected_recaps`, c.values);
  const [weak] = await run(`${c.recaps} SELECT label,ROUND(average_score,1) average_score FROM (
    SELECT 'PU' label,AVG(pu) average_score FROM selected_recaps UNION ALL SELECT 'PPU',AVG(ppu) FROM selected_recaps
    UNION ALL SELECT 'PBM',AVG(pbm) FROM selected_recaps UNION ALL SELECT 'PK',AVG(pk) FROM selected_recaps
    UNION ALL SELECT 'LBI',AVG(lbi) FROM selected_recaps UNION ALL SELECT 'LBE',AVG(lbe) FROM selected_recaps
    UNION ALL SELECT 'PM',AVG(pm) FROM selected_recaps) x WHERE average_score IS NOT NULL ORDER BY average_score LIMIT 1`, c.values);
  const [campus] = await run(`${c.users} SELECT COALESCE(campus_short,campus_name) label,COUNT(*)::int total FROM selected_users
    WHERE campus_id IS NOT NULL GROUP BY 1 ORDER BY total DESC,label LIMIT 1`, c.values);
  return [score.total ? { type:'score', text:`Rata-rata ${score.total} rekap tryout pada periode ini adalah ${score.average_score}.` } : null,
    weak ? { type:'subtest', text:`${weak.label} adalah subtes dengan rata-rata terendah (${weak.average_score}).` } : null,
    campus ? { type:'target', text:`${campus.label} menjadi target kampus terpopuler (${campus.total} siswa).` } : null].filter(Boolean);
});
