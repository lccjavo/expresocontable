import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const routes = [
  'public/index.html',
  'public/login/index.html',
  'public/register/index.html',
  'public/dashboard/index.html',
  'public/uploads/index.html',
  'public/uploads/progreso/index.html',
  'public/facturas/index.html',
  'public/declaraciones/index.html',
  'public/conciliacion/index.html',
  'public/reportes/index.html',
  'public/productos/index.html',
  'public/calculo-impuestos/index.html',
  'public/settings/index.html',
];

test('all clean-route pages exist', async () => {
  for (const route of routes) await access(route);
});

test('Netlify config keeps build, publish and functions directories stable', async () => {
  const toml = await readFile('netlify.toml', 'utf8');
  assert.match(toml, /command\s*=\s*"npm run build"/);
  assert.match(toml, /publish\s*=\s*"public"/);
  assert.match(toml, /functions\s*=\s*"netlify\/functions"/);
  assert.match(toml, /node_bundler\s*=\s*"esbuild"/);
});

test('SPA redirects preserve clean routes without .html URLs', async () => {
  const redirects = await readFile('public/_redirects', 'utf8');
  assert.match(redirects, /\/login\s+\/login\/index\.html\s+200/);
  assert.match(redirects, /\/register\s+\/register\/index\.html\s+200/);
  assert.match(redirects, /\/dashboard\s+\/dashboard\/index\.html\s+200/);
  assert.match(redirects, /\/uploads\s+\/uploads\/index\.html\s+200/);
  assert.match(redirects, /\/uploads\/progreso\s+\/uploads\/progreso\/index\.html\s+200/);
  assert.match(redirects, /\/facturas\s+\/facturas\/index\.html\s+200/);
  assert.match(redirects, /\/declaraciones\s+\/declaraciones\/index\.html\s+200/);
  assert.match(redirects, /\/conciliacion\s+\/conciliacion\/index\.html\s+200/);
  assert.match(redirects, /\/reportes\s+\/reportes\/index\.html\s+200/);
  assert.match(redirects, /\/productos\s+\/productos\/index\.html\s+200/);
  assert.match(redirects, /\/calculo-impuestos\s+\/calculo-impuestos\/index\.html\s+200/);
  assert.match(redirects, /\/settings\s+\/settings\/index\.html\s+200/);
});

test('build command runs unit tests before static build check', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.scripts.build, 'npm test && node scripts/build-check.mjs');
});


test('CFDI indexing uses fiscal period from InformacionGlobal when present', async () => {
  const uploadSource = await readFile('public/assets/js/uploads.js', 'utf8');
  const storeSource = await readFile('public/assets/js/analysis-store.js', 'utf8');
  const clearSource = await readFile('netlify/functions/clear-analysis.mjs', 'utf8');
  assert.match(uploadSource, /InformacionGlobal/);
  assert.match(uploadSource, /periodoFiscalFecha/);
  assert.match(uploadSource, /fechaEmision/);
  assert.match(storeSource, /periodoFiscalMes/);
  assert.match(storeSource, /invoiceFiscalDate/);
  assert.match(clearSource, /periodoFiscalMes/);
});

test('summaries expose IVA as a pagar or a favor', async () => {
  const storeSource = await readFile('public/assets/js/analysis-store.js', 'utf8');
  const pagesSource = await readFile('public/assets/js/analysis-pages.js', 'utf8');
  const uploadsHtml = await readFile('public/uploads/index.html', 'utf8');
  assert.match(storeSource, /ivaStatusLabel/);
  assert.match(pagesSource, /IVA neto/);
  assert.match(pagesSource, /a favor/);
  assert.match(uploadsHtml, /data-metric="iva"/);
});


test('settings page supports multiple companies and stored tax regime', async () => {
  const settingsHtml = await readFile('public/settings/index.html', 'utf8');
  const settingsJs = await readFile('public/assets/js/settings.js', 'utf8');
  const storeJs = await readFile('public/assets/js/analysis-store.js', 'utf8');
  assert.match(settingsHtml, /data-company-form/);
  assert.match(settingsHtml, /data-company-regime-input/);
  assert.doesNotMatch(settingsHtml, /data-company-resico-input/);
  assert.match(settingsJs, /saveCompany/);
  assert.match(settingsJs, /switchActiveCompany/);
  assert.match(storeJs, /activeCompanyId/);
  assert.match(storeJs, /companyRelations/);
  assert.match(storeJs, /ACCOUNT_ANALYSIS_ID/);
});

