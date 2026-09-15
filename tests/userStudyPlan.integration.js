require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, StudyPlan } = require('../src/models');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await sequelize.sync();
  const user = await User.findOne({ where: { role: 2 }, order: [['user_id', 'ASC']] });
  if (!user) { console.log('Study Plan checks skipped: no student account'); await sequelize.close(); return; }
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/user/study-plan`;
  const token = (role, id = user.user_id) => jwt.sign({ user_id: id, role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = (path = '', method = 'GET', body, role = 2, id = user.user_id) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token(role, id)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const date = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const weekStart = new Date(Date.parse(`${date}T00:00:00Z`) - ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const nextDay = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  let planId;
  const createdIds = [];
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await request(`?date_from=${date}&date_to=${nextDay}`, 'GET', null, 1)).status, 403);
    assert.equal((await request(`?date_from=${date}&date_to=${nextDay}`, 'GET', null, 3)).status, 403);
    const created = await request('', 'POST', { user_id: 999999, title: 'Latihan PK', type: 'practice', subtest: 'PK', target_questions: 20, start_at: `${date}T19:00:00+07:00`, duration_minutes: 45 });
    assert.equal(created.status, 201);
    const row = (await created.json()).data[0];
    planId = row.plan_id;
    assert.equal(row.user_id, user.user_id);
    const list = (await (await request(`?date_from=${date}&date_to=${nextDay}&user_id=999999`)).json()).data;
    assert.ok(list.some(item => item.plan_id === planId));
    const other = (await (await request(`?date_from=${date}&date_to=${nextDay}`, 'GET', null, 2, 999999)).json()).data;
    assert.ok(!other.some(item => item.plan_id === planId));
    assert.equal((await request(`/${planId}`, 'PUT', { title: 'Hijack', type: 'practice', start_at: `${date}T19:00:00+07:00` }, 2, 999999)).status, 404);
    assert.equal((await request(`/${planId}`, 'PUT', { title: 'Latihan PK Intensif', start_at: `${date}T20:00:00+07:00`, duration_minutes: 45 })).status, 200);
    const summary = (await (await request(`/week-summary?week_start=${weekStart}`)).json()).data;
    assert.ok(summary.planned >= 1);
    const preview = (await (await request('/generate', 'POST', { week_start: weekStart, availability: { monday: [{ start: '19:00', end: '20:00' }], tuesday: [{ start: '19:00', end: '20:00' }] } })).json()).data;
    assert.ok(Array.isArray(preview.plans));
    if (preview.plans.length) {
      const saved = await request('/generate/save', 'POST', { plans: preview.plans });
      assert.equal(saved.status, 201);
      createdIds.push(...(await saved.json()).data.map(item => item.plan_id));
    }
    const repeated = await request('', 'POST', { title: 'Review berulang', type: 'review', start_at: `${date}T08:00:00+07:00`, duration_minutes: 30, repeat_type: 'daily', repeat_until: `${nextDay}T23:59:59+07:00` });
    assert.equal(repeated.status, 201);
    const repeatRows = (await repeated.json()).data;
    assert.equal(repeatRows.length, 2);
    createdIds.push(...repeatRows.map(item => item.plan_id));
    assert.equal((await request(`/${planId}/complete`, 'PUT')).status, 200);
    const completed = await StudyPlan.findByPk(planId);
    assert.equal(completed.status, 'completed');
    assert.ok(completed.completed_at);
    assert.equal((await request(`/${planId}`, 'DELETE', null, 2, 999999)).status, 404);
    assert.equal((await request(`/${planId}`, 'DELETE')).status, 200);
    planId = null;
    console.log('User Study Plan integration checks passed');
  } finally {
    if (planId) await StudyPlan.destroy({ where: { plan_id: planId } });
    if (createdIds.length) await StudyPlan.destroy({ where: { plan_id: createdIds } });
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
