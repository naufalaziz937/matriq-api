const { StudyPlan, Material } = require('../models');
const service = require('../services/userStudyPlan.service');

const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error) => { if (!error.status) console.error('USER STUDY PLAN:', error); return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal memproses Study Plan.' }); };
const planId = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw service.error('ID jadwal tidak valid.'); return id; };
const ownPlan = async (id, userId) => { const plan = await StudyPlan.findOne({ where: { plan_id: planId(id), user_id: userId } }); if (!plan) throw service.error('Jadwal tidak ditemukan.', 404); return plan; };

async function list(req, res) { try { return send(res, await service.listPlans(req.user.user_id, req.query.date_from, req.query.date_to)); } catch (error) { return fail(res, error); } }
async function day(req, res) { try { return send(res, await service.listPlans(req.user.user_id, req.query.date, req.query.date)); } catch (error) { return fail(res, error); } }
async function week(req, res) { try { return send(res, await service.weekSummary(req.user.user_id, req.query.week_start)); } catch (error) { return fail(res, error); } }
async function recommendations(req, res) { try { return send(res, await service.recommendations(req.user.user_id)); } catch (error) { return fail(res, error); } }
async function materials(req, res) { try { const where = { status: 'active' }; if (req.query.subtest) { const code = String(req.query.subtest).toUpperCase(); if (!['PU','PPU','PBM','PK','LBI','LBE','PM'].includes(code)) throw service.error('Subtes tidak valid.'); where.subtest = code; } return send(res, await Material.findAll({ where, attributes: ['id','title','subtest'], order: [['title','ASC']], limit: 200 })); } catch (error) { return fail(res, error); } }
async function generate(req, res) { try { return send(res, await service.generatePreview(req.user.user_id, req.body)); } catch (error) { return fail(res, error); } }
async function saveGenerated(req, res) { try { return send(res, await service.savePreview(req.user.user_id, req.body?.plans), 201); } catch (error) { return fail(res, error); } }
async function create(req, res) { try { const data = await service.createPlans(req.body, req.user.user_id); await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id); return send(res, data, 201); } catch (error) { return fail(res, error); } }
async function update(req, res) {
  try {
    const plan = await ownPlan(req.params.id, req.user.user_id);
    if (plan.status === 'completed') throw service.error('Jadwal selesai tidak dapat diubah.');
    const changes = { ...plan.toJSON(), ...req.body, repeat_type: 'none' };
    if (req.body?.start_at && !Object.hasOwn(req.body, 'end_at')) changes.end_at = null;
    const payload = await service.validatePlan(changes, req.user.user_id, { source: plan.source });
    await plan.update({ ...payload, source: plan.source, status: plan.status });
    return send(res, plan);
  } catch (error) { return fail(res, error); }
}
async function remove(req, res) { try { const plan = await ownPlan(req.params.id, req.user.user_id); await plan.destroy(); return send(res, { plan_id: plan.plan_id }); } catch (error) { return fail(res, error); } }
async function complete(req, res) {
  try {
    const plan = await ownPlan(req.params.id, req.user.user_id);
    if (plan.status === 'cancelled') throw service.error('Jadwal dibatalkan tidak dapat diselesaikan.');
    if (plan.status !== 'completed') await plan.update({ status: 'completed', completed_at: new Date() });
    await require('../services/achievement.service').evaluateAfterEvent(req.user.user_id);
    return send(res, plan);
  } catch (error) { return fail(res, error); }
}
module.exports = { list, day, week, recommendations, materials, generate, saveGenerated, create, update, remove, complete };
