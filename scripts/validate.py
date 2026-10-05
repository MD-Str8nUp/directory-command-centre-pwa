#!/usr/bin/env python3
import json, pathlib, re, struct, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]; errors=[]
def ok(c,m):
 print(('PASS' if c else 'FAIL')+': '+m)
 if not c: errors.append(m)
def load(rel):
 try:return json.loads((ROOT/rel).read_text())
 except Exception as e: errors.append(f'{rel} loads: {e}');return {}
data=load('data/portfolio.json'); schema=load('data/portfolio.schema.json'); manifest=load('manifest.webmanifest'); vercel=load('vercel.json')
sites=data.get('sites',[]); states={'verified','unavailable','not_connected','pending_period','stale','failed_collection'}
ok(data.get('schemaVersion')=='2.0.0','schema version is 2.0.0')
ok(bool(schema),'machine-readable schema loads')
ok(len(sites)==22,'all 22 original portfolio rows remain')
for key in ('id','slug','url'):
 vals=[s.get(key) for s in sites];ok(all(vals) and len(vals)==len(set(vals)),f'all site {key}s are present and unique')
ok(all(re.fullmatch(r'[a-z0-9-]+',s['slug']) for s in sites),'slugs are hash-route safe')
ok(all(s['url'].startswith('https://') for s in sites),'all site URLs use HTTPS')
required={'traffic','seo','revenue','listings','content'}
ok(all(required<=s.get('metrics',{}).keys() for s in sites),'every site has all metric groups')
for s in sites:
 for name,m in s.get('metrics',{}).items():
  ok(m.get('state') in states,f"{s['slug']} {name}: explicit valid state")
  ok(bool(m.get('source')),f"{s['slug']} {name}: source recorded")
  ok('asOf' in m and 'freshness' in m,f"{s['slug']} {name}: as-of and freshness recorded")
traffic=[s['metrics']['traffic'] for s in sites]; verified=[m for m in traffic if m['state']=='verified']; pending=[m for m in traffic if m['state']=='pending_period']
ok(len(pending)==2,'two new sites are pending a complete period')
ok(all(m['visitors'] is None and m['views'] is None for m in pending),'pending traffic is unavailable, never zero')
ok(all(m['source']=='ChatGPT Sites Analytics' and m['period']=='2026-09-04 to 2026-10-03' for m in verified),'verified traffic uses only the fixed ChatGPT Sites period')
ok(all(s['metrics']['seo']['state']=='unavailable' for s in sites),'SEO reporting metrics remain unavailable')
google=data.get('googleSnapshot',{}); ga4=google.get('ga4',{}); gsc=google.get('searchConsole',{})
ok(google.get('source')=='verified browser snapshot — not live API' and google.get('asOf')=='2026-10-05' and google.get('state')=='verified','Google snapshot has explicit verified source, date and state')
ok([ga4.get(k) for k in ('activeUsers','newUsers','eventCount','keyEvents')]==[197,197,933,0],'GA4 snapshot totals are exact')
ok(ga4.get('sessionsByChannel')=={'Direct':201,'Organic Search':15,'Referral':1,'Unassigned':1},'GA4 channel sessions are exact')
ok(gsc.get('webSearchClicks')==9 and gsc.get('clicksProperty')=='https://neuroassessmentaustralia.com.au/' and gsc.get('indexingState')=='processing','Search Console clicks are scoped and indexing is processing')
ok(len(gsc.get('verifiedProperties',[]))==5 and len(gsc.get('notVerifiedProperties',[]))==2,'Search Console inventory preserves verified and not-verified states')
ok(all(s['metrics']['revenue']['actualRevenue'] is None for s in sites),'actual revenue is never fabricated')
ok(all(all(v=='not_connected' for v in s['readiness'].values()) for s in sites),'monetisation readiness is explicitly not connected')
for size in (192,512):
 rel=f'icons/icon-{size}.png';p=ROOT/rel; declared=any(i.get('src')==rel and i.get('sizes')==f'{size}x{size}' for i in manifest.get('icons',[]));ok(declared,f'manifest declares {size}px icon')
 try:b=p.read_bytes();valid=b[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',b[16:24])==(size,size)
 except Exception:valid=False
 ok(valid,f'{size}px PNG is valid')
js=(ROOT/'app.js').read_text(); html=(ROOT/'index.html').read_text(); admin_html=(ROOT/'admin.html').read_text(); sw=(ROOT/'sw.js').read_text(); css=(ROOT/'styles.css').read_text(); vh=json.dumps(vercel)
ok('.innerHTML' not in js and 'insertAdjacentHTML' not in js,'application does not inject imported values as HTML')
ok('textContent' in js,'safe text construction is used')
ok(all(label in js for label in ['Overview','Sites','SEO','Monetisation','Listings','Content','Leads','Claims & Forms']),'all global sections are defined')
ok('Site-level visitors' in js or 'site-level' in js,'visitor aggregation limitation is visible')
ok('secure authenticated backend' in js,'sensitive workflows declare backend boundary')
ok("cache:'no-store'" in js and "cache:'no-store'" in sw and 'skipWaiting' in sw,'service worker/data update strategy avoids stale corrections')
ok('Content-Security-Policy' in vh and "object-src 'none'" in vh,'static CSP is configured')
ok('lang="en-AU"' in html and 'lang="en-AU"' in admin_html,'Australian English locale is declared')
ok(all(x in html and x in admin_html for x in ['Directory Command Centre','href="./#/overview"','href="admin.html"']),'dashboard and editor share same-tab branded navigation')
for name,page in (('dashboard',html),('admin',admin_html)):
 actions=re.findall(r'<a class="button[^"]*shell-action[^"]*"[^>]*>',page)
 ok(len(actions)==2,f'{name} header has current and destination shell actions')
 ok(sum('aria-current="page"' in a for a in actions)==1,f'{name} header marks exactly one current shell action')
 ok(any('aria-current="page"' not in a for a in actions),f'{name} header keeps a non-current destination shell action')
ok('id="menuButton"' in html and 'id="menuButton"' not in admin_html,'dashboard has the only mobile Menu button')
ok(re.search(r'<div class="topbar-actions"[^>]*>.*?<a class="button secondary shell-action"[^>]*aria-current="page"[^>]*>Dashboard</a>.*?<a class="button shell-action"[^>]*>Manage / Edit</a>.*?<button id="menuButton"',html,re.S),'dashboard mobile header keeps current shell action, destination shell action and menu button together')
ok('@media(max-width:560px)' in css and '.shell-action[aria-current=page]{display:none}' in css,'mobile header hides redundant current shell action only under 560px')
ok(all(x in css for x in ['.brand{min-width:0;min-height:44px;flex:1 1 auto','.shell-action,.menu-button{min-height:44px','body{overflow-x:hidden','.brand-copy b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}']),'mobile header prevents overflow while preserving touch targets and readable brand')
ok(all(x in js for x in ['Google verified browser snapshot','not a live API','No site-level GSC performance snapshot','Live Google API','Not connected']),'Google snapshot and live-API status are explicit and truthful')
ok('frozen ChatGPT Sites Analytics snapshot' in html and 'not GA4 or Google Search Console data' in js,'snapshot traffic is visibly separated from Google data')
ok('44px' in css,'minimum touch target sizing is present')
print(f'\nValidation: {len(errors)} error(s)');sys.exit(bool(errors))
