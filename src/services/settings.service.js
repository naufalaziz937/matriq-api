const { sequelize }=require('../config/database');
const AppSetting=require('../models/AppSetting');
const registry=require('../config/settings.registry');

function validate(key,value) {
  const spec=registry[key];
  if (!spec) throw Object.assign(new Error(`Pengaturan ${key} tidak dikenal.`),{status:400});
  const invalid=()=>{ throw Object.assign(new Error(`Nilai ${key} tidak valid.`),{status:400}); };
  if (spec.type==='boolean' && typeof value!=='boolean') invalid();
  if (spec.type==='string' && (typeof value!=='string' || value.length>(spec.maxLength||255))) invalid();
  if (key==='support_whatsapp' && value!=='' && (!/^\+?[0-9\s()-]{8,30}$/.test(value) || !/^\d{8,15}$/.test(value.replace(/[^0-9]/g,'')))) invalid();
  if (key==='support_instagram' && value!=='' && !/^[A-Za-z0-9._]{1,30}$/.test(value) && !/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/.test(value)) invalid();
  if (spec.type==='email' && (typeof value!=='string' || value.length>254 || (value!=='' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))) invalid();
  if (spec.type==='date' && (typeof value!=='string' || (value!=='' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)))) invalid();
  if (spec.type==='integer' && (!Number.isSafeInteger(value) || (spec.min!=null && value<spec.min) || (spec.max!=null && value>spec.max))) invalid();
  if (spec.type==='enum' && !spec.values.includes(value)) invalid();
  if (spec.type==='array' && (!Array.isArray(value) || !value.length || value.length>spec.values.length || new Set(value).size!==value.length || value.some(item=>!spec.values.includes(item)))) invalid();
  if (spec.values && spec.type==='integer' && !spec.values.includes(value)) invalid();
  return value;
}
async function seedDefaults() {
  for (const [key,spec] of Object.entries(registry)) {
    await AppSetting.findOrCreate({where:{key},defaults:{category:spec.category,key,value:spec.default,is_public:spec.public,description:null}});
  }
}
async function getSetting(key) {
  const spec=registry[key]; if (!spec) return null;
  const row=await AppSetting.findOne({where:{key}});
  return row ? row.toJSON() : {key,category:spec.category,value:spec.default,is_public:spec.public};
}
async function getSettingValue(key,fallback=registry[key]?.default) {
  if (!registry[key]) return fallback;
  try { const row=await AppSetting.findOne({where:{key},attributes:['value']}); return row?.value ?? fallback; }
  catch { return fallback; }
}
async function getAllSettings({publicOnly=false}={}) {
  const specs=Object.entries(registry).filter(([,spec])=>!publicOnly || spec.public);
  const rows=await AppSetting.findAll({where:{key:specs.map(([key])=>key)},attributes:['key','value']});
  const saved=new Map(rows.map(row=>[row.key,row.value]));
  const grouped={general:{},users:{},learning:{},content:{},security:{},system:{}};
  for(const [key,spec] of specs) grouped[spec.category][key]=saved.has(key)?saved.get(key):spec.default;
  return publicOnly ? Object.fromEntries(Object.entries(grouped).filter(([,values])=>Object.keys(values).length)) : grouped;
}
async function getSettingsByCategory(category) { return (await getAllSettings())[category] || {}; }
async function setSettingsBulk(payload,adminId) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw Object.assign(new Error('Body pengaturan tidak valid.'),{status:400});
  const changes=[];
  for(const [category,values] of Object.entries(payload)) {
    if (!['general','users','learning','content','security','system'].includes(category) || !values || typeof values!=='object' || Array.isArray(values)) throw Object.assign(new Error('Kategori pengaturan tidak valid.'),{status:400});
    for(const [key,value] of Object.entries(values)) {
      if (registry[key]?.category!==category) throw Object.assign(new Error(`Pengaturan ${key} tidak valid untuk kategori ${category}.`),{status:400});
      changes.push([key,validate(key,value)]);
    }
  }
  const current=await getAllSettings();
  for(const [key,value] of changes) current[registry[key].category][key]=value;
  if (current.learning.min_target_score>current.learning.max_target_score || current.learning.default_target_score<current.learning.min_target_score || current.learning.default_target_score>current.learning.max_target_score) throw Object.assign(new Error('Rentang target skor tidak konsisten.'),{status:400});
  await sequelize.transaction(async transaction=>{
    for(const [key,value] of changes) await AppSetting.upsert({key,category:registry[key].category,value,is_public:registry[key].public,updated_by:adminId},{transaction});
  });
  return getAllSettings();
}
async function setSetting(key,value,adminId) { const spec=registry[key]; if(!spec) return validate(key,value); return setSettingsBulk({[spec.category]:{[key]:value}},adminId); }
module.exports={registry,validate,seedDefaults,getSetting,getSettingValue,getSettingsByCategory,getAllSettings,setSetting,setSettingsBulk};
