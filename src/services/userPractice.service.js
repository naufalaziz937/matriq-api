const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Question, Material, PracticeSession, PracticeAnswer, StudyProgress } = require('../models');
const { buildUserRoadmap } = require('./userRoadmap.service');
const SUBTESTS = require('../config/subtests');
const LEVELS = [
  { level: 1, key: 'fundamental', name: 'Fundamental', description: 'Bangun fondasi dan pahami konsep inti.' },
  { level: 2, key: 'intermediate', name: 'Intermediate', description: 'Gabungkan konsep dan latih kemampuan analisis.' },
  { level: 3, key: 'advanced', name: 'Advanced', description: 'Hadapi soal kompleks dan pola SNBT tingkat lanjut.' },
  { level: 4, key: 'mastery', name: 'Mastery', description: 'Uji penguasaan penuh dengan soal paling menantang.' },
];
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const percent = (correct, attempted) => attempted ? Math.round(1000 * Number(correct) / Number(attempted)) / 10 : null;
const plain = row => row?.toJSON ? row.toJSON() : row;

async function overview(userId) {
  const [summaryRows, subtestRows, recentRows, roadmap] = await Promise.all([
    sequelize.query(`SELECT COALESCE(SUM(pa.answered),0)::int attempted,COALESCE(SUM(pa.correct),0)::int correct,COUNT(DISTINCT ps.material_id) FILTER (WHERE ps.status='completed' AND pa.answered>0)::int materials_practiced,COALESCE(MAX(ps.difficulty_level) FILTER (WHERE ps.status='completed'),0)::int highest_level FROM practice_sessions ps LEFT JOIN (SELECT session_id,COUNT(*) FILTER (WHERE answered_at IS NOT NULL)::int answered,COUNT(*) FILTER (WHERE is_correct)::int correct FROM practice_answers GROUP BY session_id) pa ON pa.session_id=ps.session_id WHERE ps.user_id=:userId AND ps.status='completed'`, { replacements: { userId }, type: QueryTypes.SELECT }),
    sequelize.query(`SELECT q.subtest::text code,COUNT(*) FILTER (WHERE q.status='active' AND q.question_type='multiple_choice' AND m.status='active')::int available_questions FROM questions q JOIN materials m ON m.id=q.material_id GROUP BY q.subtest`, { type: QueryTypes.SELECT }),
    PracticeSession.findAll({ where: { user_id: userId, status: 'completed' }, include: [{ model: Material, as: 'material', attributes: ['id', 'title'] }], order: [['completed_at', 'DESC']], limit: 6 }),
    buildUserRoadmap(userId),
  ]);
  const summary = summaryRows[0];
  const subtests = SUBTESTS.map(item => {
    const study = roadmap.subtests.find(row => row.code === item.code);
    return { ...item, available_questions: Number(subtestRows.find(row => row.code === item.code)?.available_questions || 0), questions_attempted: study.questions_attempted, accuracy: study.accuracy, progress: study.progress };
  });
  const focus = roadmap.daily_recommendation?.subtest_code;
  return { summary: { questions_attempted: Number(summary.attempted), accuracy: percent(summary.correct, summary.attempted), materials_practiced: Number(summary.materials_practiced), highest_level: Number(summary.highest_level) }, subtests, levels: LEVELS, recommendation: focus ? { subtest: focus, name: subtests.find(row => row.code === focus)?.name, reason: roadmap.daily_recommendation.reason, description: roadmap.daily_recommendation.description } : null, recent_sessions: recentRows.map(row => ({ session_id: row.session_id, material_id: row.material_id, material_title: row.material?.title || 'Materi', subtest: row.subtest, difficulty_level: row.difficulty_level, question_count: row.question_count, correct_count: row.correct_count, accuracy: Number(row.accuracy), duration_seconds: row.duration_seconds, completed_at: row.completed_at })) };
}

async function materials(userId, code) {
  if (!SUBTESTS.some(item => item.code === code)) throw error('Subtes tidak valid.');
  const rows = await sequelize.query(`SELECT m.id,m.title,m.description,m.subtest::text AS subtest,COALESCE(q.available,0)::int AS available_questions,COALESCE(p.correct,0)::int AS correct,COALESCE(p.attempted,0)::int AS attempted,COALESCE(p.sessions,0)::int AS total_sessions,COALESCE(p.highest_level,0)::int AS highest_completed_level FROM materials m LEFT JOIN LATERAL (SELECT COUNT(*) AS available FROM questions WHERE material_id=m.id AND status='active' AND question_type='multiple_choice') q ON true LEFT JOIN LATERAL (SELECT SUM(correct_count) AS correct,SUM(correct_count+wrong_count) AS attempted,COUNT(*) AS sessions,MAX(difficulty_level) AS highest_level FROM practice_sessions WHERE material_id=m.id AND user_id=:userId AND status='completed') p ON true WHERE m.status='active' AND m.subtest::text=:code ORDER BY m.title`, { replacements: { userId, code }, type: QueryTypes.SELECT });
  return rows.map(row => ({ id: row.id, title: row.title, description: row.description, subtest: row.subtest, available_questions: Number(row.available_questions), attempted: Number(row.attempted), accuracy: percent(row.correct, row.attempted), total_sessions: Number(row.total_sessions), highest_completed_level: Number(row.highest_completed_level) }));
}

