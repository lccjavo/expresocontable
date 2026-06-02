import { json, parseBody } from './_auth-utils.mjs';
import { requireUser, loadAnalysisFor, saveAnalysisFor, emptyAnalysis, safeConnectLambda } from './_data-utils.mjs';

function padMonth(value) {
  const cleaned = String(value || '').replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  const n = Number(cleaned.slice(0, 2));
  return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : '';
}

function invoiceFiscalDate(invoice) {
  return String(invoice?.periodoFiscalFecha || invoice?.fechaFiscal || invoice?.fecha || '').slice(0, 10);
}

function invoiceMonth(invoice) {
  if (invoice?.periodoFiscalMes && invoice?.periodoFiscalAnio) return `${invoice.periodoFiscalAnio}-${padMonth(invoice.periodoFiscalMes)}`;
  return String(invoiceFiscalDate(invoice) || '').slice(0, 7) || 'Sin fecha';
}

function invoiceYear(invoice) {
  if (invoice?.periodoFiscalAnio) return String(invoice.periodoFiscalAnio);
  return String(invoiceFiscalDate(invoice) || '').slice(0, 4) || 'Sin fecha';
}

export async function handler(event) {
  safeConnectLambda(event);
  if (!['POST', 'DELETE'].includes(event.httpMethod)) return json(405, { error: 'Método no permitido.' });
  const { user, error } = requireUser(event);
  if (error) return error;
  const { companyId = 'default', scope = 'all', month = '', year = '', activeCompanyId = '' } = parseBody(event);
  if (scope === 'month' && month) {
    const current = await loadAnalysisFor(user.email, companyId);
    const next = { ...current, invoices: (current.invoices || []).filter((inv) => invoiceMonth(inv) !== month || (activeCompanyId && inv.companyId && inv.companyId !== activeCompanyId)) };
    next.sourceFiles = (current.sourceFiles || []).filter((f) => String(f.uploadedAt || '').slice(0, 7) !== month && String(f.month || '') !== month);
    const saved = await saveAnalysisFor(user.email, next, companyId);
    return json(200, { ok: true, analysis: saved });
  }
  if (scope === 'year' && year) {
    const current = await loadAnalysisFor(user.email, companyId);
    const next = { ...current, invoices: (current.invoices || []).filter((inv) => invoiceYear(inv) !== year || (activeCompanyId && inv.companyId && inv.companyId !== activeCompanyId)) };
    next.sourceFiles = (current.sourceFiles || []).filter((f) => String(f.uploadedAt || '').slice(0, 4) !== year && String(f.year || '') !== year);
    const saved = await saveAnalysisFor(user.email, next, companyId);
    return json(200, { ok: true, analysis: saved });
  }
  const fresh = await saveAnalysisFor(user.email, emptyAnalysis(user.email, companyId), companyId);
  return json(200, { ok: true, analysis: fresh });
}
