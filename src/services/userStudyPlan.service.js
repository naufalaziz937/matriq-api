const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { StudyPlan, Material } = require('../models');
const { buildUserRoadmap } = require('./userRoadmap.service');

const TYPES = new Set(['material', 'practice', 'review', 'tryout_recap', 'target', 'milestone', 'personal']);
const SUBTESTS = new Set(['PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM']);
const REMINDERS = new Set([0, 10, 30, 60, 1440]);
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const localDate = (value, time = '00:00') => new Date(`${value}T${time}:00+07:00`);
const dayString = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const addDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function validatePlan(input, userId, { source = 'manual' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Data jadwal tidak valid.');
  const title = String(input.title || '').trim();
  if (!title || title.length > 200) throw error('Judul wajib diisi (maksimal 200 karakter).');
  if (!TYPES.has(input.type)) throw error('Tipe aktivitas tidak valid.');
  const start = new Date(input.start_at);
  if (!input.start_at || Number.isNaN(start.getTime())) throw error('Tanggal dan jam mulai tidak valid.');
  const end = input.end_at ? new Date(input.end_at) : null;
  const duration = input.duration_minutes == null || input.duration_minutes === '' ? null : Number(input.duration_minutes);
  if (end && (Number.isNaN(end.getTime()) || end <= start)) throw error('Jam selesai harus setelah jam mulai.');
  if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) throw error('Durasi harus 1–1440 menit.');
  const computedEnd = end || (duration ? new Date(start.getTime() + duration * 60000) : null);
  const subtest = input.subtest ? String(input.subtest).toUpperCase() : null;
  if (subtest && !SUBTESTS.has(subtest)) throw error('Subtes tidak valid.');
  const materialId = input.material_id == null || input.material_id === '' ? null : Number(input.material_id);
  if (materialId != null && (!Number.isInteger(materialId) || materialId < 1)) throw error('Materi tidak valid.');
  if (materialId != null) {
    const material = await Material.findOne({ where: { id: materialId, status: 'active' } });
    if (!material || (subtest && material.subtest !== subtest)) throw error('Materi aktif tidak ditemukan untuk subtes tersebut.');
  }
  const questions = input.target_questions == null || input.target_questions === '' ? null : Number(input.target_questions);
  if (questions != null && (!Number.isInteger(questions) || questions < 1 || questions > 10000)) throw error('Target soal harus 1–10000.');
  const repeatType = input.repeat_type || 'none';
  if (!['none', 'daily', 'weekly'].includes(repeatType)) throw error('Pengulangan tidak valid.');
  const repeatUntil = input.repeat_until ? new Date(input.repeat_until) : null;
  if (repeatUntil && (Number.isNaN(repeatUntil.getTime()) || repeatUntil < start || repeatUntil.getTime() - start.getTime() > 90 * 86400000)) throw error('Batas pengulangan maksimal 90 hari.');
  if (repeatType !== 'none' && !repeatUntil) throw error('Tanggal akhir pengulangan wajib diisi.');
  const reminder = input.reminder_minutes == null || input.reminder_minutes === '' ? null : Number(input.reminder_minutes);
  if (reminder != null && !REMINDERS.has(reminder)) throw error('Pengingat tidak valid.');
  const notes = input.notes == null ? null : String(input.notes).trim();
  if (notes && notes.length > 4000) throw error('Catatan terlalu panjang.');
  const stage = input.roadmap_stage == null ? null : Number(input.roadmap_stage);
  if (stage != null && (!Number.isInteger(stage) || stage < 1 || stage > 5)) throw error('Tahap roadmap tidak valid.');
  return { user_id: userId, title, type: input.type, subtest, material_id: materialId, target_questions: questions, notes, start_at: start, end_at: computedEnd, duration_minutes: duration ?? (end ? Math.round((end - start) / 60000) : null), status: 'pending', repeat_type: repeatType, repeat_until: repeatUntil, reminder_minutes: reminder, source, roadmap_stage: stage, completed_at: null };
}

