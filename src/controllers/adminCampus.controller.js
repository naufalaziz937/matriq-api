const { Op, fn, col } = require('sequelize');
const { sequelize } = require('../config/database');
const { KampusPtn, Prodi, Provinsi } = require('../models');

const invalid = (message) => ({ success: false, message });
function campusId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 32767 ? id : null;
}
function paging(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}
function booleanValue(value, fallback = true) {
  if (value === undefined) return fallback;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}
function campusFields(input) {
  const nama = String(input.nama ?? '').trim();
  const singkatan = String(input.singkatan ?? '').trim().toUpperCase();
  const jenis = String(input.jenis ?? '').trim();
  const kota = String(input.kota ?? '').trim();
  const provinsi_kode = String(input.provinsi_kode ?? '').trim();
  const aktif = booleanValue(input.aktif);
  if (!nama || nama.length > 150) return { error: 'Nama kampus wajib diisi (maksimal 150 karakter)' };
  if (!singkatan || singkatan.length > 20) return { error: 'Singkatan wajib diisi (maksimal 20 karakter)' };
  if (!jenis || jenis.length > 30) return { error: 'Jenis kampus wajib diisi (maksimal 30 karakter)' };
  if (!kota || kota.length > 80) return { error: 'Kota wajib diisi (maksimal 80 karakter)' };
  if (!/^\d{2}$/.test(provinsi_kode)) return { error: 'Kode provinsi harus 2 digit' };
  if (aktif === null) return { error: 'Status kampus tidak valid' };
  return { value: { nama, singkatan, jenis, kota, provinsi_kode, aktif } };
}
function programFields(input) {
  const kode_snbt = String(input.kode_snbt ?? '').trim().toUpperCase();
  const nama = String(input.nama ?? '').trim();
  const capacityRaw = input.daya_tampung_2024;
  const applicantsRaw = input.peminat_2023;
  const daya_tampung_2024 = capacityRaw === '' || capacityRaw == null ? null : Number(capacityRaw);
  const peminat_2023 = applicantsRaw === '' || applicantsRaw == null ? null : Number(applicantsRaw);
  const sumber_tahun = Number(input.sumber_tahun ?? 2024);
  const aktif = booleanValue(input.aktif);
  if (!/^[A-Z0-9-]{1,10}$/.test(kode_snbt)) return { error: 'Kode SNBT harus 1–10 karakter huruf/angka' };
  if (!nama || nama.length > 180) return { error: 'Nama prodi wajib diisi (maksimal 180 karakter)' };
  if (daya_tampung_2024 !== null && (!Number.isSafeInteger(daya_tampung_2024) || daya_tampung_2024 < 0)) return { error: 'Daya tampung harus angka non-negatif' };
  if (peminat_2023 !== null && (!Number.isSafeInteger(peminat_2023) || peminat_2023 < 0)) return { error: 'Peminat harus angka non-negatif' };
  if (!Number.isInteger(sumber_tahun) || sumber_tahun < 2000 || sumber_tahun > 2100) return { error: 'Tahun sumber tidak valid' };
  if (aktif === null) return { error: 'Status prodi tidak valid' };
  return { value: { kode_snbt, nama, daya_tampung_2024, peminat_2023, sumber_tahun, aktif } };
}
function fail(res, error, message) {
  if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json(invalid('Nama, singkatan, atau kode sudah digunakan'));
  console.error(message, error);
  return res.status(500).json(invalid('Gagal memproses data kampus dan prodi'));
}

