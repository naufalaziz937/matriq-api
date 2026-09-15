const service = require('../services/userTryoutRecap.service');
const wrap = (fn, status = 200) => async (req, res) => {
  try { return res.status(status).json({ success: true, data: await fn(req) }); }
  catch (error) { if (!error.status) console.error('USER TRYOUT RECAP:', error); return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memproses rekap tryout.' }); }
};
module.exports = {
  overview: wrap(req => service.overview(req.user.user_id)),
  history: wrap(req => service.history(req.user.user_id, req.query)),
  detail: wrap(req => service.detail(req.user.user_id, req.params.id)),
  create: wrap(async req => { const data = await service.create(req.user.user_id, req.body); await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id); return data; }, 201),
  update: wrap(async req => { const data = await service.update(req.user.user_id, req.params.id, req.body); await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id); return data; }),
  remove: wrap(req => service.remove(req.user.user_id, req.params.id)),
};
