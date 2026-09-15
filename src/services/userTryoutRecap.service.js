const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { TryoutRecap, UserTarget } = require('../models');

const SUBTESTS = ['pu', 'ppu', 'pbm', 'pk', 'lbi', 'lbe', 'pm'];
const fields = ['platform', 'tryout_name', 'recap_at', ...SUBTESTS, 'total_score', 'notes'];
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const num = value => value == null ? null : Number(value);
const round = value => Math.round(value * 10) / 10;
const plain = row => row ? row.get({ plain: true }) : null;

async function prepareSchema() {
  const qi = sequelize.getQueryInterface();
  if (!await qi.tableExists('tryout_recap')) return;
  const columns = await qi.describeTable('tryout_recap');
  if (!columns.platform) await sequelize.query('ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS platform VARCHAR(100)');
  if (!columns.tryout_name) await sequelize.query('ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS tryout_name VARCHAR(150)');
  if (!columns.notes) await sequelize.query('ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS notes TEXT');
  if (!columns.created_at) await sequelize.query('ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  if (!columns.updated_at) await sequelize.query('ALTER TABLE tryout_recap ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_tryout_recap_user_date ON tryout_recap(user_id, recap_at)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_tryout_recap_platform ON tryout_recap(platform)');
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Data rekap tidak valid.');
  const value = {};
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(body, key)) value[key] = body[key];
  value.platform = String(value.platform || '').trim();
  value.tryout_name = value.tryout_name == null ? null : String(value.tryout_name).trim() || null;
  value.notes = value.notes == null ? null : String(value.notes).trim() || null;
  if (!value.platform || value.platform.length > 100) throw bad('Platform wajib diisi (maksimal 100 karakter).');
  if (value.tryout_name?.length > 150) throw bad('Nama tryout maksimal 150 karakter.');
  if (value.notes?.length > 5000) throw bad('Catatan maksimal 5000 karakter.');
  if (typeof value.recap_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.recap_at) || !Number.isFinite(Date.parse(`${value.recap_at}T00:00:00Z`)) || new Date(`${value.recap_at}T00:00:00Z`).toISOString().slice(0, 10) !== value.recap_at) throw bad('Tanggal tryout tidak valid.');
  for (const key of [...SUBTESTS, 'total_score']) {
    if (key !== 'total_score' && (value[key] === '' || value[key] == null)) { value[key] = null; continue; }
    if (value[key] === '' || value[key] == null || !Number.isFinite(Number(value[key])) || Number(value[key]) < 0 || Number(value[key]) > 1000) throw bad(`Skor ${key.toUpperCase()} harus 0–1000.`);
    value[key] = Number(value[key]);
  }
  return value;
}

async function owned(userId, id) {
  if (!/^\d+$/.test(String(id))) throw bad('ID rekap tidak valid.');
  const recap = await TryoutRecap.findOne({ where: { recap_id: Number(id), user_id: userId } });
  if (!recap) throw bad('Rekap tidak ditemukan.', 404);
  return recap;
}

async function getTarget(userId, latestScore) {
  const target = await UserTarget.findOne({ where: { user_id: userId } });
  if (!target) return null;
  const choice = Array.isArray(target.pilihan) ? target.pilihan[0] : null;
  const code = typeof choice === 'object' && choice ? choice.prodi_code || choice.kode_snbt : choice;
  let campus = null, program = null;
  if (code != null) {
    const rows = await sequelize.query('SELECT k.nama AS campus, p.nama AS program FROM prodi p JOIN kampus_ptn k ON k.id=p.kampus_id WHERE p.kode_snbt=$code LIMIT 1', { bind: { code: String(code) }, type: QueryTypes.SELECT });
    campus = rows[0]?.campus || null; program = rows[0]?.program || null;
  }
  const targetScore = num(target.target_score);
  return { campus, program, target_score: targetScore, gap: latestScore == null || targetScore == null ? null : Math.max(0, round(targetScore - latestScore)) };
}

function serialized(row) {
  const data = plain(row);
  for (const key of [...SUBTESTS, 'total_score']) data[key] = num(data[key]);
  return data;
}

