requireAuth();

function currentFilteredAnalysis() {
  const base = loadAnalysis();
  const filtered = filterInvoices(base.invoices || [], readFiltersFromDom());
  const out = analysisFromInvoices(base, filtered);
  out.declarations = filterDeclarations(base.declarations || [], readFiltersFromDom());
  return out;
}

function hasActiveFilters(filters = readFiltersFromDom()) {
  return Boolean(filters.year || filters.month || filters.from || filters.to || filters.kind || filters.rfc || filters.product);
}

function renderFilteredMetrics() {
  const hasFiltersUi = Boolean(document.querySelector('[data-auto-filter-panel]'));
  if (!hasFiltersUi) return;
  const filtered = currentFilteredAnalysis();
  hydrateMetricSummary(filtered);

  const total = loadAnalysis().invoices?.length || 0;
  const shown = filtered.totals.facturas || 0;
  const label = document.querySelector('[data-filter-result-label]');
  if (label) {
    const filters = readFiltersFromDom();
    label.textContent = hasActiveFilters(filters)
      ? `${numberFmt(shown)} de ${numberFmt(total)} CFDI coinciden con los filtros`
      : `${numberFmt(total)} CFDI en el histórico`;
  }
}

function ensureFilterPanel(title = 'Filtros') {
  const container = document.querySelector('[data-auto-filter-panel]');
  if (!container || container.dataset.ready) return;
  container.dataset.ready = '1';
  container.innerHTML = `
    <div class="card soft-card border-0 mb-4">
      <div class="card-body p-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h2 class="h5 text-primary-brand mb-1">${title}</h2>
            <div class="small text-secondary" data-filter-result-label>Aplicando filtros al histórico...</div>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <div class="dropdown">
              <button class="btn btn-sm btn-outline-secondary rounded-pill dropdown-toggle" type="button" data-bs-toggle="dropdown">Exportar</button>
              <ul class="dropdown-menu dropdown-menu-end shadow border-0 rounded-3 p-1">
                <li><button class="dropdown-item rounded-2" type="button" data-export-csv>Excel / CSV</button></li>
                <li><button class="dropdown-item rounded-2" type="button" data-export-pdf>PDF (imprimir)</button></li>
              </ul>
            </div>
            <button class="btn btn-sm btn-outline-secondary rounded-pill" type="button" data-clear-filters>Limpiar filtros</button>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-2"><label class="form-label small fw-bold">Año</label><select class="form-select" data-filter="year" data-year-options data-default-current-year><option value="">Todos</option></select></div>
          <div class="col-md-2"><label class="form-label small fw-bold">Mes</label><select class="form-select" data-filter="month" data-month-options><option value="">Todos</option></select></div>
          <div class="col-md-2"><label class="form-label small fw-bold">Desde</label><input class="form-control" type="date" data-filter="from"></div>
          <div class="col-md-2"><label class="form-label small fw-bold">Hasta</label><input class="form-control" type="date" data-filter="to"></div>
          <div class="col-md-4"><label class="form-label small fw-bold">Tipo</label><select class="form-select" data-filter="kind"><option value="">Todos</option><option value="ingreso">Ingresos</option><option value="gasto">Gastos</option><option value="desconocido">Desconocidos</option></select></div>
          <div class="col-md-6"><label class="form-label small fw-bold">RFC emisor/receptor</label><input class="form-control" data-filter="rfc" placeholder="Ej. XAXX010101000"></div>
          <div class="col-md-6"><label class="form-label small fw-bold">Producto/concepto</label><input class="form-control" data-filter="product" placeholder="Ej. servicio, ribeye, comisión..."></div>
        </div>
      </div>
    </div>`;
  bindFilterControls();
}

function renderReportes() {
  ensureFilterPanel('Filtrar reportes');
  const tbody = document.querySelector('[data-reportes-body]');
  if (!tbody) return;
  const a = currentFilteredAnalysis();
  const months = Object.entries(a.byMonth || {}).sort((x, y) => y[0].localeCompare(x[0]));
  if (!months.length) {
    tbody.innerHTML = '<tr><td>Sin datos</td><td>$0.00</td><td>$0.00</td><td>$0.00</td><td>$0.00</td></tr>';
    return;
  }
  tbody.innerHTML = months.map(([month, row]) => {
    const iva = (row.ivaIngresos || 0) - (row.ivaGastos || 0);
    return `<tr><td><strong>${periodLabel(month)}</strong><div class="small text-secondary">${row.count} CFDI</div></td><td>${money(row.ingresos)}</td><td>${money(row.gastos)}</td><td>${ivaStatusLabel(iva)}</td><td>${money(Math.max(0, iva))}</td></tr>`;
  }).join('');
}

function renderProductos() {
  ensureFilterPanel('Filtrar productos');
  const tbody = document.querySelector('[data-productos-body]');
  if (!tbody) return;
  const a = currentFilteredAnalysis();
  const rows = Object.values(a.products || {}).sort((x, y) => y.importe - x.importe).slice(0, 150);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td>Sin datos</td><td>0</td><td>$0.00</td><td>0</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((p) => `<tr><td><strong>${p.descripcion}</strong><div class="small text-secondary">${(p.months || []).slice(0, 3).map(periodLabel).join(', ')}</div></td><td>${numberFmt(p.cantidad)}</td><td>${money(p.importe)}</td><td>${p.facturas}</td></tr>`).join('');
}

const ISR_PF_MONTHLY_2026 = [
  { li: 0.01, ls: 895.24, cuota: 0, pct: 0.0192 },
  { li: 895.25, ls: 7599.70, cuota: 17.19, pct: 0.0640 },
  { li: 7599.71, ls: 13355.06, cuota: 446.05, pct: 0.1088 },
  { li: 13355.07, ls: 15525.38, cuota: 1072.89, pct: 0.16 },
  { li: 15525.39, ls: 18586.87, cuota: 1420.14, pct: 0.1792 },
  { li: 18586.88, ls: 37498.70, cuota: 1968.21, pct: 0.2136 },
  { li: 37498.71, ls: 59029.95, cuota: 6008.98, pct: 0.2352 },
  { li: 59029.96, ls: 112522.64, cuota: 11071.47, pct: 0.30 },
  { li: 112522.65, ls: 150030.18, cuota: 27119.25, pct: 0.32 },
  { li: 150030.19, ls: 450090.50, cuota: 39121.66, pct: 0.34 },
  { li: 450090.51, ls: Infinity, cuota: 141141.98, pct: 0.35 },
];