async function levels(userId, materialId) {
  const material = await Material.findOne({ where: { id: positiveId(materialId), status: 'active' }, attributes: ['id', 'title', 'subtest'] });
  if (!material) throw error('Materi aktif tidak ditemukan.', 404);
  const [counts, history] = await Promise.all([
    Question.findAll({ where: { material_id: material.id, status: 'active', question_type: 'multiple_choice' }, attributes: ['difficulty_level', [sequelize.fn('COUNT', sequelize.col('id')), 'available']], group: ['difficulty_level'], raw: true }),
    PracticeSession.findAll({ where: { user_id: userId, material_id: material.id, status: 'completed' }, attributes: ['difficulty_level', [sequelize.fn('SUM', sequelize.col('correct_count')), 'correct'], [sequelize.fn('SUM', sequelize.literal('correct_count + wrong_count')), 'attempted']], group: ['difficulty_level'], raw: true }),
  ]);
  const stats = LEVELS.map(level => {
    const count = counts.find(row => row.difficulty_level === level.level);
    const row = history.find(item => item.difficulty_level === level.level);
    const attempted = Number(row?.attempted || 0);
    return { ...level, available_questions: Number(count?.available || 0), attempted, accuracy: percent(row?.correct || 0, attempted) };
  });
  let recommended = 1;
  for (let i = 0; i < 3; i++) if (stats[i].attempted >= 10 && (stats[i].accuracy || 0) >= [70, 75, 80][i]) recommended = i + 2; else break;
  return { material: plain(material), levels: stats.map(row => ({ ...row, recommended: row.level === recommended })) };
}

