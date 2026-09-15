const { Op } = require('sequelize');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Material, User } = require('../models');

const storageDir = path.resolve(process.env.MATERIAL_UPLOAD_DIR || path.join(__dirname, '../../uploads/materials'));
const SUBTESTS = new Set(['PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM']);
const FORMATS = {
  '.pdf': { mime: 'application/pdf', signature: 'pdf' },
  '.doc': { mime: 'application/msword', signature: 'ole' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: 'zip' },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', signature: 'ole' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', signature: 'zip' },
  '.xls': { mime: 'application/vnd.ms-excel', signature: 'ole' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: 'zip' },
  '.txt': { mime: 'text/plain; charset=utf-8', signature: 'text' },
};
const creator = [{ model: User, as: 'created_by', attributes: ['user_id', 'nama'] }];
const invalid = (message) => ({ success: false, message });
function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function present(model) {
  const item = model.toJSON();
  delete item.file_key;
  item.file_url = `/api/admin/materials/${item.id}/file`;
  return item;
}
function validateFields(input) {
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const subtest = String(input.subtest ?? '').trim().toUpperCase();
  const category = String(input.category ?? '').trim();
  const status = String(input.status ?? 'draft').trim().toLowerCase();
  if (title.length < 3 || title.length > 200) return { error: 'Judul harus berisi 3–200 karakter' };
  if (description.length > 10000) return { error: 'Deskripsi maksimal 10000 karakter' };
  if (!SUBTESTS.has(subtest)) return { error: 'Subtes tidak valid' };
  if (!category || category.length > 100) return { error: 'Kategori wajib diisi (maksimal 100 karakter)' };
  if (!['draft', 'active'].includes(status)) return { error: 'Status tidak valid' };
  return { value: { title, description: description || null, subtest, category, status } };
}
function validateFile(file) {
  if (!file?.buffer?.length) return { error: 'File materi wajib diunggah' };
  const originalName = path.basename(path.win32.basename(file.originalname || ''))
    .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255);
  const extension = path.extname(originalName).toLowerCase();
  const format = FORMATS[extension];
  if (!format) return { error: 'Format file harus PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, atau TXT' };
  if (file.size > 20 * 1024 * 1024) return { error: 'Ukuran file maksimal 20 MB' };
  const buffer = file.buffer;
  const pdf = buffer.subarray(0, 5).toString() === '%PDF-';
  const zip = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const text = !buffer.includes(0) && Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
  if (!({ pdf, zip, ole, text })[format.signature]) return { error: 'Isi file tidak sesuai dengan formatnya' };
  if (format.signature === 'zip') {
    const requiredEntry = { '.docx': 'word/document.xml', '.pptx': 'ppt/presentation.xml', '.xlsx': 'xl/workbook.xml' }[extension];
    if (!buffer.includes(Buffer.from('[Content_Types].xml')) || !buffer.includes(Buffer.from(requiredEntry))) {
      return { error: 'Struktur dokumen Office tidak valid' };
    }
  }
  return { value: { originalName, extension, mime: format.mime, size: file.size } };
}
async function saveFile(file, details) {
  await fs.mkdir(storageDir, { recursive: true });
  const key = `${randomUUID()}${details.extension}`;
  await fs.writeFile(path.join(storageDir, key), file.buffer, { flag: 'wx' });
  return { file_key: key, file_name: details.originalName, file_mime: details.mime, file_size: details.size };
}
async function removeFile(key) {
  if (!key) return;
  try { await fs.unlink(path.join(storageDir, path.basename(key))); }
  catch (error) { if (error.code !== 'ENOENT') console.error('REMOVE MATERIAL FILE ERROR:', error); }
}
async function categories() {
  const rows = await Material.findAll({ attributes: ['category'], group: ['category'], order: [['category', 'ASC']], raw: true });
  return rows.map((row) => ({ id: row.category, name: row.category }));
}

