require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, TryoutRecap } = require('../src/models');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await require('../src/services/userTryoutRecap.service').prepareSchema();
  await sequelize.sync();
  const users = await User.findAll({ where: { role: 2 }, order: [['user_id', 'ASC']], limit: 2 });
  if (users.length < 2) { console.log('Tryout recap checks skipped: two students required'); await sequelize.close(); return; }
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/user/tryout-recap`;
  const token = user => jwt.sign({ user_id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const request = (user, path = '', method = 'GET', body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token(user)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = { platform: 'Integration Test', tryout_name: 'External report', recap_at: '2026-09-14', pu: 700, ppu: 690, pbm: 680, pk: 670, lbi: 720, lbe: 710, pm: 660, total_score: 699, notes: 'Catatan eksternal' };
  let created;
  try {
    assert.equal((await fetch(base)).status, 401);
    const other = await request(users[1]);
    assert.equal(other.status, 200);
    const bad = await request(users[0], '', 'POST', { ...payload, total_score: 1001 });
    assert.equal(bad.status, 400);
    const response = await request(users[0], '', 'POST', { ...payload, user_id: users[1].user_id });
    assert.equal(response.status, 201);
    created = (await response.json()).data;
    assert.equal(created.user_id, users[0].user_id);
    assert.equal(created.total_score, 699);
    const overview = (await (await request(users[0])).json()).data;
    assert.ok(overview.summary.total_recap >= 1);
    assert.equal(overview.subtests.length, 7);
    assert.ok(overview.platform_usage.some(row => row.platform === payload.platform));
    assert.equal((await request(users[1], `/${created.recap_id}`)).status, 404);
    assert.equal((await request(users[1], `/${created.recap_id}`, 'PUT', payload)).status, 404);
    assert.equal((await request(users[1], `/${created.recap_id}`, 'DELETE')).status, 404);
    const update = await request(users[0], `/${created.recap_id}`, 'PUT', { ...payload, total_score: 735 });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.total_score, 735);
    assert.equal((await request(users[0], `/${created.recap_id}`, 'DELETE')).status, 200);
    assert.equal((await request(users[0], `/${created.recap_id}`)).status, 404);
    created = null;
    console.log('User tryout recap integration checks passed');
  } finally {
    if (created) await TryoutRecap.destroy({ where: { recap_id: created.recap_id } });
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
