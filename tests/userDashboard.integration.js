require('dotenv').config();
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const app=require('../src/app');
const {sequelize}=require('../src/config/database');
const {User,StudyProgress,TryoutRecap}=require('../src/models');

async function main(){
  await require('../src/services/practiceMigration.service').preparePracticeSchema();
  await sequelize.sync();
  const user=await User.findOne({where:{role:2},order:[['user_id','ASC']]});
  if(!user){console.log('User dashboard checks skipped: no student account');await sequelize.close();return;}
  const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}/api/user/dashboard`;
  const token=(role,id=user.user_id)=>jwt.sign({user_id:id,role},process.env.JWT_SECRET,{expiresIn:'5m'});
  const get=(role=2,id=user.user_id,query='')=>fetch(base+query,{headers:{Authorization:`Bearer ${token(role,id)}`}});
  let progress,recap;
  try{
    assert.equal((await get(1)).status,403);
    assert.equal((await get(3)).status,403);
    const before=(await (await get()).json()).data;
    assert.ok(!Object.hasOwn(before.user,'password'));
    progress=await StudyProgress.create({user_id:user.user_id,materi_id:null,soal_dikerjakan:10,soal_benar:7,soal_salah:3,akurasi:70,waktu_belajar:25});
    recap=await TryoutRecap.create({user_id:user.user_id,pu:700,ppu:710,pbm:720,pk:690,lbi:730,lbe:705,pm:680,total_score:712,platform:'Integration Test',tryout_name:'Test Recap'});
    const after=(await (await get(2,user.user_id,'?user_id=999999')).json()).data;
    assert.equal(after.user.user_id,user.user_id);
    assert.equal(after.stats.total_questions,before.stats.total_questions+10);
    assert.equal(after.stats.total_study_minutes,before.stats.total_study_minutes+25);
    assert.ok(after.stats.streak_days>=1);
    assert.equal(after.daily_progress.completed_questions,before.daily_progress.completed_questions+10);
    assert.equal(after.tryout.total_recap,before.tryout.total_recap+1);
    assert.ok(after.recent_activities.some(item=>item.kind==='study'));
    assert.ok(after.recent_activities.some(item=>item.kind==='tryout'));
    assert.ok(after.subtest_performance.find(item=>item.code==='PM').average_score!=null);
    console.log('User dashboard integration checks passed');
  }finally{if(progress)await progress.destroy();if(recap)await recap.destroy();await new Promise(resolve=>server.close(resolve));await sequelize.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
