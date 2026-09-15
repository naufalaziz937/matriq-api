const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { getSettingValue } = require('./settings.service');
const { overview: recapOverview } = require('./userTryoutRecap.service');
const SUBTESTS = require('../config/subtests');

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const iso = value => new Date(value).toISOString().slice(0, 10);
const add = (date, days) => iso(Date.parse(`${date}T00:00:00Z`) + days * 86400000);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && iso(`${value}T00:00:00Z`) === value;
const pct = (part, total) => total ? Math.round(part / total * 1000) / 10 : null;
const round = value => Math.round(Number(value) * 10) / 10;
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const number = value => value == null ? null : Number(value);
const status = (accuracy, attempts) => attempts < 10 ? 'Data Belum Cukup' : accuracy >= 80 ? 'Kuat' : accuracy >= 70 ? 'Stabil' : accuracy >= 60 ? 'Berkembang' : 'Perlu Fokus';
const weekday = date => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${date}T00:00:00Z`));

function period(query = {}) {
  const range = query.range || '30d';
  if (!['7d', '30d', '3m', '6m', 'all'].includes(range)) fail('Filter periode tidak valid.');
  const today = day(new Date());
  const custom = query.date_from != null || query.date_to != null;
  if (custom && (!validDate(query.date_from) || !validDate(query.date_to))) fail('Rentang tanggal tidak valid.');
  if (custom && (query.date_from > query.date_to || query.date_to > today || (Date.parse(query.date_to) - Date.parse(query.date_from)) / 86400000 > 730)) fail('Rentang tanggal harus maksimal 730 hari dan tidak boleh melewati hari ini.');
  const days = { '7d': 7, '30d': 30, '3m': 90, '6m': 180 }[range] || null;
  const from = custom ? query.date_from : days ? add(today, -(days - 1)) : null;
  const to = custom ? query.date_to : today;
  const length = from ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : null;
  return { range: custom ? 'custom' : range, from, to, previous_from: length ? add(from, -length) : null, previous_to: length ? add(from, -1) : null };
}

async function rows(sql, userId, from, to) {
  return sequelize.query(sql, { bind: { userId, from, to }, type: QueryTypes.SELECT });
}
const filter = field => `AND ($from::date IS NULL OR (${field} AT TIME ZONE 'Asia/Jakarta')::date >= $from::date) AND (${field} AT TIME ZONE 'Asia/Jakarta')::date <= $to::date`;
const practiceSql = `SELECT ps.session_id, ps.subtest, ps.material_id, m.title AS material_title, ps.difficulty_level, ps.duration_seconds, ps.completed_at, (ps.completed_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day, COUNT(pa.answer_id) FILTER (WHERE pa.selected_answer IS NOT NULL)::int AS answered, COUNT(pa.answer_id) FILTER (WHERE pa.selected_answer IS NOT NULL AND pa.is_correct IS TRUE)::int AS correct FROM practice_sessions ps LEFT JOIN practice_answers pa ON pa.session_id=ps.session_id LEFT JOIN materials m ON m.id=ps.material_id WHERE ps.user_id=$userId AND ps.status='completed' ${filter('ps.completed_at')} GROUP BY ps.session_id,m.title ORDER BY ps.completed_at ASC,ps.session_id ASC`;
const progressSql = `SELECT (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day, COALESCE(SUM(waktu_belajar),0)::int AS minutes, COALESCE(SUM(soal_dikerjakan),0)::int AS recorded_questions FROM study_progress WHERE user_id=$userId ${filter('created_at')} GROUP BY 1 ORDER BY 1`;
const recapSql = `SELECT recap_id,recap_at,(recap_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day,total_score,platform,tryout_name,pu,ppu,pbm,pk,lbi,lbe,pm FROM tryout_recap WHERE user_id=$userId ${filter('recap_at')} ORDER BY recap_at ASC,recap_id ASC`;
const plansSql = `SELECT plan_id,(start_at AT TIME ZONE 'Asia/Jakarta')::date::text AS day,status FROM study_plans WHERE user_id=$userId ${filter('start_at')} AND status <> 'cancelled' ORDER BY start_at ASC`;

function split(rows, p) {
  return { current: rows.filter(row => row.day >= (p.from || '0000-01-01') && row.day <= p.to), previous: p.previous_from ? rows.filter(row => row.day >= p.previous_from && row.day <= p.previous_to) : [] };
}
function practiceTotals(rows) {
  const answered = sum(rows, 'answered'), correct = sum(rows, 'correct');
  return { total_sessions: rows.length, questions_attempted: answered, correct, wrong: answered - correct, accuracy: pct(correct, answered), average_session_seconds: rows.length ? Math.round(sum(rows, 'duration_seconds') / rows.length) : null };
}
function dateSeries(from, to, maximum = 180) {
  const start = from && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 < maximum ? from : add(to, -(maximum - 1));
  const result = [];
  for (let date = start; date <= to; date = add(date, 1)) result.push(date);
  return result;
}
function streak(days, to) {
  const set = new Set(days), today = day(new Date());
  let current = to < today ? to : today;
  if (!set.has(current) && to >= today) current = add(current, -1);
  let count = 0;
  while (set.has(current)) { count++; current = add(current, -1); }
  return count;
}

async function analytics(userId, query = {}) {
  const p = period(query), from = p.previous_from || p.from;
  const [allPractice, allProgress, allRecaps, allPlans, globalRecap, year] = await Promise.all([
    rows(practiceSql, userId, from, p.to), rows(progressSql, userId, from, p.to), rows(recapSql, userId, from, p.to), rows(plansSql, userId, p.from, p.to), recapOverview(userId), getSettingValue('active_snbt_year'),
  ]);
  const practiceSplit = split(allPractice, p), progressSplit = split(allProgress, p), recapSplit = split(allRecaps, p);
  const sessions = practiceSplit.current, progress = progressSplit.current, recaps = recapSplit.current, plans = allPlans;
  const practice = practiceTotals(sessions), previousPractice = practiceTotals(practiceSplit.previous);
  const studyMinutes = sum(progress, 'minutes'), previousMinutes = sum(progressSplit.previous, 'minutes');
  const activeDays = [...new Set([...sessions.map(row => row.day), ...progress.filter(row => row.minutes > 0 || row.recorded_questions > 0).map(row => row.day)])];
  const questionsByDay = new Map(), minutesByDay = new Map();
  for (const row of sessions) questionsByDay.set(row.day, (questionsByDay.get(row.day) || 0) + Number(row.answered));
  for (const row of progress) minutesByDay.set(row.day, Number(row.minutes));
  const trendStart = p.from || [...sessions, ...progress].map(row => row.day).sort()[0] || add(p.to, -29);
  const activity_trend = dateSeries(trendStart, p.to, Infinity).map(dayValue => ({ day: dayValue, questions: questionsByDay.get(dayValue) || 0, study_minutes: minutesByDay.get(dayValue) || 0 }));
  const practice_trend = sessions.filter(row => Number(row.answered) > 0).map(row => ({ day: row.day, session_id: row.session_id, accuracy: pct(Number(row.correct), Number(row.answered)), answered: Number(row.answered) }));
  const subtests = SUBTESTS.map(({ code, name }) => { const selected = sessions.filter(row => row.subtest === code), attempted = sum(selected, 'answered'), correct = sum(selected, 'correct'); return { code, name, questions_attempted: attempted, accuracy: pct(correct, attempted), status: status(pct(correct, attempted), attempted), latest_tryout_score: number(recaps.at(-1)?.[code.toLowerCase()]) }; }).sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
  const difficulty_levels = [1, 2, 3, 4].map((level, index) => { const selected = sessions.filter(row => Number(row.difficulty_level) === level), attempted = sum(selected, 'answered'), correct = sum(selected, 'correct'), accuracy = pct(correct, attempted); return { level, name: ['Fundamental', 'Intermediate', 'Advanced', 'Mastery'][index], total_sessions: selected.length, questions_attempted: attempted, accuracy, status: status(accuracy, attempted) }; });
  const tryoutScores = recaps.map(row => Number(row.total_score));
  const tryout = { latest: recaps.length ? tryoutScores.at(-1) : null, best: recaps.length ? Math.max(...tryoutScores) : null, average: recaps.length ? round(sum(recaps, 'total_score') / recaps.length) : null, latest_all_time: globalRecap.summary.latest_score, best_all_time: globalRecap.summary.best_score, target: globalRecap.target?.target_score ?? null, campus: globalRecap.target?.campus ?? null, program: globalRecap.target?.program ?? null, gap_from_best: globalRecap.target?.target_score == null || globalRecap.summary.best_score == null ? null : Math.max(0, round(globalRecap.target.target_score - globalRecap.summary.best_score)), trend: recaps.slice(-15).map((row, index, list) => ({ day: row.day, recap_at: row.recap_at, platform: row.platform, tryout_name: row.tryout_name, total_score: Number(row.total_score), delta: index ? round(Number(row.total_score) - Number(list[index - 1].total_score)) : null })), subtests: SUBTESTS.map(({ code }) => { const key = code.toLowerCase(), scores = recaps.map(row => number(row[key])).filter(value => value != null); return { code, latest: number(recaps.at(-1)?.[key]), average: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : null }; }) };
  const targetScore = tryout.target, bestScore = tryout.best_all_time;
  const target = { campus: tryout.campus, program: tryout.program, target_score: targetScore, latest_score: tryout.latest_all_time, best_score: bestScore, gap: tryout.gap_from_best, progress: targetScore && bestScore != null ? Math.min(100, Math.max(0, round(bestScore / targetScore * 100))) : null, status: targetScore == null || bestScore == null ? null : bestScore >= targetScore ? 'Target Tercapai' : bestScore / targetScore >= .9 ? 'Mendekati Target' : bestScore / targetScore >= .7 ? 'Berkembang' : 'Masih Jauh' };
  const study_consistency = dateSeries(p.from, p.to, 84).map(dayValue => ({ day: dayValue, questions: questionsByDay.get(dayValue) || 0, study_minutes: minutesByDay.get(dayValue) || 0 }));
  const planned = plans.length, completed = plans.filter(row => row.status === 'completed').length, missed = plans.filter(row => row.status === 'missed' || (row.status === 'pending' && row.day < day(new Date()))).length;
  const weekly = new Map();
  for (const row of plans) { const monday = add(row.day, -((new Date(`${row.day}T00:00:00Z`).getUTCDay() + 6) % 7)); const entry = weekly.get(monday) || { day: monday, planned: 0, completed: 0 }; entry.planned++; if (row.status === 'completed') entry.completed++; weekly.set(monday, entry); }
  const study_plan = { planned, completed, missed, completion_rate: pct(completed, planned), weekly_trend: [...weekly.values()].sort((a, b) => a.day.localeCompare(b.day)).map(row => ({ ...row, completion_rate: pct(row.completed, row.planned) })) };
  const activeWithMinutes = progress.filter(row => Number(row.minutes) > 0), mostActive = [...progress].sort((a, b) => Number(b.minutes) - Number(a.minutes))[0];
  const study_time = { total_minutes: studyMinutes, average_active_day_minutes: activeWithMinutes.length ? Math.round(studyMinutes / activeWithMinutes.length) : null, most_active_day: mostActive?.minutes > 0 ? weekday(mostActive.day) : null, most_active_date: mostActive?.minutes > 0 ? mostActive.day : null };
  const materialMap = new Map();
  for (const row of sessions) { if (row.material_id == null) continue; const entry = materialMap.get(row.material_id) || { material_id: row.material_id, title: row.material_title || 'Materi', subtest: row.subtest, questions_attempted: 0, correct: 0, highest_level: 0 }; entry.questions_attempted += Number(row.answered); entry.correct += Number(row.correct); entry.highest_level = Math.max(entry.highest_level, Number(row.difficulty_level)); materialMap.set(row.material_id, entry); }
  const materials = [...materialMap.values()].map(row => ({ ...row, accuracy: pct(row.correct, row.questions_attempted), status: status(pct(row.correct, row.questions_attempted), row.questions_attempted) })).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  const reliable = subtests.filter(row => row.questions_attempted >= 10).sort((a, b) => b.accuracy - a.accuracy), strength = reliable[0] || null, weakness = reliable.length >= 2 ? reliable.at(-1) : null;
  const insights = [];
  if (recaps.length >= 3) { const delta = round(Number(recaps.at(-1).total_score) - Number(recaps.at(-3).total_score)); insights.push(`Skor tryout ${delta >= 0 ? 'naik' : 'turun'} ${Math.abs(delta)} poin dalam 3 rekap terakhir.`); }
  if (reliable.length >= 2) { insights.push(`${strength.code} memiliki akurasi Practice tertinggi pada periode ini (${strength.accuracy}%, ${strength.questions_attempted} soal).`); insights.push(`${weakness.code} dapat menjadi fokus berikutnya (${weakness.accuracy}%, ${weakness.questions_attempted} soal).`); }
  if (subtests.some(row => row.questions_attempted > 0 && row.questions_attempted < 10)) insights.push('Beberapa subtes belum memiliki 10 jawaban; kumpulkan lebih banyak data sebelum menarik kesimpulan.');
  if (target.gap != null) insights.push(target.gap ? `Best score tinggal ${target.gap} poin dari target ${target.target_score}.` : 'Best score sudah mencapai target.');
  if (study_plan.weekly_trend.length >= 2) { const previous = study_plan.weekly_trend.at(-2), current = study_plan.weekly_trend.at(-1); if (previous.planned >= 3 && current.planned >= 3) insights.push(`Penyelesaian Study Plan ${current.completion_rate >= previous.completion_rate ? 'naik' : 'turun'} dari ${previous.completion_rate}% menjadi ${current.completion_rate}%.`); }
  const focus = weakness || subtests.find(row => row.questions_attempted < 10) || null;
  const focusMaterial = focus ? materials.find(row => row.subtest === focus.code && row.questions_attempted >= 10) : null;
  const recommended_focus = focus ? { subtest: focus.code, name: focus.name, reason: focus.questions_attempted >= 10 ? `Akurasi Practice ${focus.accuracy}% dari ${focus.questions_attempted} jawaban.` : `Data Practice ${focus.code} belum cukup; kerjakan setidaknya 10 soal.`, material: focusMaterial?.title || null, recommended_level: difficulty_levels.find(row => row.questions_attempted >= 10 && row.accuracy < 70)?.level || 1, actions: [{ label: 'Mulai Practice', path: `/practice?subtest=${focus.code}` }, { label: 'Tambahkan ke Study Plan', path: '/study-plan' }, { label: 'Lihat Roadmap', path: '/roadmap' }] } : { subtest: null, name: 'Mulai dari Practice', reason: 'Kerjakan latihan untuk melihat fokus berdasarkan data belajarmu.', material: null, recommended_level: 1, actions: [{ label: 'Mulai Practice', path: '/practice' }, { label: 'Buat Study Plan', path: '/study-plan' }] };
  return { period: { range: p.range, from: p.from, to: p.to }, snbt_year: Number(year) || null, overview: { questions_attempted: practice.questions_attempted, questions_delta: previousPractice.questions_attempted ? practice.questions_attempted - previousPractice.questions_attempted : null, accuracy: practice.accuracy, accuracy_delta: previousPractice.accuracy == null || practice.accuracy == null ? null : round(practice.accuracy - previousPractice.accuracy), study_minutes: studyMinutes, study_minutes_delta: previousMinutes ? studyMinutes - previousMinutes : null, streak_days: streak(activeDays, p.to), latest_tryout_score: tryout.latest, latest_tryout_delta: recaps.length >= 2 ? round(tryoutScores.at(-1) - tryoutScores.at(-2)) : null, target_score: targetScore, target_progress: target.progress }, activity_trend, practice: { ...practice, trend: practice_trend }, subtests, difficulty_levels, tryout, target, study_consistency, study_plan, study_time, materials, strength, weakness, insights, recommended_focus };
}

async function ensureIndexes() {
  const qi = sequelize.getQueryInterface();
  if (await qi.tableExists('practice_sessions')) await sequelize.query('CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_completed ON practice_sessions(user_id, completed_at)');
  if (await qi.tableExists('practice_answers')) await sequelize.query('CREATE INDEX IF NOT EXISTS idx_practice_answers_session ON practice_answers(session_id)');
  if (await qi.tableExists('tryout_recap')) await sequelize.query('CREATE INDEX IF NOT EXISTS idx_tryout_recap_user ON tryout_recap(user_id)');
  if (await qi.tableExists('study_plans')) await sequelize.query('CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id)');
  if (await qi.tableExists('study_progress')) await sequelize.query('CREATE INDEX IF NOT EXISTS idx_study_progress_user ON study_progress(user_id)');
}

module.exports = { analytics, period, status, ensureIndexes };
