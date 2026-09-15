const service = require('../services/userAnalytics.service');
module.exports = { overview: async (req, res) => {
  try { res.json({ success: true, data: await service.analytics(req.user.user_id, req.query) }); }
  catch (error) { if (!error.status) console.error('USER ANALYTICS:', error); res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memuat Analytics.' }); }
} };
