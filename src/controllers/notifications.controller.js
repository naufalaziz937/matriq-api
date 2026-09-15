const service = require('../services/notification.service');
async function list(req, res) {
  try { res.json({ success: true, data: await service.getNotifications(req.user.user_id, { limit: req.query.limit, unreadOnly: req.query.unread_only === 'true' }) }); }
  catch (error) { console.error('NOTIFICATIONS LIST:', error); res.status(500).json({ success: false, message: 'Gagal memuat notifikasi' }); }
}
async function read(req, res) {
  try { const item = await service.markAsRead(req.user.user_id, req.params.id); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' }); }
  catch (error) { console.error('NOTIFICATION READ:', error); res.status(500).json({ success: false, message: 'Gagal menandai notifikasi' }); }
}
async function readAll(req, res) {
  try { res.json({ success: true, data: { updated: await service.markAllAsRead(req.user.user_id) } }); }
  catch (error) { console.error('NOTIFICATIONS READ ALL:', error); res.status(500).json({ success: false, message: 'Gagal menandai notifikasi' }); }
}
module.exports = { list, read, readAll };
