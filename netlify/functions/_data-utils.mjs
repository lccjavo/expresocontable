import { connectLambda, getStore } from '@netlify/blobs';
import jwt from 'jsonwebtoken';
import { json } from './_auth-utils.mjs';

const SECRET = process.env.JWT_SECRET || 'dev-only-change-me-expreso-contable';

export function safeConnectLambda(event = {}) {
  try {
    if (event && event.blobs) connectLambda(event);
  } catch (error) {
    console.warn('Netlify Blobs context was not available:', error.message);
  }
}


export function getBearerToken(event = {}) {
  const headers = event.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

export function requireUser(event = {}) {
  const token = getBearerToken(event);
  if (!token) return { error: json(401, { error: 'Primero inicia sesión.' }) };
  try {
    const user = jwt.verify(token, SECRET);
    return { user };
  } catch {
    return { error: json(401, { error: 'Sesión inválida o expirada.' }) };
  }
}

export function getAnalysisStore() {
  return getStore('expreso-contable-analysis');
}

export function safeCompanyId(companyId = '') {
  const raw = String(companyId || 'default').trim().toLowerCase();
  return raw.replace(/[^a-z0-9_-]/g, '-') || 'default';
}

export function analysisKey(email, companyId = 'default') {
  return `analysis/${String(email || '').trim().toLowerCase()}/${safeCompanyId(companyId)}.json`;
}

export function legacyAnalysisKey(email) {
  return `analysis/${String(email || '').trim().toLowerCase()}.json`;
}

export function settingsKey(email) {
  return `settings/${String(email || '').trim().toLowerCase()}.json`;
}

export function emptyAnalysis(email = '', companyId = 'default') {
  return {
    owner: String(email || '').trim().toLowerCase(),
    companyId: safeCompanyId(companyId),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    taxId: '',
    profile: {},
    totals: {
      ingresos: 0,
      gastos: 0,
      ivaTrasladadoIngresos: 0,
      ivaAcreditableGastos: 0,
      retencionesIngresos: 0,
      retencionesGastos: 0,
      impuestoEstimado: 0,
      facturas: 0,
      ingresosCount: 0,
      gastosCount: 0,
      desconocidosCount: 0,
      duplicados: 0,
      errores: 0,
      pdfs: 0,
      zips: 0,
      divisasCount: 0
    },
    invoices: [],
    products: {},
    byMonth: {},
    byYear: {},
    sourceFiles: [],
    uploadHistory: []
  };
}

export async function loadAnalysisFor(email, companyId = 'default') {
  const store = getAnalysisStore();
  const key = analysisKey(email, companyId);
  let found = await store.get(key, { type: 'json' });
  if (!found && safeCompanyId(companyId) === 'default') {
    found = await store.get(legacyAnalysisKey(email), { type: 'json' });
  }
  return found || emptyAnalysis(email, companyId);
}

export async function saveAnalysisFor(email, analysis, companyId = 'default') {
  const normalized = {
    ...emptyAnalysis(email, companyId),
    ...(analysis || {}),
    owner: String(email || '').trim().toLowerCase(),
    companyId: safeCompanyId(companyId || analysis?.companyId || 'default'),
    updatedAt: new Date().toISOString()
  };
  if (!normalized.createdAt) normalized.createdAt = normalized.updatedAt;
  const store = getAnalysisStore();
  await store.setJSON(analysisKey(email, normalized.companyId), normalized);
  return normalized;
}

export function normalizeSettings(settings = {}, email = '') {
  const now = new Date().toISOString();
  const incoming = Array.isArray(settings.companies) ? settings.companies : [];
  const fallback = { id: 'default', name: 'Mi empresa', taxId: '', taxRegime: 'actividad-empresarial', createdAt: now, updatedAt: now };
  const companies = (incoming.length ? incoming : [fallback]).map((company, index) => {
    const taxId = String(company.taxId || '').replace(/[^A-ZÑ&0-9]/gi, '').toUpperCase().trim();
    const id = safeCompanyId(company.id || (taxId ? `rfc-${taxId}` : (index === 0 ? 'default' : `company-${index + 1}`)));
    return {
      id,
      name: String(company.name || company.businessName || taxId || 'Mi empresa').trim(),
      taxId,
      taxRegime: company.taxRegime || 'actividad-empresarial',
      createdAt: company.createdAt || now,
      updatedAt: now
    };
  });
  const activeCompanyId = companies.some((c) => c.id === safeCompanyId(settings.activeCompanyId))
    ? safeCompanyId(settings.activeCompanyId)
    : companies[0].id;
  return { owner: String(email || '').trim().toLowerCase(), activeCompanyId, companies, updatedAt: now };
}

export async function loadSettingsFor(email) {
  const store = getAnalysisStore();
  const found = await store.get(settingsKey(email), { type: 'json' });
  return normalizeSettings(found || {}, email);
}

export async function saveSettingsFor(email, settings) {
  const normalized = normalizeSettings(settings, email);
  const store = getAnalysisStore();
  await store.setJSON(settingsKey(email), normalized);
  return normalized;
}
