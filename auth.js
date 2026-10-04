'use strict';
(function(){
  const PROJECT='https://gqbekbrxftmfpgnkqodo.supabase.co';
  const PRODUCTION_REDIRECT='https://directory-command-centre-pwa.vercel.app/admin.html';
  const SESSION_KEY='directory-command-centre-admin-session-v1';
  const REFRESH_LEEWAY_SECONDS=90;
  let config=null,session=null,refreshTimer=null,refreshPromise=null,expiredHandler=null;
  function decodeJwtPayload(token){
    const part=token?.split('.')[1];if(!part)throw Error('Invalid sign-in response.');
    const padded=part.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-part.length%4)%4);
    return JSON.parse(atob(padded));
  }
  function validateAccessToken(token,{allowExpired=false}={}){
    const claims=decodeJwtPayload(token),now=Math.floor(Date.now()/1000);
    if(claims.iss!==`${PROJECT}/auth/v1`||claims.aud!=='authenticated'||!claims.sub||!Number.isFinite(claims.exp)||(!allowExpired&&claims.exp<=now))throw Error('Sign-in response was refused.');
    return claims;
  }
  function storedSessionValue(value){
    if(!value?.access_token||!value?.refresh_token)throw Error('Stored sign-in is incomplete.');
    const claims=validateAccessToken(value.access_token,{allowExpired:true}),expiresAt=Number(value.expires_at)||claims.exp;
    if(!Number.isFinite(expiresAt))throw Error('Stored sign-in is invalid.');
    return {access_token:value.access_token,refresh_token:value.refresh_token,expires_at:expiresAt};
  }
  function stopRefresh(){if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}}
  function scheduleRefresh(){stopRefresh();if(!session)return;const delay=Math.max(0,(session.expires_at-Math.floor(Date.now()/1000)-REFRESH_LEEWAY_SECONDS)*1000);refreshTimer=setTimeout(()=>refreshSession().catch(()=>{}),Math.min(delay,2147483647))}
  function persistSession(value){const safe=storedSessionValue(value);localStorage.setItem(SESSION_KEY,JSON.stringify(safe));session=safe;scheduleRefresh()}
  function removeStoredSession(){try{localStorage.removeItem(SESSION_KEY)}catch{}}
  function authError(response,value,fallback='Request failed.'){const error=Error(response.status===429?'Too many attempts. Wait a few minutes, then try again.':value.message||value.error_description||value.error||fallback);error.status=response.status;return error}
  async function loadConfig(){const response=await fetch('/api/config',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('Backend is not configured.');const value=await response.json();if(value.supabaseUrl!==PROJECT||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishableKey||''))throw Error('Backend is not configured.');config=value;return config}
  async function ensureConfig(){return config||loadConfig()}
  async function rawRequest(path,{method='GET',body,auth=true}={}){
    await ensureConfig();const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
    if(auth){if(!session?.access_token)throw Error('Sign in required.');headers.Authorization=`Bearer ${session.access_token}`}
    const response=await fetch(`${PROJECT}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    const value=await response.json().catch(()=>({}));return {response,value};
  }
  async function refreshSession(){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{if(!session?.refresh_token)throw Error('No saved sign-in is available.');const {response,value}=await rawRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});if(!response.ok||!value?.access_token||!value?.refresh_token)throw authError(response,value,'Saved sign-in could not be refreshed.');validateAccessToken(value.access_token);persistSession(value);return session})();
    try{return await refreshPromise}catch(error){removeStoredSession();session=null;stopRefresh();if(expiredHandler)expiredHandler(error);throw error}finally{refreshPromise=null}
  }
  async function request(path,options={}){const auth=options.auth!==false;if(auth&&session?.expires_at<=Math.floor(Date.now()/1000)+REFRESH_LEEWAY_SECONDS)await refreshSession();let result=await rawRequest(path,options);if(auth&&result.response.status===401){await refreshSession();result=await rawRequest(path,options)}if(!result.response.ok)throw authError(result.response,result.value);return result.value}
  async function rpc(name,args){return request(`/rest/v1/rpc/${name}`,{method:'POST',body:args})}
  function authParams(){const url=new URL(location.href),hash=new URLSearchParams(url.hash.startsWith('#')?url.hash.slice(1):url.hash);return {url,tokenHash:url.searchParams.get('token_hash')||hash.get('token_hash'),type:url.searchParams.get('type')||hash.get('type'),accessToken:hash.get('access_token'),refreshToken:hash.get('refresh_token'),expiresAt:hash.get('expires_at')}}
  function scrubAuthParams(url){for(const key of ['token_hash','token','type','access_token','refresh_token','expires_at','expires_in','error','error_code','error_description'])url.searchParams.delete(key);url.hash='';history.replaceState(null,'',`${url.pathname}${url.search}`)}
  function acceptRedirectSession(params){if(!params.accessToken)return false;const claims=validateAccessToken(params.accessToken);if(!params.refreshToken)throw Error('Sign-in response did not include a device refresh token.');persistSession({access_token:params.accessToken,refresh_token:params.refreshToken,expires_at:Number(params.expiresAt)||claims.exp});return true}
  function approvalCode(value=session){const id=validateAccessToken(value.access_token).sub.replaceAll('-','').toUpperCase();return `${id.slice(0,4)}-${id.slice(-4)}`}
  function hasStoredSession(){try{const value=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');return Boolean(value?.access_token&&value?.refresh_token)}catch{return false}}
  async function restoreSession(){try{const stored=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(!stored)return false;session=storedSessionValue(stored);await refreshSession();return true}catch(error){clearSession();throw error}}
  function clearSession(){removeStoredSession();session=null;stopRefresh()}
  function setSession(value){persistSession(value)}
  function onSessionExpired(callback){expiredHandler=callback}
  addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session?.expires_at<=Math.floor(Date.now()/1000)+REFRESH_LEEWAY_SECONDS)refreshSession().catch(()=>{})});
  window.DCCAuth={PROJECT,PRODUCTION_REDIRECT,SESSION_KEY,REFRESH_LEEWAY_SECONDS,validateAccessToken,storedSessionValue,setSession,clearSession,removeStoredSession,loadConfig,restoreSession,refreshSession,request,rpc,authParams,scrubAuthParams,acceptRedirectSession,approvalCode,hasStoredSession,getSession:()=>session,onSessionExpired,exactAdminRedirect:()=>PRODUCTION_REDIRECT};
})();