async function overview(userId) {
  const rows = await TryoutRecap.findAll({ where: { user_id: userId }, order: [['recap_at', 'ASC'], ['recap_id', 'ASC']] });
  const recaps = rows.map(serialized);
  const latest = recaps.at(-1), previous = recaps.at(-2);
  const best = recaps.length ? Math.max(...recaps.map(row => row.total_score)) : null;
  const summary = { latest_score: latest?.total_score ?? null, best_score: best, average_score: recaps.length ? round(recaps.reduce((sum, row) => sum + row.total_score, 0) / recaps.length) : null, total_recap: recaps.length, score_delta: latest && previous ? round(latest.total_score - previous.total_score) : null };
  const target = await getTarget(userId, summary.latest_score);
  const trend = recaps.slice(-15).map((row, index, list) => ({ recap_id: row.recap_id, recap_at: row.recap_at, platform: row.platform, tryout_name: row.tryout_name, total_score: row.total_score, delta: index ? round(row.total_score - list[index - 1].total_score) : null }));
  const subtests = SUBTESTS.map(code => { const scores = recaps.map(row => row[code]).filter(value => value != null); return { code: code.toUpperCase(), latest_score: latest?.[code] ?? null, average_score: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : null }; });
  const platforms = new Map();
  for (const row of recaps) { const name = row.platform || 'Tidak diketahui'; platforms.set(name, (platforms.get(name) || 0) + 1); }
  const platform_usage = [...platforms].map(([platform, total]) => ({ platform, total })).sort((a, b) => b.total - a.total);
  const recent_recaps = recaps.slice(-5).reverse().map((row, index) => ({ ...row, delta: index < recaps.length - 1 ? round(row.total_score - recaps[recaps.length - 2 - index].total_score) : null, is_best: row.total_score === best }));
  const ranked = subtests.filter(row => row.latest_score != null).sort((a, b) => b.latest_score - a.latest_score);
  const insights = [];
  if (recaps.length >= 3) { const change = round(latest.total_score - recaps.at(-3).total_score); insights.push(`Skormu ${change >= 0 ? 'naik' : 'turun'} ${Math.abs(change)} poin dalam 3 rekap terakhir.`); }
  if (ranked.length) { insights.push(`${ranked[0].code} adalah subtes terkuatmu pada rekap terakhir.`); insights.push(`${ranked.at(-1).code} dapat menjadi fokus belajar berikutnya.`); }
  if (target?.gap != null) insights.push(target.gap ? `Kamu tinggal ${target.gap} poin lagi menuju target ${target.target_score}.` : 'Target skormu sudah tercapai 🎉');
  return { summary, target, score_trend: trend, subtests, platform_usage, recent_recaps, insights };
}

async function history(userId, query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  const where = { user_id: userId };
  if (query.platform) where.platform = String(query.platform).slice(0, 100);
  for (const key of ['date_from', 'date_to']) if (query[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(query[key]) || !Number.isFinite(Date.parse(`${query[key]}T00:00:00Z`)) || new Date(`${query[key]}T00:00:00Z`).toISOString().slice(0, 10) !== query[key])) throw bad(`Filter ${key} tidak valid.`);
  if (query.date_from || query.date_to) where.recap_at = { ...(query.date_from ? { [Op.gte]: new Date(`${query.date_from}T00:00:00Z`) } : {}), ...(query.date_to ? { [Op.lt]: new Date(Date.parse(`${query.date_to}T00:00:00Z`) + 86400000) } : {}) };
  const { rows, count } = await TryoutRecap.findAndCountAll({ where, order: [['recap_at', query.sort === 'oldest' ? 'ASC' : 'DESC'], ['recap_id', query.sort === 'oldest' ? 'ASC' : 'DESC']], limit, offset: (page - 1) * limit });
  const recaps = rows.map(serialized);
  for (const row of recaps) {
    const previous = await TryoutRecap.findOne({ where: { user_id: userId, [Op.or]: [{ recap_at: { [Op.lt]: row.recap_at } }, { recap_at: row.recap_at, recap_id: { [Op.lt]: row.recap_id } }] }, order: [['recap_at', 'DESC'], ['recap_id', 'DESC']], attributes: ['total_score'] });
    row.delta = previous ? round(row.total_score - Number(previous.total_score)) : null;
  }
  return { recaps, pagination: { page, limit, total: count, total_pages: Math.max(1, Math.ceil(count / limit)) } };
}

async function detail(userId, id) { return serialized(await owned(userId, id)); }
async function create(userId, body) {
  const value = validate(body);
  const best = await TryoutRecap.max('total_score', { where: { user_id: userId } });
  const row = await TryoutRecap.create({ ...value, user_id: userId });
  return { ...serialized(row), personal_best: best == null || value.total_score > Number(best) };
}
async function update(userId, id, body) {
  const row = await owned(userId, id);
  await row.update({ ...validate(body), updated_at: new Date() });
  return serialized(row);
}
async function remove(userId, id) { const row = await owned(userId, id); await row.destroy(); return { deleted: true }; }

module.exports = { prepareSchema, overview, history, detail, create, update, remove, validate };
