const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { Question, User, Material } = require('../models');
const { sequelize } = require('../config/database');
const notifications = require('../services/notification.service');

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

// ─── Template columns definition ──────────────────────────────────────────────
const TEMPLATE_COLUMNS = [
  { col: 'subtest',        header: 'subtest',        example: 'PU',                            note: 'Kode subtes: PU, PPU, PBM, PK, LBI, LBE, PM' },
  { col: 'category',      header: 'category',       example: 'Penalaran Deduktif',            note: 'Kategori soal (maks 100 karakter)' },
  { col: 'difficulty_level', header: 'difficulty_level', example: 2,                          note: '1=Fundamental, 2=Intermediate, 3=Advanced, 4=Mastery' },
  { col: 'question',      header: 'question',       example: 'Jika A > B dan B > C, maka?',  note: 'Teks soal (min 5, maks 10000 karakter)' },
  { col: 'option_a',      header: 'option_a',       example: 'A lebih besar dari C',          note: 'Pilihan jawaban A' },
  { col: 'option_b',      header: 'option_b',       example: 'B lebih besar dari A',          note: 'Pilihan jawaban B' },
  { col: 'option_c',      header: 'option_c',       example: 'C lebih besar dari A',          note: 'Pilihan jawaban C' },
  { col: 'option_d',      header: 'option_d',       example: 'Tidak bisa ditentukan',         note: 'Pilihan jawaban D' },
  { col: 'option_e',      header: 'option_e',       example: 'A sama dengan C',               note: 'Pilihan jawaban E' },
  { col: 'correct_answer',header: 'correct_answer', example: 'A',                             note: 'Jawaban benar: A, B, C, D, atau E' },
  { col: 'explanation',   header: 'explanation',    example: 'Karena A > B > C, maka A > C', note: 'Pembahasan jawaban (maks 10000 karakter)' },
  { col: 'material_id',   header: 'material_id',    example: '',                              note: '(Opsional) ID materi aktif. Kosongkan jika tidak ada.' },
  { col: 'status',        header: 'status',         example: 'draft',                         note: 'draft atau active (default: draft)' },
];

function downloadTemplate(req, res) {
  try {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Template soal
    const headerRow = TEMPLATE_COLUMNS.map((c) => c.header);
    const ws = XLSX.utils.aoa_to_sheet([headerRow]);

    // Lebar kolom otomatis
    ws['!cols'] = TEMPLATE_COLUMNS.map((c) =>
      ({ wch: Math.max(c.header.length, String(c.example).length, c.note.length, 20) })
    );

    XLSX.utils.book_append_sheet(wb, ws, 'Soal');

    // Sheet 2: Referensi
    const refWs = XLSX.utils.aoa_to_sheet([
      ['Referensi Nilai Valid'],
      [],
      ['Field', 'Nilai Valid'],
      ['subtest', 'PU, PPU, PBM, PK, LBI, LBE, PM'],
      ['difficulty_level', '1 = Fundamental, 2 = Intermediate, 3 = Advanced, 4 = Mastery'],
      ['correct_answer', 'A, B, C, D, atau E'],
      ['status', 'draft, active'],
      [],
      ['Contoh:', 'PU | Penalaran Deduktif | 2 | Jika A > B dan B > C, maka? | ... | A | Karena A > B > C | (kosong) | draft'],
      ['Catatan:', 'Baris 1 = nama kolom (JANGAN DIUBAH). Isi soal mulai baris 2. Status Tutor ditentukan otomatis oleh workflow moderasi.'],
    ]);
    refWs['!cols'] = [{ wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, refWs, 'Referensi');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_soal.xlsx"');
    res.send(buf);
  } catch (error) {
    console.error('DOWNLOAD TEMPLATE ERROR:', error);
    return res.status(500).json(invalid('Gagal membuat template'));
  }
}

const REQUIRED_IMPORT_HEADERS = TEMPLATE_COLUMNS
  .map((column) => column.header)
  .filter((header) => header !== 'material_id' && header !== 'status');

function readImportRows(file) {
  if (!file) return { error: 'File Excel tidak ditemukan' };
  let workbook;
  try {
    workbook = XLSX.read(file.buffer, { type: 'buffer' });
  } catch {
    return { error: 'File tidak dapat dibaca. Pastikan format file adalah .xlsx' };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { error: 'File Excel kosong atau tidak memiliki sheet' };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (!matrix.length) return { error: 'File Excel kosong atau tidak memiliki header' };
  const headers = matrix[0].map((value) => String(value).trim().toLowerCase());
  const missing = REQUIRED_IMPORT_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) return { error: `Header Excel tidak lengkap: ${missing.join(', ')}` };
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const normalizedRows = rows.map((row, index) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[key.toString().trim().toLowerCase()] = row[key];
    }
    return { row: index + 2, data: normalized };
  }).filter(({ data }) => Object.values(data).some((value) => String(value).trim() !== ''));
  const MAX_ROWS = 500;
  if (normalizedRows.length > MAX_ROWS) {
    return { error: `Maksimal ${MAX_ROWS} soal per sekali import. File Anda berisi ${normalizedRows.length} baris.` };
  }
  if (!normalizedRows.length) return { error: 'Tidak ada data soal di file Excel' };
  return { rows: normalizedRows };
}

