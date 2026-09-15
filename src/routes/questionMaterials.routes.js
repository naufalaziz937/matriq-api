const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const { Material } = require('../models');
const SUBTESTS = require('../config/subtests');
router.get('/', auth, allowRoles(1, 3), async (req, res) => {
  try {
    const code = String(req.query.subtest || '').toUpperCase();
    if (code && !SUBTESTS.some(item => item.code === code)) return res.status(400).json({ success: false, message: 'Subtes tidak valid.' });
    const where = { status: 'active', ...(code ? { subtest: code } : {}) };
    const data = await Material.findAll({ where, attributes: ['id', 'title', 'subtest'], order: [['title', 'ASC']], limit: 300 });
    return res.json({ success: true, data });
  } catch (error) { console.error('QUESTION MATERIALS:', error); return res.status(500).json({ success: false, message: 'Gagal memuat materi.' }); }
});
module.exports = router;
