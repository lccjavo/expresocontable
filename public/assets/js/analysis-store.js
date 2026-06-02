const EC_ANALYSIS_KEY = 'expreso_contable_analysis_v1';
const EC_PROFILE_KEY = 'expreso_contable_profile_v1';
const EC_FILTER_KEY = 'expreso_contable_filters_v1';

const DEFAULT_COMPANY_ID = 'default-company';
const ACCOUNT_ANALYSIS_ID = 'account';


function analysisCompanies() {
  if (typeof companiesArray === 'function' && typeof getCompanies === 'function') return companiesArray(getCompanies());
  try { return (JSON.parse(localStorage.getItem(EC_PROFILE_KEY) || '{}').companies || []).map(normalizeCompany); }
  catch { return []; }
}

function relationForCompany(inv, company = getActiveCompany()) {
  if (!company?.id) return null;
  const relations = Array.isArray(inv?.companyRelations) ? inv.companyRelations : [];
  const explicit = relations.find((r) => r.companyId === company.id);
  if (explicit) return explicit;

  // Compatibilidad con CFDI guardados antes de companyRelations.
  const taxId = normalizeRfc(company.taxId);
  if (!taxId) return null;
  if (normalizeRfc(inv?.emisorRfc) === taxId) return { companyId: company.id, taxId, kind: 'ingreso', role: 'emisor' };
  if (normalizeRfc(inv?.receptorRfc) === taxId) return { companyId: company.id, taxId, kind: 'gasto', role: 'receptor' };
  return null;
}

function kindForActiveCompany(inv) {
  return relationForCompany(inv)?.kind || inv?.kind || 'desconocido';
}

function invoiceBelongsToActiveCompany(inv) {
  const company = getActiveCompany();
  if (!company?.id && !normalizeRfc(company?.taxId)) return true;
  return Boolean(relationForCompany(inv, company));
}

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
}

function numberFmt(value) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function percentFmt(value) {
  return `${numberFmt(Number(value || 0) * 100)}%`;
}

function normalizeRfc(value) {
  return String(value || '').replace(/[^A-ZÑ&0-9]/gi, '').toUpperCase().trim();
}

function normalizeCurrency(value) {
  return String(value || 'MXN').trim().toUpperCase() || 'MXN';
}

function exchangeRateFor(moneda, tipoCambioRaw) {
  const currency = normalizeCurrency(moneda);
  const rate = Number(tipoCambioRaw || 1) || 1;
  return (currency === 'MXN' || currency === 'XXX') ? 1 : rate;
}

function padMonth(value) {
  const cleaned = String(value || '').replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  const n = Number(cleaned.slice(0, 2));
  return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : '';
}


const MONTH_NAMES_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function monthName(value) {
  const n = Number(padMonth(value));
  return MONTH_NAMES_ES[n] || String(value || '');
}

function periodLabel(period) {
  const value = String(period || '');
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (match) return `${monthName(match[2])} ${match[1]}`;
  if (/^\d{4}$/.test(value)) return value;
  return value || 'Todos los periodos';
}

function invoiceFiscalDate(invoice) {
  return String(invoice?.periodoFiscalFecha || invoice?.fechaFiscal || invoice?.fecha || '').slice(0, 10);
}

function ivaNetoValue(analysis) {
  const totals = analysis?.totals || {};
  return Number(totals.ivaTrasladadoIngresos || 0) - Number(totals.ivaAcreditableGastos || 0);
}

function ivaStatusLabel(value) {
  const amount = Number(value || 0);
  if (amount > 0) return `${money(amount)} a pagar`;
  if (amount < 0) return `${money(Math.abs(amount))} a favor`;
  return money(0);
}


function amountMxn(inv, field) {
  if (!inv) return 0;
  const directMxn = Number(inv[`${field}Mxn`]);
  if (Number.isFinite(directMxn) && directMxn) return directMxn;
  const value = Number(inv[field] || 0);
  const currency = normalizeCurrency(inv.moneda || inv.monedaOriginal || 'MXN');
  if (currency === 'MXN' || currency === 'XXX') return value;
  if (inv.exchangeApplied) return value;
  return Number((value * exchangeRateFor(currency, inv.tipoCambio || inv.tipoCambioOriginal)).toFixed(2));
}

