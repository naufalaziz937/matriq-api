require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, UserProfile, UserTarget, TutorProfile, Prodi } = require('../src/models');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await require('../src/services/userTryoutRecap.service').prepareSchema();
  await sequelize.sync();
  const suffix = randomUUID();
  const users = [];
  let server;
  try {
    for (const role of [1,2,3]) users.push(await User.create({ nama: `Profile ${role}`, email: `profile-${role}-${suffix}@example.invalid`, password: await bcrypt.hash('oldpassword123', 10), role, is_activate: true }));
    server = app.listen(0);
    const root = `http://127.0.0.1:${server.address().port}/api/profile`;
    const request = (user, path = '', method = 'GET', body) => fetch(root + path, { method, headers: { Authorization: `Bearer ${jwt.sign({ user_id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await fetch(root)).status, 401);
    for (const user of users) {
      const response = await request(user);
      assert.equal(response.status, 200);
      const profile = (await response.json()).data;
      assert.equal(profile.user.user_id, user.user_id);
      assert.equal(profile.role, user.role);
      assert.equal(profile.user.password, undefined);
      assert.equal('profile' in profile, user.role === 2);
      assert.equal('tutor_profile' in profile, user.role === 3);
    }
    assert.equal((await request(users[1], '', 'PUT', { nama: 'Changed', role: 1 })).status, 400);
    assert.equal((await request(users[1], '/tutor', 'PUT', { bio: 'No' })).status, 403);
    assert.equal((await request(users[2], '/target', 'PUT', { pilihan: [] })).status, 403);
    assert.equal((await request(users[0], '/student', 'PUT', { sekolah: 'No' })).status, 403);
    assert.equal((await request(users[1], '', 'PUT', { nama: 'Student Updated', no_hp: '+628123456789', gender: 'P' })).status, 200);
    assert.equal((await User.findByPk(users[1].user_id)).role, 2);
    assert.equal((await User.findByPk(users[0].user_id)).nama, 'Profile 1');
    assert.equal((await request(users[1], '/student', 'PUT', { sekolah: 'Test School', kelas: '12', tahun_lulus: 2026, provinsi: '', kota_kab: '' })).status, 200);
    assert.equal((await request(users[1], '/student', 'PUT', { sekolah: 'No', role: 1 })).status, 400);
    assert.equal((await request(users[1], '/target', 'PUT', { pilihan: ['bad-code'], target_score: 750 })).status, 400);
    assert.equal((await request(users[2], '/tutor', 'PUT', { bio: 'Tutor bio', specialization: 'Matematika', institution: 'MatrIQ', experience_years: 3, expertise_subtests: ['PK','PM'] })).status, 200);
    assert.equal((await request(users[2], '/tutor', 'PUT', { expertise_subtests: ['BAD'] })).status, 400);
    const program = await Prodi.findOne({ where: { aktif: true } });
    if (program) {
      assert.equal((await request(users[1], '/target', 'PUT', { pilihan: [program.kode_snbt], target_score: 750 })).status, 200);
      const updated = (await (await request(users[1])).json()).data;
      assert.equal(updated.target.pilihan[0].prodi_code, program.kode_snbt);
      assert.ok(updated.target.pilihan[0].campus);
    }
    const passwordResponse = await fetch(root.replace('/profile', '/auth/reset-password'), { method: 'PUT', headers: { Authorization: `Bearer ${jwt.sign({ user_id: users[1].user_id, role: 2 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password_lama: 'oldpassword123', password_baru: 'newpassword123', konfirmasi_password: 'newpassword123' }) });
    assert.equal(passwordResponse.status, 200);
    assert.equal(await bcrypt.compare('newpassword123', (await User.findByPk(users[1].user_id)).password), true);
    const photoBody = new FormData(); photoBody.append('foto_profile', new Blob(['not an image'], { type: 'image/png' }), 'bad.png');
    const photoResponse = await fetch(`${root}/photo`, { method: 'PUT', headers: { Authorization: `Bearer ${jwt.sign({ user_id: users[1].user_id, role: 2 }, process.env.JWT_SECRET)}` }, body: photoBody });
    assert.equal(photoResponse.status, 400);
    console.log('Profile role, ownership, update and target checks passed');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (users.length) {
      const ids = users.map(user => user.user_id);
      await TutorProfile.destroy({ where: { user_id: ids } });
      await UserTarget.destroy({ where: { user_id: ids } });
      await UserProfile.destroy({ where: { user_id: ids } });
      await User.destroy({ where: { user_id: ids } });
    }
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
