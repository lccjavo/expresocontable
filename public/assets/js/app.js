const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

const AUTH_KEY = 'expreso_contable_token';
const USER_KEY = 'expreso_contable_user';
const authMessage = document.querySelector('[data-auth-message]');
const fileInput = document.querySelector('#invoice-files');
const status = document.querySelector('[data-upload-status]');
const sessionStatus = document.querySelector('[data-session-status]');
const uploadCard = document.querySelector('[data-upload-card]');
const lockedNote = document.querySelector('[data-locked-note]');
const dropzone = document.querySelector('[data-dropzone]');

function setMessage(text, type = '') {
  if (!authMessage) return;
  authMessage.textContent = text;
  authMessage.className = `form-message ${type}`.trim();
}

function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

function setSession({ token, user }) {
  localStorage.setItem(AUTH_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  refreshAuthState();
}

function refreshAuthState() {
  const token = getToken();
  const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
  const isLoggedIn = Boolean(token);

  if (fileInput) fileInput.disabled = !isLoggedIn;
  if (dropzone) dropzone.setAttribute('aria-disabled', String(!isLoggedIn));
  if (uploadCard) uploadCard.classList.toggle('locked', !isLoggedIn);
  if (lockedNote) lockedNote.classList.toggle('is-hidden', isLoggedIn);
  if (sessionStatus) {
    sessionStatus.textContent = isLoggedIn ? `Activo${user.businessName ? ` · ${user.businessName}` : ''}` : 'Bloqueado';
    sessionStatus.classList.toggle('is-unlocked', isLoggedIn);
  }
  if (status) {
    status.textContent = isLoggedIn
      ? 'Selecciona XML, PDF o ZIP para analizarlos.'
      : 'XML, PDF o ZIP. Disponible después de iniciar sesión.';
  }
}

function showTab(tabName) {
  document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    
    const active = tab.dataset.authTab === tabName;
    tab.classList.toggle('is-active', active);
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    form.classList.toggle('is-hidden', form.dataset.authForm !== tabName);
  });
  setMessage('');
}

document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
  tab.addEventListener('click', () => showTab(tab.dataset.authTab));
});

document.querySelectorAll('[data-login-open]').forEach((button) => {
  button.addEventListener('click', () => {
    showTab('login');
    document.querySelector('.auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

document.querySelectorAll('[data-register-open]').forEach((button) => {
  button.addEventListener('click', () => {
    showTab('register');
    document.querySelector('.auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

async function authRequest(endpoint, payload) {
  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

document.querySelector('[data-auth-form="login"]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  setMessage('Entrando...');
  try {
    const data = await authRequest('login', payload);
    setSession(data);
    setMessage('Listo, ya puedes subir facturas.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

document.querySelector('[data-auth-form="register"]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  setMessage('Creando cuenta...');
  try {
    const data = await authRequest('register', payload);
    setSession(data);
    setMessage('Cuenta creada. Ya puedes subir facturas.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});



dropzone?.addEventListener('click', (event) => {
  if (!getToken()) {
    event.preventDefault();
    showTab('register');
    document.querySelector('.auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setMessage('Primero crea una cuenta o inicia sesión para subir facturas.', 'error');
  }
});

fileInput?.addEventListener('click', (event) => {
  if (!getToken()) {
    event.preventDefault();
    showTab('register');
    document.querySelector('.auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setMessage('Primero crea una cuenta o inicia sesión para subir facturas.', 'error');
  }
});

fileInput?.addEventListener('change', (event) => {
  if (!getToken()) {
    event.target.value = '';
    return;
  }
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    status.textContent = 'Selecciona XML, PDF o ZIP para analizarlos.';
    return;
  }
  const count = files.length;
  status.textContent = `${count} archivo${count === 1 ? '' : 's'} listo${count === 1 ? '' : 's'} para analizar.`;
});

refreshAuthState();
