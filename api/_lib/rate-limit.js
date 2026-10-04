'use strict';
const {HttpError}=require('./errors');
class RateLimitStore { async consume(_key,_limit,_windowSeconds){throw new HttpError(503,'rate_limit_not_configured','Private management is not connected.')} }
async function enforceRateLimit(store,key,{limit=60,windowSeconds=60}={}){const result=await store.consume(key,limit,windowSeconds);if(!result?.allowed)throw new HttpError(429,'rate_limited','Too many requests.');return result}
module.exports={RateLimitStore,enforceRateLimit};
