const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { User, UserProfile } = require('../models');
const { getSettingValue } = require('./settings.service');

const SUBTESTS = require('../config/subtests').map(({ code, name }) => [code, name]);
const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const query = (sql, userId) => sequelize.query(sql, { bind: { userId }, type: QueryTypes.SELECT });
const numeric = value => value == null ? null : Number(value);
const jakartaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function stage(id, title, description, progress, detail) {
  return { id, title, description, progress: clamp(progress), detail };
}

async function buildUserRoadmap(userId) {
  const [user, profile, targets, materialRows, materialProgressRows, progressRows, totals, recapRows, recapTotals, settings] = await Promise.all([
    User.findByPk(userId, { attributes: ['user_id', 'nama', 'foto_profile', 'role', 'is_activate'] }),
    UserProfile.findOne({ where: { user_id: userId }, attributes: ['sekolah', 'kelas', 'tahun_lulus'] }),
    query(`SELECT k.nama AS campus,k.singkatan AS campus_short,p.nama AS program,ut.target_score FROM user_targets ut LEFT JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(ut.pilihan)='array' THEN ut.pilihan->0 END AS choice) first_choice ON true LEFT JOIN prodi p ON p.kode_snbt=CASE WHEN jsonb_typeof(first_choice.choice) IN ('string','number') THEN first_choice.choice #>> '{}' WHEN jsonb_typeof(first_choice.choice)='object' THEN COALESCE(first_choice.choice->>'prodi_code',first_choice.choice->>'kode_snbt') END LEFT JOIN kampus_ptn k ON k.id=COALESCE(p.kampus_id,CASE WHEN first_choice.choice #>> '{}' ~ '^\\d{1,3}$' THEN (first_choice.choice #>> '{}')::int END) WHERE ut.user_id=$userId LIMIT 1`, userId),
    sequelize.query("SELECT subtest,COUNT(*)::int AS total FROM materials WHERE status='active' GROUP BY subtest", { type: QueryTypes.SELECT }),
    query("SELECT m.subtest,COUNT(*)::int AS completed FROM user_material_progress ump JOIN materials m ON m.id=ump.material_id WHERE ump.user_id=$userId AND ump.status='completed' AND m.status='active' GROUP BY m.subtest", userId),
    query(`SELECT m.subtest,COALESCE(SUM(sp.soal_dikerjakan),0)::int AS questions_attempted,COALESCE(SUM(sp.soal_benar),0)::int AS correct,COALESCE(SUM(sp.waktu_belajar),0)::int AS study_minutes FROM study_progress sp JOIN materials m ON m.id=sp.materi_id WHERE sp.user_id=$userId GROUP BY m.subtest`, userId),
    query(`SELECT COUNT(*)::int AS entries,COALESCE(SUM(soal_dikerjakan),0)::int AS questions,COALESCE(SUM(soal_benar),0)::int AS correct,COALESCE(SUM(waktu_belajar),0)::int AS study_minutes,COUNT(DISTINCT (created_at AT TIME ZONE 'Asia/Jakarta')::date)::int AS active_days FROM study_progress WHERE user_id=$userId`, userId),
    query(`SELECT recap_id,recap_at,total_score,platform,pu,ppu,pbm,pk,lbi,lbe,pm FROM tryout_recap WHERE user_id=$userId ORDER BY recap_at DESC,recap_id DESC LIMIT 12`, userId),
    query('SELECT COUNT(*)::int AS total,MAX(total_score) AS best_score FROM tryout_recap WHERE user_id=$userId', userId),
    Promise.all(['active_snbt_year','snbt_exam_date','focus_accuracy_threshold','default_daily_question_target','roadmap_practice_target','roadmap_min_tryout_recaps','roadmap_final_review_days'].map(key => getSettingValue(key))),
  ]);
  if (!user) return null;
  const [year, examDate, focusThreshold, dailyQuestionTarget, practiceTarget, minRecaps, finalReviewDays] = settings;
  const targetRow = targets[0];
  const target = targetRow ? { campus: targetRow.campus || null, campus_short: targetRow.campus_short || null, program: targetRow.program || null, target_score: numeric(targetRow.target_score) } : null;
  const today = jakartaDay();
  const daysRemaining = examDate ? Math.ceil((Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const countdown = { exam_date: examDate || null, days_remaining: daysRemaining, is_over: daysRemaining != null && daysRemaining < 0 };
  const materialMap = new Map(materialRows.map(row => [row.subtest, row]));
  const materialProgressMap = new Map(materialProgressRows.map(row => [row.subtest, row]));
  const progressMap = new Map(progressRows.map(row => [row.subtest, row]));
  const subtests = SUBTESTS.map(([code, name]) => {
    const total = Number(materialMap.get(code)?.total || 0);
    const progress = progressMap.get(code) || {};
    const completed = Number(materialProgressMap.get(code)?.completed || 0);
    const questions = Number(progress.questions_attempted || 0);
    const accuracy = questions ? Math.round(1000 * Number(progress.correct || 0) / questions) / 10 : null;
    const strength = accuracy == null ? 'no_data' : accuracy >= 80 ? 'strong' : accuracy >= 65 ? 'stable' : accuracy >= Number(focusThreshold) ? 'needs_attention' : 'priority';
    return { code, name, topics_completed: Math.min(completed, total), topics_total: total, progress: total ? clamp(100 * completed / total) : 0, questions_attempted: questions, accuracy, strength, recommended_action: total > completed ? 'Lanjutkan materi' : accuracy != null && accuracy < Number(focusThreshold) ? 'Review materi' : questions ? 'Pertahankan latihan' : 'Mulai belajar' };
  });
  const totalTopics = subtests.reduce((sum, row) => sum + row.topics_total, 0);
  const completedTopics = subtests.reduce((sum, row) => sum + row.topics_completed, 0);
  const overall = totals[0];
  const latest = recapRows[0], previous = recapRows[1];
  const score = numeric(latest?.total_score);
  const targetScore = target?.target_score;
  const recapCount = Number(recapTotals[0].total);
  const tryout = { total_recap: recapCount, latest_score: score, previous_score: numeric(previous?.total_score), delta: latest && previous ? Math.round((score - Number(previous.total_score)) * 10) / 10 : null, best_score: numeric(recapTotals[0].best_score), gap_to_target: score != null && targetScore != null ? Math.round((score - targetScore) * 10) / 10 : null, trend: recapRows.slice(0, 10).reverse().map(row => ({ recap_id: row.recap_id, recap_at: row.recap_at, total_score: Number(row.total_score), platform: row.platform })) };
  const performance = SUBTESTS.map(([code, name]) => {
    const latestScore = numeric(latest?.[code.toLowerCase()]);
    const study = subtests.find(row => row.code === code);
    return { code, name, value: latestScore ?? study.accuracy, source: latestScore != null ? 'tryout_score' : study.accuracy != null ? 'practice_accuracy' : 'no_data' };
  }).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const latestScores = performance.filter(row => row.source === 'tryout_score').map(row => row.value);
  const averageSubtestScore = latestScores.length ? Math.round(latestScores.reduce((sum, value) => sum + value, 0) / latestScores.length * 10) / 10 : null;
  const concept = totalTopics ? clamp(100 * completedTopics / totalTopics) : 0;
  const practice = clamp(100 * Number(overall.questions) / Number(practiceTarget));
  const accuracy = Number(overall.questions) ? clamp(100 * Number(overall.correct) / Number(overall.questions)) : 0;
  const recap = clamp(100 * recapCount / Number(minRecaps));
  const consistency = clamp(100 * Number(overall.active_days) / 7);
  const readiness = { percentage: clamp(concept * .30 + practice * .25 + accuracy * .20 + recap * .15 + consistency * .10), components: { concept, practice, accuracy, tryout: recap, consistency }, formula: { concept: 30, practice: 25, accuracy: 20, tryout: 15, consistency: 10 } };
  const foundationChecks = [user.is_activate === true, Boolean(target?.campus && target?.program), Number(overall.entries) > 0 || recapRows.length > 0];
  const foundation = clamp(100 * foundationChecks.filter(Boolean).length / foundationChecks.length);
  const finalOpen = daysRemaining != null && daysRemaining >= 0 && daysRemaining <= Number(finalReviewDays);
  const stageList = [
    stage(1, 'Fondasi & Pemetaan Awal', 'Lengkapi profil, target, dan pemetaan kemampuan awal.', foundation, `${foundationChecks.filter(Boolean).length} dari 3 langkah`),
    stage(2, 'Pendalaman Konsep & Materi', 'Kuasai konsep dari tujuh subtes SNBT.', concept, `${completedTopics} / ${totalTopics} modul`),
    stage(3, 'Latihan Soal Intensif', 'Tingkatkan ketepatan melalui latihan soal.', practice, `${overall.questions} / ${practiceTarget} soal`),
    stage(4, 'Evaluasi & Rekap Tryout Berkala', 'Catat hasil tryout eksternal dan evaluasi skor.', recap, `${recapCount} hasil tercatat`),
    stage(5, 'Final Review & Peak Preparation', 'Tinjau kembali kelemahan menjelang SNBT.', finalOpen ? readiness.percentage : 0, finalOpen ? 'Masa final review' : daysRemaining == null ? 'Tanggal ujian belum ditetapkan' : `Dibuka H-${finalReviewDays}`),
  ];
  const opened = [true, foundation === 100 || concept > 0, foundation === 100 || concept >= 60 || Number(overall.questions) > 0, Number(overall.questions) > 0 || recapCount > 0, finalOpen || readiness.percentage >= 80];
  const currentStage = stageList.find(row => opened[row.id - 1] && row.progress < 100)?.id || (opened[4] ? 5 : 4);
  stageList.forEach((row, index) => { row.status = index + 1 === currentStage ? 'active' : row.progress >= 100 && index < 4 ? 'completed' : opened[index] ? 'available' : 'locked'; });
  const focus = subtests.filter(row => row.topics_total > 0 || row.questions_attempted > 0).sort((a, b) => {
    const aPriority = a.accuracy == null ? a.progress : Math.min(a.progress, a.accuracy);
    const bPriority = b.accuracy == null ? b.progress : Math.min(b.progress, b.accuracy);
    return aPriority - bPriority;
  })[0];
  const recommendation = focus ? { title: `Fokus pada ${focus.name}`, description: focus.topics_total > focus.topics_completed ? `Lanjutkan materi ${focus.name}; ${focus.topics_completed} dari ${focus.topics_total} modul tercatat. Target harianmu ${dailyQuestionTarget} soal jika latihan tersedia.` : `Tinjau kembali ${focus.name} dan tingkatkan akurasi latihan dari ${focus.accuracy ?? 0}%.`, subtest_code: focus.code, estimated_minutes: Number(overall.entries) ? Math.max(10, Math.round(Number(overall.study_minutes) / Number(overall.entries))) : null, reason: focus.accuracy != null && focus.accuracy < Number(focusThreshold) ? 'Akurasi di bawah ambang fokus' : 'Progres materi paling rendah' } : { title: 'Mulai perjalanan belajarmu', description: 'Materi aktif belum tersedia. Lengkapi target dan pantau kembali progresmu saat materi tersedia.', subtest_code: null, estimated_minutes: null, reason: 'Belum ada materi aktif' };
  const tip = focus?.accuracy != null && focus.accuracy < Number(focusThreshold) ? { title: 'Tips MatrIQ Hari Ini', content: `Akurasi ${focus.name} masih ${focus.accuracy}%. Review kesalahan dan ulangi konsep yang belum kuat.` } : { title: 'Tips MatrIQ Hari Ini', content: 'Belajar konsisten dalam sesi singkat membantu menjaga pemahaman konsep dari hari ke hari.' };
  const milestones = [];
  if (!target?.campus || !target?.program) milestones.push({ type: 'target', title: 'Lengkapi target kampus dan prodi', due_at: null, progress: 0, path: '/profile' });
  if (totalTopics > completedTopics) milestones.push({ type: 'study', title: `Selesaikan materi ${focus?.name || 'SNBT'}`, due_at: null, progress: concept, path: '#subtests' });
  if (Number(overall.questions) < Number(practiceTarget)) milestones.push({ type: 'practice', title: `Capai ${practiceTarget} soal latihan`, due_at: null, progress: practice, path: '#stages' });
  if (recapCount < Number(minRecaps)) milestones.push({ type: 'tryout_recap', title: `Catat ${minRecaps} hasil tryout eksternal`, due_at: null, progress: recap, path: '#tryout' });
  if (examDate && daysRemaining >= 0) milestones.push({ type: 'exam', title: 'SNBT', due_at: examDate, progress: 0, path: null });
  return { user: user.toJSON(), profile: profile?.toJSON() || null, snbt_year: Number(year), target, countdown, readiness, current_stage: currentStage, stages: stageList, active_stage: stageList[currentStage - 1], subtests, daily_recommendation: recommendation, tip, milestones: milestones.slice(0, 5), tryout, subtest_performance: performance, average_subtest_score: averageSubtestScore, study_summary: { total_questions: Number(overall.questions), total_study_minutes: Number(overall.study_minutes), completed_materials: completedTopics, total_materials: totalTopics } };
}

module.exports = { buildUserRoadmap };
