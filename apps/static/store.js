const { url, key } = window.APK_STORE_CONFIG;
const params = new URLSearchParams(location.search);
const results = document.getElementById('results');
const detail = document.getElementById('detail');
const hero = document.getElementById('hero');
const catalog = document.getElementById('catalog');
const search = document.getElementById('app-search');
document.getElementById('theme-button').addEventListener('click', () => {
  const mode = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = mode;
  localStorage.setItem('apk-store-theme', mode);
});
document.getElementById('search-form').addEventListener('submit', event => {
  event.preventDefault();
  location.href = './?q=' + encodeURIComponent(search.value.trim());
});
async function read(resource, query) {
  const response = await fetch(url + '/rest/v1/' + resource + '?' + query, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!response.ok) throw new Error('Catalog temporarily unavailable');
  return response.json();
}
function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.textContent = content;
  return element;
}
function empty(title, text) {
  results.replaceChildren();
  const box = node('div', 'empty-state');
  box.append(node('h3', '', title), node('p', '', text));
  results.replaceWith(box);
}
async function list() {
  const q = (params.get('q') || '').trim().slice(0, 80);
  search.value = q;
  if (params.has('search') || q) document.getElementById('catalog-title').textContent = 'Search results';
  const query = new URLSearchParams({ select: 'id,slug,title,package_id,category,description,icon_url', visibility: 'eq.published', current_release_id: 'not.is.null', order: 'created_at.desc', limit: '50' });
  if (q) query.set('title', 'ilike.*' + q.replace(/[*,()\\]/g, ' ') + '*');
  try {
    const apps = await read('apps', query);
    results.replaceChildren();
    if (!apps.length) { empty(q ? 'No matching apps' : 'No apps published yet', q ? 'Try another search term.' : 'The first approved release will appear here automatically.'); return; }
    const grid = node('div', 'app-grid');
    for (const app of apps) {
      const link = node('a', 'app-card'); link.href = './?app=' + encodeURIComponent(app.slug);
      const icon = node('div', 'app-icon', app.title.slice(0, 1).toUpperCase());
      if (app.icon_url) { const image = node('img'); image.src = app.icon_url; image.alt = ''; image.width = 64; image.height = 64; icon.replaceChildren(image); }
      icon.setAttribute('aria-hidden', 'true');
      const copy = node('div');
      copy.append(node('span', 'section-index', app.category), node('h3', '', app.title), node('p', '', app.description || app.package_id), node('span', 'card-link', 'View app ↗'));
      link.append(icon, copy); grid.append(link);
    }
    results.append(grid);
  } catch (error) { empty('Catalog unavailable', error.message); }
}
async function showApp(slug) {
  hero.hidden = true; catalog.hidden = true; detail.hidden = false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { detail.append(node('h1', '', 'App not found')); return; }
  try {
    const apps = await read('apps', new URLSearchParams({ select: 'id,slug,title,package_id,category,description,icon_url,current_release_id', slug: 'eq.' + slug, visibility: 'eq.published', limit: '1' }));
    const app = apps[0]; if (!app) throw new Error('App not found');
    const releases = await read('releases', new URLSearchParams({ select: 'id,version_code,version_name,byte_size,apk_sha256,release_notes', id: 'eq.' + app.current_release_id, status: 'eq.published', limit: '1' }));
    const release = releases[0]; if (!release) throw new Error('Release unavailable');
    detail.append(node('span', 'section-index', 'APP / ' + app.category.toUpperCase()), node('h1', '', app.title), node('p', 'app-description', app.description), node('p', '', app.package_id));
    if (app.icon_url) { const image = node('img'); image.src = app.icon_url; image.alt = app.title + ' icon'; image.width = 96; image.height = 96; detail.prepend(image); }
    const download = node('a', 'action-button download-button', 'Download APK ↗');
    download.href = url + '/functions/v1/download-apk?slug=' + encodeURIComponent(slug);
    detail.append(download);
    const panel = node('section', 'release-panel');
    panel.append(node('h2', '', 'Current release'), node('p', '', 'Version ' + release.version_name + ' (' + release.version_code + ') · ' + (release.byte_size / 1048576).toFixed(1) + ' MB'), node('p', 'hash', 'SHA-256: ' + release.apk_sha256), node('p', '', release.release_notes || ''));
    detail.append(panel);
    document.title = app.title + ' · APK STORE';
  } catch (error) { detail.replaceChildren(node('h1', '', error.message)); }
}
const slug = params.get('app');
if (slug) showApp(slug); else list();
