const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { KampusPtn, Prodi, Provinsi, User } = require('../src/models');

async function run() {
  await sequelize.authenticate();
  const [admin, province] = await Promise.all([
    User.findOne({ where: { role: 1 }, attributes: ['user_id'] }),
    Provinsi.findOne({ attributes: ['kode'] }),
  ]);
  if (!admin || !province) throw new Error('Admin and province seed are required');
  const token = jwt.sign({ user_id: admin.user_id, role: 1 }, process.env.JWT_SECRET);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let campusId;
  const code = `T${String(Date.now()).slice(-9)}`;
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + path, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert.equal((await fetch(`${base}/api/admin/campuses`)).status, 401);
    const studentToken = jwt.sign({ user_id: admin.user_id, role: 2 }, process.env.JWT_SECRET);
    assert.equal((await fetch(`${base}/api/admin/campuses`, { headers: { Authorization: `Bearer ${studentToken}` } })).status, 403);
    const name = `Kampus Integrasi ${Date.now()}`;
    const created = await request('/api/admin/campuses', 'POST', {
      nama: name, singkatan: `TI${String(Date.now()).slice(-5)}`, jenis: 'Universitas', kota: 'Jakarta', provinsi_kode: province.kode, aktif: true,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    campusId = created.body.data.id;
    const list = await request(`/api/admin/campuses?search=${encodeURIComponent(name)}`);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.data.some((item) => item.id === campusId));
    assert.equal(list.body.pagination.total, 1);
    const detail = await request(`/api/admin/campuses/${campusId}`);
    assert.equal(detail.body.data.id, campusId);
    const summary = await request('/api/admin/campuses/summary');
    assert.equal(summary.status, 200);
    assert.ok(summary.body.data.campuses >= 1);
    const program = await request(`/api/admin/campuses/${campusId}/prodi`, 'POST', {
      kode_snbt: code, nama: 'Teknik Integrasi', daya_tampung_2024: 50, peminat_2023: 100, sumber_tahun: 2024, aktif: true,
    });
    assert.equal(program.status, 201, JSON.stringify(program.body));
    const programs = await request(`/api/admin/campuses/${campusId}/prodi?search=Integrasi`);
    assert.equal(programs.status, 200, JSON.stringify(programs.body));
    assert.ok(programs.body.data.some((item) => item.kode_snbt === code));
    assert.equal(programs.body.pagination.total, 1);
    const publicPrograms = await request(`/api/kampus/${campusId}/prodi`);
    assert.ok(publicPrograms.body.data.some((item) => item.kode_snbt === code));
    const updated = await request(`/api/admin/campuses/${campusId}/prodi/${code}`, 'PUT', { aktif: false, nama: 'Teknik Integrasi Baru' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    const hiddenProgram = await request(`/api/kampus/${campusId}/prodi`);
    assert.ok(!hiddenProgram.body.data.some((item) => item.kode_snbt === code));
    const campusUpdated = await request(`/api/admin/campuses/${campusId}`, 'PUT', { aktif: false });
    assert.equal(campusUpdated.status, 200);
    const publicCampus = await request('/api/kampus');
    assert.ok(!publicCampus.body.data.some((item) => item.id === campusId));
    const retained = await request(`/api/admin/campuses/${campusId}/prodi?status=inactive`);
    assert.ok(retained.body.data.some((item) => item.kode_snbt === code));
    console.log('Campus and program admin CRUD integration passed');
  } finally {
    if (campusId) {
      await Prodi.destroy({ where: { kampus_id: campusId, kode_snbt: code } });
      await KampusPtn.destroy({ where: { id: campusId } });
    }
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
