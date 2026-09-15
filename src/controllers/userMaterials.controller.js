const fs = require('node:fs/promises');
const path = require('node:path');
const service = require('../services/userMaterials.service');
const { storageDir } = require('./adminMaterial.controller');
const wrap = (action, status = 200) => async (req, res) => {
  try { const data = await action(req); res.status(status).json({ success: true, data, ...(req.path === '/' ? { pagination: data.pagination } : {}) }); }
  catch (error) { if (!error.status) console.error('USER MATERIALS:', error); res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memuat materi.' }); }
};
const file = async (req, res) => {
  try {
    const material = await service.active(req.params.id);
    const filePath = path.join(storageDir, path.basename(material.file_key));
    await fs.access(filePath);
    res.setHeader('Content-Type', material.file_mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Content-Disposition', `${material.file_mime === 'application/pdf' ? 'inline' : 'attachment'}; filename="${material.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"`);
    res.sendFile(filePath);
  } catch (error) { if (!error.status && error.code !== 'ENOENT') console.error('USER MATERIAL FILE:', error); res.status(error.status || (error.code === 'ENOENT' ? 404 : 500)).json({ success: false, message: error.status ? error.message : error.code === 'ENOENT' ? 'File materi tidak ditemukan.' : 'Gagal membuka file materi.' }); }
};
module.exports = {
  overview: wrap(req => service.overview(req.user.user_id, req.query)),
  detail: wrap(req => service.detail(req.user.user_id, req.params.id)),
  start: wrap(req => service.start(req.user.user_id, req.params.id)),
  progress: wrap(async req => { const data = await service.updateProgress(req.user.user_id, req.params.id, req.body); if (data.material.status === 'completed') await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id); return data; }),
  complete: wrap(async req => { const data = await service.complete(req.user.user_id, req.params.id); await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id); return data; }),
  file,
};