function getProfile() {
  try {
    if (typeof getActiveCompany === 'function') {
      const company = getActiveCompany();
      return {
        companyId: company.id,
        activeCompanyId: typeof activeCompanyId === 'function' ? activeCompanyId() : company.id,
        companies: typeof analysisCompanies === 'function' ? analysisCompanies() : [company],
        businessName: company.name,
        taxId: company.taxId || '',
        taxRegime: company.taxRegime || 'actividad-empresarial'
      };
    }
    return JSON.parse(localStorage.getItem(EC_PROFILE_KEY) || '{}');
  } catch {
    try { return JSON.parse(localStorage.getItem(EC_PROFILE_KEY) || '{}'); }
    catch { return {}; }
  }
}

function saveProfile(profile) {
  const current = getProfile();
  const next = {
    ...current,
    ...profile,
    taxId: normalizeRfc(profile.taxId ?? current.taxId),
    taxRegime: profile.taxRegime || current.taxRegime || 'actividad-empresarial'
  };
  if (typeof saveActiveCompany === 'function') {
    const company = saveActiveCompany({
      name: next.businessName || next.name || current.businessName || current.name,
      taxId: next.taxId,
      taxRegime: next.taxRegime
    });
    if (typeof saveSettingsRemote === 'function' && typeof isLoggedIn === 'function' && isLoggedIn()) {
      saveSettingsRemote().catch((error) => console.warn('No se pudo guardar configuración:', error.message));
    }
    return { ...next, companyId: company.id, businessName: company.name };
  }
  localStorage.setItem(EC_PROFILE_KEY, JSON.stringify(next));
  return next;
}

function emptyAnalysis() {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    taxId: getProfile().taxId || '',
    profile: getProfile(),
    activeCompanyId: activeCompanyId(),
    companies: analysisCompanies(),
    totals: {
      ingresos: 0,
      gastos: 0,
      ingresosSubtotal: 0,
      gastosSubtotal: 0,
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
    uploadHistory: [],
    declarations: []
  };
}


function declarationPeriodMonth(declaration) {
  const year = String(declaration?.fiscal_year || declaration?.fiscalYear || '').trim();
  const month = padMonth(declaration?.period || declaration?.month || declaration?.periodMonth || '');
  if (year && month) return `${year}-${month}`;
  const submitted = String(declaration?.submitted_at || declaration?.submittedAt || '').slice(0, 7);
  return submitted || 'Sin fecha';
}

function declarationYear(declaration) {
  const year = String(declaration?.fiscal_year || declaration?.fiscalYear || '').trim();
  if (year) return year;
  return String(declaration?.submitted_at || declaration?.submittedAt || '').slice(0, 4) || 'Sin fecha';
}

function declarationMatches(declaration, filters = {}) {
  const company = typeof getActiveCompany === 'function' ? getActiveCompany() : getProfile();
  const taxId = normalizeRfc(company?.taxId);
  if (taxId && normalizeRfc(declaration?.rfc) !== taxId) return false;
  const month = declarationPeriodMonth(declaration);
  const year = declarationYear(declaration);
  if (filters.year && year !== filters.year) return false;
  if (filters.month && month !== filters.month) return false;
  const date = String(declaration?.submitted_at || declaration?.submittedAt || '').slice(0, 10);
  if (filters.from && (!date || date < filters.from)) return false;
  if (filters.to && (!date || date > filters.to)) return false;
  if (filters.rfc && !normalizeRfc(declaration?.rfc).includes(filters.rfc)) return false;
  return true;
}

function filterDeclarations(declarations, filters = readFiltersFromDom()) {
  return (declarations || []).filter((d) => declarationMatches(d, filters));
}

