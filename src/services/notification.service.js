const { Op } = require('sequelize');
const { Notification, User } = require('../models');

async function createNotification({ userId, type, title, message, actionUrl = null }) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new Error('User notifikasi tidak valid');
  if (actionUrl && (!actionUrl.startsWith('/') || actionUrl.startsWith('//'))) throw new Error('URL notifikasi tidak valid');
  return Notification.create({ user_id: Number(userId), type, title, message, action_url: actionUrl });
}
async function notifyAdmins(input) {
  const admins = await User.findAll({ where: { role: 1 }, attributes: ['user_id'] });
  return Promise.all(admins.map(admin => createNotification({ ...input, userId: admin.user_id })));
}
async function getNotifications(userId, { limit = 10, unreadOnly = false } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
  const [unreadCount, notifications] = await Promise.all([
    Notification.count({ where: { user_id: userId, is_read: false } }),
    Notification.findAll({ where: { user_id: userId, ...(unreadOnly ? { is_read: false } : {}) }, order: [['created_at', 'DESC'], ['notification_id', 'DESC']], limit: safeLimit }),
  ]);
  return { unread_count: unreadCount, notifications };
}
async function markAsRead(userId, notificationId) {
  const id = Number(notificationId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const item = await Notification.findOne({ where: { notification_id: id, user_id: userId } });
  if (!item) return null;
  if (!item.is_read) await item.update({ is_read: true, read_at: new Date() });
  return item;
}
async function markAllAsRead(userId) {
  const [updated] = await Notification.update({ is_read: true, read_at: new Date() }, { where: { user_id: userId, is_read: false } });
  return updated;
}
async function afterEvent(input) {
  try { await createNotification(input); }
  catch (error) { console.error('NOTIFICATION EVENT:', error); }
}
async function adminsAfterEvent(input) {
  try { await notifyAdmins(input); }
  catch (error) { console.error('ADMIN NOTIFICATION EVENT:', error); }
}
module.exports = { createNotification, notifyAdmins, getNotifications, markAsRead, markAllAsRead, afterEvent, adminsAfterEvent };
