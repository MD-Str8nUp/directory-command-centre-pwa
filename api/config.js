'use strict';
const PROJECT_URL='https://gqbekbrxftmfpgnkqodo.supabase.co';
module.exports=function(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') return res.status(405).json({error:'method_not_allowed'});
  const key=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return res.status(503).json({error:'admin_not_configured'});
  return res.status(200).json({supabaseUrl:PROJECT_URL,publishableKey:key});
};
