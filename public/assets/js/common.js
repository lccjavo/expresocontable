const EC_AUTH_KEY = 'expreso_contable_token';
const EC_USER_KEY = 'expreso_contable_user';

const EC_COMPANIES_KEY = 'expreso_contable_companies_v1';
const EC_ACTIVE_COMPANY_KEY = 'expreso_contable_active_company_v1';

function companyIdFromTaxId(taxId = '') {
  const normalized = String(taxId || '').replace(/[^A-ZÑ&0-9]/gi, '').toUpperCase().trim();
  return normalized ? `rfc-${normalized}` : `company-${Date.now()}`;
}

function defaultCompany() {
  const user = getUser();
  const legacyProfile = (() => {
    try { return JSON.parse(localStorage.getItem('expreso_contable_profile_v1') || '{}'); }
    catch { return {}; }
  })();
  const taxId = String(legacyProfile.taxId || '').replace(/[^A-ZÑ&0-9]/gi, '').toUpperCase().trim();
  return {
    id: legacyProfile.companyId || companyIdFromTaxId(taxId),
    name: legacyProfile.businessName || user.businessName || 'Mi empresa',
    taxId,
    taxRegime: legacyProfile.taxRegime || 'actividad-empresarial',
    isDefault: true,
    createdAt: legacyProfile.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeCompany(company = {}) {
  const taxId = String(company.taxId || '').replace(/[^A-ZÑ&0-9]/gi, '').toUpperCase().trim();
  const id = String(company.id || companyIdFromTaxId(taxId)).trim();
  return {
    id,
    name: String(company.name || company.businessName || taxId || 'Mi empresa').trim(),
    taxId,
    taxRegime: company.taxRegime || 'actividad-empresarial',
    createdAt: company.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function getCompanies() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EC_COMPANIES_KEY) || 'null');
    if (parsed && Array.isArray(parsed.companies) && parsed.companies.length) {
      return { ...parsed, companies: parsed.companies.map(normalizeCompany) };
    }
  } catch {}
  const first = normalizeCompany(defaultCompany());
  const settings = { activeCompanyId: first.id, companies: [first] };
  localStorage.setItem(EC_COMPANIES_KEY, JSON.stringify(settings));
  localStorage.setItem(EC_ACTIVE_COMPANY_KEY, first.id);
  return settings;
}

function saveCompanies(settings = {}) {
  const current = getCompanies();
  const companies = (settings.companies || current.companies || []).map(normalizeCompany);
  if (!companies.length) companies.push(normalizeCompany(defaultCompany()));
  const activeCompanyId = settings.activeCompanyId && companies.some((c) => c.id === settings.activeCompanyId)
    ? settings.activeCompanyId
    : (localStorage.getItem(EC_ACTIVE_COMPANY_KEY) || companies[0].id);
  const normalized = { activeCompanyId: companies.some((c) => c.id === activeCompanyId) ? activeCompanyId : companies[0].id, companies };
  localStorage.setItem(EC_COMPANIES_KEY, JSON.stringify(normalized));
  localStorage.setItem(EC_ACTIVE_COMPANY_KEY, normalized.activeCompanyId);
  return normalized;
}

function companiesArray(settingsOrCompanies = getCompanies()) {
  return Array.isArray(settingsOrCompanies) ? settingsOrCompanies : (settingsOrCompanies.companies || []);
}

function getActiveCompanyId() {
  const settings = getCompanies();
  const companies = companiesArray(settings);
  const profileActive = (() => { try { return JSON.parse(localStorage.getItem('expreso_contable_profile_v1') || '{}').activeCompanyId || ''; } catch { return ''; } })();
  const active = localStorage.getItem(EC_ACTIVE_COMPANY_KEY) || settings.activeCompanyId || profileActive || companies[0]?.id;
  return companies.some((c) => c.id === active) ? active : companies[0]?.id;
}

function setActiveCompanyId(companyId) {
  const settings = getCompanies();
  const companies = companiesArray(settings);
  if (!companies.some((c) => c.id === companyId)) return getActiveCompanyId();
  const next = saveCompanies({ companies, activeCompanyId: companyId });
  window.dispatchEvent(new CustomEvent('company-changed', { detail: { companyId: next.activeCompanyId } }));
  hydrateNav?.();
  return next.activeCompanyId;
}

function getActiveCompany() {
  const settings = getCompanies();
  return settings.companies.find((c) => c.id === getActiveCompanyId()) || settings.companies[0] || normalizeCompany(defaultCompany());
}

function saveActiveCompany(patch = {}) {
  const settings = getCompanies();
  const activeId = getActiveCompanyId();
  const companies = settings.companies.map((c) => c.id === activeId ? normalizeCompany({ ...c, ...patch, updatedAt: new Date().toISOString() }) : c);
  const next = saveCompanies({ ...settings, activeCompanyId: activeId, companies });
  window.dispatchEvent(new CustomEvent('company-updated', { detail: { company: getActiveCompany() } }));
  hydrateNav();
  return getActiveCompany();
}

function activeCompanyId() {
  return getActiveCompanyId();
}

