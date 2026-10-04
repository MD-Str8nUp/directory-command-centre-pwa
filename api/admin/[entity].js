'use strict';
// Deliberately fail closed until a verified Supabase JWT adapter, repository and durable rate limiter are provisioned.
const {createAdminHandler}=require('../_lib/handler');
module.exports=createAdminHandler();
