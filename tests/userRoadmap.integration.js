require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Material, StudyProgress, TryoutRecap } = require('../src/models');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await sequelize.sync();
  const user = await User.findOne({ where: { role: 2 }, order: [['user_id', 'ASC']] });
  if (!user) { console.log('Roadmap checks skipped: no student account'); await sequelize.close(); return; }
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/user/roadmap`;
  const request = (role, suffix = '') => fetch(url + suffix, { headers: { Authorization: `Bearer ${jwt.sign({ user_id: user.user_id, role }, process.env.JWT_SECRET, { expiresIn: '5m' })}` } });
  let progress, recap;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await request(1)).status, 403);
    assert.equal((await request(3)).status, 403);
    const beforeResponse = await request(2);
    assert.equal(beforeResponse.status, 200);
    const before = (await beforeResponse.json()).data;
    assert.equal(before.user.user_id, user.user_id);
    assert.ok(!Object.hasOwn(before.user, 'password'));
    assert.equal(before.stages.length, 5);
    assert.equal(before.subtests.length, 7);
    assert.ok(before.readiness.percentage >= 0 && before.readiness.percentage <= 100);
    const material = await Material.findOne({ where: { status: 'active' } });
    progress = await StudyProgress.create({ user_id: user.user_id, materi_id: material?.id || null, soal_dikerjakan: 20, soal_benar: 12, soal_salah: 8, akurasi: 60, waktu_belajar: 35 });
    recap = await TryoutRecap.create({ user_id: user.user_id, pu: 650, ppu: 670, pbm: 680, pk: 610, lbi: 690, lbe: 665, pm: 600, total_score: 666, platform: 'Integration Test' });
    const after = (await (await request(2, '?user_id=999999')).json()).data;
    assert.equal(after.user.user_id, user.user_id);
    assert.equal(after.study_summary.total_questions, before.study_summary.total_questions + 20);
    assert.equal(after.tryout.total_recap, before.tryout.total_recap + 1);
    assert.equal(after.tryout.latest_score, 666);
    assert.equal(after.subtest_performance.find(item => item.code === 'PM').value, 600);
    if (material) assert.ok(after.subtests.find(item => item.code === material.subtest).questions_attempted >= 20);
    assert.ok(after.stages.every(item => ['completed', 'active', 'available', 'locked'].includes(item.status)));
    console.log('User roadmap integration checks passed');
  } finally {
    if (progress) await progress.destroy();
    if (recap) await recap.destroy();
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
