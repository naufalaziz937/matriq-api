const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const targetJoin = `LEFT JOIN user_targets ut ON ut.user_id = u.user_id
LEFT JOIN LATERAL (
  SELECT CASE WHEN jsonb_typeof(ut.pilihan) = 'array' THEN ut.pilihan->0 ELSE NULL END AS choice
) first_choice ON true
LEFT JOIN prodi p ON p.kode_snbt = CASE
  WHEN jsonb_typeof(first_choice.choice) IN ('string','number') THEN first_choice.choice #>> '{}'
  WHEN jsonb_typeof(first_choice.choice) = 'object' THEN COALESCE(first_choice.choice->>'prodi_code', first_choice.choice->>'kode_snbt')
END
LEFT JOIN kampus_ptn k ON k.id = COALESCE(p.kampus_id, CASE
  WHEN jsonb_typeof(first_choice.choice) = 'object'
    AND COALESCE(first_choice.choice->>'campus_id', first_choice.choice->>'kampus_id') ~ '^[0-9]{1,5}$'
  THEN COALESCE(first_choice.choice->>'campus_id', first_choice.choice->>'kampus_id')::integer
END)`;

function numberParam(value, min, max) {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
}
function filters(query, alias = 'tr') {
  const values = {};
  const where = [];
  if (query.search) { values.search = `%${String(query.search).trim().slice(0, 100)}%`; where.push('u.nama ILIKE :search'); }
  if (query.platform) { values.platform = String(query.platform).trim().slice(0, 100); where.push(values.platform === 'Tidak diketahui' ? `NULLIF(TRIM(${alias}.platform), '') IS NULL` : `LOWER(TRIM(${alias}.platform)) = LOWER(:platform)`); }
  if (query.campus_id) { values.campus_id = numberParam(query.campus_id, 1, 32767); where.push('k.id = :campus_id'); }
  if (query.prodi_code) { values.prodi_code = String(query.prodi_code).slice(0, 10); where.push('p.kode_snbt = :prodi_code'); }
  if (query.date_from) { values.date_from = query.date_from; where.push(`${alias}.recap_at >= CAST(:date_from AS date)`); }
  if (query.date_to) { values.date_to = query.date_to; where.push(`${alias}.recap_at < CAST(:date_to AS date) + INTERVAL '1 day'`); }
  if (query.min_score !== undefined && query.min_score !== '') { values.min_score = numberParam(query.min_score, 0, 10000); where.push(`${alias}.total_score >= :min_score`); }
  if (query.max_score !== undefined && query.max_score !== '') { values.max_score = numberParam(query.max_score, 0, 10000); where.push(`${alias}.total_score <= :max_score`); }
  if (Object.values(values).some(v => typeof v === 'number' && Number.isNaN(v)) ||
      ['date_from', 'date_to'].some(key => values[key] && !/^\d{4}-\d{2}-\d{2}$/.test(values[key]))) {
    const error = new Error('Filter tidak valid'); error.status = 400; throw error;
  }
  return { values, clause: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}
const run = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const ok = (res, data, pagination) => res.json({ success: true, data, ...(pagination ? { pagination } : {}) });
const handle = fn => async (req, res) => { try { await fn(req, res); } catch (error) { console.error('Tryout recap:', error); res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memuat data rekap tryout.' }); } };
const base = `FROM tryout_recap tr JOIN users u ON u.user_id = tr.user_id ${targetJoin}`;
const identity = `u.user_id, u.nama, u.foto_profile, k.id AS campus_id, k.nama AS campus_name, k.singkatan AS campus_short, p.kode_snbt AS prodi_code, p.nama AS prodi_name`;
const fields = `tr.recap_id, tr.platform, tr.tryout_name, tr.pu, tr.ppu, tr.pbm, tr.pk, tr.lbi, tr.lbe, tr.pm, tr.total_score, tr.recap_at`;

exports.summary = handle(async (_req, res) => {
  const [row] = await run(`SELECT COUNT(*)::int total_recap, COUNT(DISTINCT user_id)::int total_users, ROUND(AVG(total_score), 1) average_score, MAX(total_score) highest_score FROM tryout_recap`);
  ok(res, row);
});
exports.list = handle(async (req, res) => {
  const { values, clause } = filters(req.query);
  const page = Math.max(1, Math.floor(numberParam(req.query.page, 1, 1000000) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(numberParam(req.query.limit, 1, 100) || 20)));
  const order = { latest: 'tr.recap_at DESC, tr.recap_id DESC', oldest: 'tr.recap_at ASC, tr.recap_id ASC', score_desc: 'tr.total_score DESC, tr.recap_id DESC', score_asc: 'tr.total_score ASC, tr.recap_id ASC' }[req.query.sort] || 'tr.recap_at DESC, tr.recap_id DESC';
  const [count] = await run(`SELECT COUNT(*)::int total ${base} ${clause}`, values);
  const data = await run(`SELECT ${identity}, ${fields} ${base} ${clause} ORDER BY ${order} LIMIT :limit OFFSET :offset`, { ...values, limit, offset: (page - 1) * limit });
  ok(res, data, { page, limit, total: count.total, total_pages: Math.max(1, Math.ceil(count.total / limit)) });
});
exports.ranking = handle(async (req, res) => {
  const { values, clause } = filters({ campus_id: req.query.campus_id, prodi_code: req.query.prodi_code });
  const limit = Math.min(100, Math.max(1, Math.floor(numberParam(req.query.limit, 1, 100) || 20)));
  const data = await run(`WITH ranked AS (
    SELECT ${identity}, tr.total_score, tr.platform, tr.recap_at,
      ROW_NUMBER() OVER (PARTITION BY u.user_id ORDER BY tr.total_score DESC, tr.recap_at DESC, tr.recap_id DESC) best_row,
      COUNT(*) OVER (PARTITION BY u.user_id)::int recap_count,
      FIRST_VALUE(tr.total_score) OVER (PARTITION BY u.user_id ORDER BY tr.recap_at DESC, tr.recap_id DESC) latest_score
    ${base} ${clause}
  ) SELECT *, ROW_NUMBER() OVER (ORDER BY total_score DESC, recap_at DESC, user_id)::int rank
    FROM ranked WHERE best_row = 1 ORDER BY total_score DESC, recap_at DESC, user_id LIMIT :limit`, { ...values, limit });
  ok(res, data);
});
exports.platforms = handle(async (_req, res) => {
  const data = await run(`SELECT COALESCE(NULLIF(INITCAP(LOWER(TRIM(platform))), ''), 'Tidak diketahui') platform,
    COUNT(*)::int total, ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) percentage
    FROM tryout_recap GROUP BY 1 ORDER BY total DESC, platform`);
  ok(res, data);
});
exports.subtests = handle(async (_req, res) => {
  const [row] = await run(`SELECT ${['pu','ppu','pbm','pk','lbi','lbe','pm'].map(k => `ROUND(AVG(${k}), 1) ${k}`).join(', ')} FROM tryout_recap`);
  ok(res, row);
});
exports.distribution = handle(async (_req, res) => {
  const data = await run(`WITH bands AS (SELECT CASE WHEN total_score < 500 THEN 1 WHEN total_score < 600 THEN 2 WHEN total_score < 700 THEN 3 WHEN total_score < 750 THEN 4 ELSE 5 END band, COUNT(*)::int total FROM tryout_recap GROUP BY 1)
    SELECT v.label, COALESCE(b.total, 0)::int total FROM (VALUES (1,'< 500'),(2,'500-599'),(3,'600-699'),(4,'700-749'),(5,'750+')) v(band,label) LEFT JOIN bands b ON b.band=v.band ORDER BY v.band`);
  ok(res, data);
});
exports.improved = handle(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Math.floor(numberParam(req.query.limit, 1, 50) || 5)));
  const data = await run(`WITH changes AS (SELECT user_id, COUNT(*)::int recap_count,
    (ARRAY_AGG(total_score ORDER BY recap_at ASC, recap_id ASC))[1] first_score,
    (ARRAY_AGG(total_score ORDER BY recap_at DESC, recap_id DESC))[1] latest_score
    FROM tryout_recap GROUP BY user_id HAVING COUNT(*) >= 2)
    SELECT c.*, u.nama, c.latest_score - c.first_score improvement FROM changes c JOIN users u ON u.user_id=c.user_id
    ORDER BY improvement DESC, c.user_id LIMIT :limit`, { limit });
  ok(res, data);
});
exports.user = handle(async (req, res) => {
  const userId = numberParam(req.params.userId, 1, 2147483647);
  if (!Number.isInteger(userId)) { const e = new Error('User tidak valid'); e.status = 400; throw e; }
  const [user] = await run(`SELECT ${identity} FROM users u ${targetJoin} WHERE u.user_id=:userId`, { userId });
  if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
  const [summary] = await run(`SELECT COUNT(*)::int total_recap, MAX(total_score) best_score, ROUND(AVG(total_score),1) average_score,
    (ARRAY_AGG(total_score ORDER BY recap_at DESC, recap_id DESC))[1] latest_score,
    ${['pu','ppu','pbm','pk','lbi','lbe','pm'].map(k => `ROUND(AVG(${k}),1) ${k}`).join(', ')}
    FROM tryout_recap WHERE user_id=:userId`, { userId });
  const history = await run(`SELECT ${fields} FROM tryout_recap tr WHERE tr.user_id=:userId ORDER BY tr.recap_at DESC, tr.recap_id DESC LIMIT 200`, { userId });
  ok(res, { user, target: { campus_id: user.campus_id, campus_name: user.campus_name, prodi_code: user.prodi_code, prodi_name: user.prodi_name }, summary, subtest_average: Object.fromEntries(['pu','ppu','pbm','pk','lbi','lbe','pm'].map(k => [k, summary[k]])), trend: [...history].reverse().map(x => ({ recap_at: x.recap_at, total_score: x.total_score, platform: x.platform })), history });
});
