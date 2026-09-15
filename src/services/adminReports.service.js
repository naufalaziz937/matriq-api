const { sequelize } = require('../config/database');

const TYPES = {
  users: { label: 'Pengguna', description: 'Akun, profil, dan target siswa', filters: ['role','status','province','campus_id','prodi_code','date_from','date_to'] },
  'tryout-recap': { label: 'Rekap Tryout', description: 'Skor tryout eksternal per siswa', filters: ['platform','campus_id','prodi_code','min_score','max_score','date_from','date_to'] },
  'study-progress': { label: 'Progres Belajar', description: 'Belum tersedia: data aktivitas belajar belum dicatat', filters: ['date_from','date_to'], available: false },
  questions: { label: 'Bank Soal', description: 'Inventaris soal dan status review', filters: ['subtest','category','difficulty','status','date_from','date_to','include_answers'] },
  tutors: { label: 'Kontribusi Tutor', description: 'Soal, materi, dan aktivitas tutor', filters: ['date_from','date_to'] },
  analytics: { label: 'Ringkasan Analytics', description: 'Metrik agregat MatrIQ', filters: ['date_from','date_to'] },
  targets: { label: 'Target Kampus & Prodi', description: 'Minat dan capaian target siswa', filters: ['campus_id','prodi_code'] },
  moderation: { label: 'Moderasi Konten', description: 'Jejak review soal tutor', filters: ['status','date_from','date_to'] },
};
const baseTarget = `LEFT JOIN user_profiles up ON up.user_id=u.user_id
 LEFT JOIN user_targets ut ON ut.user_id=u.user_id
 LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(ut.pilihan)='array' THEN ut.pilihan->0 END AS choice) fc ON true
 LEFT JOIN prodi p ON p.kode_snbt=CASE WHEN jsonb_typeof(fc.choice) IN ('string','number') THEN fc.choice #>> '{}' WHEN jsonb_typeof(fc.choice)='object' THEN COALESCE(fc.choice->>'prodi_code',fc.choice->>'kode_snbt') END
 LEFT JOIN kampus_ptn k ON k.id=p.kampus_id`;
const dateCondition = (column) => `($date_from::date IS NULL OR ${column} >= $date_from::date) AND ($date_to::date IS NULL OR ${column} < $date_to::date + INTERVAL '1 day')`;

function parseFilters(type, input = {}) {
  if (!TYPES[type]) { const e = new Error('Jenis laporan tidak dikenal.'); e.status = 404; throw e; }
  const allowed = TYPES[type].filters;
  const filters = {};
  for (const key of allowed) {
    const value = input[key];
    if (value == null || value === '') { filters[key] = null; continue; }
    if (Array.isArray(value) || typeof value === 'object') { const e = new Error(`Filter ${key} tidak valid.`); e.status = 400; throw e; }
    filters[key] = String(value).trim();
    if (filters[key].length > 120) { const e = new Error(`Filter ${key} terlalu panjang.`); e.status = 400; throw e; }
  }
  for (const key of ['campus_id','min_score','max_score']) if (filters[key] != null) {
    if (!/^\d+(\.\d+)?$/.test(filters[key])) { const e = new Error(`Filter ${key} harus angka.`); e.status = 400; throw e; }
    filters[key] = Number(filters[key]);
  }
  if (filters.role && !['1','2','3'].includes(filters.role)) { const e = new Error('Role tidak valid.'); e.status = 400; throw e; }
  if (filters.include_answers && !['true','false'].includes(filters.include_answers)) { const e = new Error('Pilihan jawaban tidak valid.'); e.status = 400; throw e; }
  for (const key of ['date_from','date_to']) if (filters[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]) || Number.isNaN(Date.parse(filters[key])))) { const e = new Error(`Tanggal ${key} tidak valid.`); e.status = 400; throw e; }
  if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) { const e = new Error('Rentang tanggal tidak valid.'); e.status = 400; throw e; }
  return filters;
}