test('pages warn when expense invoices are missing', async () => {
  const dashboardHtml = await readFile('public/dashboard/index.html', 'utf8');
  const impuestosHtml = await readFile('public/calculo-impuestos/index.html', 'utf8');
  const pagesJs = await readFile('public/assets/js/analysis-pages.js', 'utf8');
  assert.match(dashboardHtml, /data-expense-warning/);
  assert.match(impuestosHtml, /data-expense-warning/);
  assert.match(pagesJs, /no hay facturas de gastos/i);
});


test('RESICO PF rate is automatic and not manually selected', async () => {
  const pagesJs = await readFile('public/assets/js/analysis-pages.js', 'utf8');
  const settingsHtml = await readFile('public/settings/index.html', 'utf8');
  const impuestosHtml = await readFile('public/calculo-impuestos/index.html', 'utf8');
  assert.match(pagesJs, /RESICO_PF_MONTHLY_RATES/);
  assert.match(pagesJs, /resicoPfRateForMonthlyIncome/);
  assert.doesNotMatch(settingsHtml, /data-company-resico-input/);
  assert.doesNotMatch(impuestosHtml, /data-resico-rate/);
});

test('uploads classify CFDI against all registered company RFCs, not only the active company', async () => {
  const uploadSource = await readFile('public/assets/js/uploads.js', 'utf8');
  const storeSource = await readFile('public/assets/js/analysis-store.js', 'utf8');
  assert.match(uploadSource, /classifyInvoiceForCompanies/);
  assert.match(uploadSource, /companiesForClassification/);
  assert.match(storeSource, /relationForCompany/);
});

test('analysis-store does not shadow company helpers from common.js', async () => {
  const storeSource = await readFile('public/assets/js/analysis-store.js', 'utf8');
  assert.doesNotMatch(storeSource, /function\s+getActiveCompany\s*\(/);
  assert.doesNotMatch(storeSource, /function\s+getCompanies\s*\(/);
  assert.match(storeSource, /analysisCompanies/);
});


test('declarations and reconciliation pages are wired', async () => {
  const uploadsHtml = await readFile('public/uploads/index.html', 'utf8');
  const pagesJs = await readFile('public/assets/js/analysis-pages.js', 'utf8');
  const storeJs = await readFile('public/assets/js/analysis-store.js', 'utf8');
  assert.match(uploadsHtml, /data-upload-mode="declaraciones"/);
  assert.match(pagesJs, /renderDeclaraciones/);
  assert.match(pagesJs, /renderConciliacion/);
  assert.match(storeJs, /declarations/);
  assert.match(storeJs, /filterDeclarations/);
});

test('SAT declaration parser extracts values by labels and page markers', async () => {
  const uploadSource = await readFile('public/assets/js/uploads.js', 'utf8');
  assert.match(uploadSource, /SAT_DECL_PAGE_/);
  assert.match(uploadSource, /extractAmountByLabels/);
  assert.match(uploadSource, /iva_base_no_objeto/);
  assert.match(uploadSource, /iva_pagado_gastos/);
  assert.match(uploadSource, /iva_no_acreditable_devoluciones_gastos/);
  assert.match(uploadSource, /isr_cantidad_a_cargo/);
  assert.match(uploadSource, /extraction_version: 'sat-declaration-label-v2'/);
});


test('upload file-list handler is defined before file input change event', async () => {
  const uploadSource = await readFile('public/assets/js/uploads.js', 'utf8');
  const uploadsHtml = await readFile('public/uploads/index.html', 'utf8');
  assert.match(uploadSource, /function\s+renderFileList\s*\(/);
  assert.match(uploadSource, /renderFiles\(document\.querySelector\('\[data-file-list\]'\)/);
  assert.match(uploadsHtml, /pdf\.min\.js/);
  assert.match(uploadSource, /runDeclarationAnalysis/);
});
