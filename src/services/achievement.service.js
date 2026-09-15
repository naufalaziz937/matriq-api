const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Achievement, UserAchievement, PracticeSession, TryoutRecap, StudyPlan } = require('../models');
const definitions = require('../config/achievements');
const notificationService = require('./notification.service');
const { analytics } = require('./userAnalytics.service');
const { buildUserRoadmap } = require('./userRoadmap.service');

const validCategories = new Set(['learning','practice','consistency','tryout','roadmap','mastery','special']);
const validRarities = new Set(['common','rare','epic','legendary']);
const validStatuses = new Set(['all','unlocked','locked']);
const invalid = message => Object.assign(new Error(message), { status: 400 });
const round = value => Math.round(Number(value || 0) * 10) / 10;
const formatDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
const previousDay = value => new Date(Date.parse(`${value}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

async function seedDefinitions() {
  await Achievement.bulkCreate(definitions, { ignoreDuplicates: true });
}
async function getAchievementDefinitions() { return Achievement.findAll({ where: { is_active: true }, order: [['sort_order','ASC'],['achievement_id','ASC']] }); }

async function facts(userId) {
  const [a, roadmap, sessions, recaps, planCount, planCompleted, materialStats, activityDays] = await Promise.all([
    analytics(userId, { range: 'all' }),
    buildUserRoadmap(userId),
    PracticeSession.findAll({ where: { user_id: userId, status: 'completed' }, attributes: ['difficulty_level','correct_count','wrong_count','accuracy','completed_at'] }),
    TryoutRecap.findAll({ where: { user_id: userId }, attributes: ['total_score','recap_at'], order: [['recap_at','ASC'],['recap_id','ASC']] }),
    StudyPlan.count({ where: { user_id: userId } }),
    StudyPlan.count({ where: { user_id: userId, status: 'completed' } }),
    sequelize.query("SELECT m.subtest::text AS code,COUNT(*)::int AS total,COUNT(ump.progress_id) FILTER (WHERE ump.status='completed')::int AS completed FROM materials m LEFT JOIN user_material_progress ump ON ump.material_id=m.id AND ump.user_id=$userId WHERE m.status='active' GROUP BY m.subtest", { bind: { userId }, type: QueryTypes.SELECT }),
    sequelize.query("SELECT DISTINCT day FROM (SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day FROM study_progress WHERE user_id=$userId AND (waktu_belajar>0 OR soal_dikerjakan>0) UNION SELECT (completed_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day FROM practice_sessions WHERE user_id=$userId AND status='completed' AND correct_count+wrong_count>0) activity ORDER BY day", { bind: { userId }, type: QueryTypes.SELECT }),
  ]);
  const days = new Set(activityDays.map(row => row.day));
  let longestStreak = 0, chain = 0, prior = null;
  for (const row of activityDays) { chain = prior && previousDay(row.day) === prior ? chain + 1 : 1; longestStreak = Math.max(longestStreak, chain); prior = row.day; }
  const scoreList = recaps.map(row => Number(row.total_score));
  let improvement3 = false, personalBest = false, runningBest = -Infinity;
  for (let index = 0; index < scoreList.length; index++) {
    if (index >= 2 && scoreList[index - 2] < scoreList[index - 1] && scoreList[index - 1] < scoreList[index]) improvement3 = true;
    if (index > 0 && scoreList[index] > runningBest) personalBest = true;
    runningBest = Math.max(runningBest, scoreList[index]);
  }
  return { a, roadmap, sessions, recaps, planCount, planCompleted, materialStats, longestStreak, improvement3, personalBest, days };
}

function condition(definition, context) {
  const { a, roadmap, sessions, recaps, planCount, planCompleted, materialStats, longestStreak, improvement3, personalBest } = context;
  const type = definition.condition_type, threshold = Number(definition.condition_value);
  const practice = a.practice || {}, target = a.target || {}, best = Number(a.tryout?.best_all_time || 0);
  const from = value => ({ value: round(value), target: threshold });
  if (type === 'materials_completed') return from(roadmap.study_summary.completed_materials);
  if (type === 'material_master') return from(materialStats.filter(row => row.total > 0 && row.completed === row.total).length);
  if (type === 'practice_sessions') return from(practice.total_sessions || 0);
  if (type === 'practice_questions') return from(practice.questions_attempted || 0);
  if (type === 'sharp_mind') return from(sessions.filter(row => Number(row.correct_count) + Number(row.wrong_count) >= 20 && Number(row.accuracy) >= 80).length);
  if (type === 'perfect_run') return from(sessions.filter(row => Number(row.correct_count) >= 10 && Number(row.wrong_count) === 0).length);
  if (/^practice_level_[1-4]$/.test(type)) { const level = Number(type.at(-1)); const minAccuracy = level === 4 ? 75 : 70; return from(sessions.filter(row => Number(row.difficulty_level) === level && Number(row.correct_count) + Number(row.wrong_count) >= 10 && Number(row.accuracy) >= minAccuracy).length); }
  if (type === 'study_streak') return from(longestStreak);
  if (type === 'study_plan_created') return from(planCount);
  if (type === 'study_plan_completed') return from(planCompleted);
  if (type === 'weekly_champion') return from((a.study_plan?.weekly_trend || []).filter(row => row.planned >= 5 && row.completion_rate >= 90).length);
  if (type === 'tryout_recaps') return from(recaps.length);
  if (type === 'tryout_improvement_3') return from(improvement3 ? 1 : 0);
  if (type === 'personal_best') return from(personalBest ? 1 : 0);
  if (type === 'best_tryout_score') return from(best);
  if (type === 'target_set') return from(roadmap.target?.campus && roadmap.target?.program ? 1 : 0);
  if (type === 'target_gap') return target.target_score != null && target.best_score != null ? { value: best, target: Math.max(0, Number(target.target_score) - threshold), met: Number(target.gap) <= threshold } : { value: 0, target: 1, unavailable: true };
  if (type === 'target_reached') return target.target_score != null && target.best_score != null ? { value: best, target: Number(target.target_score) } : { value: 0, target: 1, unavailable: true };
  if (/^roadmap_stage_[1-5]$/.test(type)) { const stage = Number(type.at(-1)); return from(roadmap.stages.find(row => row.id === stage)?.progress >= 100 ? 1 : 0); }
  if (/^subtest_accuracy_(PK|PM)$/.test(type)) { const code = type.split('_').at(-1), row = a.subtests.find(item => item.code === code); return row?.questions_attempted >= 50 ? from(row.accuracy || 0) : { value: 0, target: threshold, unavailable: true, sample: row?.questions_attempted || 0 }; }
  if (type === 'literacy_specialist') { const eligible = a.subtests.filter(row => ['LBI','LBE'].includes(row.code) && row.questions_attempted >= 50); return eligible.length ? from(Math.max(...eligible.map(row => row.accuracy || 0))) : { value: 0, target: threshold, unavailable: true, sample: Math.max(0, ...a.subtests.filter(row => ['LBI','LBE'].includes(row.code)).map(row => row.questions_attempted)) }; }
  return { value: 0, target: threshold, unavailable: true };
}

async function evaluateAchievements(userId) {
  const [items, context] = await Promise.all([getAchievementDefinitions(), facts(userId)]);
  const previous = await UserAchievement.findAll({ where: { user_id: userId } });
  const byId = new Map(previous.map(row => [row.achievement_id, row]));
  const now = new Date(), newlyUnlocked = [];
  for (const item of items) {
    const calculated = condition(item, context);
    const target = Number(calculated.target ?? 1);
    const value = Math.max(0, round(calculated.value));
    let record = byId.get(item.achievement_id);
    if (!record) {
      [record] = await UserAchievement.findOrCreate({ where: { user_id: userId, achievement_id: item.achievement_id }, defaults: { progress_value: value, target_value: target, unlocked_at: null } });
      byId.set(item.achievement_id, record);
    }
    if (!record.unlocked_at && !calculated.unavailable && (calculated.met ?? value >= target)) {
      const [changed] = await UserAchievement.update({ progress_value: Math.max(value, Number(record.progress_value || 0)), target_value: target, unlocked_at: now }, { where: { user_id: userId, achievement_id: item.achievement_id, unlocked_at: null } });
      if (changed) {
        record.unlocked_at = now;
        newlyUnlocked.push(item.code);
        await notificationService.afterEvent({ userId, type: 'achievement_unlocked', title: 'Achievement Baru 🎉', message: `Kamu membuka badge ${item.name}.`, actionUrl: '/achievements' });
      }
    } else if (Number(record.progress_value) !== Math.max(value, record.unlocked_at ? target : 0) || Number(record.target_value) !== target) {
      await record.update({ progress_value: Math.max(value, record.unlocked_at ? target : 0), target_value: target });
    }
  }
  return newlyUnlocked;
}

async function getUserAchievementProgress(userId) {
  const items = await Achievement.findAll({ where: { is_active: true }, include: [{ model: UserAchievement, as: 'unlocks', where: { user_id: userId }, required: false }], order: [['sort_order','ASC'],['achievement_id','ASC']] });
  return items.map(item => {
    const saved = item.unlocks?.[0];
    const target = Number(saved?.target_value ?? item.condition_value);
    const value = Number(saved?.progress_value || 0);
    return { achievement_id: item.achievement_id, code: item.code, name: item.name, description: item.description, category: item.category, rarity: item.rarity, icon: item.icon, xp_reward: item.xp_reward, progress_value: value, target_value: target, progress_percent: saved?.unlocked_at ? 100 : Math.min(100, Math.round(value / Math.max(1, target) * 100)), status: saved?.unlocked_at ? 'unlocked' : 'locked', unlocked_at: saved?.unlocked_at || null };
  });
}
function getAchievementSummary(items, currentStreak = 0) {
  const unlocked = items.filter(item => item.status === 'unlocked');
  return { total: items.length, unlocked: unlocked.length, locked: items.length - unlocked.length, rare_badges: unlocked.filter(item => item.rarity !== 'common').length, current_streak: currentStreak, total_xp: unlocked.reduce((total, item) => total + item.xp_reward, 0) };
}
async function overview(userId, query = {}) {
  const category = String(query.category || ''), rarity = String(query.rarity || ''), status = String(query.status || 'all');
  if (category && !validCategories.has(category)) throw invalid('Kategori achievement tidak valid.');
  if (rarity && !validRarities.has(rarity)) throw invalid('Rarity achievement tidak valid.');
  if (!validStatuses.has(status)) throw invalid('Status achievement tidak valid.');
  await evaluateAchievements(userId);
  const [all, streakRows] = await Promise.all([getUserAchievementProgress(userId), sequelize.query("SELECT DISTINCT day FROM (SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day FROM study_progress WHERE user_id=$userId AND (waktu_belajar>0 OR soal_dikerjakan>0) UNION SELECT (completed_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day FROM practice_sessions WHERE user_id=$userId AND status='completed' AND correct_count+wrong_count>0) activity ORDER BY day", { bind: { userId }, type: QueryTypes.SELECT })]);
  const active = new Set(streakRows.map(row => row.day));
  const today = formatDay(new Date()); let cursor = active.has(today) ? today : previousDay(today), currentStreak = 0;
  while (active.has(cursor)) { currentStreak++; cursor = previousDay(cursor); }
  const latest = all.filter(item => item.status === 'unlocked').sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at) || a.achievement_id - b.achievement_id).slice(0, 3);
  const almost_unlocked = all.filter(item => item.status === 'locked' && item.progress_value > 0 && item.progress_percent < 100).sort((a, b) => b.progress_percent - a.progress_percent).slice(0, 3);
  const filtered = all.filter(item => (!category || item.category === category) && (!rarity || item.rarity === rarity) && (status === 'all' || item.status === status));
  return { summary: getAchievementSummary(all, currentStreak), latest, almost_unlocked, achievements: filtered };
}

async function evaluateAfterEvent(userId) {
  try { return await evaluateAchievements(userId); }
  catch (error) { console.error('ACHIEVEMENT EVALUATION:', error); return []; }
}

module.exports = { seedDefinitions, getAchievementDefinitions, getUserAchievementProgress, evaluateAchievements, evaluateAfterEvent, unlockAchievements: evaluateAchievements, getAchievementSummary, overview, condition };