function statement(type, f) {
  switch(type) {
    case 'users': return { sql: `SELECT u.user_id, u.nama, u.email, u.no_hp, u.gender, u.role, u.is_activate AS status, up.sekolah, up.kelas, up.tahun_lulus, up.provinsi, up.kota_kab, k.nama AS target_kampus, p.nama AS target_prodi, ut.target_score, u.created_at, u.updated_at FROM users u ${baseTarget} WHERE ($role::int IS NULL OR u.role=$role::int) AND ($status::text IS NULL OR u.is_activate::text=$status) AND ($province::text IS NULL OR up.provinsi=$province) AND ($campus_id::int IS NULL OR k.id=$campus_id::int) AND ($prodi_code::text IS NULL OR p.kode_snbt=$prodi_code) AND ${dateCondition('u.created_at')}`, order: 'u.user_id DESC' };
    case 'tryout-recap': return { sql: `SELECT r.recap_id, u.user_id, u.nama, u.email, r.platform, r.tryout_name, r.pu, r.ppu, r.pbm, r.pk, r.lbi, r.lbe, r.pm, r.total_score, k.nama AS target_kampus, p.nama AS target_prodi, r.recap_at FROM tryout_recap r JOIN users u ON u.user_id=r.user_id ${baseTarget} WHERE ($platform::text IS NULL OR r.platform=$platform) AND ($campus_id::int IS NULL OR k.id=$campus_id::int) AND ($prodi_code::text IS NULL OR p.kode_snbt=$prodi_code) AND ($min_score::numeric IS NULL OR r.total_score >= $min_score::numeric) AND ($max_score::numeric IS NULL OR r.total_score <= $max_score::numeric) AND ${dateCondition('r.recap_at')}`, order: 'r.recap_at DESC, r.recap_id DESC' };
    case 'questions': return { sql: `SELECT q.id AS question_id, LEFT(q.question, 180) AS question_preview, q.subtest, q.category, q.difficulty, q.status, creator.nama AS creator_name, creator.role AS creator_role, q.status AS moderation_status, q.created_at, q.updated_at ${f.include_answers === 'true' ? ', q.correct_answer, q.explanation' : ''} FROM questions q LEFT JOIN users creator ON creator.user_id=q.created_by_id WHERE ($subtest::text IS NULL OR q.subtest::text=$subtest) AND ($category::text IS NULL OR q.category=$category) AND ($difficulty::text IS NULL OR q.difficulty::text=$difficulty) AND ($status::text IS NULL OR q.status::text=$status) AND ${dateCondition('q.created_at')}`, order: 'question_id DESC' };
    case 'tutors': return { sql: `SELECT u.user_id AS tutor_id, u.nama, u.email, COUNT(DISTINCT q.id)::int AS total_questions, COUNT(DISTINCT q.id) FILTER (WHERE q.status='active')::int AS approved, COUNT(DISTINCT q.id) FILTER (WHERE q.status='rejected')::int AS rejected, COUNT(DISTINCT q.id) FILTER (WHERE q.status='review')::int AS pending, COUNT(DISTINCT m.id)::int AS total_materials, GREATEST(MAX(q.updated_at),MAX(m.updated_at)) AS last_activity FROM users u LEFT JOIN questions q ON q.created_by_id=u.user_id AND ${dateCondition('q.created_at')} LEFT JOIN materials m ON m.created_by_id=u.user_id AND ${dateCondition('m.created_at')} WHERE u.role=3 GROUP BY u.user_id,u.nama,u.email`, order: 'total_questions DESC, tutor_id' };
    case 'moderation': return { sql: `SELECT q.id AS question_id, LEFT(q.question,180) AS question_preview, c.nama AS creator_name, c.role AS creator_role, reviewer.nama AS reviewer_name, q.status, q.rejection_reason, q.submitted_at, q.reviewed_at FROM questions q JOIN users c ON c.user_id=q.created_by_id LEFT JOIN users reviewer ON reviewer.user_id=q.reviewed_by_id WHERE c.role=3 AND ($status::text IS NULL OR q.status::text=$status) AND ${dateCondition('q.created_at')}`, order: 'question_id DESC' };
    case 'targets': return { sql: `SELECT k.nama AS campus, p.nama AS prodi, COUNT(DISTINCT u.user_id)::int AS user_count, ROUND(AVG(ut.target_score),1) AS average_target_score, ROUND(AVG(latest.total_score),1) AS average_latest_score, ROUND(AVG(best.best_score),1) AS average_best_score FROM users u ${baseTarget} LEFT JOIN LATERAL (SELECT total_score FROM tryout_recap WHERE user_id=u.user_id ORDER BY recap_at DESC,recap_id DESC LIMIT 1) latest ON true LEFT JOIN LATERAL (SELECT MAX(total_score) AS best_score FROM tryout_recap WHERE user_id=u.user_id) best ON true WHERE u.role=2 AND p.kode_snbt IS NOT NULL AND ($campus_id::int IS NULL OR k.id=$campus_id::int) AND ($prodi_code::text IS NULL OR p.kode_snbt=$prodi_code) GROUP BY k.nama,p.nama`, order: 'user_count DESC, campus, prodi' };
    case 'analytics': return { sql: `SELECT 'total_users' AS metric, COUNT(*)::numeric AS value, NULL::text AS detail FROM users UNION ALL SELECT 'new_users', COUNT(*)::numeric, NULL::text FROM users WHERE ${dateCondition('created_at')} UNION ALL SELECT 'active_users', COUNT(DISTINCT user_id)::numeric, NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'average_tryout_score', ROUND(AVG(total_score),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'average_accuracy', NULL::numeric, 'Data latihan belum tersedia' UNION ALL SELECT 'study_activity', NULL::numeric, 'Data aktivitas belum tersedia' UNION ALL SELECT 'popular_campus', COUNT(*)::numeric, k.nama FROM users u ${baseTarget} WHERE k.nama IS NOT NULL GROUP BY k.nama UNION ALL SELECT 'popular_prodi', COUNT(*)::numeric, p.nama FROM users u ${baseTarget} WHERE p.nama IS NOT NULL GROUP BY p.nama UNION ALL SELECT 'popular_platform', COUNT(*)::numeric, platform FROM tryout_recap WHERE ${dateCondition('recap_at')} GROUP BY platform UNION ALL SELECT 'subtest_pu', ROUND(AVG(pu),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'subtest_ppu', ROUND(AVG(ppu),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'subtest_pbm', ROUND(AVG(pbm),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'subtest_pk', ROUND(AVG(pk),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'subtest_lbi', ROUND(AVG(lbi),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'subtest_lbe', ROUND(AVG(lbe),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')} UNION ALL SELECT 'subtest_pm', ROUND(AVG(pm),2), NULL::text FROM tryout_recap WHERE ${dateCondition('recap_at')}`, order: 'metric, value DESC NULLS LAST' };
    case 'study-progress': return { sql: `SELECT NULL::integer AS user_id, NULL::text AS materi, NULL::integer AS questions_done, NULL::integer AS correct, NULL::integer AS wrong, NULL::numeric AS accuracy, NULL::numeric AS study_time, NULL::timestamp AS activity_date WHERE false`, order: 'user_id' };
    default: throw new Error('Unsupported report');
  }
}

async function run(type, filters, { limit = 20, offset = 0 } = {}) {
  const f = parseFilters(type, filters);
  const { sql, order } = statement(type, f);
  const bind = { ...f, limit, offset };
  const [countRows] = await sequelize.query(`SELECT COUNT(*)::int AS total FROM (${sql}) report_rows`, { bind });
  const [rows, metadata] = await sequelize.query(`SELECT * FROM (${sql}) report_rows ORDER BY ${order.replace(/\bu\.|\br\.|\bq\./g,'')} LIMIT $limit OFFSET $offset`, { bind });
  const columns = metadata?.fields?.map(field => field.name) || Object.keys(rows[0] || {});
  return { rows, total: countRows[0]?.total || 0, columns, filters: f };
}
module.exports = { TYPES, parseFilters, run };
