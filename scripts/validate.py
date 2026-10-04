#!/usr/bin/env python3
import json, pathlib, struct, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
errors=[]
def ok(condition,message):
 print(('PASS' if condition else 'FAIL')+': '+message)
 if not condition: errors.append(message)
try: data=json.loads((ROOT/'data/portfolio.json').read_text())
except Exception as e: print('FAIL: portfolio JSON loads:',e);sys.exit(1)
sites=data.get('sites',[])
ok(len(sites)==22,'portfolio has exactly 22 rows')
urls=[s.get('url') for s in sites]
ok(len(urls)==len(set(urls)),'all site URLs are unique')
ok(all(isinstance(u,str) and u.startswith('https://') for u in urls),'all URLs are absolute HTTPS links')
new=[s for s in sites if s.get('isNew')]
ok(len(new)==2,'exactly two sites are marked as new launches')
expected={'Aged Care Provider Finder Australia':31,'ADHD Assessment Cost & Wait-Time Finder':30}
for name,count in expected.items():
 matches=[s for s in new if s.get('name')==name]
 ok(len(matches)==1,f'new site present: {name}')
 if matches:
  s=matches[0]
  ok(s.get('searchConsole')=='Connected',f'{name}: Search Console connected')
  ok(s.get('ga4')=='G-T02L0H1Y00',f'{name}: GA4 metadata preserved')
  ok(s.get('sitemapUrls')==count,f'{name}: sitemap URL count is {count}')
  ok(s.get('uniqueVisitors') is None and s.get('pageViews') is None,f'{name}: traffic is unavailable, not zero')
ok(all(not(s.get('isNew') and (s.get('uniqueVisitors')==0 or s.get('pageViews')==0)) for s in sites),'no fabricated zero traffic for new launches')
manifest_path=ROOT/'manifest.webmanifest'
try: manifest=json.loads(manifest_path.read_text()); mok=True
except Exception: manifest={};mok=False
ok(mok,'manifest is valid JSON')
icons=manifest.get('icons',[])
for size in (192,512):
 rel=f'icons/icon-{size}.png';p=ROOT/rel
 ok(any(i.get('src')==rel and i.get('sizes')==f'{size}x{size}' for i in icons),f'manifest declares {size}px icon')
 good=False
 if p.exists():
  try:
   b=p.read_bytes();w,h=struct.unpack('>II',b[16:24]);good=b[:8]==b'\x89PNG\r\n\x1a\n' and (w,h)==(size,size)
  except Exception: pass
 ok(good,f'{size}px PNG exists with correct dimensions')
ok((ROOT/'icons/icon.svg').exists(),'SVG icon exists')
for rel in ('index.html','styles.css','app.js','sw.js'):
 ok((ROOT/rel).exists(),f'{rel} exists')
html=(ROOT/'index.html').read_text(); js=(ROOT/'app.js').read_text()
ok('4 September–3 October 2026' in html,'fixed analytics period caveat is visible')
ok('Unavailable' in js,'UI renders missing traffic as Unavailable')
print(f'\nValidation: {len(errors)} error(s)')
sys.exit(bool(errors))
