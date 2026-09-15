const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Question, User, Material } = require('../models');
const { materialError } = require('./adminQuestion.controller');
const notifications = require('../services/notification.service');

const creator = { model: User, as: 'created_by', attributes: ['user_id', 'nama', 'role', 'foto_profile'], required: true, where: { role: 3 } };
const reviewer = { model: User, as: 'reviewer', attributes: ['user_id', 'nama', 'role', 'foto_profile'], required: false };
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function getModerationSummary(_req, res) {
  try {
    const [data] = await sequelize.query(`SELECT
      COUNT(*) FILTER (WHERE q.status='review')::int pending_review,
      COUNT(*) FILTER (WHERE q.status='active' AND (q.reviewed_at AT TIME ZONE 'Asia/Jakarta')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)::int approved_today,
      COUNT(*) FILTER (WHERE q.status='rejected')::int rejected,
      COUNT(*)::int total_tutor_submission
      FROM questions q JOIN users u ON u.user_id=q.created_by_id AND u.role=3`, { type: QueryTypes.SELECT });
    res.json({ success: true, data });
  } catch(error) { console.error('MODERATION SUMMARY:', error); fail(res, 500, 'Gagal memuat ringkasan moderasi'); }
}

async function getModerationQueue(req, res) {
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
  const status = String(req.query.status || 'review').toLowerCase();
  if (!['review', 'active', 'rejected'].includes(status)) return fail(res, 400, 'Filter status tidak valid');
  const where = ['u.role=3', 'q.status=:status'];
  const replacements = { status, limit, offset: (page - 1) * limit };
  if (req.query.search) { replacements.search = `%${String(req.query.search).trim().slice(0, 200)}%`; where.push('(q.question ILIKE :search OR q.category ILIKE :search OR u.nama ILIKE :search OR u.email ILIKE :search)'); }
  if (req.query.subtest) { const value = String(req.query.subtest).toUpperCase(); if (!['PU','PPU','PBM','PK','LBI','LBE','PM'].includes(value)) return fail(res, 400, 'Subtes tidak valid'); replacements.subtest = value; where.push('q.subtest::text=:subtest'); }
  if (req.query.difficulty) { const value = String(req.query.difficulty).toLowerCase(); if (!['easy','medium','hard','1','2','3','4'].includes(value)) return fail(res, 400, 'Kesulitan tidak valid'); replacements.difficulty = value; where.push(['1','2','3','4'].includes(value) ? 'q.difficulty_level=CAST(:difficulty AS integer)' : 'q.difficulty::text=:difficulty'); }
  if (req.query.tutor_id) { const id = validId(req.query.tutor_id); if (!id) return fail(res, 400, 'Tutor tidak valid'); replacements.tutor_id=id; where.push('u.user_id=:tutor_id'); }
  for (const key of ['date_from','date_to']) {
    if (!req.query[key]) continue;
    const value = String(req.query[key]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return fail(res, 400, 'Tanggal tidak valid');
    replacements[key] = value;
    where.push(key==='date_from' ? 'COALESCE(q.submitted_at,q.created_at) >= CAST(:date_from AS date)' : "COALESCE(q.submitted_at,q.created_at) < CAST(:date_to AS date) + INTERVAL '1 day'");
  }
  const order = req.query.sort === 'newest' ? 'COALESCE(q.submitted_at,q.created_at) DESC,q.id DESC' : 'COALESCE(q.submitted_at,q.created_at) ASC,q.id ASC';
  const from = `FROM questions q JOIN users u ON u.user_id=q.created_by_id LEFT JOIN users reviewer ON reviewer.user_id=q.reviewed_by_id LEFT JOIN materials m ON m.id=q.material_id WHERE ${where.join(' AND ')}`;
  try {
    const [count] = await sequelize.query(`SELECT COUNT(*)::int total ${from}`, { replacements, type: QueryTypes.SELECT });
    const data = await sequelize.query(`SELECT q.id,q.question,q.subtest,q.category,q.difficulty,q.difficulty_level,q.material_id,m.title AS material_title,q.status,q.created_at,q.updated_at,q.submitted_at,q.reviewed_at,q.rejection_reason,
      json_build_object('user_id',u.user_id,'nama',u.nama,'role',u.role,'foto_profile',u.foto_profile) creator,
      CASE WHEN reviewer.user_id IS NULL THEN NULL ELSE json_build_object('user_id',reviewer.user_id,'nama',reviewer.nama,'role',reviewer.role) END reviewer
      ${from} ORDER BY ${order} LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
    res.json({ success: true, data, pagination: { page, limit, total: count.total, total_pages: Math.max(1, Math.ceil(count.total / limit)) } });
  } catch(error) { console.error('MODERATION QUEUE:', error); fail(res, 500, 'Gagal memuat moderation queue'); }
}

async function getModerationDetail(req, res) {
  const id = validId(req.params.id); if (!id) return fail(res, 400, 'ID soal tidak valid');
  try {
    const item = await Question.findByPk(id, { include: [creator, reviewer, { model: Material, as: 'material', attributes: ['id', 'title', 'subtest'] }] });
    if (!item) return fail(res, 404, 'Soal Tutor tidak ditemukan');
    res.json({ success: true, data: item });
  } catch(error) { console.error('MODERATION DETAIL:', error); fail(res, 500, 'Gagal memuat detail soal'); }
}

async function review(req, res, status) {
  const id = validId(req.params.id); if (!id) return fail(res, 400, 'ID soal tidak valid');
  const reason = String(req.body?.reason || '').trim();
  const reasonRequired=await require('../services/settings.service').getSettingValue('rejection_reason_required',true);
  if (status === 'rejected' && ((reasonRequired && reason.length < 5) || reason.length > 2000)) return fail(res, 400, 'Alasan penolakan wajib diisi (5–2000 karakter)');
  try {
    const item = await Question.findByPk(id, { include: [creator] });
    if (!item) return fail(res, 404, 'Soal Tutor tidak ditemukan');
    if (item.status !== 'review') return fail(res, 400, 'Hanya soal menunggu review yang dapat dimoderasi');
    if (status === 'active') { const issue = await materialError({ ...item.toJSON(), status: 'active' }); if (issue) return fail(res, 400, issue); }
    const [updated] = await Question.update({ status, reviewed_by_id: req.user.user_id, reviewed_at: new Date(), rejection_reason: status === 'rejected' ? reason : null }, { where: { id, status: 'review' } });
    if (!updated) return fail(res, 409, 'Status soal sudah berubah. Muat ulang daftar.');
    const saved = await Question.findByPk(id, { include: [creator, reviewer] });
    await notifications.afterEvent({userId:item.created_by_id,type:status==='active'?'question_approved':'question_rejected',title:status==='active'?'Soal Disetujui':'Soal Perlu Revisi',message:status==='active'?`Soal "${String(item.question).slice(0,70)}" telah disetujui Admin.`:`Soal "${String(item.question).slice(0,70)}" perlu revisi. ${reason}`,actionUrl:'/my-moderation'});
    res.json({ success: true, message: status === 'active' ? 'Soal berhasil disetujui' : 'Soal berhasil ditolak', data: saved });
  } catch(error) { console.error('MODERATION REVIEW:', error); fail(res, 500, 'Gagal memoderasi soal'); }
}
const approveQuestion = (req,res) => review(req,res,'active');
const rejectQuestion = (req,res) => review(req,res,'rejected');
module.exports = { getModerationSummary, getModerationQueue, getModerationDetail, approveQuestion, rejectQuestion };
