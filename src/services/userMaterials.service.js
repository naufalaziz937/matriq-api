const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Material, UserMaterialProgress } = require('../models');
const SUBTESTS = require('../config/subtests');
const { getSettingValue } = require('./settings.service');
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const pct = (completed, total) => total ? Math.round(completed / total * 1000) / 10 : 0;

async function active(id) {
  const material = await Material.findOne({ where: { id: positive(id), status: 'active' } });
  if (!material) throw invalid('Materi aktif tidak ditemukan.', 404);
  return material;
}
async function rows(userId) {
  const [materials, progress, questionCounts] = await Promise.all([
    Material.findAll({ where: { status: 'active' }, attributes: ['id', 'title', 'description', 'subtest', 'category', 'file_name', 'file_mime', 'file_size', 'created_at', 'updated_at'], order: [['subtest', 'ASC'], ['title', 'ASC'], ['id', 'ASC']] }),
    UserMaterialProgress.findAll({ where: { user_id: userId }, attributes: ['material_id', 'status', 'progress_percentage', 'started_at', 'completed_at', 'last_accessed_at'] }),
    sequelize.query("SELECT material_id,COUNT(*)::int AS total FROM questions WHERE material_id IS NOT NULL AND status='active' AND question_type='multiple_choice' GROUP BY material_id", { type: QueryTypes.SELECT }),
  ]);
  const byProgress = new Map(progress.map(row => [row.material_id, row.toJSON()]));
  const byQuestions = new Map(questionCounts.map(row => [row.material_id, Number(row.total)]));
  return materials.map(material => {
    const record = byProgress.get(material.id);
    return { material_id: material.id, title: material.title, description: material.description, subtest: material.subtest, category: material.category, file_name: material.file_name, file_mime: material.file_mime, file_size: material.file_size, created_at: material.created_at, status: record?.status || 'not_started', progress: Number(record?.progress_percentage || 0), topics_total: 1, topics_completed: record?.status === 'completed' ? 1 : 0, practice_question_count: byQuestions.get(material.id) || 0, started_at: record?.started_at || null, completed_at: record?.completed_at || null, last_accessed_at: record?.last_accessed_at || null };
  });
}
function summarize(items) {
  const completed = items.filter(row => row.status === 'completed').length;
  const inProgress = items.filter(row => row.status === 'in_progress').length;
  return { total_materials: items.length, completed, in_progress: inProgress, overall_progress: pct(completed, items.length) };
}
async function summary(userId) { return summarize(await rows(userId)); }

