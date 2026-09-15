const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { User, UserProfile, UserTarget, TutorProfile, Provinsi, KotaKab, Prodi, KampusPtn, Question, Material, ReportExport } = require('../models');
const { buildUserRoadmap } = require('./userRoadmap.service');
const { analytics } = require('./userAnalytics.service');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const subtests = new Set(['PU','PPU','PBM','PK','LBI','LBE','PM']);
const userFields = ['user_id','nama','email','no_hp','gender','role','foto_profile','is_activate','created_at','updated_at'];
const clean = (value, max) => { const text = String(value ?? '').trim(); if (text.length > max) fail(`Maksimal ${max} karakter`); return text || null; };
const requireRole = (user, role) => { if (Number(user.role) !== role) fail('Akses ditolak', 403); };

async function resolveRegions(profile) {
  if (!profile) return null;
  const data = profile.toJSON();
  const [province, city] = await Promise.all([
    data.provinsi ? Provinsi.findOne({ where: { [Op.or]: [{ kode: data.provinsi }, { nama: data.provinsi }] }, attributes: ['kode','nama'] }) : null,
    data.kota_kab ? KotaKab.findOne({ where: { [Op.or]: [{ kode: data.kota_kab }, { nama: data.kota_kab }] }, attributes: ['kode','nama','jenis'] }) : null,
  ]);
  return { ...data, provinsi_kode: province?.kode || null, provinsi_nama: province?.nama || (data.provinsi && !/^\d/.test(data.provinsi) ? data.provinsi : null), kota_kab_kode: city?.kode || null, kota_kab_nama: city ? `${city.jenis} ${city.nama}` : data.kota_kab && !/^\d/.test(data.kota_kab) ? data.kota_kab : null };
}

async function resolveTarget(target) {
  if (!target) return null;
  const choices = Array.isArray(target.pilihan) ? target.pilihan.slice(0, 4) : [];
  const codes = choices.map(item => typeof item === 'object' && item ? item.prodi_code || item.kode_snbt : item).filter(Boolean).map(String);
  const programs = codes.length ? await Prodi.findAll({ where: { kode_snbt: { [Op.in]: codes } }, include: [{ model: KampusPtn, as: 'kampus', attributes: ['id','nama','singkatan'] }] }) : [];
  const byCode = new Map(programs.map(item => [item.kode_snbt, item]));
  return { target_id: target.target_id, target_score: target.target_score, pilihan: choices.map((item, index) => { const code = String(typeof item === 'object' && item ? item.prodi_code || item.kode_snbt || '' : item); const program = byCode.get(code); return { priority: index + 1, prodi_code: program?.kode_snbt || null, program: program?.nama || null, campus_id: program?.kampus_id || null, campus: program?.kampus?.nama || null, campus_short: program?.kampus?.singkatan || null }; }) };
}