function pfMonthlyIsr(base) {
  if (base <= 0) return { isr: 0, tramo: null, excedente: 0 };
  const tramo = ISR_PF_MONTHLY_2026.find((r) => base >= r.li && base <= r.ls) || ISR_PF_MONTHLY_2026[ISR_PF_MONTHLY_2026.length - 1];
  const excedente = Math.max(0, base - tramo.li);
  return { isr: Math.max(0, tramo.cuota + excedente * tramo.pct), tramo, excedente };
}


const RESICO_PF_MONTHLY_RATES = [
  { limit: 25000, rate: 0.01 },
  { limit: 50000, rate: 0.011 },
  { limit: 83333.33, rate: 0.015 },
  { limit: 208333.33, rate: 0.02 },
  { limit: 3500000, rate: 0.025 },
];

function resicoPfRateForMonthlyIncome(ingresosSinIva) {
  const base = Math.max(0, Number(ingresosSinIva || 0));
  return RESICO_PF_MONTHLY_RATES.find((row) => base <= row.limit) || RESICO_PF_MONTHLY_RATES[RESICO_PF_MONTHLY_RATES.length - 1];
}

function calculateTaxes(a, regime, opts = {}) {
  const ingresos = a.totals.ingresos || 0;
  const gastos = a.totals.gastos || 0;
  const ingresosSinIva = a.totals.ingresosSubtotal || Math.max(0, ingresos - (a.totals.ivaTrasladadoIngresos || 0));
  const gastosSinIva = a.totals.gastosSubtotal || Math.max(0, gastos - (a.totals.ivaAcreditableGastos || 0));
  const ivaIngresos = a.totals.ivaTrasladadoIngresos || 0;
  const ivaGastos = a.totals.ivaAcreditableGastos || 0;
  const retIsr = a.totals.retencionesIngresos || 0;
  const retIva = 0;
  const utilidad = Math.max(0, ingresosSinIva - gastosSinIva);
  const ivaNeto = ivaIngresos - ivaGastos - retIva;
  const ivaCargo = Math.max(0, ivaNeto);
  const ivaFavor = Math.max(0, -ivaNeto);
  let isr = 0;
  let rows = [];
  let note = '';

  if (regime === 'persona-moral') {
    isr = utilidad * 0.30;
    rows = [
      ['Ingresos acumulables sin IVA', money(ingresosSinIva), 'Subtotal de CFDI donde el RFC de la empresa es emisor'],
      ['Gastos/deducciones estimadas sin IVA', money(gastosSinIva), 'Subtotal de CFDI de gastos. Revisa que sean deducibles y cumplan requisitos fiscales.'],
      ['Utilidad fiscal estimada', money(utilidad), 'Ingresos - gastos'],
      ['ISR persona moral 30%', money(isr), 'Tasa general configurable/provisional'],
      ['Retenciones ISR detectadas', `-${money(retIsr)}`, 'Restadas al ISR estimado'],
      ['IVA trasladado cobrado', money(ivaIngresos), 'IVA de ingresos'],
      ['IVA acreditable pagado', `-${money(ivaGastos)}`, 'IVA de gastos'],
      ['IVA neto', ivaStatusLabel(ivaNeto), 'IVA ingresos - IVA gastos'],
      ['IVA a favor estimado', money(ivaFavor), 'Solo si el IVA acreditable supera al trasladado'],
    ];
    note = 'Persona moral: estimación simple con tasa 30% sobre utilidad fiscal detectada.';
  } else if (regime === 'resico-pf') {
    const tramo = resicoPfRateForMonthlyIncome(ingresosSinIva);
    const tasa = tramo.rate;
    isr = ingresosSinIva * tasa;
    rows = [
      ['Ingresos cobrados detectados sin IVA', money(ingresosSinIva), 'Base RESICO estimada: subtotal de CFDI de ingresos del periodo'],
      ['Gastos detectados del periodo sin IVA', money(gastosSinIva), 'Referencia operativa. En RESICO PF no se restan para el ISR; solo ayudan a revisar IVA acreditable y control del negocio.'],
      ['Tramo RESICO mensual', `Hasta ${money(tramo.limit)}`, 'Determinado automáticamente por ingresos del periodo'],
      ['Tasa RESICO PF automática', percentFmt(tasa), 'Tabla mensual Art. 113-E LISR'],
      ['ISR RESICO estimado', money(isr), 'Ingresos sin IVA × tasa automática'],
      ['Retenciones ISR detectadas', `-${money(retIsr)}`, 'Restadas al ISR estimado'],
      ['IVA trasladado cobrado', money(ivaIngresos), 'IVA de ingresos'],
      ['IVA acreditable pagado', `-${money(ivaGastos)}`, 'IVA de gastos'],
      ['IVA neto', ivaStatusLabel(ivaNeto), 'IVA ingresos - IVA gastos'],
      ['IVA a favor estimado', money(ivaFavor), 'Solo si el IVA acreditable supera al trasladado'],
    ];
    note = 'RESICO PF: el ISR se estima sobre ingresos sin IVA con la tabla mensual del Art. 113-E LISR. Los gastos no se restan para ISR; se muestran como referencia y para estimar IVA acreditable. No valida requisitos, cobro efectivo ni tope anual acumulado.';
  } else {
    const pf = pfMonthlyIsr(utilidad);
    isr = pf.isr;
    rows = [
      ['Ingresos acumulables sin IVA', money(ingresosSinIva), 'Subtotal de CFDI donde el RFC de la empresa es emisor'],
      ['Gastos/deducciones estimadas sin IVA', money(gastosSinIva), 'Subtotal de CFDI de gastos. Revisa que sean deducibles y cumplan requisitos fiscales.'],
      ['Base gravable estimada', money(utilidad), 'Ingresos - gastos'],
      ['Límite inferior usado', money(pf.tramo?.li || 0), 'Tarifa mensual 2026 integrada en app'],
      ['Excedente', money(pf.excedente), 'Base - límite inferior'],
      ['Cuota fija', money(pf.tramo?.cuota || 0), 'Según tramo'],
      ['Porcentaje excedente', percentFmt(pf.tramo?.pct || 0), 'Según tramo'],
      ['ISR actividad empresarial estimado', money(isr), 'Cuota fija + excedente × porcentaje'],
      ['Retenciones ISR detectadas', `-${money(retIsr)}`, 'Restadas al ISR estimado'],
      ['IVA trasladado cobrado', money(ivaIngresos), 'IVA de ingresos'],
      ['IVA acreditable pagado', `-${money(ivaGastos)}`, 'IVA de gastos'],
      ['IVA neto', ivaStatusLabel(ivaNeto), 'IVA ingresos - IVA gastos'],
      ['IVA a favor estimado', money(ivaFavor), 'Solo si el IVA acreditable supera al trasladado'],
    ];
    note = 'Actividad empresarial PF: usa una tarifa mensual 2026 aproximada integrada. Revísala con tu contador antes de declarar.';
  }
  const isrNeto = Math.max(0, isr - retIsr);
  const total = isrNeto + ivaCargo;
  return { ingresos, gastos, ingresosSinIva, gastosSinIva, utilidad, ivaNeto, ivaCargo, ivaFavor, isr, isrNeto, total, rows, note };
}