function saveCompany(company) {
  const settings = getCompanies();
  const nextCompany = normalizeCompany(company);
  const companies = companiesArray(settings);
  const index = companies.findIndex((c) => c.id === nextCompany.id);
  const nextCompanies = [...companies];
  if (index >= 0) nextCompanies[index] = { ...companies[index], ...nextCompany, updatedAt: new Date().toISOString() };
  else nextCompanies.push(nextCompany);
  const next = saveCompanies({ ...settings, companies: nextCompanies, activeCompanyId: nextCompany.id });
  window.dispatchEvent(new CustomEvent('company-updated', { detail: { company: nextCompany } }));
  hydrateNav?.();
  return next;
}

function switchActiveCompany(id) {
  const activeId = setActiveCompanyId(id);
  return { ...getCompanies(), activeCompanyId: activeId };
}

function deleteCompany(id) {
  const settings = getCompanies();
  let companies = companiesArray(settings).filter((c) => c.id !== id);
  if (!companies.length) companies = [normalizeCompany(defaultCompany())];
  const activeCompanyId = settings.activeCompanyId === id ? companies[0].id : (settings.activeCompanyId || companies[0].id);
  const next = saveCompanies({ companies, activeCompanyId });
  window.dispatchEvent(new CustomEvent('company-updated', { detail: { company: getActiveCompany() } }));
  hydrateNav?.();
  return next;
}

async function settingsRequest(endpoint, payload, method = 'POST') {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo sincronizar configuración.');
  return data;
}

async function loadSettingsRemote() {
  if (!isLoggedIn()) return getCompanies();
  const data = await settingsRequest('get-settings', null, 'GET');
  if (data.settings) return saveCompanies(data.settings);
  return getCompanies();
}

async function saveSettingsRemote(settings = getCompanies()) {
  const normalized = saveCompanies(settings);
  if (!isLoggedIn()) return normalized;
  const data = await settingsRequest('save-settings', { settings: normalized });
  return data.settings ? saveCompanies(data.settings) : normalized;
}


function getToken() {
  return localStorage.getItem(EC_AUTH_KEY);
}

function getUser() {
  try { return JSON.parse(localStorage.getItem(EC_USER_KEY) || '{}'); }
  catch { return {}; }
}

function isLoggedIn() {
  return Boolean(getToken());
}

function setSession({ token, user }) {
  localStorage.setItem(EC_AUTH_KEY, token);
  localStorage.setItem(EC_USER_KEY, JSON.stringify(user || {}));
}

function clearSession() {
  localStorage.removeItem(EC_AUTH_KEY);
  localStorage.removeItem(EC_USER_KEY);
}

function requireAuth() {
  if (!isLoggedIn()) {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
  }
}

function redirectIfLoggedIn() {
  if (isLoggedIn()) {
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get('next') || '/dashboard';
  }
}

function setMessage(selector, text, type = '') {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  el.textContent = text;
  el.className = `form-message small fw-semibold mt-3 mb-0 ${type}`.trim();
}

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

function hydrateNav() {
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  const user = getUser();
  const authOnly = document.querySelectorAll('[data-auth-only]');
  const guestOnly = document.querySelectorAll('[data-guest-only]');
  authOnly.forEach((el) => el.classList.toggle('d-none', !isLoggedIn()));
  guestOnly.forEach((el) => el.classList.toggle('d-none', isLoggedIn()));

  const activeCompany = isLoggedIn() ? getActiveCompany() : null;
  document.querySelectorAll('[data-business-name]').forEach((el) => {
    el.textContent = activeCompany?.name || user.businessName || user.email || 'Mi cuenta';
  });

  document.querySelectorAll('[data-company-switcher]').forEach((wrap) => {
    const companies = companiesArray(getCompanies());
    wrap.innerHTML = companies.map((company) => `
      <button class="dropdown-item rounded-3 d-flex justify-content-between align-items-center" type="button" data-company-option="${company.id}">
        <span><strong>${company.name}</strong><br><small class="text-secondary">${company.taxId || 'Sin RFC configurado'}</small></span>
        ${company.id === getActiveCompanyId() ? '<span class="badge text-bg-success">Activa</span>' : ''}
      </button>
    `).join('') || '<span class="dropdown-item text-secondary">Sin empresas</span>';
    wrap.querySelectorAll('[data-company-option]').forEach((button) => {
      button.addEventListener('click', async () => {
        setActiveCompanyId(button.getAttribute('data-company-option'));
        hydrateNav();
        try {
          if (typeof loadAnalysisRemote === 'function') {
            const analysis = await loadAnalysisRemote();
            window.dispatchEvent(new CustomEvent('analysis-updated', { detail: { analysis } }));
          }
        } catch {}
        if (!location.pathname.startsWith('/settings')) location.reload();
      });
    });
  });

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', () => {
      clearSession();
      window.location.href = '/login';
    });
  });

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const href = link.getAttribute('href')?.replace(/\/$/, '') || '/';
    link.classList.toggle('active', href === path);
  });
}

document.addEventListener('DOMContentLoaded', hydrateNav);

// Operational sidebar behavior
(function initSidebarShell(){
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-sidebar-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    });
    document.querySelectorAll('[data-sidebar-backdrop]').forEach((backdrop) => {
      backdrop.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    });
    document.querySelectorAll('.ec-sidebar a[data-nav-link]').forEach((link) => {
      link.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    });
  });
})();