async function overview(userId, query = {}) {
  const selected = String(query.subtest_id || query.subtest || '').toUpperCase();
  const status = String(query.status || 'all');
  const search = String(query.search || '').trim().slice(0, 200).toLowerCase();
  if (selected && !SUBTESTS.some(row => row.code === selected)) throw invalid('Filter subtes tidak valid.');
  if (!['all', 'not_started', 'in_progress', 'completed'].includes(status)) throw invalid('Filter status tidak valid.');
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1), limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 12));
  const all = await rows(userId);
  const subtests = SUBTESTS.map(({ code, name }) => { const items = all.filter(row => row.subtest === code); const complete = items.filter(row => row.status === 'completed').length; return { code, name, total_materials: items.length, completed: complete, progress: pct(complete, items.length) }; });
  const continueLearning = all.filter(row => row.status === 'in_progress').sort((a, b) => new Date(b.last_accessed_at || b.started_at || 0) - new Date(a.last_accessed_at || a.started_at || 0))[0] || null;
  const weakest = subtests.filter(row => row.total_materials > 0).sort((a, b) => a.progress - b.progress || a.code.localeCompare(b.code))[0];
  const focusRows = await sequelize.query("SELECT ps.subtest::text AS code,COUNT(pa.answer_id) FILTER (WHERE pa.selected_answer IS NOT NULL)::int AS attempted,COUNT(pa.answer_id) FILTER (WHERE pa.is_correct IS TRUE AND pa.selected_answer IS NOT NULL)::int AS correct FROM practice_sessions ps JOIN practice_answers pa ON pa.session_id=ps.session_id WHERE ps.user_id=$userId AND ps.status='completed' GROUP BY ps.subtest", { bind: { userId }, type: QueryTypes.SELECT });
  const practiceFocus = focusRows.filter(row => Number(row.attempted) >= 10).map(row => ({ ...row, accuracy: pct(Number(row.correct), Number(row.attempted)) })).sort((a, b) => a.accuracy - b.accuracy)[0];
  const focus = practiceFocus?.code || weakest?.code;
  const recommended = all.filter(row => row.subtest === focus && row.status !== 'completed').sort((a, b) => (a.status === 'in_progress' ? -1 : 0) - (b.status === 'in_progress' ? -1 : 0) || a.title.localeCompare(b.title)).slice(0, 3).map(row => ({ ...row, reason: practiceFocus ? `Akurasi Practice ${focus} ${practiceFocus.accuracy}% dari ${practiceFocus.attempted} soal.` : `Progres materi ${focus} masih ${weakest?.progress || 0}%.` }));
  const continue_learning = continueLearning || recommended[0] || null;
  const completed_materials = all.filter(row => row.status === 'completed').sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0)).slice(0, 5);
  const filtered = all.filter(row => (!selected || row.subtest === selected) && (status === 'all' || row.status === status) && (!search || `${row.title} ${row.description || ''} ${row.subtest}`.toLowerCase().includes(search)));
  return { summary: summarize(all), subtests, continue_learning, recommended, completed_materials, materials: filtered.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: filtered.length, total_pages: Math.max(1, Math.ceil(filtered.length / limit)) }, snbt_year: Number(await getSettingValue('active_snbt_year')) || null };
}

async function detail(userId, id) {
  const material = await active(id);
  const all = await rows(userId);
  const item = all.find(row => row.material_id === material.id);
  const related = all.filter(row => row.subtest === material.subtest);
  const position = related.findIndex(row => row.material_id === material.id);
  return { material: item, topics: [{ topic_id: material.id, title: material.title, completed: item.status === 'completed' }], previous_material: related[position - 1] || null, next_material: related[position + 1] || null, content_type: 'file', file_url: `/api/user/materials/${material.id}/file` };
}

async function start(userId, id) {
  const material = await active(id), now = new Date();
  const [record] = await UserMaterialProgress.findOrCreate({ where: { user_id: userId, material_id: material.id }, defaults: { user_id: userId, material_id: material.id, status: 'in_progress', started_at: now, last_accessed_at: now } });
  if (record.status === 'not_started') await record.update({ status: 'in_progress', started_at: record.started_at || now, last_accessed_at: now });
  else await record.update({ last_accessed_at: now });
  return detail(userId, id);
}
async function updateProgress(userId, id, input) {
  const material = await active(id);
  const value = Number(input?.progress_percentage);
  if (input?.progress_percentage == null || !Number.isFinite(value) || value < 0 || value > 100) throw invalid('Progress harus 0–100.');
  const [record] = await UserMaterialProgress.findOrCreate({ where: { user_id: userId, material_id: material.id }, defaults: { user_id: userId, material_id: material.id, status: 'in_progress', started_at: new Date() } });
  if (record.status !== 'completed') await record.update({ progress_percentage: value, status: value === 100 ? 'completed' : 'in_progress', started_at: record.started_at || new Date(), completed_at: value === 100 ? new Date() : null, last_accessed_at: new Date() });
  return detail(userId, id);
}
async function complete(userId, id) {
  const material = await active(id), now = new Date();
  const [record] = await UserMaterialProgress.findOrCreate({ where: { user_id: userId, material_id: material.id }, defaults: { user_id: userId, material_id: material.id, status: 'completed', progress_percentage: 100, started_at: now, completed_at: now, last_accessed_at: now } });
  if (record.status !== 'completed') await record.update({ status: 'completed', progress_percentage: 100, started_at: record.started_at || now, completed_at: now, last_accessed_at: now });
  return detail(userId, id);
}

module.exports = { overview, detail, start, updateProgress, complete, active, summary };