async function ownSession(userId, sessionId, transaction) {
  const session = await PracticeSession.findOne({ where: { session_id: positiveId(sessionId), user_id: userId }, ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {}) });
  if (!session) throw error('Sesi latihan tidak ditemukan.', 404);
  return session;
}
async function sessionView(userId, sessionId) {
  const session = await ownSession(userId, sessionId);
  const questions = await Question.findAll({ where: { id: { [Op.in]: session.question_ids } }, attributes: ['id', 'question', 'options', 'correct_answer', 'explanation'] });
  const byId = new Map(questions.map(row => [row.id, row]));
  const answers = await PracticeAnswer.findAll({ where: { session_id: session.session_id }, attributes: ['question_id', 'selected_answer', 'is_correct', 'answered_at'] });
  const byAnswer = new Map(answers.map(row => [row.question_id, row]));
  return { session_id: session.session_id, material_id: session.material_id, subtest: session.subtest, difficulty_level: session.difficulty_level, question_count: session.question_count, status: session.status, started_at: session.started_at, questions: session.question_ids.map(id => { const question = byId.get(id); const answer = byAnswer.get(id); return question ? { question_id: id, question: question.question, options: question.options, answered: Boolean(answer?.answered_at), selected_answer: answer?.selected_answer || null, ...(answer?.answered_at ? { feedback: { selected_answer: answer.selected_answer, is_correct: answer.is_correct, correct_answer: question.correct_answer, explanation: question.explanation } } : {}) } : null; }).filter(Boolean) };
}
async function start(userId, input) {
  const materialId = positiveId(input?.material_id), level = Number(input?.difficulty_level), count = Number(input?.question_count ?? 10);
  if (!materialId || !Number.isInteger(level) || level < 1 || level > 4 || ![5, 10, 15, 20].includes(count)) throw error('Pilihan latihan tidak valid.');
  const material = await Material.findOne({ where: { id: materialId, status: 'active' } });
  if (!material) throw error('Materi aktif tidak ditemukan.', 404);
  const available = await Question.count({ where: { material_id: materialId, subtest: material.subtest, difficulty_level: level, status: 'active', question_type: 'multiple_choice' } });
  if (available < count) throw error(`Hanya ${available} soal aktif tersedia untuk level ini.`);
  const selected = await Question.findAll({ where: { material_id: materialId, subtest: material.subtest, difficulty_level: level, status: 'active', question_type: 'multiple_choice' }, attributes: ['id'], order: sequelize.random(), limit: count });
  if (selected.length !== count) throw error('Jumlah soal berubah. Silakan coba lagi.', 409);
  const questionIds = selected.map(row => row.id);
  const session = await sequelize.transaction(async transaction => {
    const created = await PracticeSession.create({ user_id: userId, subtest: material.subtest, material_id: material.id, difficulty_level: level, question_ids: questionIds, question_count: count, unanswered_count: count, status: 'in_progress' }, { transaction });
    await PracticeAnswer.bulkCreate(questionIds.map(questionId => ({ session_id: created.session_id, question_id: questionId })), { transaction });
    return created;
  });
  return { ...(await sessionView(userId, session.session_id)), material: { id: material.id, title: material.title } };
}
async function submitAnswer(userId, sessionId, input) {
  const questionId = positiveId(input?.question_id);
  const selected = String(input?.selected_answer || '').toUpperCase();
  const seconds = Number(input?.time_spent_seconds ?? 0);
  if (!questionId || !['A', 'B', 'C', 'D', 'E'].includes(selected) || !Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw error('Jawaban tidak valid.');
  return sequelize.transaction(async transaction => {
    const session = await ownSession(userId, sessionId, transaction);
    if (session.status !== 'in_progress') throw error('Sesi sudah selesai.');
    if (!session.question_ids.includes(questionId)) throw error('Soal tidak ada dalam sesi.', 404);
    const answer = await PracticeAnswer.findOne({ where: { session_id: session.session_id, question_id: questionId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!answer || answer.answered_at) throw error('Soal sudah dijawab.', 409);
    const question = await Question.findByPk(questionId, { attributes: ['correct_answer', 'explanation'], transaction });
    if (!question) throw error('Soal tidak ditemukan.', 404);
    const correct = selected === question.correct_answer;
    await answer.update({ selected_answer: selected, is_correct: correct, time_spent_seconds: seconds, answered_at: new Date() }, { transaction });
    return { question_id: questionId, selected_answer: selected, is_correct: correct, correct_answer: question.correct_answer, explanation: question.explanation };
  });
}
async function result(userId, sessionId) {
  const session = await ownSession(userId, sessionId);
  if (session.status !== 'completed') throw error('Hasil tersedia setelah sesi selesai.', 409);
  const answers = await PracticeAnswer.findAll({ where: { session_id: session.session_id }, order: [['answer_id', 'ASC']] });
  const questions = await Question.findAll({ where: { id: { [Op.in]: session.question_ids } }, attributes: ['id', 'question', 'options', 'correct_answer', 'explanation'] });
  const byId = new Map(questions.map(row => [row.id, row]));
  const byAnswer = new Map(answers.map(row => [row.question_id, row]));
  return { session_id: session.session_id, status: session.status, subtest: session.subtest, material_id: session.material_id, difficulty_level: session.difficulty_level, question_count: session.question_count, correct_count: session.correct_count, wrong_count: session.wrong_count, unanswered_count: session.unanswered_count, accuracy: Number(session.accuracy), duration_seconds: session.duration_seconds, completed_at: session.completed_at, review: session.question_ids.map(id => { const question = byId.get(id), answer = byAnswer.get(id); return question ? { question_id: id, question: question.question, options: question.options, selected_answer: answer?.selected_answer || null, is_correct: answer?.is_correct ?? null, correct_answer: question.correct_answer, explanation: question.explanation } : null; }).filter(Boolean) };
}
async function complete(userId, sessionId) {
  await sequelize.transaction(async transaction => {
    const session = await ownSession(userId, sessionId, transaction);
    if (session.status === 'completed') return;
    if (session.status !== 'in_progress') throw error('Sesi tidak dapat diselesaikan.');
    const answers = await PracticeAnswer.findAll({ where: { session_id: session.session_id }, transaction });
    const correct = answers.filter(row => row.is_correct === true).length;
    const wrong = answers.filter(row => row.is_correct === false).length;
    const attempted = correct + wrong;
    const duration = Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000));
    await session.update({ status: 'completed', correct_count: correct, wrong_count: wrong, unanswered_count: session.question_count - attempted, accuracy: percent(correct, attempted) || 0, duration_seconds: duration, completed_at: new Date() }, { transaction });
    if (attempted) await StudyProgress.create({ user_id: userId, materi_id: session.material_id, soal_dikerjakan: attempted, soal_benar: correct, soal_salah: wrong, akurasi: percent(correct, attempted), waktu_belajar: Math.ceil(duration / 60) }, { transaction });
  });
  return result(userId, sessionId);
}
module.exports = { overview, materials, levels, start, sessionView, submitAnswer, complete, result, error, LEVELS };
