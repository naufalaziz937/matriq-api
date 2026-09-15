require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Material, PracticeSession, StudyPlan, TryoutRecap, UserMaterialProgress, UserAchievement, Achievement } = require('../src/models');
const achievementService = require('../src/services/achievement.service');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await require('../src/services/userTryoutRecap.service').prepareSchema();
  await sequelize.sync();
  await achievementService.seedDefinitions();
  const creator = await User.findOne({ where: { role: 1 } });
  if (!creator) { console.log('Achievement checks skipped: admin creator required'); await sequelize.close(); return; }
  const suffix = randomUUID();
  const user = await User.create({ nama: 'Achievement Test', email: `achievement-${suffix}@example.invalid`, password: 'unused', role: 2, is_activate: true });
  const other = await User.create({ nama: 'Achievement Other', email: `achievement-other-${suffix}@example.invalid`, password: 'unused', role: 2, is_activate: true });
  const server = app.listen(0), root = `http://127.0.0.1:${server.address().port}/api/user`;
  const token = (id, role = 2) => jwt.sign({ user_id: id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = (id, path, method = 'GET', body, role = 2) => fetch(root + path, { method, headers: { Authorization: `Bearer ${token(id, role)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let material, session, plan, recap;
  try {
    assert.equal((await fetch(`${root}/achievements`)).status, 401);
    assert.equal((await request(user.user_id, '/achievements', 'GET', null, 1)).status, 403);
    assert.equal((await request(user.user_id, '/achievements?category=invalid')).status, 400);
    const before = (await (await request(user.user_id, '/achievements')).json()).data;
    assert.equal(before.summary.unlocked, 0);
    assert.ok(before.achievements.length >= 30);
    material = await Material.create({ title: 'Achievement Integration Material', description: 'Test', subtest: 'PK', category: 'Integration', status: 'active', file_key: `${randomUUID()}.pdf`, file_name: 'test.pdf', file_mime: 'application/pdf', file_size: 10, created_by_id: creator.user_id });
    assert.equal((await request(user.user_id, `/materials/${material.id}/complete`, 'PUT')).status, 200);
    session = await PracticeSession.create({ user_id: user.user_id, subtest: 'PK', material_id: material.id, difficulty_level: 1, question_ids: [], question_count: 1, status: 'in_progress', started_at: new Date() });
    assert.equal((await request(user.user_id, `/practice/session/${session.session_id}/complete`, 'PUT')).status, 200);
    plan = await StudyPlan.create({ user_id: user.user_id, title: 'Achievement plan', type: 'review', start_at: new Date(), status: 'pending' });
    assert.equal((await request(user.user_id, `/study-plan/${plan.plan_id}/complete`, 'PUT')).status, 200);
    const response = await request(user.user_id, '/tryout-recap', 'POST', { platform: 'External Test', recap_at: new Date().toISOString().slice(0, 10), total_score: 650 });
    assert.equal(response.status, 201);
    recap = await TryoutRecap.findOne({ where: { user_id: user.user_id, platform: 'External Test' } });
    const after = (await (await request(user.user_id, '/achievements')).json()).data;
    const codes = new Set(after.achievements.filter(row => row.status === 'unlocked').map(row => row.code));
    for (const code of ['first_step','first_practice','planner','first_recap']) assert.ok(codes.has(code), `${code} should unlock`);
    assert.equal(after.summary.total_xp, after.achievements.filter(row => row.status === 'unlocked').reduce((sum, row) => sum + row.xp_reward, 0));
    const again = (await (await request(user.user_id, '/achievements')).json()).data;
    assert.equal(again.summary.unlocked, after.summary.unlocked);
    assert.equal(again.summary.total_xp, after.summary.total_xp);
    assert.equal(await UserAchievement.count({ where: { user_id: user.user_id, achievement_id: (await Achievement.findOne({ where: { code: 'first_step' } })).achievement_id } }), 1);
    const filtered = (await (await request(user.user_id, '/achievements?category=learning&status=unlocked')).json()).data;
    assert.ok(filtered.achievements.every(row => row.category === 'learning' && row.status === 'unlocked'));
    const otherData = (await (await request(other.user_id, '/achievements')).json()).data;
    assert.equal(otherData.summary.unlocked, 0);
    console.log('User Achievements integration checks passed');
  } finally {
    if (session) await session.destroy();
    if (plan) await plan.destroy();
    if (recap) await recap.destroy();
    await UserAchievement.destroy({ where: { user_id: [user.user_id, other.user_id] } });
    await UserMaterialProgress.destroy({ where: { user_id: [user.user_id, other.user_id] } });
    if (material) await material.destroy();
    await user.destroy(); await other.destroy();
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
