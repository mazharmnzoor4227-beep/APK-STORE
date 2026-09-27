const { url: base, key } = window.APK_STORE_CONFIG;
const endpoint = base + '/functions/v1/admin-upload';
const $ = id => document.getElementById(id);
const message = value => { $('admin-message').textContent = value; };
let session = null;

function saveSession(value) {
  session = value;
  if (value) sessionStorage.setItem('apk-store-owner-session', JSON.stringify(value));
  else sessionStorage.removeItem('apk-store-owner-session');
  $('login').hidden = Boolean(value);
  $('dashboard').hidden = !value;
}
async function currentToken() {
  if (!session) throw new Error('Sign in first.');
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  const response = await fetch(base + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (!response.ok) { saveSession(null); throw new Error('Session expired. Sign in again.'); }
  const data = await response.json();
  saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
  return session.access_token;
}
async function api(action, method = 'GET', body) {
  const token = await currentToken();
  const response = await fetch(endpoint + '?action=' + action, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
async function refresh() {
  const { candidates } = await api('list');
  const list = $('uploads'); list.replaceChildren();
  if (!candidates.length) { list.textContent = 'No APK uploaded yet.'; return; }
  for (const candidate of candidates) {
    const item = document.createElement('article'); item.className = 'upload-item';
    const name = document.createElement('strong'); name.textContent = candidate.filename;
    const status = document.createElement('p'); status.textContent = candidate.status === 'uploaded' ? 'Uploaded privately · inspection pending' : candidate.status;
    item.append(name, status);
    if (candidate.error) { const error = document.createElement('p'); error.textContent = candidate.error; item.append(error); }
    list.append(item);
  }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); message('Sending sign-in link…');
  const email = $('owner-email').value.trim();
  try {
    const response = await fetch(base + '/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + '/admin'), { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: true }) });
    if (!response.ok) throw new Error('Could not send sign-in link.');
    message('Check your email for the sign-in link.');
  } catch (error) { message(error.message); }
});
$('upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('apk-file').files[0]; if (!file) return;
  const button = $('upload-form').querySelector('button'); button.disabled = true;
  const progress = $('upload-progress'); progress.hidden = false; progress.value = 0;
  try {
    const { id, signedUrl } = await api('start', 'POST', { filename: file.name, byteSize: file.size });
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('content-type', 'application/vnd.android.package-archive');
      xhr.upload.onprogress = e => { if (e.lengthComputable) progress.value = Math.round(e.loaded * 100 / e.total); };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Storage upload failed (' + xhr.status + ')'));
      xhr.onerror = () => reject(new Error('Upload connection failed')); xhr.send(file);
    });
    await api('complete', 'POST', { id });
    message('APK uploaded privately. Package inspection and publication are pending.');
    $('upload-form').reset(); await refresh();
  } catch (error) { message(error.message); }
  finally { button.disabled = false; progress.hidden = true; }
});
$('refresh').addEventListener('click', () => refresh().catch(error => message(error.message)));
$('sign-out').addEventListener('click', () => { saveSession(null); message('Signed out.'); });
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.get('access_token') && fragment.get('refresh_token')) {
  saveSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token'), expires_at: Date.now() + Number(fragment.get('expires_in') || 3600) * 1000 });
  history.replaceState(null, '', location.pathname);
} else {
  try { const old = JSON.parse(sessionStorage.getItem('apk-store-owner-session')); if (old?.refresh_token) saveSession(old); } catch {}
}
if (session) refresh().catch(error => message(error.message));
