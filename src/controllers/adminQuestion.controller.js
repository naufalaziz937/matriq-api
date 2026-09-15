const { Op } = require('sequelize');
const { Question, User, Material } = require('../models');

const SUBTEST_ITEMS = require('../config/subtests');
const SUBTESTS = new Set(SUBTEST_ITEMS.map(item => item.code));
const SUBTEST_LABELS = Object.fromEntries(SUBTEST_ITEMS.map(item => [item.code, item.name]));
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const STATUSES = new Set(['draft', 'active', 'review', 'rejected']);
const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'];
const creator = [{ model: User, as: 'created_by', attributes: ['user_id', 'nama', 'role', 'foto_profile'] }, { model: Material, as: 'material', attributes: ['id', 'title', 'subtest'] }];

function invalid(message) { return { success: false, message }; }
function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function validateQuestion(input) {
  const question = String(input.question ?? '').trim();
  const subtest = String(input.subtest ?? '').trim().toUpperCase();
  const category = String(input.category ?? '').trim();
  const difficulty = String(input.difficulty ?? '').trim().toLowerCase();
  const difficultyLevel = Number(input.difficulty_level ?? ({ easy: 1, medium: 2, hard: 3 })[difficulty]);
  const materialId = input.material_id == null || input.material_id === '' ? null : Number(input.material_id);
  const explanation = String(input.explanation ?? '').trim();
  const status = String(input.status ?? 'draft').trim().toLowerCase();
  const correctAnswer = String(input.correct_answer ?? '').trim().toUpperCase();
  const options = input.options;

  if (question.length < 5 || question.length > 10000) return { error: 'Pertanyaan harus berisi 5–10000 karakter' };
  if (!SUBTESTS.has(subtest)) return { error: 'Subtes tidak valid' };
  if (!category || category.length > 100) return { error: 'Kategori wajib diisi (maksimal 100 karakter)' };
  if (!DIFFICULTIES.has(difficulty)) return { error: 'Tingkat kesulitan tidak valid' };
  if (!Number.isInteger(difficultyLevel) || difficultyLevel < 1 || difficultyLevel > 4) return { error: 'Level latihan harus 1–4' };
  if (materialId != null && (!Number.isSafeInteger(materialId) || materialId < 1)) return { error: 'Materi tidak valid' };
  if (!STATUSES.has(status)) return { error: 'Status tidak valid' };
  if (!Array.isArray(options) || options.length !== 5) return { error: 'Pilihan jawaban harus A sampai E' };
  const normalizedOptions = options.map((option) => ({
    key: String(option?.key ?? '').trim().toUpperCase(),
    text: String(option?.text ?? '').trim(),
  }));
  if (normalizedOptions.some((option, index) => option.key !== OPTION_KEYS[index] || !option.text || option.text.length > 3000)) {
    return { error: 'Setiap pilihan A–E wajib diisi (maksimal 3000 karakter)' };
  }
  if (!OPTION_KEYS.includes(correctAnswer)) return { error: 'Jawaban benar harus salah satu dari A–E' };
  if (!explanation || explanation.length > 10000) return { error: 'Pembahasan wajib diisi (maksimal 10000 karakter)' };

  return { value: { question, question_type: 'multiple_choice', subtest, category, difficulty: difficultyLevel === 1 ? 'easy' : difficultyLevel === 2 ? 'medium' : 'hard', difficulty_level: difficultyLevel, material_id: materialId, options: normalizedOptions, correct_answer: correctAnswer, explanation, status } };
}
async function materialError(value) {
  if (!value.material_id) return value.status === 'active' ? 'Soal aktif wajib memiliki materi.' : null;
  const material = await Material.findByPk(value.material_id);
  if (!material || material.subtest !== value.subtest || (value.status === 'active' && material.status !== 'active')) return 'Materi tidak tersedia untuk subtes atau status soal ini.';
  return null;
}

async function categories() {
  const rows = await Question.findAll({
    attributes: ['category'],
    group: ['category'],
    order: [['category', 'ASC']],
    raw: true,
  });
  return rows.map((row) => ({ id: row.category, name: row.category }));
}

