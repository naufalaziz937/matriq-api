const {DataTypes}=require('sequelize');
const {sequelize}=require('../config/database');
module.exports=sequelize.define('StudyProgress',{
  progress_id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
  user_id:{type:DataTypes.INTEGER,allowNull:false},
  materi_id:{type:DataTypes.INTEGER,allowNull:true},
  soal_dikerjakan:{type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
  soal_benar:{type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
  soal_salah:{type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
  akurasi:{type:DataTypes.DECIMAL(5,2),allowNull:true},
  waktu_belajar:{type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
},{tableName:'study_progress',timestamps:true,createdAt:'created_at',updatedAt:'updated_at',indexes:[{fields:['user_id','created_at']},{fields:['materi_id']}]});
