// The private deployment uses the existing site session. No API key belongs here.
const MEMORIA_MANAGED = !location.hostname.endsWith('.github.io');
const MEMORIA_API = new URL('./api', location.href).pathname;

function memoriaSessionError() {
  const error = new Error('登录已到期，请重新登录后再试');
  error.status = 401;
  const notice = document.getElementById('session-notice');
  if (notice) notice.hidden = false;
  return error;
}

async function memoriaFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) throw memoriaSessionError();
  return response;
}

async function memoriaRequest(action, params = {}, stream = false, externalAc) {
  if (!MEMORIA_MANAGED) throw memoriaSessionError();
  const controller = externalAc || new AbortController();
  if (stream && !externalAc) S.ac = controller;
  const timer = setTimeout(() => controller.abort(), stream ? 60000 : 30000);
  try {
    const response = await memoriaFetch(MEMORIA_API, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Memoria-Client': 'session'},
      body: JSON.stringify({action, ...params}),
      signal: controller.signal,
    });
    if (!response.ok) await _throwApiError(response);
    if (!response.headers.get('content-type')?.includes(stream ? 'text/event-stream' : 'application/json')) {
      throw memoriaSessionError();
    }
    return stream ? response : response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      // Redirects to Access are deliberately not followed as API data.
      const notice = document.getElementById('session-notice');
      if (notice) notice.hidden = false;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function checkMemoriaConnection() {
  try {
    await api('list_models');
    toast('已连接，使用当前站点登录');
  } catch (error) {
    toast(apiErrMsg(error, '连接失败，请检查网络或重新登录'));
  }
}

function openPrivateMemoria(event) {
  event.preventDefault();
  const input = document.getElementById('private-site-address');
  try {
    const url = new URL(input.value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname.endsWith('.github.io')) throw new Error();
    url.pathname = '/memoria/';
    url.search = '';
    url.hash = '';
    location.assign(url.href);
  } catch {
    document.getElementById('private-site-error').textContent = '请输入你平时登录的完整 HTTPS 站点地址。';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!MEMORIA_MANAGED) {
    document.getElementById('app').hidden = true;
    document.getElementById('private-site-entry').hidden = false;
  }
});