async function getSummary(req, res) {
  try {
    const [campuses, activeCampuses, programs, activePrograms] = await Promise.all([
      KampusPtn.count(), KampusPtn.count({ where: { aktif: true } }), Prodi.count(), Prodi.count({ where: { aktif: true } }),
    ]);
    return res.json({ success: true, data: { campuses, activeCampuses, programs, activePrograms } });
  } catch (error) { return fail(res, error, 'CAMPUS SUMMARY ERROR:'); }
}
async function getCampuses(req, res) {
  try {
    const { page, limit, offset } = paging(req.query);
    const search = String(req.query.search ?? '').trim().slice(0, 200);
    const status = String(req.query.status ?? '').trim();
    if (status && !['active', 'inactive'].includes(status)) return res.status(400).json(invalid('Filter status tidak valid'));
    const where = {};
    if (status) where.aktif = status === 'active';
    if (search) where[Op.or] = ['nama', 'singkatan', 'jenis', 'kota'].map((field) => ({ [field]: { [Op.iLike]: `%${search}%` } }));
    const { count, rows } = await KampusPtn.findAndCountAll({ where, order: [['nama', 'ASC']], limit, offset });
    const ids = rows.map((row) => row.id);
    const counts = ids.length ? await Prodi.findAll({
      attributes: ['kampus_id', [fn('COUNT', col('kode_snbt')), 'total']],
      where: { kampus_id: { [Op.in]: ids } }, group: ['kampus_id'], raw: true,
    }) : [];
    const countMap = new Map(counts.map((row) => [Number(row.kampus_id), Number(row.total)]));
    return res.json({ success: true, data: rows.map((row) => ({ ...row.toJSON(), prodi_count: countMap.get(row.id) ?? 0 })), pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) } });
  } catch (error) { return fail(res, error, 'GET CAMPUSES ERROR:'); }
}
async function getCampusById(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  try {
    const campus = await KampusPtn.findByPk(id);
    if (!campus) return res.status(404).json(invalid('Kampus tidak ditemukan'));
    return res.json({ success: true, data: campus });
  } catch (error) { return fail(res, error, 'GET CAMPUS ERROR:'); }
}
async function createCampus(req, res) {
  const fields = campusFields(req.body ?? {});
  if (fields.error) return res.status(400).json(invalid(fields.error));
  let transaction;
  try {
    if (!await Provinsi.findByPk(fields.value.provinsi_kode)) return res.status(400).json(invalid('Provinsi tidak ditemukan'));
    transaction = await sequelize.transaction();
    await sequelize.query('SELECT pg_advisory_xact_lock(64172)', { transaction });
    const maxId = await KampusPtn.max('id', { transaction });
    const id = (Number(maxId) || 0) + 1;
    if (id > 32767) { await transaction.rollback(); return res.status(409).json(invalid('ID kampus sudah mencapai batas'));
    }
    const campus = await KampusPtn.create({ id, ...fields.value }, { transaction });
    await transaction.commit();
    return res.status(201).json({ success: true, message: 'Kampus berhasil dibuat', data: campus });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    return fail(res, error, 'CREATE CAMPUS ERROR:');
  }
}
async function updateCampus(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  try {
    const campus = await KampusPtn.findByPk(id);
    if (!campus) return res.status(404).json(invalid('Kampus tidak ditemukan'));
    const fields = campusFields({ ...campus.toJSON(), ...(req.body ?? {}) });
    if (fields.error) return res.status(400).json(invalid(fields.error));
    if (!await Provinsi.findByPk(fields.value.provinsi_kode)) return res.status(400).json(invalid('Provinsi tidak ditemukan'));
    await campus.update(fields.value);
    return res.json({ success: true, message: 'Kampus berhasil diperbarui', data: campus });
  } catch (error) { return fail(res, error, 'UPDATE CAMPUS ERROR:'); }
}
async function deactivateCampus(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  try {
    const campus = await KampusPtn.findByPk(id);
    if (!campus) return res.status(404).json(invalid('Kampus tidak ditemukan'));
    await campus.update({ aktif: false });
    return res.json({ success: true, message: 'Kampus dinonaktifkan' });
  } catch (error) { return fail(res, error, 'DEACTIVATE CAMPUS ERROR:'); }
}
async function getPrograms(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  try {
    const campus = await KampusPtn.findByPk(id);
    if (!campus) return res.status(404).json(invalid('Kampus tidak ditemukan'));
    const { page, limit, offset } = paging(req.query);
    const search = String(req.query.search ?? '').trim().slice(0, 200);
    const status = String(req.query.status ?? '').trim();
    if (status && !['active', 'inactive'].includes(status)) return res.status(400).json(invalid('Filter status tidak valid'));
    const where = { kampus_id: id };
    if (status) where.aktif = status === 'active';
    if (search) where[Op.or] = [{ nama: { [Op.iLike]: `%${search}%` } }, { kode_snbt: { [Op.iLike]: `%${search}%` } }];
    const { count, rows } = await Prodi.findAndCountAll({ where, order: [['nama', 'ASC']], limit, offset });
    return res.json({ success: true, kampus: campus, data: rows, pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) } });
  } catch (error) { return fail(res, error, 'GET PROGRAMS ERROR:'); }
}
async function createProgram(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  const fields = programFields(req.body ?? {});
  if (fields.error) return res.status(400).json(invalid(fields.error));
  try {
    if (!await KampusPtn.findByPk(id)) return res.status(404).json(invalid('Kampus tidak ditemukan'));
    const program = await Prodi.create({ kampus_id: id, ...fields.value });
    return res.status(201).json({ success: true, message: 'Prodi berhasil dibuat', data: program });
  } catch (error) { return fail(res, error, 'CREATE PROGRAM ERROR:'); }
}
async function updateProgram(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  try {
    const program = await Prodi.findOne({ where: { kampus_id: id, kode_snbt: req.params.code } });
    if (!program) return res.status(404).json(invalid('Prodi tidak ditemukan'));
    const fields = programFields({ ...program.toJSON(), ...(req.body ?? {}), kode_snbt: program.kode_snbt });
    if (fields.error) return res.status(400).json(invalid(fields.error));
    await program.update(fields.value);
    return res.json({ success: true, message: 'Prodi berhasil diperbarui', data: program });
  } catch (error) { return fail(res, error, 'UPDATE PROGRAM ERROR:'); }
}
async function deactivateProgram(req, res) {
  const id = campusId(req.params.id);
  if (!id) return res.status(400).json(invalid('ID kampus tidak valid'));
  try {
    const program = await Prodi.findOne({ where: { kampus_id: id, kode_snbt: req.params.code } });
    if (!program) return res.status(404).json(invalid('Prodi tidak ditemukan'));
    await program.update({ aktif: false });
    return res.json({ success: true, message: 'Prodi dinonaktifkan' });
  } catch (error) { return fail(res, error, 'DEACTIVATE PROGRAM ERROR:'); }
}

module.exports = { getSummary, getCampuses, getCampusById, createCampus, updateCampus, deactivateCampus, getPrograms, createProgram, updateProgram, deactivateProgram };