function renderExpenseWarning(analysis = currentFilteredAnalysis()) {
  const container = document.querySelector('[data-expense-warning]');
  if (!container) return;
  const t = analysis.totals || {};
  if ((t.ingresosCount || 0) > 0 && (t.gastosCount || 0) === 0) {
    container.innerHTML = `<div class="alert alert-warning border-0 rounded-4 mb-4"><strong>Ojo:</strong> no hay facturas de gastos en este periodo/empresa. El cálculo no considera deducciones ni IVA acreditable; sube tus gastos para obtener un estimado más completo.</div>`;
  } else if ((t.ingresosCount || 0) > 0 && (t.gastos || 0) < (t.ingresos || 0) * 0.03) {
    container.innerHTML = `<div class="alert alert-info border-0 rounded-4 mb-4"><strong>Revisión sugerida:</strong> tus gastos detectados son muy bajos frente a tus ingresos. Verifica que hayas subido tus facturas de gastos del periodo.</div>`;
  } else {
    container.innerHTML = '';
  }
}

function renderImpuestos() {
  ensureFilterPanel('Filtrar cálculo');
  const full = loadAnalysis();
  const a = currentFilteredAnalysis();
  const profile = getProfile();
  const regimeSelect = document.querySelector('[data-tax-regime]') || document.querySelector('select');
  if (regimeSelect && !regimeSelect.dataset.profileHydrated) {
    regimeSelect.value = profile.taxRegime || 'actividad-empresarial';
    regimeSelect.dataset.profileHydrated = '1';
  }
  const regime = regimeSelect?.value || profile.taxRegime || 'actividad-empresarial';
  const calc = calculateTaxes(a, regime);

  setText('[data-tax="base-ingresos"]', money(calc.ingresos));
  setText('[data-tax="deducciones"]', money(calc.gastos));
  const expenseLabel = regime === 'resico-pf' ? 'Gastos del periodo' : 'Gastos / deducc. estimadas';
  document.querySelectorAll('[data-tax-expense-label]').forEach((el) => { el.textContent = expenseLabel; });
  setText('[data-tax="iva-cargo"]', ivaStatusLabel(calc.ivaNeto));
  setText('[data-tax="a-pagar"]', money(calc.total));
  setText('[data-tax="isr"]', money(calc.isrNeto));
  setText('[data-tax="utilidad"]', money(calc.utilidad));
  setText('[data-tax-note]', calc.note);

  const tbody = document.querySelector('[data-tax-breakdown-body]');
  if (tbody) {
    tbody.innerHTML = calc.rows.map(([concepto, importe, formula]) => `<tr><td><strong>${concepto}</strong></td><td class="text-end">${importe}</td><td class="text-secondary small">${formula}</td></tr>`).join('') + `<tr class="table-primary"><td><strong>Total estimado a pagar</strong></td><td class="text-end"><strong>${money(calc.total)}</strong></td><td class="small">ISR neto + IVA a cargo. Si el IVA sale a favor, no se suma como pago.</td></tr>`;
  }

  const periodInfo = document.querySelector('[data-tax-period-info]');
  if (periodInfo) {
    const f = readFiltersFromDom();
    periodInfo.textContent = f.month ? periodLabel(f.month) : (f.year || `${f.from || 'inicio'} a ${f.to || 'hoy'}`);
  }
  renderExpenseWarning(a);
  hydrateAnalysisSummary(full);
}

function renderGraficas() {
  ensureFilterPanel('Filtrar gráficas');
  const chart = document.querySelector('[data-chart-real]') || document.querySelector('.chart-placeholder');
  if (!chart) return;
  const a = currentFilteredAnalysis();
  const months = Object.entries(a.byMonth || {}).sort((x, y) => x[0].localeCompare(y[0])).slice(-12);
  if (!months.length) {
    chart.innerHTML = '<div class="text-secondary text-center align-self-center">Sin datos. Sube facturas para generar gráficas.</div>';
    return;
  }
  const max = Math.max(...months.map(([, m]) => Math.max(m.ingresos || 0, m.gastos || 0)), 1);
  chart.innerHTML = months.map(([month, m]) => {
    const ingresoHeight = Math.max(10, Math.round((m.ingresos / max) * 100));
    const gastoHeight = Math.max(10, Math.round((m.gastos / max) * 100));
    return `<div class="chart-month"><div class="chart-bars"><span class="chart-bar" style="height:${ingresoHeight}%" title="Ingresos ${money(m.ingresos)}"></span><span class="chart-bar olive-bar" style="height:${gastoHeight}%" title="Gastos ${money(m.gastos)}"></span></div><small>${month}</small></div>`;
  }).join('');
}