async function getStudentSummary(userId) {
  const [roadmap, report] = await Promise.all([buildUserRoadmap(userId), analytics(userId, { range: 'all' })]);
  return { completed_materials: roadmap?.study_summary?.completed_materials || 0, questions_attempted: report?.practice?.questions_attempted || 0, practice_accuracy: report?.practice?.accuracy ?? null, best_tryout_score: roadmap?.tryout?.best_score ?? null, study_streak: report?.overview?.streak_days || 0, roadmap_stage: roadmap?.current_stage || 1 };
}
async function getTutorSummary(userId) {
  const [questions, materials, answers, topMaterial, topSubtest, recentQuestions, recentMaterials] = await Promise.all([
    Question.findAll({ where: { created_by_id: userId }, attributes: ['status'], raw: true }),
    Material.findAll({ where: { created_by_id: userId }, attributes: ['status'], raw: true }),
    sequelize.query('SELECT COUNT(*)::int AS attempts, ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy FROM practice_answers pa JOIN questions q ON q.id=pa.question_id WHERE q.created_by_id=$userId AND pa.is_correct IS NOT NULL', { bind: { userId }, type: QueryTypes.SELECT }),
    sequelize.query('SELECT m.title, COUNT(ump.progress_id)::int AS views FROM materials m JOIN user_material_progress ump ON ump.material_id=m.id WHERE m.created_by_id=$userId GROUP BY m.id,m.title ORDER BY views DESC,m.id ASC LIMIT 1', { bind: { userId }, type: QueryTypes.SELECT }),
    sequelize.query('SELECT subtest::text AS code,COUNT(*)::int AS total FROM questions WHERE created_by_id=$userId GROUP BY subtest ORDER BY total DESC,code ASC LIMIT 1', { bind: { userId }, type: QueryTypes.SELECT }),
    Question.findAll({ where: { created_by_id: userId }, attributes: ['id','question','status','created_at'], order: [['created_at','DESC']], limit: 3 }),
    Material.findAll({ where: { created_by_id: userId }, attributes: ['id','title','status','created_at'], order: [['created_at','DESC']], limit: 3 }),
  ]);
  return { summary: { total_questions: questions.length, active_questions: questions.filter(x => x.status === 'active').length, review_questions: questions.filter(x => x.status === 'review').length, rejected_questions: questions.filter(x => x.status === 'rejected').length, total_materials: materials.length, active_materials: materials.filter(x => x.status === 'active').length, pending_materials: materials.filter(x => x.status === 'draft').length }, performance: { question_attempts: answers[0]?.attempts || 0, average_accuracy: answers[0]?.accuracy == null ? null : Number(answers[0].accuracy), most_read_material: topMaterial[0] || null, top_subtest: topSubtest[0] || null }, recent_content: [...recentQuestions.map(item => ({ type: 'question', id: item.id, title: item.question.slice(0, 80), status: item.status, created_at: item.created_at })), ...recentMaterials.map(item => ({ type: 'material', id: item.id, title: item.title, status: item.status, created_at: item.created_at }))].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,5) };
}
async function getAdminSummary(userId) {
  const [questionsCreated, contentReviewed, reportsExported] = await Promise.all([Question.count({ where: { created_by_id: userId } }), Question.count({ where: { reviewed_by_id: userId } }), ReportExport.count({ where: { admin_id: userId } })]);
  return { questions_created: questionsCreated, content_reviewed: contentReviewed, reports_exported: reportsExported };
}
async function getProfile(userId) {
  const user = await User.findByPk(userId, { attributes: userFields });
  if (!user) fail('Akun tidak ditemukan', 404);
  const role = Number(user.role);
  if (![1,2,3].includes(role)) fail('Role tidak dikenal', 403);
  const result = { user: user.toJSON(), role };
  if (role === 2) {
    const [profile, target, summary] = await Promise.all([UserProfile.findOne({ where: { user_id: userId } }), UserTarget.findOne({ where: { user_id: userId } }), getStudentSummary(userId)]);
    result.profile = await resolveRegions(profile);
    result.target = await resolveTarget(target);
    result.summary = summary;
  } else if (role === 3) {
    const [profile, data] = await Promise.all([TutorProfile.findOne({ where: { user_id: userId } }), getTutorSummary(userId)]);
    result.tutor_profile = profile?.toJSON() || null;
    Object.assign(result, data);
  } else result.summary = await getAdminSummary(userId);
  return result;
}
async function updateCommonProfile(userId, payload) {
  const allowed = new Set(['nama','no_hp','gender']);
  if (Object.keys(payload || {}).some(key => !allowed.has(key))) fail('Field profil tidak diizinkan');
  const data = {};
  if ('nama' in payload) { data.nama = clean(payload.nama, 150); if (!data.nama || data.nama.length < 2) fail('Nama minimal 2 karakter'); }
  if ('no_hp' in payload) { data.no_hp = clean(payload.no_hp, 30); if (data.no_hp && !/^\+?[0-9\s()-]{8,30}$/.test(data.no_hp)) fail('Nomor HP tidak valid'); }
  if ('gender' in payload) { data.gender = payload.gender || null; if (data.gender && !['L','P'].includes(data.gender)) fail('Gender tidak valid'); }
  await User.update(data, { where: { user_id: userId } });
  return getProfile(userId);
}
async function updateStudentProfile(userId, payload) {
  const user = await User.findByPk(userId, { attributes: ['role'] });
  if (!user) fail('Akun tidak ditemukan', 404);
  requireRole(user, 2);
  const allowed = new Set(['sekolah','kelas','tahun_lulus','provinsi','kota_kab']);
  if (Object.keys(payload || {}).some(key => !allowed.has(key))) fail('Field akademik tidak diizinkan');
  const data = { sekolah: clean(payload.sekolah,150), kelas: clean(payload.kelas,50), provinsi: payload.provinsi || null, kota_kab: payload.kota_kab || null };
  const year = payload.tahun_lulus === '' || payload.tahun_lulus == null ? null : Number(payload.tahun_lulus);
  if (year != null && (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear() + 10)) fail('Tahun lulus tidak valid');
  data.tahun_lulus = year;
  if (data.provinsi) { const province = await Provinsi.findByPk(data.provinsi); if (!province) fail('Provinsi tidak valid'); }
  if (data.kota_kab) { const city = await KotaKab.findOne({ where: { kode: data.kota_kab, provinsi_kode: data.provinsi } }); if (!city) fail('Kota/Kabupaten tidak sesuai provinsi'); }
  await UserProfile.findOrCreate({ where: { user_id: userId }, defaults: data }).then(async ([row, created]) => { if (!created) await row.update(data); });
  return getProfile(userId);
}
async function updateTarget(userId, payload) {
  const user = await User.findByPk(userId, { attributes: ['role'] });
  if (!user) fail('Akun tidak ditemukan', 404);
  requireRole(user, 2);
  const allowed = new Set(['pilihan','target_score']);
  if (Object.keys(payload || {}).some(key => !allowed.has(key))) fail('Field target tidak diizinkan');
  const pilihan = payload.pilihan;
  if (!Array.isArray(pilihan) || pilihan.length > 4) fail('Maksimal 4 pilihan prodi');
  const codes = pilihan.map(item => String(typeof item === 'object' && item ? item.prodi_code || item.kode_snbt || '' : item).trim());
  if (codes.some(code => !code) || new Set(codes).size !== codes.length) fail('Pilihan prodi tidak valid atau duplikat');
  const valid = await Prodi.count({ where: { kode_snbt: { [Op.in]: codes }, aktif: true } });
  if (valid !== codes.length) fail('Pilihan prodi tidak ditemukan');
  const score = payload.target_score === '' || payload.target_score == null ? null : Number(payload.target_score);
  if (score != null && (!Number.isFinite(score) || score < 0 || score > 1000)) fail('Target skor harus 0–1000');
  await UserTarget.findOrCreate({ where: { user_id: userId }, defaults: { pilihan: codes, target_score: score } }).then(async ([row, created]) => { if (!created) await row.update({ pilihan: codes, target_score: score }); });
  return getProfile(userId);
}
async function updateTutorProfile(userId, payload) {
  const user = await User.findByPk(userId, { attributes: ['role'] });
  if (!user) fail('Akun tidak ditemukan', 404);
  requireRole(user, 3);
  const allowed = new Set(['bio','specialization','institution','experience_years','expertise_subtests']);
  if (Object.keys(payload || {}).some(key => !allowed.has(key))) fail('Field tutor tidak diizinkan');
  const expertise = payload.expertise_subtests || [];
  if (!Array.isArray(expertise) || expertise.some(code => !subtests.has(code)) || new Set(expertise).size !== expertise.length) fail('Subtes keahlian tidak valid');
  const years = payload.experience_years === '' || payload.experience_years == null ? null : Number(payload.experience_years);
  if (years != null && (!Number.isInteger(years) || years < 0 || years > 80)) fail('Pengalaman mengajar tidak valid');
  const data = { bio: clean(payload.bio,3000), specialization: clean(payload.specialization,200), institution: clean(payload.institution,200), experience_years: years, expertise_subtests: expertise };
  await TutorProfile.findOrCreate({ where: { user_id: userId }, defaults: data }).then(async ([row, created]) => { if (!created) await row.update(data); });
  return getProfile(userId);
}
module.exports = { getProfile, updateCommonProfile, updateStudentProfile, updateTarget, updateTutorProfile, getStudentSummary, getTutorSummary, getAdminSummary };