function mergeDeclarations(existing = [], incoming = []) {
  const out = [...(existing || [])];
  const seen = new Set(out.map((d) => `${normalizeRfc(d.rfc)}|${declarationPeriodMonth(d)}|${d.operation_number || d.operationNumber || d.id || d.source_file_name || ''}`));
  for (const d of incoming || []) {
    const key = `${normalizeRfc(d.rfc)}|${declarationPeriodMonth(d)}|${d.operation_number || d.operationNumber || d.id || d.source_file_name || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function currentAnalysisKey() {
  return `${EC_ANALYSIS_KEY}:${ACCOUNT_ANALYSIS_ID}`;
}

function loadAnalysis() {
  try {
    const key = currentAnalysisKey();
    const parsed = JSON.parse(localStorage.getItem(key) || localStorage.getItem(EC_ANALYSIS_KEY) || 'null');
    return parsed && parsed.totals ? parsed : emptyAnalysis();
  } catch {
    return emptyAnalysis();
  }
}

function saveAnalysis(analysis) {
  analysis.updatedAt = new Date().toISOString();
  analysis.profile = getProfile();
  analysis.activeCompanyId = activeCompanyId();
  analysis.companies = analysisCompanies();
  localStorage.setItem(currentAnalysisKey(), JSON.stringify(analysis));
  window.dispatchEvent(new CustomEvent('analysis-updated', { detail: { analysis } }));
  return analysis;
}

async function authJson(endpoint, options = {}) {
  const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('expreso_contable_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/.netlify/functions/${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

async function loadAnalysisRemote() {
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) return loadAnalysis();
  const companyId = ACCOUNT_ANALYSIS_ID;
  const data = await authJson(`get-analysis?companyId=${encodeURIComponent(companyId)}`, { method: 'GET', headers: {} });
  if (data.analysis) {
    const local = loadAnalysis();
    const localHasData = (local.invoices || []).length > 0 || (local.declarations || []).length > 0;
    const serverNewer = (data.analysis.updatedAt || '') >= (local.updatedAt || '');
    if (serverNewer || !localHasData) {
      if (data.analysis.profile && typeof saveProfile === 'function') saveProfile(data.analysis.profile);
      const recomputed = recomputeAnalysis({ ...emptyAnalysis(), ...data.analysis, invoices: data.analysis.invoices || [] });
      saveAnalysis(recomputed);
      return recomputed;
    }
    return local;
  }
  return loadAnalysis();
}

async function saveAnalysisRemote(analysis) {
  const recomputed = recomputeAnalysis(analysis);
  saveAnalysis(recomputed);
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) return recomputed;
  const companyId = ACCOUNT_ANALYSIS_ID;
  recomputed.companyId = companyId;
  recomputed.profile = { ...(recomputed.profile || {}), ...getProfile() };
  const data = await authJson('save-analysis', { method: 'POST', body: JSON.stringify({ companyId, analysis: recomputed }) });
  if (data.analysis) {
    const normalized = recomputeAnalysis({ ...emptyAnalysis(), ...data.analysis, invoices: data.analysis.invoices || [] });
    saveAnalysis(normalized);
    return normalized;
  }
  return recomputed;
}

async function clearAnalysisRemote(scope = 'all', period = '') {
  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    const companyId = ACCOUNT_ANALYSIS_ID;
    const data = await authJson('clear-analysis', { method: 'POST', body: JSON.stringify({ companyId, scope, month: period, year: period, activeCompanyId: activeCompanyId() }) });
    const next = data.analysis ? recomputeAnalysis(data.analysis) : emptyAnalysis();
    saveAnalysis(next);
    return next;
  }
  const current = loadAnalysis();
  let next = emptyAnalysis();
  if (scope === 'month' && period) {
    next = { ...current, invoices: (current.invoices || []).filter((inv) => invoiceMonth(inv) !== period) };
    next = recomputeAnalysis(next);
  } else if (scope === 'year' && period) {
    next = { ...current, invoices: (current.invoices || []).filter((inv) => invoiceYear(inv) !== period) };
    next = recomputeAnalysis(next);
  }
  saveAnalysis(next);
  return next;
}

function clearAnalysis() {
  const next = emptyAnalysis();
  saveAnalysis(next);
  return next;
}

function invoiceMonth(invoice) {
  if (invoice?.periodoFiscalMes && invoice?.periodoFiscalAnio) return `${invoice.periodoFiscalAnio}-${padMonth(invoice.periodoFiscalMes)}`;
  return String(invoiceFiscalDate(invoice) || '').slice(0, 7) || 'Sin fecha';
}

function invoiceYear(invoice) {
  if (invoice?.periodoFiscalAnio) return String(invoice.periodoFiscalAnio);
  return String(invoiceFiscalDate(invoice) || '').slice(0, 4) || 'Sin fecha';
}

function recomputeAnalysis(analysis) {
  analysis ||= emptyAnalysis();
  analysis.invoices ||= [];
  analysis.declarations ||= [];
  const previous = analysis.totals || {};
  const totals = {
    ingresos: 0,
    gastos: 0,
    ingresosSubtotal: 0,
    gastosSubtotal: 0,
    ivaTrasladadoIngresos: 0,
    ivaAcreditableGastos: 0,
    retencionesIngresos: 0,
    retencionesGastos: 0,
    impuestoEstimado: 0,
    facturas: analysis.invoices.length,
    ingresosCount: 0,
    gastosCount: 0,
    desconocidosCount: 0,
    duplicados: previous.duplicados || 0,
    errores: previous.errores || 0,
    pdfs: previous.pdfs || 0,
    zips: previous.zips || 0,
    divisasCount: 0
  };
  const products = {};
  const byMonth = {};
  const byYear = {};

  for (const inv of analysis.invoices) {
    const month = invoiceMonth(inv);
    const year = invoiceYear(inv);
    byMonth[month] ||= { ingresos: 0, gastos: 0, ivaIngresos: 0, ivaGastos: 0, count: 0, invoices: 0 };
    byYear[year] ||= { ingresos: 0, gastos: 0, ivaIngresos: 0, ivaGastos: 0, count: 0, invoices: 0 };
    byMonth[month].count += 1;
    byMonth[month].invoices += 1;
    byYear[year].count += 1;
    byYear[year].invoices += 1;
    const totalMxn = amountMxn(inv, 'total');
    const subtotalMxn = amountMxn(inv, 'subtotal');
    const ivaMxn = amountMxn(inv, 'ivaTrasladado');
    const activeKind = kindForActiveCompany(inv);
    const retMxn = amountMxn(inv, 'retenciones');
    if (normalizeCurrency(inv.moneda || inv.monedaOriginal) !== 'MXN' && normalizeCurrency(inv.moneda || inv.monedaOriginal) !== 'XXX') totals.divisasCount += 1;

    if (activeKind === 'ingreso') {
      totals.ingresos += totalMxn;
      totals.ingresosSubtotal += subtotalMxn;
      totals.ivaTrasladadoIngresos += ivaMxn;
      totals.retencionesIngresos += retMxn;
      totals.ingresosCount += 1;
      byMonth[month].ingresos += totalMxn;
      byMonth[month].ivaIngresos += ivaMxn;
      byYear[year].ingresos += totalMxn;
      byYear[year].ivaIngresos += ivaMxn;
      for (const item of inv.concepts || []) {
        const key = String(item.descripcion || 'Sin descripción').trim().toUpperCase();
        products[key] ||= { descripcion: item.descripcion || 'Sin descripción', cantidad: 0, importe: 0, facturas: 0, rfcs: new Set(), months: new Set() };
        products[key].cantidad += Number(item.cantidad || 0);
        products[key].importe += Number(item.importe || 0);
        products[key].facturas += 1;
        products[key].rfcs.add(inv.receptorRfc || '');
        products[key].months.add(month);
      }
    } else if (activeKind === 'gasto') {
      totals.gastos += totalMxn;
      totals.gastosSubtotal += subtotalMxn;
      totals.ivaAcreditableGastos += ivaMxn;
      totals.retencionesGastos += retMxn;
      totals.gastosCount += 1;
      byMonth[month].gastos += totalMxn;
      byMonth[month].ivaGastos += ivaMxn;
      byYear[year].gastos += totalMxn;
      byYear[year].ivaGastos += ivaMxn;
    } else {
      totals.desconocidosCount += 1;
    }
  }

  for (const p of Object.values(products)) {
    p.rfcs = Array.from(p.rfcs).filter(Boolean);
    p.months = Array.from(p.months).filter(Boolean);
  }
  totals.impuestoEstimado = Math.max(0, (totals.ivaTrasladadoIngresos - totals.ivaAcreditableGastos) - totals.retencionesIngresos);
  analysis.totals = totals;
  analysis.products = products;
  analysis.byMonth = byMonth;
  analysis.byYear = byYear;
  return analysis;
}

function getFilters() {
  try { return JSON.parse(sessionStorage.getItem(EC_FILTER_KEY) || '{}'); }
  catch { return {}; }
}

function saveFilters(filters) {
  sessionStorage.setItem(EC_FILTER_KEY, JSON.stringify(filters || {}));
  return filters || {};
}

function readFiltersFromDom() {
  if (!document.querySelector('[data-filter]')) return getFilters();
  const data = {
    year: document.querySelector('[data-filter="year"]')?.value || '',
    from: document.querySelector('[data-filter="from"]')?.value || '',
    to: document.querySelector('[data-filter="to"]')?.value || '',
    month: document.querySelector('[data-filter="month"]')?.value || '',
    rfc: normalizeRfc(document.querySelector('[data-filter="rfc"]')?.value || ''),
    product: String(document.querySelector('[data-filter="product"]')?.value || '').trim().toLowerCase(),
    kind: document.querySelector('[data-filter="kind"]')?.value || '',
  };
  saveFilters(data);
  return data;
}

function invoiceMatches(inv, filters = {}) {
  if (!invoiceBelongsToActiveCompany(inv)) return false;
  const date = invoiceFiscalDate(inv);
  const month = invoiceMonth(inv);
  const year = invoiceYear(inv);

  if (filters.year && year !== filters.year) return false;
  if (filters.month && month !== filters.month) return false;
  // Si el usuario filtra por fecha, una factura sin fecha no debe quedarse en los resultados.
  if (filters.from && (!date || date < filters.from)) return false;
  if (filters.to && (!date || date > filters.to)) return false;
  const activeKind = kindForActiveCompany(inv);
  if (filters.kind && activeKind !== filters.kind) return false;

  if (filters.rfc) {
    const rfcs = [inv.emisorRfc, inv.receptorRfc].map(normalizeRfc);
    if (!rfcs.some((r) => r.includes(filters.rfc))) return false;
  }

  if (filters.product) {
    const needle = String(filters.product || '').trim().toLowerCase();
    const haystack = [
      inv.fileName,
      inv.emisorNombre,
      inv.receptorNombre,
      ...(inv.concepts || []).flatMap((c) => [c.descripcion, c.claveProdServ, c.claveUnidad])
    ].map((v) => String(v || '').toLowerCase()).join(' | ');
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

function filterInvoices(invoices, filters = readFiltersFromDom()) {
  return (invoices || []).filter((inv) => invoiceMatches(inv, filters));
}

function analysisFromInvoices(base, invoices) {
  const next = { ...emptyAnalysis(), ...base, invoices: [...(invoices || [])] };
  return recomputeAnalysis(next);
}

function uniqueYears(analysis = loadAnalysis()) {
  const years = new Set();
  for (const inv of filterInvoices(analysis.invoices || [], {})) {
    const year = invoiceYear(inv);
    if (year && year !== 'Sin fecha') years.add(year);
  }
  for (const dec of filterDeclarations(analysis.declarations || [], {})) {
    const year = declarationYear(dec);
    if (year && year !== 'Sin fecha') years.add(year);
  }
  return Array.from(years).sort().reverse();
}

function defaultYear(analysis = loadAnalysis()) {
  const years = uniqueYears(analysis);
  const current = String(new Date().getFullYear());
  return years.includes(current) ? current : (years[0] || current);
}

function uniqueMonths(analysis = loadAnalysis(), year = '') {
  const months = new Set();
  for (const inv of filterInvoices(analysis.invoices || [], {})) {
    const month = invoiceMonth(inv);
    if (!month || month === 'Sin fecha') continue;
    if (year && !month.startsWith(`${year}-`)) continue;
    months.add(month);
  }
  for (const dec of filterDeclarations(analysis.declarations || [], {})) {
    const month = declarationPeriodMonth(dec);
    if (!month || month === 'Sin fecha') continue;
    if (year && !month.startsWith(`${year}-`)) continue;
    months.add(month);
  }
  return Array.from(months).sort().reverse();
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((el) => { el.textContent = value; });
}

function downloadCSV(headers, rows, filename) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map((r) => r.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}


function renderMissingExpenseNotice(analysis = loadAnalysis()) {
  const container = document.querySelector('[data-expense-warning]');
  if (!container) return;
  const base = recomputeAnalysis(analysis);
  const hasFilterUi = Boolean(document.querySelector('[data-filter]'));
  const filtered = analysisFromInvoices(base, filterInvoices(base.invoices || [], hasFilterUi ? readFiltersFromDom() : {}));
  const t = filtered.totals || {};
  if ((t.ingresosCount || 0) > 0 && (t.gastosCount || 0) === 0) {
    container.innerHTML = '<div class="alert alert-warning border-0 rounded-4 mb-4"><strong>Ojo:</strong> no hay facturas de gastos para esta empresa/periodo. El cálculo no considera deducciones ni IVA acreditable; sube tus gastos para tener un estimado más completo.</div>';
  } else {
    container.innerHTML = '';
  }
}

function hydrateAnalysisSummary(analysis = loadAnalysis()) {
  const base = recomputeAnalysis(analysis);
  const hasFilterUi = Boolean(document.querySelector('[data-filter]'));
  const activeFiltered = filterInvoices(base.invoices || [], hasFilterUi ? readFiltersFromDom() : {});
  const a = analysisFromInvoices(base, activeFiltered);
  setText('[data-metric="ingresos"]', money(a.totals.ingresos));
  setText('[data-metric="gastos"]', money(a.totals.gastos));
  setText('[data-metric="iva"]', ivaStatusLabel(ivaNetoValue(a)));
  setText('[data-metric="estimado"]', money(a.totals.impuestoEstimado));
  setText('[data-metric="facturas"]', numberFmt(a.totals.facturas));
  setText('[data-metric="ingresos-count"]', numberFmt(a.totals.ingresosCount));
  setText('[data-metric="gastos-count"]', numberFmt(a.totals.gastosCount));
  setText('[data-metric="divisas-count"]', numberFmt(a.totals.divisasCount || 0));
  setText('[data-metric="actualizado"]', a.updatedAt ? new Date(a.updatedAt).toLocaleString('es-MX') : 'Sin análisis');
  renderMissingExpenseNotice(base);
}

function hydrateMetricSummary(analysis = loadAnalysis()) {
  // Resumen usado por páginas con filtros. Actualiza las tarjetas principales
  // para que cada cambio de fecha/RFC/producto/tipo se vea inmediatamente.
  const a = recomputeAnalysis(analysis);
  setText('[data-metric="ingresos"]', money(a.totals.ingresos));
  setText('[data-metric="gastos"]', money(a.totals.gastos));
  setText('[data-metric="iva"]', ivaStatusLabel(ivaNetoValue(a)));
  setText('[data-metric="estimado"]', money(a.totals.impuestoEstimado));
  setText('[data-metric="facturas"]', numberFmt(a.totals.facturas));
  setText('[data-metric="ingresos-count"]', numberFmt(a.totals.ingresosCount));
  setText('[data-metric="gastos-count"]', numberFmt(a.totals.gastosCount));
  setText('[data-metric="divisas-count"]', numberFmt(a.totals.divisasCount || 0));
}

function populateFilterControls() {
  const filters = getFilters();
  const analysis = recomputeAnalysis(loadAnalysis());

  document.querySelectorAll('[data-year-options]').forEach((select) => {
    const current = select.value;
    const years = uniqueYears(analysis);
    const label = select.getAttribute('data-empty-label') || 'Todos los años';
    select.innerHTML = `<option value="">${label}</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}`;
    const wanted = current || filters.year || (select.hasAttribute('data-default-current-year') ? defaultYear(analysis) : '');
    select.value = years.includes(wanted) ? wanted : '';
  });

  document.querySelectorAll('[data-filter]').forEach((el) => {
    const key = el.getAttribute('data-filter');
    if (filters[key] && key !== 'year' && key !== 'month') el.value = filters[key];
  });

  const selectedYear = document.querySelector('[data-filter="year"]')?.value || filters.year || '';
  document.querySelectorAll('[data-month-options]').forEach((select) => {
    const current = select.value;
    const months = uniqueMonths(analysis, selectedYear);
    const label = select.getAttribute('data-empty-label') || 'Todos los meses';
    select.innerHTML = `<option value="">${label}</option>${months.map((m) => `<option value="${m}">${periodLabel(m)}</option>`).join('')}`;
    const wanted = current || filters.month || '';
    select.value = months.includes(wanted) ? wanted : '';
  });

  // Normaliza filtros guardados contra las opciones visibles. Esto evita que
  // páginas distintas sigan usando un mes/año obsoleto después de subir nuevos XML.
  if (document.querySelector('[data-filter]')) {
    saveFilters({ ...filters, ...readFiltersFromDom() });
  }
}

function bindFilterControls() {
  populateFilterControls();
  document.querySelectorAll('[data-filter]').forEach((el) => {
    if (el.dataset.filterBound === '1') return;
    el.dataset.filterBound = '1';
    const notify = () => {
      if (el.getAttribute('data-filter') === 'year') {
        document.querySelectorAll('[data-filter="month"]').forEach((monthEl) => { monthEl.value = ''; });
        saveFilters({ ...getFilters(), year: el.value, month: '' });
        populateFilterControls();
      }
      readFiltersFromDom();
      hydrateAnalysisSummary(loadAnalysis());
      window.dispatchEvent(new CustomEvent('analysis-filter-changed'));
    };
    el.addEventListener('input', notify);
    el.addEventListener('change', notify);
  });
  document.querySelectorAll('[data-clear-filters]').forEach((button) => {
    if (button.dataset.filterBound === '1') return;
    button.dataset.filterBound = '1';
    button.addEventListener('click', () => {
      saveFilters({});
      document.querySelectorAll('[data-filter]').forEach((el) => { el.value = ''; });
      populateFilterControls();
      hydrateAnalysisSummary(loadAnalysis());
      window.dispatchEvent(new CustomEvent('analysis-filter-changed'));
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof isLoggedIn === 'function' && isLoggedIn() && typeof loadSettingsRemote === 'function') {
    try { await loadSettingsRemote(); hydrateNav(); } catch (error) { console.warn('No se pudo sincronizar configuración:', error.message); }
  }
  bindFilterControls();
  hydrateAnalysisSummary();
  if (typeof isLoggedIn === 'function' && isLoggedIn()) {
    try {
      const remote = await loadAnalysisRemote();
      populateFilterControls();
      hydrateAnalysisSummary(remote);
      window.dispatchEvent(new CustomEvent('analysis-updated', { detail: { analysis: remote } }));
    } catch (error) {
      console.warn('No se pudo sincronizar análisis persistente:', error.message);
    }
  }
});
