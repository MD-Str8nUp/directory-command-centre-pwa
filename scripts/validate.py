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
ok(all(s['metrics']['revenue']['actualRevenue'] is None for s in sites),'actual revenue is never fabricated')
ok(all(all(v=='not_connected' for v in s['readiness'].values()) for s in sites),'monetisation readiness is explicitly not connected')
for size in (192,512):
 rel=f'icons/icon-{size}.png';p=ROOT/rel; declared=any(i.get('src')==rel and i.get('sizes')==f'{size}x{size}' for i in manifest.get('icons',[]));ok(declared,f'manifest declares {size}px icon')
 try:b=p.read_bytes();valid=b[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',b[16:24])==(size,size)
 except Exception:valid=False
 ok(valid,f'{size}px PNG is valid')
js=(ROOT/'app.js').read_text(); html=(ROOT/'index.html').read_text(); admin_html=(ROOT/'admin.html').read_text(); sw=(ROOT/'sw.js').read_text(); vh=json.dumps(vercel)
ok('.innerHTML' not in js and 'insertAdjacentHTML' not in js,'application does not inject imported values as HTML')
ok('textContent' in js,'safe text construction is used')
ok(all(label in js for label in ['Overview','Sites','SEO','Monetisation','Listings','Content','Leads','Claims & Forms']),'all global sections are defined')
ok('Site-level visitors' in js or 'site-level' in js,'visitor aggregation limitation is visible')
ok('secure authenticated backend' in js,'sensitive workflows declare backend boundary')
ok("cache:'no-store'" in js and "cache:'no-store'" in sw and 'skipWaiting' in sw,'service worker/data update strategy avoids stale corrections')
ok('Content-Security-Policy' in vh and "object-src 'none'" in vh,'static CSP is configured')
ok('lang="en-AU"' in html and 'lang="en-AU"' in admin_html,'Australian English locale is declared')
ok(all(x in html and x in admin_html for x in ['Directory Command Centre','href="./#/overview"','href="admin.html"']),'dashboard and editor share same-tab branded navigation')
ok(all(x in js for x in ['GA4 live reporting','Search Console live reporting','Not connected','setup metadata']),'Google live-data status is explicit and truthful')
ok('frozen ChatGPT Sites Analytics snapshot' in html and 'not GA4 or Google Search Console data' in js,'snapshot traffic is visibly separated from Google data')
ok('44px' in (ROOT/'styles.css').read_text(),'minimum touch target sizing is present')
print(f'\nValidation: {len(errors)} error(s)');sys.exit(bool(errors))
