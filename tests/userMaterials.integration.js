require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const app = require('../src/app');
const { storageDir } = require('../src/controllers/adminMaterial.controller');
const { sequelize } = require('../src/config/database');
const { User, Material, UserMaterialProgress } = require('../src/models');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await require('../src/services/userTryoutRecap.service').prepareSchema();
  await sequelize.sync();
  const users = await User.findAll({ where: { role: 2 }, limit: 2, order: [['user_id', 'ASC']] });
  if (users.length < 2) { console.log('User materials checks skipped: two students required'); await sequelize.close(); return; }
  const creator = await User.findOne({ where: { role: 1 } }) || users[0];
  let active, draft, ownedProgress, uploadedPath;
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/user/materials`;
  const roadmap = `http://127.0.0.1:${server.address().port}/api/user/roadmap`;
  const token = (id, role = 2) => jwt.sign({ user_id: id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = (id, path = '', method = 'GET', body, role = 2) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token(id, role)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    active = await Material.create({ title: 'User Materials Integration Active', description: 'Document test', subtest: 'PK', category: 'Integration', status: 'active', file_key: `${randomUUID()}.pdf`, file_name: 'test.pdf', file_mime: 'application/pdf', file_size: 20, created_by_id: creator.user_id });
    await fs.mkdir(storageDir, { recursive: true });
    uploadedPath = path.join(storageDir, active.file_key);
    await fs.writeFile(uploadedPath, '%PDF-1.4\n%%EOF');
    draft = await Material.create({ title: 'User Materials Integration Draft', description: 'Hidden test', subtest: 'PK', category: 'Integration', status: 'draft', file_key: `${randomUUID()}.pdf`, file_name: 'draft.pdf', file_mime: 'application/pdf', file_size: 20, created_by_id: creator.user_id });
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await request(users[0].user_id, '', 'GET', null, 1)).status, 403);
    assert.equal((await request(users[0].user_id, '', 'POST', { title: 'Nope' })).status, 404);
    const overviewResponse = await request(users[0].user_id, '?subtest_id=PK&search=Integration');
    assert.equal(overviewResponse.status, 200);
    const overview = (await overviewResponse.json()).data;
    assert.equal(overview.subtests.length, 7);
    assert.ok(overview.materials.some(row => row.material_id === active.id));
    assert.ok(!overview.materials.some(row => row.material_id === draft.id));
    assert.equal((await request(users[0].user_id, `/${draft.id}`)).status, 404);
    assert.equal((await request(users[0].user_id, `/${draft.id}/file`)).status, 404);
    const file = await request(users[0].user_id, `/${active.id}/file`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal((await request(users[0].user_id, `/${draft.id}/start`, 'POST')).status, 404);
    assert.equal((await request(users[0].user_id, `/${active.id}/progress`, 'PUT', { progress_percentage: 101 })).status, 400);
    const roadmapBefore = (await (await fetch(roadmap, { headers: { Authorization: `Bearer ${token(users[0].user_id)}` } })).json()).data;
    const started = await request(users[0].user_id, `/${active.id}/start`, 'POST', { user_id: users[1].user_id });
    assert.equal(started.status, 200);
    assert.equal((await started.json()).data.material.status, 'in_progress');
    ownedProgress = await UserMaterialProgress.findOne({ where: { user_id: users[0].user_id, material_id: active.id } });
    assert.ok(ownedProgress);
    const updated = await request(users[0].user_id, `/${active.id}/progress`, 'PUT', { progress_percentage: 55 });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.material.progress, 55);
    const other = (await (await request(users[1].user_id, `/${active.id}`)).json()).data;
    assert.equal(other.material.progress, 0);
    assert.equal(other.material.status, 'not_started');
    assert.equal((await request(users[0].user_id, `/${active.id}/complete`, 'PUT')).status, 200);
    assert.equal((await (await request(users[0].user_id, `/${active.id}`)).json()).data.material.progress, 100);
    const roadmapAfter = (await (await fetch(roadmap, { headers: { Authorization: `Bearer ${token(users[0].user_id)}` } })).json()).data;
    assert.equal(roadmapAfter.study_summary.completed_materials, roadmapBefore.study_summary.completed_materials + 1);
    assert.equal((await request(users[0].user_id, `/${active.id}/complete`, 'PUT')).status, 200);
    const list = (await (await request(users[0].user_id, '?status=completed')).json()).data;
    assert.ok(list.materials.some(row => row.material_id === active.id));
    console.log('User Materials integration checks passed');
  } finally {
    if (ownedProgress) await ownedProgress.destroy();
    if (active) await active.destroy();
    if (draft) await draft.destroy();
    if (uploadedPath) await fs.rm(uploadedPath, { force: true });
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
