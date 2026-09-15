const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const allowRoles = require('../middlewares/role.middleware');
const { sequelize } = require('../config/database');
const { TYPES, run } = require('../services/adminReports.service');
const { csv, xlsx } = require('../utils/reportFiles');
const { getSettingValue }=require('../services/settings.service');

router.use(auth, allowRoles(1));
const respondError = (res,error) => { if (!error.status) console.error('REPORT ERROR:',error); res.status(error.status || 500).json({ success:false, message:error.status ? error.message : 'Gagal memuat laporan.' }); };
router.get('/types', async (req,res) => {
  try {
    const types = await Promise.all(Object.entries(TYPES).map(async ([id,meta]) => {
      try { const { total } = await run(id, {}, { limit:0 }); return { id, ...meta, total }; }
      catch { return { id, ...meta, total:0 }; }
    }));
    res.json({ success:true, data:types });
  } catch(error) { respondError(res,error); }
});
router.get('/recent', async (req,res) => {
  try {
    const [rows] = await sequelize.query('SELECT report_type, format, filters, total_rows, created_at FROM report_exports WHERE admin_id=$admin_id ORDER BY created_at DESC LIMIT 10', { bind:{ admin_id:req.user.user_id } });
    res.json({ success:true, data:rows });
  } catch(error) { respondError(res,error); }
});
router.get('/:type/preview', async (req,res) => {
  try {
    const { rows,total,columns,filters } = await run(req.params.type,req.query,{ limit:20 });
    res.json({ success:true, data:{ rows,total,columns,filters,available:TYPES[req.params.type].available !== false, notice:TYPES[req.params.type].available === false ? TYPES[req.params.type].description : null } });
  } catch(error) { respondError(res,error); }
});
router.get('/:type/export/:format', async (req,res) => {
  try {
    const { type,format } = req.params;
    if (!['csv','xlsx'].includes(format)) return res.status(400).json({ success:false,message:'Format tidak didukung.' });
    if (!TYPES[type]) return res.status(404).json({ success:false,message:'Jenis laporan tidak dikenal.' });
    if (TYPES[type].available === false) return res.status(409).json({ success:false,message:'Data laporan ini belum tersedia.' });
    const first = await run(type,req.query,{ limit:0 });
    const rowLimit=await getSettingValue('export_row_limit',10000);
    if (first.total>rowLimit) return res.status(413).json({success:false,message:`Ekspor dibatasi ${rowLimit.toLocaleString('id-ID')} baris. Persempit filter laporan.`});
    if (format==='xlsx' && first.total>20000) return res.status(413).json({ success:false,message:'Excel dibatasi 20.000 baris; gunakan CSV untuk data lebih besar.' });
    const all=[];
    for(let offset=0;offset<first.total;offset+=1000) {
      const batch=await run(type,req.query,{limit:1000,offset});
      all.push(...batch.rows);
    }
    const columns=first.columns.length ? first.columns : Object.keys(all[0] || {});
    const body=format==='csv' ? Buffer.from(csv(columns,all),'utf8') : xlsx(columns,all);
    await sequelize.query(`INSERT INTO report_exports (admin_id,report_type,format,filters,total_rows,created_at) VALUES ($admin_id,$type,$format,$filters::jsonb,$total,NOW())`, { bind:{ admin_id:req.user.user_id,type,format,filters:JSON.stringify(first.filters),total:first.total } });
    const filename=`matriq-${type}-${new Date().toISOString().slice(0,10)}.${format}`;
    res.setHeader('Content-Type',format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
    res.setHeader('Content-Length',body.length);
    res.send(body);
  } catch(error) { respondError(res,error); }
});
module.exports=router;
