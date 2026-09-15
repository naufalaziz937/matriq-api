require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
const { User, Material, Question, PracticeSession, PracticeAnswer, StudyProgress } = require('../src/models');

async function main() {
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await sequelize.sync();
  const user = await User.findOne({ where: { role: 2 } });
  if (!user) { console.log('Practice checks skipped: no student account'); await sequelize.close(); return; }
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/user/practice`;
  const request = (path = '', method = 'GET', body, role = 2, id = user.user_id) => fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign({ user_id: id, role }, process.env.JWT_SECRET, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let material, sessionId;
  const questionIds = [];
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await request('', 'GET', null, 1)).status, 403);
    assert.equal((await request('', 'GET', null, 3)).status, 403);
    const overview = await request();
    assert.equal(overview.status, 200);
    assert.equal((await overview.json()).data.subtests.length, 7);
    material = await Material.create({ title: 'Materi Tes Practice', description: 'Integration', subtest: 'PK', category: 'Tes', status: 'active', file_key: `practice-test-${Date.now()}`, file_name: 'test.pdf', file_mime: 'application/pdf', file_size: 1, created_by_id: user.user_id });
    const options = ['A','B','C','D','E'].map((key, index) => ({ key, text: `Opsi ${index}` }));
    for (let i = 0; i < 5; i++) {
      const question = await Question.create({ question: `Berapa hasil ${i}+2?`, subtest: 'PK', category: 'Tes', difficulty: 'easy', difficulty_level: 1, material_id: material.id, options, correct_answer: 'A', explanation: 'Pembahasan tes.', status: 'active', created_by_id: user.user_id });
      questionIds.push(question.id);
    }
    const draft = await Question.create({ question: 'Soal draft tidak boleh muncul', subtest: 'PK', category: 'Tes', difficulty: 'easy', difficulty_level: 1, material_id: material.id, options, correct_answer: 'A', explanation: 'Draft.', status: 'draft', created_by_id: user.user_id });
    questionIds.push(draft.id);
    const levels = (await (await request(`/materials/${material.id}/levels`)).json()).data;
    assert.equal(levels.levels[0].available_questions, 5);
    const materialList = await request('/subtests/PK/materials');
    assert.equal(materialList.status, 200);
    assert.ok((await materialList.json()).data.some(item => item.id === material.id && item.available_questions === 5));
    assert.equal((await request('/session', 'POST', { material_id: material.id, difficulty_level: 1, question_count: 10 })).status, 400);
    const started = await request('/session', 'POST', { material_id: material.id, difficulty_level: 1, question_count: 5, user_id: 999999 });
    assert.equal(started.status, 201);
    const session = (await started.json()).data;
    sessionId = session.session_id;
    assert.equal(session.questions.length, 5);
    assert.ok(session.questions.every(row => !Object.hasOwn(row, 'correct_answer') && !Object.hasOwn(row, 'explanation') && !row.question.includes('draft')));
    assert.equal((await request(`/session/${sessionId}`, 'GET', null, 2, 999999)).status, 404);
    assert.equal((await request(`/session/${sessionId}/answer`, 'POST', { question_id: session.questions[0].question_id, selected_answer: 'A' }, 2, 999999)).status, 404);
    assert.equal((await request(`/session/${sessionId}/result`)).status, 409);
    const before = await StudyProgress.sum('soal_dikerjakan', { where: { user_id: user.user_id, materi_id: material.id } }) || 0;
    const answered = await request(`/session/${sessionId}/answer`, 'POST', { question_id: session.questions[0].question_id, selected_answer: 'A', time_spent_seconds: 10 });
    assert.equal(answered.status, 200);
    assert.equal((await answered.json()).data.correct_answer, 'A');
    const resumed = (await (await request(`/session/${sessionId}`)).json()).data;
    assert.equal(resumed.questions.find(item => item.question_id === session.questions[0].question_id).feedback.correct_answer, 'A');
    assert.ok(resumed.questions.filter(item => !item.answered).every(item => !Object.hasOwn(item, 'feedback') && !Object.hasOwn(item, 'correct_answer')));
    assert.equal((await request(`/session/${sessionId}/answer`, 'POST', { question_id: session.questions[0].question_id, selected_answer: 'B' })).status, 409);
    const completed = await request(`/session/${sessionId}/complete`, 'PUT');
    assert.equal(completed.status, 200);
    const result = (await completed.json()).data;
    assert.equal(result.correct_count, 1);
    assert.equal(result.unanswered_count, 4);
    assert.equal(result.review.length, 5);
    await request(`/session/${sessionId}/complete`, 'PUT');
    const after = await StudyProgress.sum('soal_dikerjakan', { where: { user_id: user.user_id, materi_id: material.id } }) || 0;
    assert.equal(after - before, 1);
    console.log('User Practice integration checks passed');
  } finally {
    if (sessionId) { await StudyProgress.destroy({ where: { user_id: user.user_id, materi_id: material?.id } }); await PracticeAnswer.destroy({ where: { session_id: sessionId } }); await PracticeSession.destroy({ where: { session_id: sessionId } }); }
    if (questionIds.length) await Question.destroy({ where: { id: questionIds } });
    if (material) await material.destroy();
    await new Promise(resolve => server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
