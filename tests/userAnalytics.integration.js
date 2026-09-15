require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Material, Question, PracticeSession, PracticeAnswer, StudyProgress, StudyPlan, TryoutRecap } = require('../src/models');
const service = require('../src/services/userAnalytics.service');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await require('../src/services/userTryoutRecap.service').prepareSchema();
  await sequelize.sync();
  await service.ensureIndexes();
  assert.throws(() => service.period({ range: 'invalid' }), /periode/);
  assert.throws(() => service.period({ range: '30d', date_from: '2026-02-30', date_to: '2026-03-01' }), /tanggal/);
  const user = await User.findOne({ where: { role: 2 }, order: [['user_id', 'ASC']] });
  const other = await User.findOne({ where: { role: 2, user_id: { [require('sequelize').Op.ne]: user?.user_id } } });
  if (!user || !other) { console.log('Analytics checks skipped: two students required'); await sequelize.close(); return; }
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/user/analytics`;
  const token = (id, role = 2) => jwt.sign({ user_id: id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const get = (id, suffix = '', role = 2) => fetch(base + suffix, { headers: { Authorization: `Bearer ${token(id, role)}` } });
  let session, answer, progress, plan, recap;
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await get(user.user_id, '', 1)).status, 403);
    assert.equal((await get(user.user_id, '?range=oops')).status, 400);
    const before = (await (await get(user.user_id)).json()).data;
    const material = await Material.findOne();
    const question = await Question.findOne();
    if (material && question) {
      session = await PracticeSession.create({ user_id: user.user_id, subtest: material.subtest, material_id: material.id, difficulty_level: 2, question_ids: [question.id], question_count: 1, correct_count: 1, wrong_count: 0, accuracy: 100, duration_seconds: 600, status: 'completed', completed_at: new Date() });
      answer = await PracticeAnswer.create({ session_id: session.session_id, question_id: question.id, selected_answer: 'A', is_correct: true, answered_at: new Date() });
    }
    progress = await StudyProgress.create({ user_id: user.user_id, materi_id: material?.id || null, soal_dikerjakan: 1, soal_benar: 1, soal_salah: 0, akurasi: 100, waktu_belajar: 10 });
    plan = await StudyPlan.create({ user_id: user.user_id, title: 'Analytics test plan', type: 'review', start_at: new Date(), status: 'completed', completed_at: new Date() });
    recap = await TryoutRecap.create({ user_id: user.user_id, platform: 'Analytics Test', tryout_name: 'External report', total_score: 731, recap_at: new Date() });
    const response = await get(user.user_id, `?range=30d&user_id=${other.user_id}`);
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.equal(data.subtests.length, 7);
    assert.equal(data.difficulty_levels.length, 4);
    assert.equal(data.overview.study_minutes, before.overview.study_minutes + 10);
    assert.equal(data.study_plan.completed, before.study_plan.completed + 1);
    assert.equal(data.tryout.latest, 731);
    assert.ok(data.tryout.trend.some(row => row.platform === 'Analytics Test'));
    if (session) {
      assert.equal(data.practice.questions_attempted, before.practice.questions_attempted + 1);
      assert.equal(data.practice.correct, before.practice.correct + 1);
      assert.equal(data.difficulty_levels[1].questions_attempted, before.difficulty_levels[1].questions_attempted + 1);
      if (data.difficulty_levels[1].questions_attempted < 10) assert.equal(data.difficulty_levels[1].status, 'Data Belum Cukup');
    }
    const otherData = (await (await get(other.user_id)).json()).data;
    assert.ok(!otherData.tryout.trend.some(row => row.platform === 'Analytics Test'));
    assert.equal((await get(user.user_id, '?range=all')).status, 200);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal((await get(user.user_id, `?range=30d&date_from=${today}&date_to=${today}`)).status, 200);
    console.log('User Analytics integration checks passed');
  } finally {
    if (answer) await answer.destroy();
    if (session) await session.destroy();
    if (progress) await progress.destroy();
    if (plan) await plan.destroy();
    if (recap) await recap.destroy();
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
