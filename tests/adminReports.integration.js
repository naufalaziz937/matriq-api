require('dotenv').config();
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { sequelize } = require('../src/config/database');
require('../src/models');
const { csv, xlsx } = require('../src/utils/reportFiles');

async function main() {
  await sequelize.sync();
  const server=app.listen(0);
  const base=`http://127.0.0.1:${server.address().port}/api/admin/reports`;
  const token=role=>jwt.sign({user_id:999999,role},process.env.JWT_SECRET,{expiresIn:'5m'});
  const get=(path,role=1)=>fetch(base+path,{headers:{Authorization:`Bearer ${token(role)}`}});
  try {
    assert.equal((await get('/types',2)).status,403);
    assert.equal((await get('/users/preview',3)).status,403);
    assert.equal((await get('/users/export/csv',2)).status,403);
    const previewResponse=await get('/users/preview?role=2');
    assert.equal(previewResponse.status,200);
    const preview=(await previewResponse.json()).data;
    assert.ok(preview.rows.length<=20);
    assert.ok(!preview.columns.includes('password'));
    const exportResponse=await get('/users/export/csv?role=2');
    assert.equal(exportResponse.status,200);
    const bytes=Buffer.from(await exportResponse.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf]);
    const body=bytes.toString('utf8');
    assert.ok(!body.split('\r\n')[0].includes('password'));
    assert.equal(body.trim().split('\r\n').length-1,preview.total);
    const filtered=await get('/users/preview?role=2&date_from=2099-01-01');
    assert.equal((await filtered.json()).data.total,0);
    assert.equal((await get('/study-progress/export/xlsx')).status,409);
    assert.equal((await get('/users/preview?date_from=2026-09-14&date_to=2020-01-01')).status,400);
    assert.ok(csv(['value'],[{value:'=1+1'}]).includes("'=1+1"));
    const file=xlsx(['value','score'],[{value:'alpha',score:10}]);
    assert.equal(file.readUInt32LE(0),0x04034b50);
    console.log('Reports integration checks passed');
  } finally {
    await sequelize.query('DELETE FROM report_exports WHERE admin_id=999999');
    await new Promise(resolve=>server.close(resolve));
    await sequelize.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