function renderDashboardFilteredMetrics() {
  const target = document.querySelector('[data-dashboard-filtered]');
  if (!target) return;
  const a = currentFilteredAnalysis();
  renderExpenseWarning(a);
  target.innerHTML = `
    <div class="row g-3">
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>CFDI filtrados</span><strong>${numberFmt(a.totals.facturas)}</strong></div></div>
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>Ingresos filtrados</span><strong>${money(a.totals.ingresos)}</strong></div></div>
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>Gastos filtrados</span><strong>${money(a.totals.gastos)}</strong></div></div>
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>IVA filtrado</span><strong>${ivaStatusLabel(a.totals.ivaTrasladadoIngresos - a.totals.ivaAcreditableGastos)}</strong></div></div>
    </div>`;
}


function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderInvoiceDetail(inv) {
  if (!inv) return `<div class="empty-detail"><strong>Selecciona una factura</strong><span>Al cargar CFDI, aquí verás emisor, receptor, UUID, moneda, impuestos y conceptos.</span></div>`;
  const kind = kindForActiveCompany(inv);
  const conceptos = (inv.conceptos || inv.items || []).slice(0, 30).map((c) => `
    <tr><td>${safeText(c.descripcion || c.description || 'Concepto')}</td><td class="text-end">${numberFmt(c.cantidad || c.quantity || 1)}</td><td class="text-end">${money(amountMxn(c, 'importe') || c.importe || c.amount || 0)}</td></tr>
  `).join('') || `<tr><td colspan="3" class="text-secondary">Sin conceptos detallados en el XML procesado.</td></tr>`;
  return `
    <div class="ec-detail-header">
      <div><span class="badge rounded-pill ${kind === 'ingreso' ? 'text-bg-success' : kind === 'gasto' ? 'text-bg-secondary' : 'text-bg-warning'}">${safeText(kind)}</span><h2 class="h4 mt-2 mb-1">${money(amountMxn(inv,'total'))}</h2><p class="text-secondary mb-0">${periodLabel(invoiceMonth(inv))} · ${safeText(inv.moneda || 'MXN')}${inv.tipoCambio ? ` · TC ${safeText(inv.tipoCambio)}` : ''}</p></div>
    </div>
    <div class="row g-3 mt-1">
      <div class="col-md-6"><div class="detail-box"><small>Emisor</small><strong>${safeText(inv.emisorNombre || inv.emisorRfc || 'No detectado')}</strong><span>${safeText(inv.emisorRfc || '')}</span></div></div>
      <div class="col-md-6"><div class="detail-box"><small>Receptor</small><strong>${safeText(inv.receptorNombre || inv.receptorRfc || 'No detectado')}</strong><span>${safeText(inv.receptorRfc || '')}</span></div></div>
      <div class="col-md-6"><div class="detail-box"><small>UUID</small><span class="font-monospace small">${safeText(inv.uuid || inv.UUID || 'Sin UUID')}</span></div></div>
      <div class="col-md-6"><div class="detail-box"><small>Fecha fiscal</small><strong>${safeText(invoiceFiscalDate(inv) || inv.fecha || 'Sin fecha')}</strong><span>Emisión: ${safeText(inv.fechaEmision || inv.fecha || '')}</span></div></div>
    </div>
    <div class="row g-3 mt-1">
      <div class="col-4"><div class="mini-metric"><span>Subtotal</span><strong>${money(amountMxn(inv,'subtotal'))}</strong></div></div>
      <div class="col-4"><div class="mini-metric"><span>IVA</span><strong>${money(amountMxn(inv,'ivaTrasladado'))}</strong></div></div>
      <div class="col-4"><div class="mini-metric"><span>Total</span><strong>${money(amountMxn(inv,'total'))}</strong></div></div>
    </div>
    <h3 class="h6 mt-4 mb-2 text-primary-brand">Conceptos</h3>
    <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Descripción</th><th class="text-end">Cantidad</th><th class="text-end">Importe</th></tr></thead><tbody>${conceptos}</tbody></table></div>
  `;
}

