const service = require('../services/profile.service');
const { User } = require('../models');
const { uploadToCloudinary } = require('./onboarding.controller');

const send = (res, data) => res.json({ success: true, data });
const handle = (res, error) => { if (!error.status) console.error('PROFILE:', error); return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memproses profil' }); };
const endpoint = fn => async (req, res) => { try { return send(res, await fn(req.user.user_id, req.body)); } catch (error) { return handle(res, error); } };
const get = async (req, res) => { try { return send(res, await service.getProfile(req.user.user_id)); } catch (error) { return handle(res, error); } };
async function photo(req, res) {
  try {
    if (!req.file?.buffer) return res.status(400).json({ success: false, message: 'Foto profil wajib diunggah' });
    const bytes = req.file.buffer;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!({ 'image/jpeg': jpeg, 'image/jpg': jpeg, 'image/png': png, 'image/webp': webp })[req.file.mimetype]) return res.status(400).json({ success: false, message: 'Isi file foto tidak valid' });
    const uploaded = await uploadToCloudinary(bytes, req.user.user_id);
    await User.update({ foto_profile: uploaded.secure_url }, { where: { user_id: req.user.user_id } });
    return send(res, await service.getProfile(req.user.user_id));
  } catch (error) { return handle(res, error); }
}
module.exports = { get, updateCommon: endpoint(service.updateCommonProfile), updateStudent: endpoint(service.updateStudentProfile), updateTarget: endpoint(service.updateTarget), updateTutor: endpoint(service.updateTutorProfile), photo };
