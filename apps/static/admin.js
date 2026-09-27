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
    if (candidate.status === 'uploaded') {
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Inspect APK';
      inspect.onclick = async () => { inspect.disabled = true; message('Reading APK metadata and checksum…'); try { await api('inspect', 'POST', { id: candidate.id }); message('Inspection complete. Review and publish below.'); await refresh(); } catch (error) { message(error.message); } finally { inspect.disabled = false; } };
      item.append(inspect);
    }
    if (candidate.status === 'inspected') {
      const info = candidate.inspection;
      item.append(Object.assign(document.createElement('p'), { textContent: `${info.packageId} · ${info.versionName} (${info.versionCode}) · signer ${info.certificateSha256.slice(0, 16)}…` }));
      if (info.iconUrl) { const icon = document.createElement('img'); icon.src = info.iconUrl; icon.alt = ''; icon.width = 64; icon.height = 64; item.append(icon); }
      const form = document.createElement('form'); form.className = 'release-form';
      const field = (label, value, maxLength) => { const wrap = document.createElement('label'); wrap.textContent = label; const input = document.createElement('input'); input.value = value; input.maxLength = maxLength; input.required = true; wrap.append(input); form.append(wrap); return input; };
      const title = field('App name', info.appName || info.packageId, 100);
      const category = field('Category', 'Tools', 60);
      const description = field('Description', '', 2000); description.required = false;
      const releaseNotes = field('What is new', '', 1000); releaseNotes.required = false;
      const publish = document.createElement('button'); publish.className = 'action-button'; publish.type = 'submit'; publish.textContent = 'Approve and publish'; form.append(publish);
      form.onsubmit = async event => { event.preventDefault(); publish.disabled = true; message('Publishing approved release…'); try { const result = await api('publish', 'POST', { id: candidate.id, title: title.value, category: category.value, description: description.value, releaseNotes: releaseNotes.value }); message('Published. View ' + result.slug + ' in the store.'); await refresh(); } catch (error) { message(error.message); } finally { publish.disabled = false; } };
      item.append(form);
    }
    if (candidate.status === 'published') { const link = document.createElement('a'); link.href = './?app=' + encodeURIComponent(candidate.inspection.packageId.replaceAll('.', '-')); link.textContent = 'View in store ↗'; item.append(link); }
    if (candidate.error) { const error = document.createElement('p'); error.textContent = candidate.error; item.append(error); }
    list.append(item);
  }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); message('Signing in…');
  const email = $('owner-email').value.trim();
  const password = $('owner-password').value;
  if (!password) { message('Enter your password, or use the email sign-in link below.'); return; }
  try {
    const response = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Could not sign in.');
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 });
    $('owner-password').value = '';
    message('Signed in.'); await refresh();
  } catch (error) { message(error.message); }
});
$('send-link').addEventListener('click', async () => {
  message('Sending sign-in link…');
  const email = $('owner-email').value.trim();
  if (!email) { message('Enter your email first.'); return; }
  try {
    const response = await fetch(base + '/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + '/admin'), { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: true }) });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error('Email limit reached. Please wait about an hour before requesting another link.');
      throw new Error(failure.msg || failure.message || 'Could not send sign-in link.');
    }
    message('Check your email for the sign-in link.');
  } catch (error) { message(error.message); }
});
$('password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('new-password').value;
  if (password.length < 12) { message('Use at least 12 characters.'); return; }
  try {
    const token = await currentToken();
    const response = await fetch(base + '/auth/v1/user', { method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Password could not be saved.');
    $('password-form').reset(); message('Password saved. Next time, sign in with your email and password.');
  } catch (error) { message(error.message); }
});
$('upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = $('apk-file').files[0]; if (!file) return;
  if (file.size > 300 * 1024 * 1024) { message('Select an APK up to 300 MB.'); return; }
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
    message('Upload complete. Reading APK package, icon and checksum…');
    try { await api('inspect', 'POST', { id }); message('APK inspected. Review its details and approve publication below.'); }
    catch (inspectionError) { message('Upload saved. Inspection needs a retry: ' + inspectionError.message); }
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
