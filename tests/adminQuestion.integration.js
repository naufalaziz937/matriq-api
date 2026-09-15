const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Question, Material } = require('../src/models');

async function run() {
  await sequelize.authenticate();
  const admin = await User.findOne({ where: { role: 1 }, attributes: ['user_id'] });
  if (!admin) throw new Error('Admin test account is required for integration test');
  const token = jwt.sign({ user_id: admin.user_id, role: 1 }, process.env.JWT_SECRET);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/admin/questions`;
  let id, material;
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    material = await Material.create({ title: 'Materi Bank Soal Integrasi', subtest: 'PK', category: 'Tes Integrasi', status: 'active', file_key: `bank-integrasi-${Date.now()}`, file_name: 'test.pdf', file_mime: 'application/pdf', file_size: 1, created_by_id: admin.user_id });
    const question = {
      question: `Tes integrasi Bank Soal ${Date.now()}: berapakah 2 + 3?`,
      subtest: 'PK', category: 'Tes Integrasi', difficulty: 'easy', difficulty_level: 1, material_id: material.id,
      options: ['A', 'B', 'C', 'D', 'E'].map((key, index) => ({ key, text: String(index + 3) })),
      correct_answer: 'C', explanation: 'Dua ditambah tiga sama dengan lima.', status: 'draft',
    };
    const created = await request('', 'POST', question);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    id = created.body.data.id;
    const detail = await request(`/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.correct_answer, 'C');
    const list = await request('?page=1&limit=10&search=Tes%20Integrasi&subtest=PK&difficulty=easy&status=draft&category=Tes%20Integrasi');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.data.some((item) => item.id === id));
    assert.ok(list.body.categories.some((item) => item.name === 'Tes Integrasi'));
    const summary = await request('/summary');
    assert.equal(summary.status, 200);
    assert.ok(summary.body.data.draft >= 1);
    const updated = await request(`/${id}`, 'PUT', { status: 'active', difficulty: 'medium', difficulty_level: 2 });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.status, 'active');
    const deleted = await request(`/${id}`, 'DELETE');
    assert.equal(deleted.status, 200);
    id = null;
    console.log('Question Bank API CRUD integration passed');
  } finally {
    if (id) await Question.destroy({ where: { id } });
    if (material) await material.destroy();
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
