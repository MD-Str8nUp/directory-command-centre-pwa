'use strict';
const PROJECT='https://gqbekbrxftmfpgnkqodo.supabase.co';
const PRODUCTION_REDIRECT='https://directory-command-centre-pwa.vercel.app/admin.html';
const SESSION_KEY='directory-command-centre-admin-session-v1';
const REFRESH_LEEWAY_SECONDS=90;
const $=selector=>document.querySelector(selector);
let config=null,session=null,sites=[],records=[],refreshTimer=null,refreshPromise=null;
const status=(text,bad=false)=>{const node=$('#adminStatus');node.textContent=text;node.className=`notice${bad?' warning':''}`};
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
  const claims=validateAccessToken(value.access_token,{allowExpired:true});
  const expiresAt=Number(value.expires_at)||claims.exp;
  if(!Number.isFinite(expiresAt))throw Error('Stored sign-in is invalid.');
  return {access_token:value.access_token,refresh_token:value.refresh_token,expires_at:expiresAt};
}
function persistSession(value){const safe=storedSessionValue(value);localStorage.setItem(SESSION_KEY,JSON.stringify(safe));session=safe;scheduleRefresh()}
function removeStoredSession(){try{localStorage.removeItem(SESSION_KEY)}catch{}}
function stopRefresh(){if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null}}
function scheduleRefresh(){
  stopRefresh();if(!session)return;
  const delay=Math.max(0,(session.expires_at-Math.floor(Date.now()/1000)-REFRESH_LEEWAY_SECONDS)*1000);
  refreshTimer=setTimeout(()=>{refreshSession().catch(()=>{})},Math.min(delay,2147483647));
}
function hidePrivateViews(){$('#workspace').hidden=true;$('#pendingApproval').hidden=true}
function showSignedOut(message='Signed out.'){
  session=null;records=[];sites=[];stopRefresh();hidePrivateViews();$('#signInForm').hidden=!config;$('#signInForm').reset();status(config?message:'Private administration is not configured.',!config);
}
function authError(response,value,fallback='Request failed.'){
  const error=Error(response.status===429?'Too many attempts. Wait a few minutes, then try again.':value.message||value.error_description||value.error||fallback);
  error.status=response.status;return error;
}
async function rawRequest(path,{method='GET',body,auth=true}={}){
  if(!config)throw Error('Backend is not configured.');
  const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
  if(auth){if(!session?.access_token)throw Error('Sign in required.');headers.Authorization=`Bearer ${session.access_token}`}
  const response=await fetch(`${PROJECT}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const value=await response.json().catch(()=>({}));return {response,value};
}
async function refreshSession(){
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    if(!session?.refresh_token)throw Error('No saved sign-in is available.');
    const {response,value}=await rawRequest('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});
    if(!response.ok||!value?.access_token||!value?.refresh_token)throw authError(response,value,'Saved sign-in could not be refreshed.');
    validateAccessToken(value.access_token);persistSession(value);return session;
  })();
  try{return await refreshPromise}catch(error){removeStoredSession();showSignedOut('Your saved sign-in expired or was revoked. Activate this device again.');throw error}finally{refreshPromise=null}
}
async function request(path,options={}){
  const auth=options.auth!==false;
  if(auth&&session?.expires_at<=Math.floor(Date.now()/1000)+REFRESH_LEEWAY_SECONDS)await refreshSession();
  let result=await rawRequest(path,options);
  if(auth&&result.response.status===401){await refreshSession();result=await rawRequest(path,options)}
  if(!result.response.ok)throw authError(result.response,result.value);return result.value;
}
async function rpc(name,args){return request(`/rest/v1/rpc/${name}`,{method:'POST',body:args})}
function exactAdminRedirect(){return PRODUCTION_REDIRECT}
function authParams(){
  const url=new URL(location.href),hash=new URLSearchParams(url.hash.startsWith('#')?url.hash.slice(1):url.hash);
  return {url,tokenHash:url.searchParams.get('token_hash')||hash.get('token_hash'),type:url.searchParams.get('type')||hash.get('type'),accessToken:hash.get('access_token'),refreshToken:hash.get('refresh_token'),expiresAt:hash.get('expires_at')};
}
function scrubAuthParams(url){for(const key of ['token_hash','token','type','access_token','refresh_token','expires_at','expires_in','error','error_code','error_description'])url.searchParams.delete(key);url.hash='';history.replaceState(null,'',`${url.pathname}${url.search}`)}
function acceptRedirectSession(params){
  if(!params.accessToken)return false;const claims=validateAccessToken(params.accessToken);
  if(!params.refreshToken)throw Error('Sign-in response did not include a device refresh token.');
  persistSession({access_token:params.accessToken,refresh_token:params.refreshToken,expires_at:Number(params.expiresAt)||claims.exp});return true;
}
function approvalCode(){const id=validateAccessToken(session.access_token).sub.replaceAll('-','').toUpperCase();return `${id.slice(0,4)}-${id.slice(-4)}`}
function showPending(){
  const claims=validateAccessToken(session.access_token);hidePrivateViews();$('#signInForm').hidden=true;$('#approvalCode').textContent=approvalCode();$('#approvalUserId').textContent=claims.sub;$('#pendingApproval').hidden=false;
  status('This device is authenticated but is still awaiting private administrator approval.');
}
function isPending(error){return error?.status===401||error?.status===403||/insufficient_role|permission denied|not authorised|not authorized/i.test(error?.message||'')}
function entitySpec(){const entity=$('#entity').value;if(entity==='listings')return {label:'name',extra:'public_url',statuses:['draft','review','published','archived']};if(entity==='content_items')return {label:'title',extra:'slug',statuses:['draft','review','published','archived']};return {label:'title',extra:'due_at',statuses:['open','in_progress','blocked','done','cancelled']}}
function resetForm(){const form=$('#recordForm');form.reset();form.id.value='';syncForm()}
function syncForm(){const spec=entitySpec(),form=$('#recordForm');form.status.replaceChildren(...spec.statuses.map(value=>new Option(value.replaceAll('_',' '),value)));$('#priorityWrap').hidden=$('#entity').value!=='tasks'}
function render(){const box=$('#records');box.replaceChildren(...records.map(row=>{const card=document.createElement('article');card.className='panel';const title=document.createElement('h2');title.textContent=row.name||row.title;const meta=document.createElement('p');meta.className='source-line';meta.textContent=`${row.status} · updated ${new Date(row.updated_at).toLocaleString('en-AU')}`;const edit=document.createElement('button');edit.className='button secondary';edit.type='button';edit.textContent='Edit';edit.onclick=()=>{const form=$('#recordForm'),spec=entitySpec();form.id.value=row.id;form.site_id.value=row.site_id;form.label.value=row[spec.label]||'';form.extra.value=row[spec.extra]||'';form.status.value=row.status;form.priority.value=row.priority||'normal';scrollTo({top:form.offsetTop,behavior:'smooth'})};card.append(title,meta,edit);return card}));if(!records.length)box.append(Object.assign(document.createElement('p'),{textContent:'No records yet.'}))}
async function load(){sites=await rpc('admin_list',{entity:'sites'});const select=$('#recordForm [name=site_id]');select.replaceChildren(...sites.map(site=>new Option(site.public_site_key,site.id)));records=await rpc('admin_list',{entity:$('#entity').value});render();hidePrivateViews();$('#signInForm').hidden=true;$('#workspace').hidden=false;status('Private workspace connected on this trusted device.')}
async function openOrPending(){try{await load();return true}catch(error){if(isPending(error)){showPending();return false}throw error}}
async function loadConfig(){const response=await fetch('/api/config',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error();const value=await response.json();if(value.supabaseUrl!==PROJECT||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishableKey||''))throw Error();config=value}
async function completeMagicLink(){
  const params=authParams();if(!params.tokenHash&&!params.accessToken&&!params.url.searchParams.get('error')&&!new URLSearchParams(params.url.hash.slice(1)).get('error'))return false;
  try{
    status('Verifying sign-in link…');if(params.type&&!['magiclink','email'].includes(params.type))throw Error('Sign-in link type was refused.');
    if(!acceptRedirectSession(params)){if(!params.tokenHash||!params.type)throw Error('Sign-in link could not be verified.');const value=await request(`/auth/v1/verify?type=${encodeURIComponent(params.type)}`,{method:'POST',auth:false,body:{token_hash:params.tokenHash}});if(!value?.access_token||!value?.refresh_token)throw Error('Sign-in link could not be verified.');validateAccessToken(value.access_token);persistSession(value)}
    scrubAuthParams(params.url);await openOrPending();return true;
  }catch(error){removeStoredSession();session=null;scrubAuthParams(params.url);status(error.message||'Sign-in link could not be verified.',true);return true}
}
async function restoreSession(){
  try{const stored=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(!stored)return false;session=storedSessionValue(stored);await refreshSession();await openOrPending();return true}catch{removeStoredSession();session=null;return false}
}
addEventListener('DOMContentLoaded',async()=>{try{await loadConfig();syncForm();if(await completeMagicLink())return;if(await restoreSession())return;$('#signInForm').hidden=false;status('Secure backend available. Activate this device, or use the authorised email-link fallback.')}catch{config=null;removeStoredSession();session=null;status('Private administration is not configured. Public dashboard remains read-only.',true)}syncForm()});
$('#activateDevice').onclick=async()=>{status('Creating a private device identity…');try{const value=await request('/auth/v1/signup',{method:'POST',auth:false,body:{}});if(!value?.access_token||!value?.refresh_token)throw Error('Device activation did not return a session.');validateAccessToken(value.access_token);persistSession(value);showPending()}catch(error){removeStoredSession();session=null;status(error.message||'Device activation failed.',true)}};
$('#signInForm').addEventListener('submit',async event=>{event.preventDefault();status('Sending sign-in link…');try{const form=new FormData(event.currentTarget);await request('/auth/v1/otp',{method:'POST',auth:false,body:{email:form.get('email'),should_create_user:false,email_redirect_to:exactAdminRedirect()}});event.currentTarget.reset();status('If that address is authorised, a one-use device activation link has been sent.')}catch(error){session=null;event.currentTarget.reset();status(error.message,true)}});
$('#retryApproval').onclick=async()=>{status('Checking approval…');try{await refreshSession();await openOrPending()}catch(error){status(error.message,true)}};
$('#cancelActivation').onclick=async()=>{try{await request('/auth/v1/logout?scope=local',{method:'POST'})}catch{}finally{removeStoredSession();showSignedOut('Device activation cleared.')}};
$('#signOut').onclick=async()=>{const active=Boolean(session);try{if(active)await request('/auth/v1/logout?scope=local',{method:'POST'})}catch{}finally{removeStoredSession();showSignedOut(active?'Signed out and the saved device session was revoked.':'Signed out.')}};
$('#entity').onchange=async()=>{resetForm();try{records=await rpc('admin_list',{entity:$('#entity').value});render()}catch(error){status(error.message,true)}};
$('#clearRecord').onclick=resetForm;
$('#recordForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,spec=entitySpec(),record={id:form.id.value||undefined,site_id:form.site_id.value,status:form.status.value,[spec.label]:form.label.value.trim()};if(form.extra.value.trim())record[spec.extra]=form.extra.value.trim();if($('#entity').value==='tasks')record.priority=form.priority.value;try{await rpc('admin_upsert',{entity:$('#entity').value,record});resetForm();records=await rpc('admin_list',{entity:$('#entity').value});render();status('Saved and audited.')}catch(error){status(error.message,true)}});
addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session?.expires_at<=Math.floor(Date.now()/1000)+REFRESH_LEEWAY_SECONDS)refreshSession().catch(()=>{})});
