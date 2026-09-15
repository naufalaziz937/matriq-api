const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Question, Material } = require('../src/models');

const payload = {
  question: 'Soal integrasi moderasi: berapakah 2 + 3?', subtest: 'PK', category: 'Integrasi', difficulty: 'easy',
  difficulty_level: 1,
  options: ['A','B','C','D','E'].map((key,index) => ({ key, text: String(index+3) })),
  correct_answer: 'C', explanation: 'Dua ditambah tiga sama dengan lima.', status: 'active',
};

async function run() {
  const [admin, student, ...tutors] = await Promise.all([
    User.findOne({ where: { role: 1 }, attributes: ['user_id'] }),
    User.findOne({ where: { role: 2 }, attributes: ['user_id'] }),
    User.findAll({ where: { role: 3 }, attributes: ['user_id'], limit: 2 }),
  ]).then(([admin, student, tutorRows]) => [admin, student, ...tutorRows]);
  if (!admin || !student || tutors.length < 2) throw new Error('Admin, student, and two tutor accounts are required');
  const token = user => jwt.sign({ user_id: user.user_id, role: user === admin ? 1 : user === student ? 2 : 3 }, process.env.JWT_SECRET);
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  const ids = [];
  let material;
  async function request(path, user, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token(user)}`, ...(body ? { 'Content-Type':'application/json' } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
    return { status:response.status, body:await response.json() };
  }
  try {
    material = await Material.create({ title: 'Materi Moderasi Integrasi', subtest: 'PK', category: 'Integrasi', status: 'active', file_key: `moderasi-integrasi-${Date.now()}`, file_name: 'test.pdf', file_mime: 'application/pdf', file_size: 1, created_by_id: admin.user_id });
    payload.material_id = material.id;
    assert.equal((await fetch(base+'/api/admin/moderation')).status, 401);
    for (const user of [student, ...tutors]) {
      for (const path of ['/api/admin/moderation', '/api/admin/moderation/summary']) assert.equal((await request(path,user)).status,403);
    }
    assert.equal((await request('/api/tutor/questions',student)).status,403);
    const created = await request('/api/tutor/questions',tutors[0],'POST',payload);
    assert.equal(created.status,201,JSON.stringify(created.body));
    const id = created.body.data.id; ids.push(id);
    assert.equal(created.body.data.status,'review');
    assert.equal(created.body.data.created_by_id,tutors[0].user_id);
    assert.equal(created.body.data.created_by.role,3);
    const tutorSummary = await request('/api/tutor/questions/summary',tutors[0]);
    assert.equal(tutorSummary.status,200); assert.ok(tutorSummary.body.data.review>=1);
    const queue = await request('/api/admin/moderation?status=review&search=integrasi',admin);
    assert.equal(queue.status,200,JSON.stringify(queue.body));
    assert.ok(queue.body.data.some(item=>item.id===id));
    assert.ok(queue.body.data.every(item=>!('password' in item.creator)));
    const detail = await request(`/api/admin/moderation/${id}`,admin);
    assert.equal(detail.status,200); assert.equal(detail.body.data.options.length,5);
    assert.equal((await request(`/api/tutor/questions/${id}`,tutors[1])).status,404);
    assert.equal((await request(`/api/tutor/questions/${id}`,tutors[1],'PUT',{question:'Tidak boleh diubah'})).status,404);
    for (const user of [student, ...tutors]) {
      assert.equal((await request(`/api/admin/moderation/${id}/approve`,user,'PUT')).status,403);
      assert.equal((await request(`/api/admin/moderation/${id}/reject`,user,'PUT',{reason:'Tidak berwenang'})).status,403);
    }
    assert.equal((await request(`/api/admin/moderation/${id}/reject`,admin,'PUT',{reason:' ' })).status,400);
    const rejected = await request(`/api/admin/moderation/${id}/reject`,admin,'PUT',{reason:'Pembahasan perlu diperjelas.'});
    assert.equal(rejected.status,200,JSON.stringify(rejected.body));
    assert.equal(rejected.body.data.status,'rejected');
    assert.equal(rejected.body.data.reviewed_by_id,admin.user_id);
    assert.ok(rejected.body.data.reviewed_at);
    const own = await request(`/api/tutor/questions/${id}`,tutors[0]);
    assert.equal(own.body.data.rejection_reason,'Pembahasan perlu diperjelas.');
    const edited = await request(`/api/tutor/questions/${id}`,tutors[0],'PUT',{...payload,explanation:'Dua satuan ditambah tiga satuan menghasilkan lima satuan.'});
    assert.equal(edited.status,200,JSON.stringify(edited.body)); assert.equal(edited.body.data.status,'rejected');
    const submitted = await request(`/api/tutor/questions/${id}/submit`,tutors[0],'PUT');
    assert.equal(submitted.status,200,JSON.stringify(submitted.body));
    assert.equal(submitted.body.data.status,'review'); assert.equal(submitted.body.data.rejection_reason,null);
    const approved = await request(`/api/admin/moderation/${id}/approve`,admin,'PUT');
    assert.equal(approved.status,200,JSON.stringify(approved.body));
    assert.equal(approved.body.data.status,'active'); assert.equal(approved.body.data.reviewed_by_id,admin.user_id);
    assert.equal((await request(`/api/admin/moderation/${id}/approve`,admin,'PUT')).status,400);
    assert.equal((await request(`/api/tutor/questions/${id}`,tutors[0],'PUT',{question:'Changed after approval'})).status,400);
    const adminCreated = await request('/api/admin/questions',admin,'POST',payload);
    assert.equal(adminCreated.status,201,JSON.stringify(adminCreated.body)); ids.push(adminCreated.body.data.id);
    assert.equal(adminCreated.body.data.status,'active'); assert.equal(adminCreated.body.data.created_by.role,1);
    assert.equal((await request(`/api/admin/moderation/${adminCreated.body.data.id}`,admin)).status,404);
    console.log('Question moderation integration passed');
  } finally {
    if (ids.length) await Question.destroy({ where: { id: ids } });
    if (material) await material.destroy();
    await new Promise(resolve=>server.close(resolve)); await sequelize.close();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