async function prepareImport(req) {
  const parsed = readImportRows(req.file);
  if (parsed.error) return parsed;
  const isTutor = Number(req.user.role) === 3;
  const settings = require('../services/settings.service');
  const defaultStatus = isTutor
    ? (await settings.getSettingValue('tutor_submission_requires_review', true) ? 'review' : 'active')
    : await settings.getSettingValue('admin_question_default_status', 'active');
  const valid = [];
  const errors = [];

  for (const item of parsed.rows) {
    const row = item.data;
    const rowNum = item.row;
    const rawStatus = String(row.status ?? '').trim().toLowerCase();
    const difficultyLevel = Number(row['difficulty_level'] ?? row['difficulty level']);
    const payload = {
      subtest: String(row.subtest ?? '').trim().toUpperCase(),
      category: String(row['category'] ?? '').trim(),
      difficulty_level: difficultyLevel,
      difficulty: difficultyLevel === 1 ? 'easy' : difficultyLevel === 2 ? 'medium' : 'hard',
      question: String(row['question'] ?? '').trim(),
      options: [
        { key: 'A', text: String(row['option_a'] ?? row['option a'] ?? '').trim() },
        { key: 'B', text: String(row['option_b'] ?? row['option b'] ?? '').trim() },
        { key: 'C', text: String(row['option_c'] ?? row['option c'] ?? '').trim() },
        { key: 'D', text: String(row['option_d'] ?? row['option d'] ?? '').trim() },
        { key: 'E', text: String(row['option_e'] ?? row['option e'] ?? '').trim() },
      ],
      correct_answer: String(row['correct_answer'] ?? row['correct answer'] ?? '').trim().toUpperCase(),
      explanation: String(row['explanation'] ?? '').trim(),
      material_id: row['material_id'] != null && row['material_id'] !== '' ? Number(row['material_id']) : null,
      status: isTutor ? defaultStatus : (rawStatus || defaultStatus),
    };
    const validation = validateQuestion(payload);
    if (validation.error) {
      errors.push({ row: rowNum, error: validation.error, data: { ...payload, question: payload.question.slice(0, 120) } });
      continue;
    }
    if (!isTutor && !['draft', 'active'].includes(validation.value.status)) {
      errors.push({ row: rowNum, error: 'Status Admin harus draft atau active', data: { ...payload, question: payload.question.slice(0, 120) } });
      continue;
    }
    const materialIssue = await materialError(validation.value);
    if (materialIssue) {
      errors.push({ row: rowNum, error: materialIssue, data: { ...payload, question: payload.question.slice(0, 120) } });
      continue;
    }
    valid.push({ row: rowNum, value: validation.value });
  }
  return { valid, errors, total: valid.length + errors.length, status: defaultStatus };
}

async function validateImport(req, res) {
  try {
    const prepared = await prepareImport(req);
    if (prepared.error) return res.status(400).json(invalid(prepared.error));
    const rows = [
      ...prepared.valid.map((item) => ({ row: item.row, status: 'valid', data: item.value })),
      ...prepared.errors.map((item) => ({ ...item, status: 'error' })),
    ].sort((a, b) => a.row - b.row);
    return res.json({ success: true, data: { total: prepared.total, valid: prepared.valid.length, invalid: prepared.errors.length, rows } });
  } catch (error) {
    console.error('VALIDATE QUESTION IMPORT ERROR:', error);
    return res.status(500).json(invalid('Gagal memvalidasi file soal'));
  }
}

async function importQuestions(req, res) {
  try {
    const prepared = await prepareImport(req);
    if (prepared.error) return res.status(400).json(invalid(prepared.error));
    if (prepared.errors.length) {
      return res.status(422).json({ success: false, message: `${prepared.errors.length} baris masih tidak valid. Tidak ada soal yang diimpor.`, data: { success: [], errors: prepared.errors } });
    }
    const now = new Date();
    const values = prepared.valid.map((item) => ({
      ...item.value,
      created_by_id: req.user.user_id,
      submitted_at: Number(req.user.role) === 3 && item.value.status !== 'draft' ? now : null,
      reviewed_by_id: null,
      reviewed_at: null,
      rejection_reason: null,
    }));
    await sequelize.transaction(async (transaction) => {
      await Question.bulkCreate(values, { transaction, validate: true });
    });
    if (Number(req.user.role) === 3 && prepared.status === 'review') {
      await notifications.adminsAfterEvent({ type: 'new_question_review', title: 'Import Soal Menunggu Review', message: `${values.length} soal baru dari Tutor menunggu review.`, actionUrl: '/moderation' });
    }
    const success = prepared.valid.map((item) => ({ row: item.row, question: item.value.question.slice(0, 80) }));
    return res.status(201).json({ success: true, message: 'Import berhasil', data: { processed: values.length, success, errors: [] } });
  } catch (error) {
    console.error('IMPORT QUESTIONS ERROR:', error);
    return res.status(500).json(invalid('Import gagal. Tidak ada soal yang disimpan.'));
  }
}

module.exports = { getQuestions, getSummary, getQuestionById, createQuestion, updateQuestion, deleteQuestion, validateQuestion, materialError, downloadTemplate, validateImport, importQuestions };
