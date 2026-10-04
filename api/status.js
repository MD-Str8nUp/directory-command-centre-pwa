'use strict';
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');res.status(200).json({privateManagement:'not_connected'});};
