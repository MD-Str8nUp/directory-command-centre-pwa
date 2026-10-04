'use strict';
const {HttpError}=require('./errors');
const REQUIRED=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_JWT_AUDIENCE','ADMIN_ALLOWED_ORIGINS','CSRF_HMAC_SECRET'];
function serverEnv(source=process.env){
  const missing=REQUIRED.filter(k=>!source[k]||!String(source[k]).trim());
  if(missing.length) throw new HttpError(503,'backend_not_configured','Private management is not connected.');
  const url=new URL(source.SUPABASE_URL);
  if(url.protocol!=='https:') throw new HttpError(503,'invalid_configuration','Backend configuration is invalid.');
  const origins=source.ADMIN_ALLOWED_ORIGINS.split(',').map(v=>v.trim()).filter(Boolean).map(v=>new URL(v).origin);
  if(!origins.length) throw new HttpError(503,'invalid_configuration','Backend configuration is invalid.');
  return Object.freeze({supabaseUrl:url.origin,serviceRoleKey:source.SUPABASE_SERVICE_ROLE_KEY,jwtAudience:source.ADMIN_JWT_AUDIENCE,allowedOrigins:origins,csrfSecret:source.CSRF_HMAC_SECRET});
}
module.exports={REQUIRED,serverEnv};
