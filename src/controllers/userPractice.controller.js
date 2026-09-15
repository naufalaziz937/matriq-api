const service = require('../services/userPractice.service');
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error) => { if (!error.status) console.error('USER PRACTICE:', error); return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memuat latihan.' }); };
const handler = action => async (req, res) => { try { return send(res, await action(req), req.method === 'POST' && req.path === '/session' ? 201 : 200); } catch (error) { return fail(res, error); } };
module.exports = {
  overview: handler(req => service.overview(req.user.user_id)),
  materials: handler(req => service.materials(req.user.user_id, String(req.params.code).toUpperCase())),
  levels: handler(req => service.levels(req.user.user_id, req.params.materialId)),
  start: handler(req => service.start(req.user.user_id, req.body)),
  session: handler(req => service.sessionView(req.user.user_id, req.params.sessionId)),
  answer: handler(req => service.submitAnswer(req.user.user_id, req.params.sessionId, req.body)),
  complete: handler(async req => { const data = await service.complete(req.user.user_id, req.params.sessionId); await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id); return data; }),
  result: handler(req => service.result(req.user.user_id, req.params.sessionId)),
};