async function getQuestions(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const search = String(req.query.search ?? '').trim().slice(0, 200);
    const subtest = String(req.query.subtest ?? '').toUpperCase();
    const difficulty = String(req.query.difficulty ?? '').toLowerCase();
    const status = String(req.query.status ?? '').toLowerCase();
    const category = String(req.query.category ?? '').trim();
    if (subtest && !SUBTESTS.has(subtest)) return res.status(400).json(invalid('Filter subtes tidak valid'));
    if (difficulty && !DIFFICULTIES.has(difficulty) && !['1','2','3','4'].includes(difficulty)) return res.status(400).json(invalid('Filter kesulitan tidak valid'));
    if (status && !STATUSES.has(status)) return res.status(400).json(invalid('Filter status tidak valid'));

    const where = {};
    if (subtest) where.subtest = subtest;
    if (difficulty) { if (['1','2','3','4'].includes(difficulty)) where.difficulty_level = Number(difficulty); else where.difficulty = difficulty; }
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      const matchingSubtests = Object.entries(SUBTEST_LABELS)
        .filter(([code, label]) => code.toLowerCase().includes(search.toLowerCase()) || label.toLowerCase().includes(search.toLowerCase()))
        .map(([code]) => code);
      where[Op.or] = [
        { question: { [Op.iLike]: `%${search}%` } },
        { category: { [Op.iLike]: `%${search}%` } },
        ...(matchingSubtests.length ? [{ subtest: { [Op.in]: matchingSubtests } }] : []),
      ];
    }
    const [{ count, rows }, categoryList] = await Promise.all([
      Question.findAndCountAll({ where, include: creator, order: [['created_at', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit }),
      categories(),
    ]);
    return res.json({
      success: true,
      data: rows,
      categories: categoryList,
      pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    console.error('GET QUESTIONS ERROR:', error);
    return res.status(500).json(invalid('Gagal memuat Bank Soal'));
  }
}

async function getSummary(req, res) {
  try {
    const [total, active, draft, review] = await Promise.all([
      Question.count(),
      Question.count({ where: { status: 'active' } }),
      Question.count({ where: { status: 'draft' } }),
      Question.count({ where: { status: 'review' } }),
    ]);
    return res.json({ success: true, data: { total, active, draft, review } });
  } catch (error) {
    console.error('GET QUESTION SUMMARY ERROR:', error);
    return res.status(500).json(invalid('Gagal memuat ringkasan Bank Soal'));
  }
}

async function getQuestionById(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID soal tidak valid'));
  try {
    const question = await Question.findByPk(id, { include: creator });
    if (!question) return res.status(404).json(invalid('Soal tidak ditemukan'));
    return res.json({ success: true, data: question });
  } catch (error) {
    console.error('GET QUESTION ERROR:', error);
    return res.status(500).json(invalid('Gagal memuat detail soal'));
  }
}

async function createQuestion(req, res) {
  const defaultStatus=await require('../services/settings.service').getSettingValue('admin_question_default_status','active');
  const result = validateQuestion({ status:defaultStatus,...(req.body ?? {}) });
  if (result.error) return res.status(400).json(invalid(result.error));
  if (!['draft', 'active'].includes(result.value.status)) return res.status(400).json(invalid('Admin hanya dapat membuat soal draft atau aktif'));
  try {
    const issue = await materialError(result.value); if (issue) return res.status(400).json(invalid(issue));
    const question = await Question.create({ ...result.value, created_by_id: req.user.user_id });
    const saved = await Question.findByPk(question.id, { include: creator });
    return res.status(201).json({ success: true, message: 'Soal berhasil dibuat', data: saved });
  } catch (error) {
    console.error('CREATE QUESTION ERROR:', error);
    return res.status(500).json(invalid('Gagal membuat soal'));
  }
}

async function updateQuestion(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID soal tidak valid'));
  try {
    const question = await Question.findByPk(id);
    if (!question) return res.status(404).json(invalid('Soal tidak ditemukan'));
    const result = validateQuestion({ ...question.toJSON(), ...(req.body ?? {}) });
    if (result.error) return res.status(400).json(invalid(result.error));
    const issue = await materialError(result.value); if (issue) return res.status(400).json(invalid(issue));
    await question.update(result.value);
    const saved = await Question.findByPk(id, { include: creator });
    return res.json({ success: true, message: 'Soal berhasil diperbarui', data: saved });
  } catch (error) {
    console.error('UPDATE QUESTION ERROR:', error);
    return res.status(500).json(invalid('Gagal memperbarui soal'));
  }
}

async function deleteQuestion(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID soal tidak valid'));
  try {
    const deleted = await Question.destroy({ where: { id } });
    if (!deleted) return res.status(404).json(invalid('Soal tidak ditemukan'));
    return res.json({ success: true, message: 'Soal berhasil dihapus' });
  } catch (error) {
    console.error('DELETE QUESTION ERROR:', error);
    return res.status(500).json(invalid('Gagal menghapus soal'));
  }
}

module.exports = { getQuestions, getSummary, getQuestionById, createQuestion, updateQuestion, deleteQuestion, validateQuestion, materialError };
