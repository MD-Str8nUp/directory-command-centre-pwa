'use strict';
const PROJECT='https://gqbekbrxftmfpgnkqodo.supabase.co';
const $=selector=>document.querySelector(selector);
let config=null,session=null,sites=[],records=[];
const status=(text,bad=false)=>{const node=$('#adminStatus');node.textContent=text;node.className=`notice${bad?' warning':''}`};
async function request(path,{method='GET',body,auth=true}={}){
  if(!config)throw Error('Backend is not configured.');
  const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
  if(auth){if(!session?.access_token)throw Error('Sign in required.');headers.Authorization=`Bearer ${session.access_token}`;}
  const response=await fetch(`${PROJECT}${path}`,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const value=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(value.message||value.error_description||value.error||'Request failed.');
  return value;
}
async function rpc(name,args){return request(`/rest/v1/rpc/${name}`,{method:'POST',body:args})}
function clearSession(){session=null;records=[];sites=[];$('#workspace').hidden=true;$('#signInForm').hidden=!config;$('#signInForm').reset();status(config?'Signed out.':'Private administration is not configured.',!config)}
function sameOriginAdminUrl(){return new URL('/admin.html',location.origin).toString()}
function authParams(){
  const url=new URL(location.href),hash=new URLSearchParams(url.hash.startsWith('#')?url.hash.slice(1):url.hash);
  return {url,tokenHash:url.searchParams.get('token_hash')||hash.get('token_hash'),type:url.searchParams.get('type')||hash.get('type'),accessToken:hash.get('access_token'),refreshToken:hash.get('refresh_token'),expiresAt:hash.get('expires_at')};
}
function scrubAuthParams(url){
  for(const key of ['token_hash','token','type','access_token','refresh_token','expires_at','expires_in','error','error_code','error_description'])url.searchParams.delete(key);
  url.hash='';history.replaceState(null,'',`${url.pathname}${url.search}`);
}
function decodeJwtPayload(token){
  const part=token.split('.')[1];if(!part)throw Error('Invalid sign-in response.');
  const padded=part.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-part.length%4)%4);
  return JSON.parse(atob(padded));
}
function acceptRedirectSession(params){
  if(!params.accessToken)return false;
  const claims=decodeJwtPayload(params.accessToken),now=Math.floor(Date.now()/1000);
  if(claims.iss!==`${PROJECT}/auth/v1`||claims.aud!=='authenticated'||!claims.sub||!claims.exp||claims.exp<=now)throw Error('Sign-in response was refused.');
  session={access_token:params.accessToken,refresh_token:params.refreshToken||null,expires_at:Number(params.expiresAt)||claims.exp};
  return true;
}
function entitySpec(){const entity=$('#entity').value;if(entity==='listings')return {label:'name',extra:'public_url',statuses:['draft','review','published','archived']};if(entity==='content_items')return {label:'title',extra:'slug',statuses:['draft','review','published','archived']};return {label:'title',extra:'due_at',statuses:['open','in_progress','blocked','done','cancelled']}}
function resetForm(){const form=$('#recordForm');form.reset();form.id.value='';syncForm()}
function syncForm(){const spec=entitySpec(),form=$('#recordForm');form.status.replaceChildren(...spec.statuses.map(value=>new Option(value.replaceAll('_',' '),value)));$('#priorityWrap').hidden=$('#entity').value!=='tasks'}
function render(){const box=$('#records');box.replaceChildren(...records.map(row=>{const card=document.createElement('article');card.className='panel';const title=document.createElement('h2');title.textContent=row.name||row.title;const meta=document.createElement('p');meta.className='source-line';meta.textContent=`${row.status} · updated ${new Date(row.updated_at).toLocaleString('en-AU')}`;const edit=document.createElement('button');edit.className='button secondary';edit.type='button';edit.textContent='Edit';edit.onclick=()=>{const form=$('#recordForm'),spec=entitySpec();form.id.value=row.id;form.site_id.value=row.site_id;form.label.value=row[spec.label]||'';form.extra.value=row[spec.extra]||'';form.status.value=row.status;form.priority.value=row.priority||'normal';scrollTo({top:form.offsetTop,behavior:'smooth'})};card.append(title,meta,edit);return card}));if(!records.length)box.append(Object.assign(document.createElement('p'),{textContent:'No records yet.'}))}
async function load(){sites=await rpc('admin_list',{entity:'sites'});const select=$('#recordForm [name=site_id]');select.replaceChildren(...sites.map(site=>new Option(site.public_site_key,site.id)));records=await rpc('admin_list',{entity:$('#entity').value});render();status('Private workspace connected.')}
async function loadConfig(){const response=await fetch('/api/config',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error();const value=await response.json();if(value.supabaseUrl!==PROJECT||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.publishableKey||''))throw Error();config=value}
async function completeMagicLink(){
  const params=authParams();if(!params.tokenHash&&!params.accessToken&&!params.url.searchParams.get('error')&&!new URLSearchParams(params.url.hash.slice(1)).get('error'))return false;
  try{
    status('Verifying sign-in link…');
    if(params.type&&!['magiclink','email'].includes(params.type))throw Error('Sign-in link type was refused.');
    if(!acceptRedirectSession(params)){
      if(!params.tokenHash||!params.type)throw Error('Sign-in link could not be verified.');
      const value=await request(`/auth/v1/verify?type=${encodeURIComponent(params.type)}`,{method:'POST',auth:false,body:{token_hash:params.tokenHash}});
      if(!value?.access_token)throw Error('Sign-in link could not be verified.');
      const claims=decodeJwtPayload(value.access_token);
      if(claims.iss!==`${PROJECT}/auth/v1`||claims.aud!=='authenticated')throw Error('Sign-in response was refused.');
      session=value;
    }
    scrubAuthParams(params.url);$('#signInForm').hidden=true;$('#workspace').hidden=false;await load();return true;
  }catch(error){session=null;scrubAuthParams(params.url);status(error.message||'Sign-in link could not be verified.',true);return true;}
}
addEventListener('DOMContentLoaded',async()=>{try{await loadConfig();syncForm();if(await completeMagicLink())return;$('#signInForm').hidden=false;status('Secure backend available. Email a sign-in link to the authorised account.')}catch{config=null;status('Private administration is not configured. Public dashboard remains read-only.',true)}syncForm()});
$('#signInForm').addEventListener('submit',async event=>{event.preventDefault();status('Sending sign-in link…');try{const form=new FormData(event.currentTarget);await request('/auth/v1/otp',{method:'POST',auth:false,body:{email:form.get('email'),should_create_user:false,email_redirect_to:sameOriginAdminUrl()}});event.currentTarget.reset();status('If that address is authorised, a one-use sign-in link has been sent.')}catch(error){session=null;status(error.message,true)}});
$('#signOut').onclick=async()=>{try{if(session)await request('/auth/v1/logout',{method:'POST'})}catch{}clearSession()};
$('#entity').onchange=async()=>{resetForm();try{records=await rpc('admin_list',{entity:$('#entity').value});render()}catch(error){status(error.message,true)}};
$('#clearRecord').onclick=resetForm;
$('#recordForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,spec=entitySpec(),record={id:form.id.value||undefined,site_id:form.site_id.value,status:form.status.value,[spec.label]:form.label.value.trim()};if(form.extra.value.trim())record[spec.extra]=form.extra.value.trim();if($('#entity').value==='tasks')record.priority=form.priority.value;try{await rpc('admin_upsert',{entity:$('#entity').value,record});resetForm();records=await rpc('admin_list',{entity:$('#entity').value});render();status('Saved and audited.')}catch(error){status(error.message,true)}});
addEventListener('pagehide',()=>{session=null});
