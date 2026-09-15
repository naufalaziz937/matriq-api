require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Notification } = require('../src/models');
const service = require('../src/services/notification.service');

async function main() {
  await sequelize.sync();
  const suffix = randomUUID();
  const users = [];
  let server;
  try {
    for (const role of [1, 2, 3]) users.push(await User.create({ nama: `Notif ${role}`, email: `notif-${role}-${suffix}@example.invalid`, password: 'unused', role, is_activate: true }));
    server = app.listen(0);
    const root = `http://127.0.0.1:${server.address().port}/api/notifications`;
    const request = (user, path = '', method = 'GET') => fetch(root + path, { method, headers: { Authorization: `Bearer ${jwt.sign({ user_id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' })}` } });
    assert.equal((await fetch(root)).status, 401);
    const items = [];
    for (const user of users) items.push(await service.createNotification({ userId: user.user_id, type: 'system_announcement', title: 'Test', message: 'Only owner', actionUrl: '/dashboard' }));
    for (const user of users) {
      const response = await request(user);
      assert.equal(response.status, 200);
      const data = (await response.json()).data;
      assert.equal(data.unread_count, 1);
      assert.equal(data.notifications.length, 1);
      assert.equal(data.notifications[0].user_id, user.user_id);
    }
    assert.equal((await request(users[1], `/${items[0].notification_id}/read`, 'PUT')).status, 404);
    assert.equal((await request(users[1], '/read-all', 'PUT')).status, 200);
    assert.equal((await (await request(users[1])).json()).data.unread_count, 0);
    assert.equal((await (await request(users[0])).json()).data.unread_count, 1);
    assert.equal((await request(users[2], `/${items[2].notification_id}/read`, 'PUT')).status, 200);
    assert.equal((await request(users[2], `/${items[2].notification_id}/read`, 'PUT')).status, 200);
    assert.equal((await (await request(users[2])).json()).data.unread_count, 0);
    console.log('Notification ownership and read checks passed');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (users.length) { await Notification.destroy({ where: { user_id: users.map(user => user.user_id) } }); await User.destroy({ where: { user_id: users.map(user => user.user_id) } }); }
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