async function createPlans(input, userId) {
  const plan = await validatePlan(input, userId, { source: input?.source === 'roadmap' ? 'roadmap' : 'manual' });
  const rows = [plan];
  if (plan.repeat_type !== 'none') {
    const step = plan.repeat_type === 'daily' ? 1 : 7;
    for (let next = new Date(plan.start_at.getTime() + step * 86400000); next <= plan.repeat_until; next = new Date(next.getTime() + step * 86400000)) {
      rows.push({ ...plan, start_at: next, end_at: plan.end_at ? new Date(plan.end_at.getTime() + (next - plan.start_at)) : null });
    }
  }
  return sequelize.transaction(async transaction => StudyPlan.bulkCreate(rows, { transaction, returning: true }));
}

function validRange(from, to, maxDays = 62) {
  if (!dateOnly(from) || !dateOnly(to)) throw error('Rentang tanggal tidak valid.');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > maxDays) throw error(`Rentang tanggal maksimal ${maxDays} hari.`);
  return { from: localDate(from), to: localDate(addDays(to, 1)) };
}
async function listPlans(userId, from, to) {
  const range = validRange(from, to);
  return StudyPlan.findAll({ where: { user_id: userId, start_at: { [Op.gte]: range.from, [Op.lt]: range.to } }, order: [['start_at', 'ASC'], ['plan_id', 'ASC']] });
}
async function weekSummary(userId, weekStart) {
  if (!dateOnly(weekStart)) throw error('Tanggal awal minggu tidak valid.');
  const plans = await listPlans(userId, weekStart, addDays(weekStart, 6));
  const now = new Date();
  const completed = plans.filter(row => row.status === 'completed');
  const missed = plans.filter(row => row.status === 'missed' || (row.status === 'pending' && (row.end_at || row.start_at) < now));
  const questionsPlanned = plans.reduce((sum, row) => sum + Number(row.target_questions || 0), 0);
  const questionsCompleted = completed.reduce((sum, row) => sum + Number(row.target_questions || 0), 0);
  return { planned: plans.length, completed: completed.length, missed: missed.length, completion_rate: plans.length ? Math.round(1000 * completed.length / plans.length) / 10 : 0, total_minutes: completed.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0), target_minutes: plans.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0), questions_planned: questionsPlanned, questions_completed: questionsCompleted, daily: Array.from({ length: 7 }, (_, i) => { const day = addDays(weekStart, i); const items = plans.filter(row => dayString(row.start_at) === day); return { date: day, planned: items.length, completed: items.filter(row => row.status === 'completed').length, plans: items.map(row => ({ plan_id: row.plan_id, title: row.title, type: row.type, status: row.status })) }; }) };
}
async function recommendations(userId) {
  const roadmap = await buildUserRoadmap(userId);
  if (!roadmap) throw error('User tidak ditemukan.', 404);
  const focus = roadmap.subtests.find(row => row.code === roadmap.daily_recommendation?.subtest_code);
  return { focus_subtest: focus?.code || null, focus_name: focus?.name || null, reason: roadmap.daily_recommendation?.reason || null, description: roadmap.daily_recommendation?.description || null, roadmap_stage: roadmap.current_stage, suggestions: focus ? [
    ...(focus.topics_total > focus.topics_completed ? [{ type: 'material', title: `Lanjutkan materi ${focus.name}`, duration_minutes: 45, subtest: focus.code }] : []),
    { type: 'practice', title: `Latihan soal ${focus.name}`, target_questions: 20, duration_minutes: 45, subtest: focus.code },
    ...(focus.accuracy != null && focus.accuracy < 80 ? [{ type: 'review', title: `Review kesalahan ${focus.name}`, duration_minutes: 30, subtest: focus.code }] : []),
  ] : [], milestones: roadmap.milestones, target: roadmap.target, snbt_year: roadmap.snbt_year, streak_days: await studyStreak(userId) };
}
async function studyStreak(userId) {
  const rows = await sequelize.query("SELECT DISTINCT day FROM (SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date AS day FROM study_progress WHERE user_id=:userId UNION SELECT (completed_at AT TIME ZONE 'Asia/Jakarta')::date AS day FROM study_plans WHERE user_id=:userId AND status='completed' AND completed_at IS NOT NULL) dates ORDER BY day DESC LIMIT 90", { replacements: { userId }, type: QueryTypes.SELECT });
  let cursor = dayString(new Date()), streak = 0;
  for (const row of rows) {
    const day = typeof row.day === 'string' ? row.day : row.day.toISOString().slice(0, 10);
    if (streak === 0 && day === addDays(cursor, -1)) cursor = day;
    if (day !== cursor) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
function validateAvailability(availability) {
  if (!availability || typeof availability !== 'object' || Array.isArray(availability)) throw error('Waktu belajar wajib diisi.');
  const names = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const slots = [];
  for (const [index, name] of names.entries()) {
    const entries = availability[name] || [];
    if (!Array.isArray(entries) || entries.length > 3) throw error('Maksimal 3 slot per hari.');
    for (const slot of entries) {
      if (!/^\d{2}:\d{2}$/.test(slot.start) || !/^\d{2}:\d{2}$/.test(slot.end)) throw error('Format jam belajar tidak valid.');
      const start = Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3));
      const end = Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3));
      if (start < 0 || end > 1440 || start >= end || end - start > 240 || Number(slot.start.slice(3)) > 59 || Number(slot.end.slice(3)) > 59) throw error('Slot belajar harus 1–240 menit.');
      slots.push({ dayIndex: index, start: slot.start, end: slot.end, minutes: end - start });
    }
  }
  if (!slots.length) throw error('Pilih setidaknya satu waktu belajar.');
  return slots;
}
async function generatePreview(userId, input) {
  const weekStart = input?.week_start;
  if (!dateOnly(weekStart) || new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1) throw error('Awal minggu harus hari Senin.');
  const slots = validateAvailability(input.availability);
  const recommendation = await recommendations(userId);
  const existing = await listPlans(userId, weekStart, addDays(weekStart, 6));
  const templates = recommendation.suggestions.length ? recommendation.suggestions : [{ type: 'material', title: 'Sesi belajar mandiri', duration_minutes: 45, subtest: null }];
  const plans = [];
  for (const [index, slot] of slots.entries()) {
    const date = addDays(weekStart, slot.dayIndex);
    const start = localDate(date, slot.start);
    const template = templates[index % templates.length];
    const minutes = Math.min(slot.minutes, template.duration_minutes);
    const end = new Date(start.getTime() + minutes * 60000);
    const conflicts = [...existing, ...plans].some(row => start < new Date(row.end_at || new Date(row.start_at).getTime() + 30 * 60000) && end > new Date(row.start_at));
    if (conflicts) continue;
    plans.push({ title: template.title, type: template.type, subtest: template.subtest, target_questions: template.target_questions || null, start_at: start.toISOString(), end_at: end.toISOString(), duration_minutes: minutes, source: 'auto_plan', roadmap_stage: recommendation.roadmap_stage, repeat_type: 'none', reminder_minutes: null, notes: recommendation.reason || null });
  }
  return { plans, skipped_conflicts: slots.length - plans.length, focus_subtest: recommendation.focus_subtest, reason: recommendation.reason };
}
async function savePreview(userId, plans) {
  if (!Array.isArray(plans) || !plans.length || plans.length > 21) throw error('Pratinjau rencana tidak valid.');
  const values = [];
  for (const plan of plans) values.push(await validatePlan({ ...plan, repeat_type: 'none' }, userId, { source: 'auto_plan' }));
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
    const a = values[i], b = values[j];
    if (a.start_at < (b.end_at || new Date(b.start_at.getTime() + 30 * 60000)) && (a.end_at || new Date(a.start_at.getTime() + 30 * 60000)) > b.start_at) throw error('Pratinjau memuat jadwal yang bertabrakan.');
  }
  return sequelize.transaction(async transaction => {
    for (const value of values) {
      const overlap = await StudyPlan.count({ where: { user_id: userId, status: { [Op.notIn]: ['cancelled', 'missed'] }, start_at: { [Op.lt]: value.end_at || new Date(value.start_at.getTime() + 30 * 60000) }, [Op.or]: [{ end_at: { [Op.gt]: value.start_at } }, { end_at: null, start_at: { [Op.gte]: new Date(value.start_at.getTime() - 30 * 60000) } }] }, transaction });
      if (overlap) throw error('Ada jadwal yang bertabrakan. Muat ulang pratinjau.');
    }
    return StudyPlan.bulkCreate(values, { transaction, returning: true });
  });
}
module.exports = { validatePlan, createPlans, validRange, listPlans, weekSummary, recommendations, generatePreview, savePreview, dateOnly, addDays, error };