async function getMaterials(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const search = String(req.query.search ?? '').trim().slice(0, 200);
    const subtest = String(req.query.subtest ?? '').toUpperCase();
    const category = String(req.query.category ?? '').trim();
    const status = String(req.query.status ?? '').toLowerCase();
    if (subtest && !SUBTESTS.has(subtest)) return res.status(400).json(invalid('Filter subtes tidak valid'));
    if (status && !['draft', 'active'].includes(status)) return res.status(400).json(invalid('Filter status tidak valid'));
    const where = {};
    if (subtest) where.subtest = subtest;
    if (category) where.category = category;
    if (status) where.status = status;
    if (search) where[Op.or] = [{ title: { [Op.iLike]: `%${search}%` } }, { description: { [Op.iLike]: `%${search}%` } }, { category: { [Op.iLike]: `%${search}%` } }];
    const [{ count, rows }, categoryList] = await Promise.all([
      Material.findAndCountAll({ where, include: creator, order: [['created_at', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit }),
      categories(),
    ]);
    return res.json({ success: true, data: rows.map(present), categories: categoryList, pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) } });
  } catch (error) {
    console.error('GET MATERIALS ERROR:', error);
    return res.status(500).json(invalid('Gagal memuat materi'));
  }
}
async function getSummary(req, res) {
  try {
    const [total, active, draft] = await Promise.all([Material.count(), Material.count({ where: { status: 'active' } }), Material.count({ where: { status: 'draft' } })]);
    return res.json({ success: true, data: { total, active, draft } });
  } catch (error) {
    console.error('GET MATERIAL SUMMARY ERROR:', error);
    return res.status(500).json(invalid('Gagal memuat ringkasan materi'));
  }
}
async function getMaterialById(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID materi tidak valid'));
  try {
    const material = await Material.findByPk(id, { include: creator });
    if (!material) return res.status(404).json(invalid('Materi tidak ditemukan'));
    return res.json({ success: true, data: present(material) });
  } catch (error) {
    console.error('GET MATERIAL ERROR:', error);
    return res.status(500).json(invalid('Gagal memuat detail materi'));
  }
}
async function getFile(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID materi tidak valid'));
  try {
    const material = await Material.findByPk(id);
    if (!material) return res.status(404).json(invalid('Materi tidak ditemukan'));
    const filePath = path.join(storageDir, path.basename(material.file_key));
    await fs.access(filePath);
    const disposition = material.file_mime === 'application/pdf' ? 'inline' : 'attachment';
    const fallbackName = material.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', material.file_mime);
    res.setHeader('Content-Length', material.file_size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(material.file_name)}`);
    return res.sendFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json(invalid('File materi tidak ditemukan'));
    console.error('GET MATERIAL FILE ERROR:', error);
    return res.status(500).json(invalid('Gagal membuka file materi'));
  }
}
async function createMaterial(req, res) {
  const fields = validateFields(req.body ?? {});
  if (fields.error) return res.status(400).json(invalid(fields.error));
  const file = validateFile(req.file);
  if (file.error) return res.status(400).json(invalid(file.error));
  let savedFile;
  try {
    savedFile = await saveFile(req.file, file.value);
    const material = await Material.create({ ...fields.value, ...savedFile, created_by_id: req.user.user_id });
    const saved = await Material.findByPk(material.id, { include: creator });
    return res.status(201).json({ success: true, message: 'Materi berhasil dibuat', data: present(saved) });
  } catch (error) {
    await removeFile(savedFile?.file_key);
    console.error('CREATE MATERIAL ERROR:', error);
    return res.status(500).json(invalid('Gagal membuat materi'));
  }
}
async function updateMaterial(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID materi tidak valid'));
  let savedFile;
  try {
    const material = await Material.findByPk(id);
    if (!material) return res.status(404).json(invalid('Materi tidak ditemukan'));
    const fields = validateFields({ ...material.toJSON(), ...(req.body ?? {}) });
    if (fields.error) return res.status(400).json(invalid(fields.error));
    if (req.file) {
      const file = validateFile(req.file);
      if (file.error) return res.status(400).json(invalid(file.error));
      savedFile = await saveFile(req.file, file.value);
    }
    const previousKey = material.file_key;
    await material.update({ ...fields.value, ...(savedFile ?? {}) });
    if (savedFile) await removeFile(previousKey);
    const updated = await Material.findByPk(id, { include: creator });
    return res.json({ success: true, message: 'Materi berhasil diperbarui', data: present(updated) });
  } catch (error) {
    await removeFile(savedFile?.file_key);
    console.error('UPDATE MATERIAL ERROR:', error);
    return res.status(500).json(invalid('Gagal memperbarui materi'));
  }
}
async function deleteMaterial(req, res) {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID materi tidak valid'));
  try {
    const material = await Material.findByPk(id);
    if (!material) return res.status(404).json(invalid('Materi tidak ditemukan'));
    const key = material.file_key;
    await material.destroy();
    await removeFile(key);
    return res.json({ success: true, message: 'Materi berhasil dihapus' });
  } catch (error) {
    console.error('DELETE MATERIAL ERROR:', error);
    return res.status(500).json(invalid('Gagal menghapus materi'));
  }
}

module.exports = { getMaterials, getSummary, getMaterialById, getFile, createMaterial, updateMaterial, deleteMaterial, validateFields, validateFile, saveFile, removeFile, storageDir };