function renderDeclarationDetail(d) {
  if (!d) return `<div class="empty-detail"><strong>Selecciona una declaración</strong><span>Aquí aparecerá RFC, periodo, operación, ISR, IVA, compensaciones y saldos a favor.</span></div>`;
  const vals = Object.fromEntries((d.values || []).map((v) => [v.concept_key, Number(v.amount || 0)]));
  const rows = (d.values || []).slice(0, 60).map((v) => `<tr><td><strong>${safeText(v.concept_label || v.concept_key)}</strong><div class="small text-secondary">${safeText(v.tax_type || '')}${v.page_number ? ` · pág. ${safeText(v.page_number)}` : ''}</div></td><td class="text-end">${money(v.amount)}</td></tr>`).join('') || `<tr><td colspan="2" class="text-secondary">No se detectaron valores extraíbles.</td></tr>`;
  return `
    <div class="ec-detail-header">
      <div><span class="badge rounded-pill text-bg-info">${safeText(d.declaration_type || 'SAT')}</span><h2 class="h4 mt-2 mb-1">${periodLabel(declarationPeriodMonth(d))}</h2><p class="text-secondary mb-0">${safeText(d.rfc || 'RFC no detectado')} · operación ${safeText(d.operation_number || 'sin número')}</p></div>
    </div>
    <div class="row g-3 mt-1">
      <div class="col-md-6"><div class="detail-box"><small>Contribuyente</small><strong>${safeText(d.taxpayer_name || 'No detectado')}</strong><span>${safeText(d.rfc || '')}</span></div></div>
      <div class="col-md-6"><div class="detail-box"><small>Presentación</small><strong>${safeText(d.submitted_at || 'No detectada')}</strong><span>Vence: ${safeText(d.due_date || 'No detectado')}</span></div></div>
    </div>
    <div class="row g-3 mt-1">
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>ISR pagado</span><strong>${money(vals.isr_final)}</strong></div></div>
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>IVA pagado</span><strong>${money(vals.iva_final)}</strong></div></div>
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>Compensaciones</span><strong>${money(vals.isr_compensaciones)}</strong></div></div>
      <div class="col-6 col-lg-3"><div class="mini-metric"><span>Saldo aplicado</span><strong>${money(vals.saldo_favor_aplicado)}</strong></div></div>
    </div>
    <h3 class="h6 mt-4 mb-2 text-primary-brand">Valores extraídos</h3>
    <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Concepto</th><th class="text-end">Monto</th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
}

function valueForDeclaration(dec, key) {
  return Number((dec.values || []).find((v) => v.concept_key === key)?.amount || 0);
}

function renderFacturas() {
  ensureFilterPanel('Filtrar facturas');
  const list = document.querySelector('[data-facturas-list]');
  const detail = document.querySelector('[data-facturas-detail]');
  const tbody = document.querySelector('[data-facturas-body]');
  if (!list && !tbody) return;
  const a = currentFilteredAnalysis();
  const rows = (a.invoices || []).slice().sort((x,y) => invoiceFiscalDate(y).localeCompare(invoiceFiscalDate(x))).slice(0, 300);
  if (!rows.length) {
    if (list) list.innerHTML = '<div class="p-4 text-secondary">Sin facturas para los filtros seleccionados.</div>';
    if (detail) detail.innerHTML = renderInvoiceDetail(null);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-secondary">Sin facturas para los filtros seleccionados.</td></tr>';
    return;
  }
  if (list && detail) {
    list.innerHTML = rows.map((inv, index) => {
      const kind = kindForActiveCompany(inv);
      return `<button class="ec-list-item ${index === 0 ? 'active' : ''}" type="button" data-invoice-index="${index}">
        <span class="d-flex justify-content-between gap-2"><strong>${safeText(inv.receptorNombre || inv.emisorNombre || inv.uuid || 'Factura')}</strong><span class="badge rounded-pill ${kind === 'ingreso' ? 'text-bg-success' : kind === 'gasto' ? 'text-bg-secondary' : 'text-bg-warning'}">${safeText(kind)}</span></span>
        <span class="small text-secondary">${periodLabel(invoiceMonth(inv))} · ${safeText(inv.emisorRfc || '')} → ${safeText(inv.receptorRfc || '')}</span>
        <span class="ec-list-amount">${money(amountMxn(inv,'total'))}</span>
      </button>`;
    }).join('');
    detail.innerHTML = renderInvoiceDetail(rows[0]);
    list.querySelectorAll('[data-invoice-index]').forEach((button) => button.addEventListener('click', () => {
      list.querySelectorAll('.ec-list-item').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      detail.innerHTML = renderInvoiceDetail(rows[Number(button.dataset.invoiceIndex)]);
    }));
  }
  if (tbody) {
    tbody.innerHTML = rows.map((inv) => {
      const kind = kindForActiveCompany(inv);
      return `<tr><td><strong>${periodLabel(invoiceMonth(inv))}</strong><div class="small text-secondary">Emisión: ${inv.fechaEmision || inv.fecha || ''}</div></td><td><span class="badge rounded-pill ${kind === 'ingreso' ? 'text-bg-success' : kind === 'gasto' ? 'text-bg-secondary' : 'text-bg-warning'}">${kind}</span></td><td><strong>${inv.emisorNombre || inv.emisorRfc}</strong><div class="small text-secondary">${inv.emisorRfc}</div></td><td><strong>${inv.receptorNombre || inv.receptorRfc}</strong><div class="small text-secondary">${inv.receptorRfc}</div></td><td>${money(amountMxn(inv,'subtotal'))}</td><td>${money(amountMxn(inv,'ivaTrasladado'))}</td><td>${money(amountMxn(inv,'total'))}</td></tr>`;
    }).join('');
  }
}

function renderDeclaraciones() {
  ensureFilterPanel('Filtrar declaraciones');
  const list = document.querySelector('[data-declaraciones-list]');
  const detail = document.querySelector('[data-declaraciones-detail]');
  const tbody = document.querySelector('[data-declaraciones-body]');
  if (!list && !tbody) return;
  const declarations = filterDeclarations(loadAnalysis().declarations || [], readFiltersFromDom()).sort((a,b) => declarationPeriodMonth(b).localeCompare(declarationPeriodMonth(a)));
  if (!declarations.length) {
    if (list) list.innerHTML = '<div class="p-4 text-secondary">Sin declaraciones SAT cargadas para los filtros seleccionados.</div>';
    if (detail) detail.innerHTML = renderDeclarationDetail(null);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-secondary">Sin declaraciones SAT cargadas para los filtros seleccionados.</td></tr>';
    return;
  }
  if (list && detail) {
    list.innerHTML = declarations.map((d, index) => `<button class="ec-list-item ${index === 0 ? 'active' : ''}" type="button" data-declaration-index="${index}">
      <span class="d-flex justify-content-between gap-2"><strong>${periodLabel(declarationPeriodMonth(d))}</strong><span class="declaration-badge">${safeText(d.declaration_type || 'SAT')}</span></span>
      <span class="small text-secondary">${safeText(d.rfc || 'RFC no detectado')} · operación ${safeText(d.operation_number || 'sin número')}</span>
      <span class="ec-list-amount">ISR ${money(valueForDeclaration(d,'isr_final'))} · IVA ${money(valueForDeclaration(d,'iva_final'))}</span>
    </button>`).join('');
    detail.innerHTML = renderDeclarationDetail(declarations[0]);
    list.querySelectorAll('[data-declaration-index]').forEach((button) => button.addEventListener('click', () => {
      list.querySelectorAll('.ec-list-item').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      detail.innerHTML = renderDeclarationDetail(declarations[Number(button.dataset.declarationIndex)]);
    }));
  }
  if (tbody) tbody.innerHTML = declarations.map((d) => `<tr><td><strong>${periodLabel(declarationPeriodMonth(d))}</strong><div class="small text-secondary">${d.periodicity || ''}</div></td><td>${d.rfc || 'No detectado'}<div class="small text-secondary">${d.taxpayer_name || ''}</div></td><td><span class="declaration-badge">${d.declaration_type || 'SAT'}</span></td><td>${d.operation_number || 'Sin número'}</td><td>${money(valueForDeclaration(d,'isr_final'))}</td><td>${money(valueForDeclaration(d,'iva_final'))}</td><td>${money(valueForDeclaration(d,'saldo_favor_aplicado'))}</td><td class="small text-secondary">${d.source_file_name || ''}</td></tr>`).join('');
}

function diffClass(value) {
  const abs = Math.abs(Number(value || 0));
  if (abs < 1) return 'reconciliation-diff-ok';
  if (abs < 500) return 'reconciliation-diff-warn';
  return 'reconciliation-diff-bad';
}

function renderConciliacion() {
  ensureFilterPanel('Filtrar conciliación');
  const container = document.querySelector('[data-conciliacion-body]');
  if (!container) return;
  const a = currentFilteredAnalysis();
  const decs = a.declarations || [];
  if (!decs.length) {
    container.innerHTML = '<div class="alert alert-warning border-0 rounded-4">Sube una declaración SAT del periodo para comparar lo presentado ante el SAT contra las facturas cargadas.</div>';
    return;
  }
  const calc = calculateTaxes(a, getProfile().taxRegime || 'actividad-empresarial');
  const dec = decs[0];

  // IVA — declaración
  const declaredIvaTotalCargo   = valueForDeclaration(dec, 'iva_total_a_cargo');
  const declaredIvaAcred        = valueForDeclaration(dec, 'iva_acreditable') || valueForDeclaration(dec, 'iva_pagado_gastos');
  const declaredIvaImpCargo     = valueForDeclaration(dec, 'iva_impuesto_a_cargo');
  const declaredSaldo           = valueForDeclaration(dec, 'saldo_favor_aplicado');
  const declaredIvaFinal        = valueForDeclaration(dec, 'iva_final');
  // ISR — declaración
  const declaredIncome          = valueForDeclaration(dec, 'ingresos_efectivamente_cobrados') || valueForDeclaration(dec, 'ingresos_actividad');
  const declaredIsrCargo        = valueForDeclaration(dec, 'isr_cantidad_a_cargo') || valueForDeclaration(dec, 'isr_impuesto_a_cargo');
  const declaredIsrRetenido     = valueForDeclaration(dec, 'isr_retenido');
  const declaredCompensaciones  = valueForDeclaration(dec, 'compensaciones') || valueForDeclaration(dec, 'isr_total_aplicaciones');
  const declaredIsrFinal        = valueForDeclaration(dec, 'isr_final');

  const d = (sys, decl) => (decl ? sys - decl : 0);
  const sep = (label) => `<tr class="table-secondary"><td colspan="5"><strong class="small text-uppercase text-secondary">${label}</strong></td></tr>`;
  const row = (l1, v1, l2, v2, diff) => `<tr><td>${l1}</td><td class="text-end">${v1}</td><td>${l2}</td><td class="text-end">${v2}</td><td class="text-end ${diffClass(diff)}">${diff !== 0 ? money(diff) : '—'}</td></tr>`;

  const ivaFavorBadge = calc.ivaFavor > 0
    ? `<br><span class="badge text-bg-success mt-1">IVA a favor este periodo: ${money(calc.ivaFavor)} — aplicable en declaraciones futuras</span>`
    : '';

  const rows = `
    ${sep('IVA')}
    ${row('IVA trasladado ingresos (XML)', money(a.totals.ivaTrasladadoIngresos), 'IVA total a cargo (SAT)', money(declaredIvaTotalCargo), d(a.totals.ivaTrasladadoIngresos, declaredIvaTotalCargo))}
    ${row('IVA acreditable gastos (XML)', money(a.totals.ivaAcreditableGastos), 'IVA acreditable (SAT)', money(declaredIvaAcred), d(a.totals.ivaAcreditableGastos, declaredIvaAcred))}
    ${row(calc.ivaFavor > 0 ? 'IVA a favor generado (XML)' : 'IVA neto a cargo (XML)', calc.ivaFavor > 0 ? `${money(calc.ivaFavor)} a favor` : money(calc.ivaCargo), 'IVA impuesto a cargo (SAT)', money(declaredIvaImpCargo), d(calc.ivaCargo, declaredIvaImpCargo))}
    ${declaredSaldo ? row('—', '—', 'Saldo a favor aplicado (SAT)', money(declaredSaldo), 0) : ''}
    ${row('IVA final estimado', calc.ivaFavor > 0 ? money(0) : money(calc.ivaCargo), 'IVA final pagado (SAT)', money(declaredIvaFinal), d(calc.ivaCargo, declaredIvaFinal))}
    ${sep('ISR')}
    ${row('Ingresos sin IVA (XML)', money(calc.ingresosSinIva), 'Ingresos declarados (SAT)', money(declaredIncome), d(calc.ingresosSinIva, declaredIncome))}
    ${row('ISR calculado (sistema)', money(calc.isr), 'ISR a cargo antes de aplicaciones (SAT)', money(declaredIsrCargo), d(calc.isr, declaredIsrCargo))}
    ${declaredIsrRetenido ? row('Retenciones ISR (XML)', money(a.totals.retencionesIngresos || 0), 'ISR retenido acreditable (SAT)', money(declaredIsrRetenido), 0) : ''}
    ${declaredCompensaciones ? row('—', '—', 'Compensaciones / aplicaciones (SAT)', money(declaredCompensaciones), 0) : ''}
    ${row('ISR neto estimado', money(calc.isrNeto), 'ISR final pagado (SAT)', money(declaredIsrFinal), d(calc.isrNeto, declaredIsrFinal))}
  `;

  container.innerHTML = `
    <div class="alert alert-info border-0 rounded-4">
      <strong>Declaración:</strong> ${dec.rfc || ''} · ${periodLabel(declarationPeriodMonth(dec))} · operación ${dec.operation_number || 'sin número'}${ivaFavorBadge}
    </div>
    <div class="table-responsive">
      <table class="table align-middle">
        <thead><tr><th>Concepto sistema (XML)</th><th class="text-end">Estimado</th><th>Declaración SAT</th><th class="text-end">Declarado / pagado</th><th class="text-end">Diferencia</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function concilRow(label, value, strong = false) {
  return `<div class="d-flex justify-content-between gap-2 py-1 border-bottom border-light-subtle">
    <span class="small text-secondary">${label}</span>
    <span class="small ${strong ? 'fw-bold' : ''}">${value}</span>
  </div>`;
}

function renderDashboardConciliacion() {
  const container = document.querySelector('[data-dashboard-conciliacion]');
  if (!container) return;
  const a = currentFilteredAnalysis();
  const calc = calculateTaxes(a, getProfile().taxRegime || 'actividad-empresarial');
  const totalEstimado = calc.isrNeto + calc.ivaCargo;
  const decs = a.declarations || [];

  const cfdiBlock = `
    <div class="small text-secondary mb-2 fw-bold text-uppercase">Resumen CFDI detectado</div>
    ${concilRow('Ingresos sin IVA', money(calc.ingresosSinIva))}
    ${concilRow('IVA cobrado', money(a.totals.ivaTrasladadoIngresos))}
    ${concilRow('Gastos sin IVA', money(calc.gastosSinIva))}
    ${concilRow('IVA acreditable', money(a.totals.ivaAcreditableGastos))}
    ${concilRow('ISR estimado', money(calc.isr))}`;

  if (!decs.length) {
    container.innerHTML = `
      <div class="card soft-card border-0 mt-4">
        <div class="card-body p-4">
          <h2 class="h5 text-primary-brand mb-3">Estimado CFDI vs declaración SAT</h2>
          <div class="row g-3">
            <div class="col-md-5"><div class="p-3 rounded-3 bg-light">${cfdiBlock}<hr class="my-2">${concilRow('Total estimado CFDI', money(totalEstimado), true)}</div></div>
            <div class="col-md-7 d-flex align-items-center">
              <div class="text-secondary small p-3">
                <strong class="d-block mb-1 text-primary-brand">Falta la declaración SAT</strong>
                Sube el PDF de tu declaración provisional para ver el total conciliado real (después de IVA a favor, compensaciones y retenciones aplicadas) y compararlo contra este estimado.
                <div class="mt-3"><a href="/uploads" class="btn btn-sm btn-outline-primary rounded-pill">Subir declaración SAT</a></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  const dec = decs[0];
  const declaredIsrFinal        = valueForDeclaration(dec, 'isr_final');
  const declaredIvaFinal        = valueForDeclaration(dec, 'iva_final');
  const declaredSaldo           = valueForDeclaration(dec, 'saldo_favor_aplicado');
  const declaredCompensaciones  = valueForDeclaration(dec, 'compensaciones') || valueForDeclaration(dec, 'isr_total_aplicaciones');
  const declaredIsrRetenido     = valueForDeclaration(dec, 'isr_retenido');
  const totalConciliado         = (declaredIsrFinal || 0) + (declaredIvaFinal || 0);
  const diferencia              = totalEstimado - totalConciliado;
  const diferenciaPositiva      = diferencia >= 0;

  container.innerHTML = `
    <div class="card soft-card border-0 mt-4">
      <div class="card-body p-4">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
          <div>
            <h2 class="h5 text-primary-brand mb-1">Estimado CFDI vs declaración SAT</h2>
            <p class="small text-secondary mb-0">${periodLabel(declarationPeriodMonth(dec))} · ${dec.rfc || ''} · operación ${dec.operation_number || 'sin número'}</p>
          </div>
          <a href="/conciliacion" class="btn btn-sm btn-outline-primary rounded-pill">Ver conciliación completa</a>
        </div>
        <div class="row g-3">
          <div class="col-md-4">
            <div class="p-3 rounded-3 bg-light h-100">
              ${cfdiBlock}
            </div>
          </div>
          <div class="col-md-4">
            <div class="p-3 rounded-3 bg-light h-100">
              <div class="small text-secondary mb-2 fw-bold text-uppercase">Conciliación</div>
              ${concilRow(calc.ivaFavor > 0 ? 'IVA a favor generado' : 'IVA del periodo', calc.ivaFavor > 0 ? `${money(calc.ivaFavor)} a favor` : money(calc.ivaCargo))}
              ${declaredSaldo     ? concilRow('IVA a favor aplicado',   `− ${money(declaredSaldo)}`)         : ''}
              ${declaredIsrRetenido ? concilRow('ISR retenido aplicado', `− ${money(declaredIsrRetenido)}`)  : ''}
              ${declaredCompensaciones ? concilRow('Compensaciones ISR', `− ${money(declaredCompensaciones)}`) : ''}
              <hr class="my-2">
              ${concilRow('ISR final pagado (SAT)', money(declaredIsrFinal || 0))}
              ${concilRow('IVA final pagado (SAT)', money(declaredIvaFinal || 0))}
            </div>
          </div>
          <div class="col-md-4">
            <div class="p-3 rounded-3 h-100" style="background:${diferenciaPositiva ? 'rgba(25,135,84,.08)' : 'rgba(255,193,7,.12)'}">
              <div class="small text-secondary mb-2 fw-bold text-uppercase">Totales</div>
              ${concilRow('Total estimado CFDI', money(totalEstimado), true)}
              ${concilRow('Total conciliado SAT', money(totalConciliado), true)}
              <hr class="my-2">
              ${concilRow('Diferencia', money(Math.abs(diferencia)), true)}
              <p class="small text-secondary mt-2 mb-0">
                ${diferenciaPositiva
                  ? 'La declaración pagó menos que el estimado bruto — la diferencia se explica por saldos a favor, compensaciones o retenciones aplicadas.'
                  : 'La declaración pagó más que el estimado — puede haber conceptos no capturados en los XML.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function rerenderAll() {
  renderReportes();
  renderProductos();
  renderFacturas();
  renderDeclaraciones();
  renderConciliacion();
  renderImpuestos();
  renderDashboardFilteredMetrics();
  renderFilteredMetrics();
  renderDashboardConciliacion();
}

document.addEventListener('DOMContentLoaded', () => {
  rerenderAll();
  document.querySelectorAll('[data-tax-regime]').forEach((el) => el.addEventListener('change', () => {
    saveProfile({
      taxRegime: document.querySelector('[data-tax-regime]')?.value || 'actividad-empresarial'
    });
    renderImpuestos();
    renderDashboardConciliacion();
  }));
});
window.addEventListener('analysis-updated', () => { populateFilterControls(); rerenderAll(); });
window.addEventListener('analysis-filter-changed', rerenderAll);
window.addEventListener('active-company-changed', () => { populateFilterControls(); rerenderAll(); });
window.addEventListener('profile-updated', () => { populateFilterControls(); rerenderAll(); });

// ── Export ────────────────────────────────────────────────────────────────────

function exportFilename(base) {
  const f = readFiltersFromDom();
  const tag = f.month ? periodLabel(f.month).replace(/\s/g, '-') : (f.year || 'total');
  return `${base}-${tag}.csv`;
}

function exportFacturasCSV() {
  const a = currentFilteredAnalysis();
  const headers = ['Periodo','Fecha Emisión','Tipo','Emisor','RFC Emisor','Receptor','RFC Receptor','Moneda','Subtotal','IVA','Total'];
  const rows = (a.invoices || []).slice().sort((x,y) => invoiceFiscalDate(y).localeCompare(invoiceFiscalDate(x))).map((inv) => [
    periodLabel(invoiceMonth(inv)), inv.fechaEmision || '', kindForActiveCompany(inv),
    inv.emisorNombre || '', inv.emisorRfc || '', inv.receptorNombre || '', inv.receptorRfc || '',
    inv.moneda || 'MXN', amountMxn(inv,'subtotal'), amountMxn(inv,'ivaTrasladado'), amountMxn(inv,'total')
  ]);
  downloadCSV(headers, rows, exportFilename('facturas'));
}

function exportDeclaracionesCSV() {
  const a = currentFilteredAnalysis();
  const headers = ['Periodo','RFC','Contribuyente','Tipo','Periodicidad','Núm. Operación','ISR Final','IVA Final','Fecha Presentación','Archivo'];
  const rows = (a.declarations || []).map((d) => [
    periodLabel(declarationPeriodMonth(d)), d.rfc || '', d.taxpayer_name || '',
    d.declaration_type || '', d.periodicity || '', d.operation_number || '',
    valueForDeclaration(d,'isr_final'), valueForDeclaration(d,'iva_final'),
    d.submitted_at || '', d.source_file_name || ''
  ]);
  downloadCSV(headers, rows, exportFilename('declaraciones'));
}

function exportReportesCSV() {
  const a = currentFilteredAnalysis();
  const headers = ['Periodo','Ingresos','Gastos','IVA Ingresos','IVA Gastos','IVA Neto','Facturas'];
  const rows = Object.entries(a.byMonth || {}).sort((x,y) => y[0].localeCompare(x[0])).map(([month, row]) => [
    periodLabel(month), row.ingresos || 0, row.gastos || 0,
    row.ivaIngresos || 0, row.ivaGastos || 0, (row.ivaIngresos || 0) - (row.ivaGastos || 0), row.count || 0
  ]);
  downloadCSV(headers, rows, exportFilename('reportes'));
}

function exportProductosCSV() {
  const a = currentFilteredAnalysis();
  const headers = ['Producto','Cantidad','Importe MXN','Núm. Facturas','Periodos'];
  const rows = Object.values(a.products || {}).sort((x,y) => y.importe - x.importe).map((p) => [
    p.descripcion || '', p.cantidad || 0, p.importe || 0, p.facturas || 0,
    (p.months || []).map(periodLabel).join('; ')
  ]);
  downloadCSV(headers, rows, exportFilename('productos'));
}

function exportConciliacionCSV() {
  const a = currentFilteredAnalysis();
  const calc = calculateTaxes(a, getProfile().taxRegime || 'actividad-empresarial');
  const dec = (a.declarations || [])[0];
  const headers = ['Concepto Sistema','Estimado MXN','Concepto SAT','Declarado/Pagado MXN'];
  const rows = [
    ['Ingresos sin IVA (XML)', calc.ingresosSinIva, 'Ingresos declarados (SAT)', valueForDeclaration(dec,'ingresos_efectivamente_cobrados') || valueForDeclaration(dec,'ingresos_actividad')],
    ['IVA trasladado ingresos (XML)', a.totals.ivaTrasladadoIngresos, 'IVA total a cargo (SAT)', valueForDeclaration(dec,'iva_total_a_cargo')],
    ['IVA acreditable gastos (XML)', a.totals.ivaAcreditableGastos, 'IVA acreditable (SAT)', valueForDeclaration(dec,'iva_acreditable')],
    [calc.ivaFavor > 0 ? 'IVA a favor generado (XML)' : 'IVA neto a cargo (XML)', calc.ivaFavor > 0 ? calc.ivaFavor : calc.ivaCargo, 'Saldo a favor aplicado (SAT)', valueForDeclaration(dec,'saldo_favor_aplicado')],
    ['IVA final estimado', calc.ivaCargo, 'IVA final pagado (SAT)', valueForDeclaration(dec,'iva_final')],
    ['ISR calculado', calc.isr, 'ISR a cargo (SAT)', valueForDeclaration(dec,'isr_cantidad_a_cargo') || valueForDeclaration(dec,'isr_impuesto_a_cargo')],
    ['ISR neto estimado', calc.isrNeto, 'ISR final pagado (SAT)', valueForDeclaration(dec,'isr_final')],
    ['Total estimado', calc.isrNeto + calc.ivaCargo, 'Total conciliado SAT', (valueForDeclaration(dec,'isr_final') || 0) + (valueForDeclaration(dec,'iva_final') || 0)],
  ];
  downloadCSV(headers, rows, exportFilename('conciliacion'));
}

function exportDashboardCSV() {
  const a = currentFilteredAnalysis();
  const calc = calculateTaxes(a, getProfile().taxRegime || 'actividad-empresarial');
  const headers = ['Concepto','Importe MXN','Descripción'];
  downloadCSV(headers, calc.rows || [], exportFilename('dashboard'));
}

function exportCurrentCSV() {
  const path = location.pathname;
  if (path.startsWith('/facturas')) exportFacturasCSV();
  else if (path.startsWith('/declaraciones')) exportDeclaracionesCSV();
  else if (path.startsWith('/reportes')) exportReportesCSV();
  else if (path.startsWith('/productos')) exportProductosCSV();
  else if (path.startsWith('/conciliacion')) exportConciliacionCSV();
  else exportDashboardCSV();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-export-csv]')) exportCurrentCSV();
  if (e.target.closest('[data-export-pdf]')) window.print();
});
