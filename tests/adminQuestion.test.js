const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const app = require('../src/app');
const controller = require('../src/controllers/adminQuestion.controller');
const { Question, Material } = require('../src/models');
const { sequelize } = require('../src/config/database');
const settings = require('../src/services/settings.service');
const notifications = require('../src/services/notification.service');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const payload = {
  question: 'Jika x + 2 = 5, berapakah x?', subtest: 'PK', category: 'Aljabar', difficulty: 'easy',
  difficulty_level: 1, material_id: 7,
  options: ['A', 'B', 'C', 'D', 'E'].map((key, index) => ({ key, text: String(index + 1) })),
  correct_answer: 'C', explanation: 'Kurangi kedua sisi dengan 2.', status: 'active',
};

const importHeaders = ['subtest','category','difficulty_level','question','option_a','option_b','option_c','option_d','option_e','correct_answer','explanation','material_id','status'];
function excelFile(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([importHeaders, ...rows]), 'Soal');
  return { buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
}
const validImportRow = ['PK','Aljabar',1,'Berapakah dua ditambah tiga?','3','4','5','6','7','C','Dua ditambah tiga adalah lima.','','draft'];

test('validasi menolak soal tanpa opsi A–E dan jawaban tidak valid', async () => {
  const missing = response();
  await controller.createQuestion({ body: { ...payload, options: [] }, user: { user_id: 1 } }, missing);
  assert.equal(missing.statusCode, 400);
  const wrong = response();
  await controller.createQuestion({ body: { ...payload, correct_answer: 'F' }, user: { user_id: 1 } }, wrong);
  assert.equal(wrong.statusCode, 400);
});

test('create menyimpan soal valid dan ID pembuat dari token', async () => {
  const originalCreate = Question.create;
  const originalFind = Question.findByPk;
  const originalMaterialFind = Material.findByPk;
  let saved;
  Question.create = async (value) => { saved = value; return { id: 7 }; };
  Question.findByPk = async () => ({ id: 7, ...saved });
  Material.findByPk = async () => ({ id: 7, subtest: 'PK', status: 'active' });
  try {
    const res = response();
    await controller.createQuestion({ body: payload, user: { user_id: 42 } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(saved.created_by_id, 42);
    assert.equal(saved.options.length, 5);
    assert.equal(res.body.data.id, 7);
  } finally {
    Question.create = originalCreate;
    Question.findByPk = originalFind;
    Material.findByPk = originalMaterialFind;
  }
});

test('ringkasan mengembalikan total per status', async () => {
  const original = Question.count;
  Question.count = async (options) => ({ active: 4, draft: 2, review: 1 })[options?.where?.status] ?? 7;
  try {
    const res = response();
    await controller.getSummary({}, res);
    assert.deepEqual(res.body.data, { total: 7, active: 4, draft: 2, review: 1 });
  } finally { Question.count = original; }
});

test('API menolak tanpa token dan role non-admin', async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const noToken = await fetch(`${base}/api/admin/questions`);
    assert.equal(noToken.status, 401);
    const token = jwt.sign({ user_id: 3, role: 2 }, process.env.JWT_SECRET);
    const forbidden = await fetch(`${base}/api/admin/questions`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(forbidden.status, 403);
    const adminToken = jwt.sign({ user_id: 1, role: 1 }, process.env.JWT_SECRET);
    const invalid = await fetch(`${base}/api/admin/questions`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, options: [] }) });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('preview import menampilkan baris valid dan error tanpa menyimpan', async () => {
  const res = response();
  await controller.validateImport({ file: excelFile([validImportRow, [...validImportRow.slice(0, 1), '', ...validImportRow.slice(2)]]), user: { user_id: 42, role: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.total, 2);
  assert.equal(res.body.data.valid, 1);
  assert.equal(res.body.data.invalid, 1);
  assert.equal(res.body.data.rows.find((row) => row.status === 'error').row, 3);
});

test('import bersifat all-or-nothing dan mengambil author dari token', async () => {
  const originalBulkCreate = Question.bulkCreate;
  const originalTransaction = sequelize.transaction;
  const originalSetting = settings.getSettingValue;
  let inserted = null;
  Question.bulkCreate = async (values) => { inserted = values; };
  sequelize.transaction = async (callback) => callback({});
  settings.getSettingValue = async () => 'active';
  try {
    const invalidRes = response();
    const invalidRow = [...validImportRow]; invalidRow[1] = '';
    await controller.importQuestions({ file: excelFile([validImportRow, invalidRow]), user: { user_id: 42, role: 1 } }, invalidRes);
    assert.equal(invalidRes.statusCode, 422);
    assert.equal(inserted, null);

    const validRes = response();
    await controller.importQuestions({ file: excelFile([validImportRow]), user: { user_id: 42, role: 1 } }, validRes);
    assert.equal(validRes.statusCode, 201);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].created_by_id, 42);
  } finally {
    Question.bulkCreate = originalBulkCreate;
    sequelize.transaction = originalTransaction;
    settings.getSettingValue = originalSetting;
  }
});

test('import Tutor memakai author token dan status workflow moderasi', async () => {
  const originalBulkCreate = Question.bulkCreate;
  const originalTransaction = sequelize.transaction;
  const originalSetting = settings.getSettingValue;
  const originalNotification = notifications.adminsAfterEvent;
  let inserted = null;
  let notified = false;
  Question.bulkCreate = async (values) => { inserted = values; };
  sequelize.transaction = async (callback) => callback({});
  settings.getSettingValue = async (key) => key === 'tutor_submission_requires_review' ? true : null;
  notifications.adminsAfterEvent = async () => { notified = true; };
  try {
    const res = response();
    await controller.importQuestions({ file: excelFile([validImportRow]), user: { user_id: 77, role: 3 } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(inserted[0].created_by_id, 77);
    assert.equal(inserted[0].status, 'review');
    assert.ok(inserted[0].submitted_at instanceof Date);
    assert.equal(notified, true);
  } finally {
    Question.bulkCreate = originalBulkCreate;
    sequelize.transaction = originalTransaction;
    settings.getSettingValue = originalSetting;
    notifications.adminsAfterEvent = originalNotification;
  }
});
