const { DataTypes }=require('sequelize');
const { sequelize }=require('../config/database');
module.exports=sequelize.define('ReportExport',{
  export_id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
  admin_id:{type:DataTypes.INTEGER,allowNull:false},
  report_type:{type:DataTypes.STRING(40),allowNull:false},
  format:{type:DataTypes.STRING(8),allowNull:false},
  filters:{type:DataTypes.JSONB,allowNull:false,defaultValue:{}},
  total_rows:{type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
  created_at:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
},{tableName:'report_exports',timestamps:false,indexes:[{fields:['admin_id','created_at']}]});
