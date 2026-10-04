'use strict';
(function(){
  const root=document.querySelector('#managementSummary'),state=document.querySelector('#managementSummaryState'),content=document.querySelector('#managementSummaryContent');
  if(!root||!state||!content)return;
  const auth=window.DCCAuth;
  function locked(message='Locked. Open Manage / Edit to activate or approve this device.'){content.hidden=true;content.replaceChildren();state.textContent=message;state.className='notice'}
  function metric(label,value){const node=document.createElement('article');node.className='metric';const name=document.createElement('span');name.textContent=label;const count=document.createElement('strong');count.textContent=String(value);node.append(name,count);return node}
  function render(summary){
    const entities=['listings','content_items','tasks'],labels={listings:'Listings',content_items:'Content',tasks:'Tasks'};
    const totals=document.createElement('div');totals.className='metrics';
    for(const entity of entities)totals.append(metric(labels[entity],summary[entity].total));
    const breakdown=document.createElement('div');breakdown.className='grid';
    for(const entity of entities){const panel=document.createElement('section');panel.className='panel';const heading=document.createElement('h2');heading.textContent=`${labels[entity]} status`;const list=document.createElement('dl');list.className='detail-list';for(const [statusName,count] of Object.entries(summary[entity].statuses)){const row=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');term.className='meta-label';term.textContent=statusName.replaceAll('_',' ');value.textContent=String(count);row.append(term,value);list.append(row)}if(!list.children.length){const empty=document.createElement('p');empty.textContent='No records.';panel.append(heading,empty)}else panel.append(heading,list);breakdown.append(panel)}
    const refreshed=document.createElement('p');refreshed.className='source-line';refreshed.textContent=`Last refreshed: ${new Date(summary.refreshed_at).toLocaleString('en-AU')}`;
    content.replaceChildren(totals,breakdown,refreshed);content.hidden=false;state.textContent='Private aggregate summary unlocked for this approved device. No record names, bodies or personal information are loaded.';state.className='notice';
  }
  async function restore(){
    locked();
    if(!auth?.hasStoredSession())return;
    state.textContent='Checking saved trusted-device session…';
    try{await auth.restoreSession();const summary=await auth.rpc('admin_summary',{});render(summary)}catch{locked('Locked. The saved device session is invalid, expired, not approved or the private summary is not connected.')}
  }
  auth?.onSessionExpired(()=>locked('Locked. The saved device session expired or was revoked.'));
  addEventListener('DOMContentLoaded',restore);
})();
