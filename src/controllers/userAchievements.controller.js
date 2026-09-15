const service = require('../services/achievement.service');
module.exports = { overview: async (req, res) => {
  try { res.json({ success: true, data: await service.overview(req.user.user_id, req.query) }); }
  catch (error) { if (!error.status) console.error('USER ACHIEVEMENTS:', error); res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memuat achievement.' }); }
} };
