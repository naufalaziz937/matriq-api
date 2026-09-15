const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Material } = require('../src/models');
const fs = require('node:fs/promises');
const path = require('node:path');

async function run() {
  await sequelize.authenticate();
  const admin = await User.findOne({ where: { role: 1 }, attributes: ['user_id'] });
  if (!admin) throw new Error('Admin test account is required');
  const token = jwt.sign({ user_id: admin.user_id, role: 1 }, process.env.JWT_SECRET);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/admin/materials`;
  let id;
  let key;
  async function request(url, options = {}) {
    return fetch(base + url, { headers: { Authorization: `Bearer ${token}` }, ...options });
  }
  try {
    assert.equal((await fetch(base)).status, 401);
    const studentToken = jwt.sign({ user_id: admin.user_id, role: 2 }, process.env.JWT_SECRET);
    assert.equal((await fetch(base, { headers: { Authorization: `Bearer ${studentToken}` } })).status, 403);
    const invalid = new FormData();
    invalid.set('title', 'Materi tes'); invalid.set('subtest', 'PK'); invalid.set('category', 'Tes Integrasi');
    invalid.set('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'fake.pdf');
    assert.equal((await request('', { method: 'POST', body: invalid })).status, 400);
    const fakeOffice = new FormData();
    fakeOffice.set('title', 'Materi tes'); fakeOffice.set('subtest', 'PK'); fakeOffice.set('category', 'Tes Integrasi');
    fakeOffice.set('file', new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'not a document']), 'fake.docx');
    assert.equal((await request('', { method: 'POST', body: fakeOffice })).status, 400);

    const form = new FormData();
    form.set('title', `Materi tes ${Date.now()}`);
    form.set('description', 'Dokumen untuk tes integrasi');
    form.set('subtest', 'PK'); form.set('category', 'Tes Integrasi'); form.set('status', 'draft');
    form.set('file', new Blob(['%PDF-1.4\n% test document\n'], { type: 'application/pdf' }), 'material-test.pdf');
    const createdResponse = await request('', { method: 'POST', body: form });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 201, JSON.stringify(created));
    id = created.data.id;
    assert.equal(created.data.file_key, undefined);
    key = (await Material.findByPk(id)).file_key;

    const summary = await (await request('/summary')).json();
    assert.ok(summary.data.draft >= 1);
    const listed = await (await request('?search=Materi%20tes&subtest=PK&status=draft&category=Tes%20Integrasi')).json();
    assert.ok(listed.data.some((item) => item.id === id));
    const detail = await (await request(`/${id}`)).json();
    assert.equal(detail.data.file_name, 'material-test.pdf');
    const downloaded = await request(`/${id}/file`);
    assert.equal(downloaded.status, 200);
    assert.match(await downloaded.text(), /^%PDF-/);

    const update = new FormData();
    update.set('status', 'active');
    update.set('file', new Blob(['%PDF-1.4\n% replacement\n'], { type: 'application/pdf' }), 'material-replacement.pdf');
    const updatedResponse = await request(`/${id}`, { method: 'PUT', body: update });
    const updated = await updatedResponse.json();
    assert.equal(updatedResponse.status, 200, JSON.stringify(updated));
    assert.equal(updated.data.status, 'active');
    assert.equal(updated.data.file_name, 'material-replacement.pdf');
    await assert.rejects(fs.access(path.resolve(__dirname, '../uploads/materials', key)));
    key = (await Material.findByPk(id)).file_key;
    const replacement = await request(`/${id}/file`);
    assert.match(await replacement.text(), /replacement/);

    const deleted = await request(`/${id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    id = null;
    await assert.rejects(fs.access(path.resolve(__dirname, '../uploads/materials', key)));
    console.log('Material upload, CRUD, filters, file access and cleanup passed');
  } finally {
    if (id) {
      const material = await Material.findByPk(id);
      await Material.destroy({ where: { id } });
      if (material) await fs.rm(path.resolve(__dirname, '../uploads/materials', material.file_key), { force: true });
    }
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
