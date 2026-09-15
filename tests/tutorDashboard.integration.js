require('dotenv').config();
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const app=require('../src/app');
const {sequelize}=require('../src/config/database');
const {Question,Material}=require('../src/models');
const {removeFile}=require('../src/controllers/adminMaterial.controller');
require('../src/models');
async function main(){
  const [tutors]=await sequelize.query('SELECT user_id FROM users WHERE role=3 ORDER BY user_id LIMIT 1');
  if(!tutors.length){console.log('Tutor ownership checks skipped: no tutor account');await sequelize.close();return;}
  const userId=tutors[0].user_id,server=app.listen(0),base=`http://127.0.0.1:${server.address().port}/api`;
  const token=(role,id=userId)=>jwt.sign({user_id:id,role},process.env.JWT_SECRET,{expiresIn:'5m'});
  const call=(path,role=3,id=userId,method='GET')=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token(role,id)}`}});
  let createdQuestion=null,createdMaterial=null;
  try{
    assert.equal((await call('/tutor/dashboard',2)).status,403);
    assert.equal((await call('/admin/users',3)).status,403);
    const result=await call('/tutor/dashboard');assert.equal(result.status,200);
    const data=(await result.json()).data;
    const [count]=await sequelize.query('SELECT COUNT(*)::int total FROM questions WHERE created_by_id=$id',{bind:{id:userId}});
    assert.equal(data.summary.total_questions,count[0].total);
    assert.ok(data.recent_content.every(item=>['Soal','Materi'].includes(item.type)));
    const insight=(await (await call('/tutor/student-insights')).json()).data;
    assert.equal(insight.available,false);
    assert.equal(JSON.stringify(insight).includes('email'),false);
    const [foreignQuestions]=await sequelize.query('SELECT id FROM questions WHERE created_by_id<>$id LIMIT 1',{bind:{id:userId}});
    if(foreignQuestions.length){const id=foreignQuestions[0].id;assert.equal((await call(`/tutor/questions/${id}`)).status,404);assert.equal((await call(`/tutor/questions/${id}`,3,userId,'DELETE')).status,404);}
    const [foreignMaterials]=await sequelize.query('SELECT id FROM materials WHERE created_by_id<>$id LIMIT 1',{bind:{id:userId}});
    if(foreignMaterials.length){const id=foreignMaterials[0].id;assert.equal((await call(`/tutor/materials/${id}`)).status,404);assert.equal((await call(`/tutor/materials/${id}/file`)).status,404);}
    const questionPayload={question:'Soal integrasi Tutor MatrIQ?',subtest:'PU',category:'Integrasi',difficulty:'easy',options:['A','B','C','D','E'].map(key=>({key,text:`Pilihan ${key}`})),correct_answer:'A',explanation:'Pembahasan pengujian.',status:'draft',created_by_id:999999};
    const questionResponse=await fetch(base+'/tutor/questions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token(3)}`},body:JSON.stringify(questionPayload)});
    assert.equal(questionResponse.status,201);
    createdQuestion=(await questionResponse.json()).data.id;
    const question=await Question.findByPk(createdQuestion);assert.equal(question.created_by_id,userId);assert.equal(question.status,'draft');
    assert.equal((await call(`/tutor/questions/${createdQuestion}`,3,999999)).status,404);
    assert.equal((await call(`/tutor/questions/${createdQuestion}/submit`,3,userId,'PUT')).status,200);
    const form=new FormData();form.set('title','Materi Integrasi Tutor');form.set('description','Pengujian upload');form.set('subtest','PU');form.set('category','Integrasi');form.set('status','active');form.set('created_by_id','999999');form.set('file',new Blob(['Materi uji'],{type:'text/plain'}),'test.txt');
    const materialResponse=await fetch(base+'/tutor/materials',{method:'POST',headers:{Authorization:`Bearer ${token(3)}`},body:form});
    assert.equal(materialResponse.status,201);
    createdMaterial=(await materialResponse.json()).data.id;
    const material=await Material.findByPk(createdMaterial);assert.equal(material.created_by_id,userId);assert.equal(material.status,'draft');
    assert.equal((await call(`/tutor/materials/${createdMaterial}`,3,999999)).status,404);
    assert.equal((await call(`/tutor/materials/${createdMaterial}/submit`,3,userId,'PUT')).status,200);
    console.log('Tutor dashboard and ownership checks passed');
  }finally{if(createdQuestion)await Question.destroy({where:{id:createdQuestion}});if(createdMaterial){const item=await Material.findByPk(createdMaterial);if(item){const key=item.file_key;await item.destroy();await removeFile(key);}}await new Promise(resolve=>server.close(resolve));await sequelize.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
