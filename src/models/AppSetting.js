const { DataTypes }=require('sequelize');
const { sequelize }=require('../config/database');
module.exports=sequelize.define('AppSetting',{
  setting_id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
  category:{type:DataTypes.STRING(50),allowNull:false},
  key:{type:DataTypes.STRING(100),allowNull:false,unique:true},
  value:{type:DataTypes.JSONB,allowNull:false},
  description:{type:DataTypes.TEXT,allowNull:true},
  is_public:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false},
  updated_by:{type:DataTypes.INTEGER,allowNull:true},
},{tableName:'app_settings',timestamps:true,createdAt:'created_at',updatedAt:'updated_at',indexes:[{fields:['category']}]});
