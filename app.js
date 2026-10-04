const $ = selector => document.querySelector(selector);
const fmt = value => value == null ? 'Unavailable' : value.toLocaleString('en-AU');

const SOURCE_OPTIONS = [
  ['chatgpt-sites', 'ChatGPT Sites analytics'],
  ['ga4', 'Google Analytics (GA4) coverage'],
  ['search-console', 'Search Console coverage'],
  ['awaiting', 'Awaiting data']
];

let sites = [];

function chip(text, className = '') {
  return `<span class="chip ${className}">${text}</span>`;
}

function sourceInfo(site) {
  const raw = (site.source || '').toLowerCase();
  if (site.uniqueVisitors == null && site.pageViews == null) {
    return { key: 'awaiting', label: 'Awaiting data' };
  }
  if (raw.includes('search console')) {
    return { key: 'search-console', label: 'Search Console' };
  }
  if (raw.includes('ga4') || raw.includes('google analytics')) {
    return { key: 'ga4', label: 'Google Analytics (GA4)' };
  }
  if (raw.includes('chatgpt sites')) {
    return { key: 'chatgpt-sites', label: 'ChatGPT Sites analytics' };
  }
  return { key: 'awaiting', label: 'Awaiting data' };
}

function matchesSourceFilter(site, filter) {
  if (!filter) return true;
  if (filter === 'chatgpt-sites' || filter === 'awaiting') return sourceInfo(site).key === filter;
  if (filter === 'ga4') return Boolean(site.ga4 && !['not recorded', 'not installed', 'none'].includes(site.ga4.toLowerCase()));
  if (filter === 'search-console') return Boolean(site.searchConsole && site.searchConsole.toLowerCase() !== 'not recorded');
  return false;
}

function evidence(site) {
  if (sourceInfo(site).key === 'awaiting') {
    return `Search Console: ${site.searchConsole} · GA4 tag: ${site.ga4} · Sitemap: ${site.sitemapUrls} URLs`;
  }
  return `Snapshot: ${site.snapshotPeriod} · GA4 coverage: ${site.ga4} · Search Console: ${site.searchConsole}`;
}

function sourceBadge(site) {
  const source = sourceInfo(site);
  return chip(`Metrics: ${source.label}`, `source ${source.key}`);
}

function render() {
  const query = $('#search').value.trim().toLowerCase();
  const decision = $('#decision').value;
  const status = $('#status').value;
  const source = $('#source').value;
  const sort = $('#sort').value;

  const list = sites.filter(site => {
    const text = `${site.name} ${site.url}`.toLowerCase();
    return (!query || text.includes(query)) &&
      (!decision || site.decision === decision) &&
      (!status || site.status === status) &&
      matchesSourceFilter(site, source);
  });

  list.sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) :
    sort === 'visitors' ? (b.uniqueVisitors ?? -1) - (a.uniqueVisitors ?? -1) :
    sort === 'views' ? (b.pageViews ?? -1) - (a.pageViews ?? -1) :
    (a.rank ?? -1) - (b.rank ?? -1)
  );

  $('#resultCount').textContent = `Showing ${list.length} of ${sites.length} sites`;
  $('#cards').innerHTML = list.length ? list.map(site => {
    return `<article class="card">
      <div class="chips">${chip(site.decision, 'decision')}${chip(site.status, site.isNew ? 'new' : '')}${sourceBadge(site)}</div>
      <h2><a href="${site.url}" target="_blank" rel="noopener">${site.name}</a></h2>
      <div class="rank">${site.rank == null ? 'Internal dashboard' : `Portfolio #${site.rank}`}</div>
      <div class="numbers">
        <div><span>Visitors</span><strong>${fmt(site.uniqueVisitors)}</strong></div>
        <div><span>Views</span><strong>${fmt(site.pageViews)}</strong></div>
      </div>
      <div class="evidence">${evidence(site)}</div>
    </article>`;
  }).join('') : `<div class="empty">No sites match those filters.</div>`;

  $('#rows').innerHTML = list.map(site => {
    return `<tr>
      <td><a href="${site.url}" target="_blank" rel="noopener">${site.name}</a><br><small>${site.rank == null ? 'Internal' : `#${site.rank}`}</small></td>
      <td>${chip(site.decision, 'decision')}</td>
      <td>${chip(site.status, site.isNew ? 'new' : '')}</td>
      <td>${sourceBadge(site)}</td>
      <td>${fmt(site.uniqueVisitors)}</td>
      <td>${fmt(site.pageViews)}</td>
      <td class="evidence">${evidence(site)}</td>
    </tr>`;
  }).join('');
}

fetch('data/portfolio.json')
  .then(response => {
    if (!response.ok) throw Error('Data unavailable');
    return response.json();
  })
  .then(data => {
    sites = data.sites;
    $('#visitorTotal').textContent = fmt(sites.reduce((total, site) => total + (site.uniqueVisitors ?? 0), 0));
    $('#viewTotal').textContent = fmt(sites.reduce((total, site) => total + (site.pageViews ?? 0), 0));
    for (const [id, key] of [['decision', 'decision'], ['status', 'status']]) {
      for (const value of [...new Set(sites.map(site => site[key]))].sort()) {
        $('#' + id).insertAdjacentHTML('beforeend', `<option>${value}</option>`);
      }
    }
    for (const [value, label] of SOURCE_OPTIONS) {
      $('#source').insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
    }
    document.querySelectorAll('input,select').forEach(input => input.addEventListener('input', render));
    render();
  })
  .catch(() => {
    $('#cards').innerHTML = '<div class="empty">Portfolio data could not be loaded.</div>';
  });

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
