const { buildUserRoadmap } = require('../services/userRoadmap.service');

async function getUserRoadmap(req, res) {
  try {
    const roadmap = await buildUserRoadmap(req.user.user_id);
    if (!roadmap) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    return res.json({ success: true, data: roadmap });
  } catch (error) {
    console.error('USER ROADMAP:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat roadmap belajarmu.' });
  }
}

module.exports = { getUserRoadmap };
