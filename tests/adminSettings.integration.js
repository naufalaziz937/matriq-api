require('dotenv').config();
const assert=require('node:assert/strict');
const jwt=require('jsonwebtoken');
const app=require('../src/app');
const {sequelize}=require('../src/config/database');
const AppSetting=require('../src/models/AppSetting');
const settings=require('../src/services/settings.service');
require('../src/models');

async function main() {
  await sequelize.sync(); await settings.seedDefaults();
  const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;
  const token=role=>jwt.sign({user_id:999999,role},process.env.JWT_SECRET,{expiresIn:'5m'});
  const call=(path,role=1,options={})=>fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer ${token(role)}`}:{})}});
  const original=await AppSetting.findOne({where:{key:'support_contact'}});
  const old=original.toJSON();
  const originalWhatsapp=(await AppSetting.findOne({where:{key:'support_whatsapp'}})).toJSON();
  const originalInstagram=(await AppSetting.findOne({where:{key:'support_instagram'}})).toJSON();
  const maintenanceRow=await AppSetting.findOne({where:{key:'maintenance_mode'}});
  const oldMaintenance=maintenanceRow.toJSON();
  const registrationRow=await AppSetting.findOne({where:{key:'registration_enabled'}});
  const oldRegistration=registrationRow.toJSON();
  try {
    assert.equal((await call('/api/admin/settings',2)).status,403);
    assert.equal((await call('/api/admin/settings',3,{method:'PUT',body:'{}'})).status,403);
    const publicResult=await (await call('/api/settings/public',null)).json();
    assert.ok(publicResult.data.general.app_name);
    assert.equal(typeof publicResult.data.general.support_whatsapp,'string');
    assert.equal(typeof publicResult.data.general.support_instagram,'string');
    assert.equal(publicResult.data.security,undefined);
    assert.equal(publicResult.data.users.minimum_password_length,undefined);
    const before=await (await call('/api/admin/settings')).json();
    assert.ok(before.data.security.minimum_password_length>=8);
    assert.equal((await call('/api/admin/settings',1,{method:'PUT',body:JSON.stringify({security:{JWT_SECRET:'bad'}})})).status,400);
    assert.equal((await call('/api/admin/settings',1,{method:'PUT',body:JSON.stringify({security:{minimum_password_length:4}})})).status,400);
    assert.equal((await call('/api/admin/settings',1,{method:'PUT',body:JSON.stringify({general:{support_whatsapp:'123',support_instagram:'https://example.com/bad'}})})).status,400);
    const saved=await call('/api/admin/settings',1,{method:'PUT',body:JSON.stringify({general:{support_contact:'__settings_integration_test__'}})});
    assert.equal(saved.status,200);
    assert.equal((await (await call('/api/admin/settings')).json()).data.general.support_contact,'__settings_integration_test__');
    const supportSaved=await call('/api/admin/settings',1,{method:'PUT',body:JSON.stringify({general:{support_whatsapp:'628123456789',support_instagram:'matriq.id'}})});
    assert.equal(supportSaved.status,200);
    const publicSupport=(await (await call('/api/settings/public',null)).json()).data.general;
    assert.equal(publicSupport.support_whatsapp,'628123456789');
    assert.equal(publicSupport.support_instagram,'matriq.id');
    assert.equal((await (await call('/api/admin/settings/system-status')).json()).data.api,'online');
    await settings.setSettingsBulk({users:{registration_enabled:false}},999999);
    assert.equal((await call('/api/auth/register',null,{method:'POST',body:JSON.stringify({nama:'Test',email:'test-settings@example.com',password:'password123'})})).status,403);
    await AppSetting.update({value:oldRegistration.value,updated_by:oldRegistration.updated_by,updated_at:oldRegistration.updated_at},{where:{key:'registration_enabled'},silent:true});
    if (!oldMaintenance.value) {
      await settings.setSettingsBulk({system:{maintenance_mode:true}},999999);
      assert.equal((await call('/api/admin/settings',2)).status,503);
      assert.equal((await call('/api/admin/settings',1)).status,200);
      assert.equal((await call('/api/settings/public',null)).status,200);
    }
    console.log('Settings integration checks passed');
  } finally {
    await AppSetting.update({value:old.value,updated_by:old.updated_by,updated_at:old.updated_at},{where:{key:'support_contact'},silent:true});
    await AppSetting.update({value:originalWhatsapp.value,updated_by:originalWhatsapp.updated_by,updated_at:originalWhatsapp.updated_at},{where:{key:'support_whatsapp'},silent:true});
    await AppSetting.update({value:originalInstagram.value,updated_by:originalInstagram.updated_by,updated_at:originalInstagram.updated_at},{where:{key:'support_instagram'},silent:true});
    await AppSetting.update({value:oldMaintenance.value,updated_by:oldMaintenance.updated_by,updated_at:oldMaintenance.updated_at},{where:{key:'maintenance_mode'},silent:true});
    await AppSetting.update({value:oldRegistration.value,updated_by:oldRegistration.updated_by,updated_at:oldRegistration.updated_at},{where:{key:'registration_enabled'},silent:true});
    await new Promise(resolve=>server.close(resolve)); await sequelize.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
