requireAuth();

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

let currentUploadMode = sessionStorage.getItem('expreso_contable_upload_mode') || 'facturas';

function setUploadMode(mode) {
  currentUploadMode = mode === 'declaraciones' ? 'declaraciones' : 'facturas';
  sessionStorage.setItem('expreso_contable_upload_mode', currentUploadMode);
  document.querySelectorAll('[data-upload-mode]').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-upload-mode') === currentUploadMode));
  const status = document.querySelector('[data-upload-status]');
  if (status) status.textContent = currentUploadMode === 'declaraciones' ? 'Selecciona PDF de declaración SAT para guardarla y conciliarla.' : 'Selecciona XML, PDF o ZIP para analizarlos.';
  const input = document.querySelector('#invoice-files');
  if (input) input.setAttribute('accept', currentUploadMode === 'declaraciones' ? '.pdf' : '.xml,.pdf,.zip');
}

function xmlAttr(node, name) {
  if (!node) return '';
  return node.getAttribute(name) || node.getAttribute(name.toLowerCase()) || node.getAttribute(name.toUpperCase()) || '';
}

function num(value) {
  const parsed = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCurrency(value) {
  return String(value || 'MXN').trim().toUpperCase() || 'MXN';
}

function exchangeRateFor(moneda, tipoCambioRaw) {
  const currency = normalizeCurrency(moneda);
  const rate = num(tipoCambioRaw || 1) || 1;
  return (currency === 'MXN' || currency === 'XXX') ? 1 : rate;
}

function toMxn(value, rate) {
  return Number((num(value) * (rate || 1)).toFixed(2));
}

function moneyCurrency(value, currency) {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: normalizeCurrency(currency) }).format(Number(value || 0));
  } catch {
    return `${normalizeCurrency(currency)} ${numberFmt(value)}`;
  }
}

function getFirst(doc, localName) {
  return Array.from(doc.getElementsByTagName('*')).find((n) => n.localName === localName) || null;
}

function getAll(doc, localName) {
  return Array.from(doc.getElementsByTagName('*')).filter((n) => n.localName === localName);
}

function getDirectChild(node, localName) {
  if (!node) return null;
  return Array.from(node.children || []).find((n) => n.localName === localName) || null;
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function padMonth(value) {
  const cleaned = String(value || '').replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  const n = Number(cleaned.slice(0, 2));
  return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : '';
}

function parseMeses(value) {
  const raw = String(value || '').trim();
  const matches = raw.match(/\d{1,2}/g) || [];
  const months = matches.map(padMonth).filter(Boolean);
  return Array.from(new Set(months));
}

function fiscalPeriodFromCfdi(doc, comprobante) {
  const info = getFirst(doc, 'InformacionGlobal');
  const fechaEmision = xmlAttr(comprobante, 'Fecha');
  const emisionYear = fechaEmision.slice(0, 4);
  const emisionMonth = fechaEmision.slice(5, 7);
  if (!info) {
    return {
      fechaEmision,
      fechaFiscal: fechaEmision,
      periodoFiscalFecha: fechaEmision,
      periodoFiscalAnio: emisionYear,
      periodoFiscalMes: emisionMonth,
      periodoFiscalMeses: emisionMonth ? [emisionMonth] : [],
      globalPeriodicidad: '',
      isGlobalInvoice: false,
      indexingReason: 'Fecha de emisión CFDI'
    };
  }
  const anio = firstNonEmpty(xmlAttr(info, 'Año'), xmlAttr(info, 'Anio'), xmlAttr(info, 'Ano'), emisionYear);
  const meses = parseMeses(xmlAttr(info, 'Meses'));
  const firstMonth = meses[0] || emisionMonth || '01';
  const fiscalDate = anio && firstMonth ? `${anio}-${firstMonth}-01` : fechaEmision;
  return {
    fechaEmision,
    fechaFiscal: fiscalDate,
    periodoFiscalFecha: fiscalDate,
    periodoFiscalAnio: anio || emisionYear,
    periodoFiscalMes: firstMonth,
    periodoFiscalMeses: meses.length ? meses : (firstMonth ? [firstMonth] : []),
    globalPeriodicidad: xmlAttr(info, 'Periodicidad'),
    isGlobalInvoice: true,
    indexingReason: `InformaciónGlobal Meses=${xmlAttr(info, 'Meses') || firstMonth} Año=${anio || emisionYear}`
  };
}


function parseCfdiXml(xmlText, fileName, forcedTaxId = '') {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('XML inválido');

  const comprobante = getFirst(doc, 'Comprobante');
  if (!comprobante) throw new Error('No parece ser un CFDI');

  const emisor = getFirst(doc, 'Emisor');
  const receptor = getFirst(doc, 'Receptor');
  const timbre = getFirst(doc, 'TimbreFiscalDigital');
  const uuid = (xmlAttr(timbre, 'UUID') || `${fileName}-${xmlAttr(comprobante, 'Fecha')}-${xmlAttr(comprobante, 'Total')}`).toUpperCase();
  const emisorRfc = normalizeRfc(xmlAttr(emisor, 'Rfc'));
  const receptorRfc = normalizeRfc(xmlAttr(receptor, 'Rfc'));
  const taxId = normalizeRfc(forcedTaxId);
  const fiscalPeriod = fiscalPeriodFromCfdi(doc, comprobante);

  let kind = 'desconocido';
  if (taxId && emisorRfc === taxId) kind = 'ingreso';
  else if (taxId && receptorRfc === taxId) kind = 'gasto';

  const moneda = normalizeCurrency(xmlAttr(comprobante, 'Moneda') || 'MXN');
  const tipoCambioOriginal = num(xmlAttr(comprobante, 'TipoCambio') || 1) || 1;
  const tipoCambio = exchangeRateFor(moneda, tipoCambioOriginal);
  const foreignCurrency = moneda !== 'MXN' && moneda !== 'XXX';

  const concepts = getAll(doc, 'Concepto').map((c) => {
    const valorUnitarioOriginal = num(xmlAttr(c, 'ValorUnitario'));
    const importeOriginal = num(xmlAttr(c, 'Importe'));
    const descuentoOriginal = num(xmlAttr(c, 'Descuento'));
    return {
      descripcion: xmlAttr(c, 'Descripcion') || 'Sin descripción',
      cantidad: num(xmlAttr(c, 'Cantidad')),
      claveProdServ: xmlAttr(c, 'ClaveProdServ'),
      claveUnidad: xmlAttr(c, 'ClaveUnidad'),
      valorUnitario: toMxn(valorUnitarioOriginal, tipoCambio),
      importe: toMxn(importeOriginal, tipoCambio),
      descuento: toMxn(descuentoOriginal, tipoCambio),
      valorUnitarioOriginal,
      importeOriginal,
      descuentoOriginal,
      monedaOriginal: moneda,
      tipoCambio
    };
  });

  const impuestosComprobante = getDirectChild(comprobante, 'Impuestos');
  let ivaTrasladadoOriginal = num(xmlAttr(impuestosComprobante, 'TotalImpuestosTrasladados'));
  let retencionesOriginal = num(xmlAttr(impuestosComprobante, 'TotalImpuestosRetenidos'));

  if (!ivaTrasladadoOriginal) {
    const trasladosRoot = impuestosComprobante ? getAll(impuestosComprobante, 'Traslado') : getAll(doc, 'Traslado');
    for (const traslado of trasladosRoot) {
      if (xmlAttr(traslado, 'Impuesto') === '002') ivaTrasladadoOriginal += num(xmlAttr(traslado, 'Importe'));
    }
  }
  if (!retencionesOriginal) {
    const retencionesRoot = impuestosComprobante ? getAll(impuestosComprobante, 'Retencion') : getAll(doc, 'Retencion');
    for (const retencion of retencionesRoot) {
      retencionesOriginal += num(xmlAttr(retencion, 'Importe'));
    }
  }

  const subtotalOriginal = num(xmlAttr(comprobante, 'SubTotal'));
  const totalOriginal = num(xmlAttr(comprobante, 'Total'));
  const subtotal = toMxn(subtotalOriginal, tipoCambio);
  const total = toMxn(totalOriginal, tipoCambio);
  const ivaTrasladado = toMxn(ivaTrasladadoOriginal, tipoCambio);
  const retenciones = toMxn(retencionesOriginal, tipoCambio);

  return {
    uuid,
    fileName,
    version: xmlAttr(comprobante, 'Version'),
    fecha: fiscalPeriod.periodoFiscalFecha,
    fechaEmision: fiscalPeriod.fechaEmision,
    fechaFiscal: fiscalPeriod.fechaFiscal,
    periodoFiscalFecha: fiscalPeriod.periodoFiscalFecha,
    periodoFiscalAnio: fiscalPeriod.periodoFiscalAnio,
    periodoFiscalMes: fiscalPeriod.periodoFiscalMes,
    periodoFiscalMeses: fiscalPeriod.periodoFiscalMeses,
    globalPeriodicidad: fiscalPeriod.globalPeriodicidad,
    isGlobalInvoice: fiscalPeriod.isGlobalInvoice,
    indexingReason: fiscalPeriod.indexingReason,
    tipoDeComprobante: xmlAttr(comprobante, 'TipoDeComprobante'),
    moneda,
    monedaOriginal: moneda,
    tipoCambio,
    tipoCambioOriginal,
    foreignCurrency,
    exchangeApplied: foreignCurrency,
    subtotal,
    total,
    ivaTrasladado,
    retenciones,
    subtotalOriginal,
    totalOriginal,
    ivaTrasladadoOriginal,
    retencionesOriginal,
    emisorRfc,
    emisorNombre: xmlAttr(emisor, 'Nombre'),
    receptorRfc,
    receptorNombre: xmlAttr(receptor, 'Nombre'),
    kind,
    concepts
  };
}

async function collectFilesFromZip(file, counters, progress) {
  if (!window.JSZip) throw new Error('No se pudo cargar JSZip. Revisa tu conexión e intenta de nuevo.');
  counters.zips += 1;
  progress(`Abriendo ZIP: ${file.name}`);
  const zip = await JSZip.loadAsync(file);
  const collected = [];
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  for (const entry of entries) {
    const name = entry.name;
    const lower = name.toLowerCase();
    if (lower.endsWith('.xml')) {
      const text = await entry.async('text');
      collected.push({ name, type: 'xml', text, size: text.length });
    } else if (lower.endsWith('.zip')) {
      const blob = await entry.async('blob');
      const nested = new File([blob], name, { type: 'application/zip' });
      collected.push(...await collectFilesFromZip(nested, counters, progress));
    } else if (lower.endsWith('.pdf')) {
      counters.pdfs += 1;
      collected.push({ name, type: 'pdf', size: entry._data?.uncompressedSize || 0 });
    } else {
      collected.push({ name, type: 'ignored', size: entry._data?.uncompressedSize || 0 });
    }
  }
  return collected;
}

async function collectFiles(inputFiles, counters, progress) {
  const collected = [];
  for (const file of inputFiles) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      collected.push(...await collectFilesFromZip(file, counters, progress));
    } else if (lower.endsWith('.xml')) {
      collected.push({ name: file.name, type: 'xml', text: await file.text(), size: file.size });
    } else if (lower.endsWith('.pdf')) {
      counters.pdfs += 1;
      collected.push({ name: file.name, type: 'pdf', size: file.size });
    } else {
      collected.push({ name: file.name, type: 'ignored', size: file.size });
    }
  }
  return collected;
}

function inferTaxIdFromXmlFiles(xmlFiles) {
  const score = {};
  for (const file of xmlFiles) {
    try {
      const inv = parseCfdiXml(file.text, file.name, '');
      if (inv.emisorRfc) score[inv.emisorRfc] = (score[inv.emisorRfc] || 0) + 2;
      if (inv.receptorRfc) score[inv.receptorRfc] = (score[inv.receptorRfc] || 0) + 2;
    } catch {}
  }
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function renderFiles(list, files) {
  if (!list) return;
  if (!files.length) {
    list.innerHTML = '<li class="list-group-item text-secondary px-0">Todavía no has seleccionado archivos.</li>';
    return;
  }
  list.innerHTML = files.map((file) => `
    <li class="list-group-item d-flex justify-content-between align-items-center px-0">
      <span class="text-truncate pe-3">${file.name}</span>
      <span class="badge text-bg-light border">${Math.max(1, Math.round(file.size / 1024))} KB</span>
    </li>
  `).join('');
}


function renderFileList(files) {
  renderFiles(document.querySelector('[data-file-list]'), Array.from(files || []));
}

function setProgress(percent, text) {
  const bar = document.querySelector('[data-analysis-progress-bar]');
  const label = document.querySelector('[data-analysis-progress-label]');
  if (bar) {
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(percent)));
  }
  if (label) label.textContent = text;
}

function addLog(text, tone = '') {
  const log = document.querySelector('[data-analysis-log]');
  if (!log) return;
  const item = document.createElement('li');
  item.className = `list-group-item px-0 small ${tone}`.trim();
  item.textContent = text;
  log.prepend(item);
  while (log.children.length > 8) log.removeChild(log.lastChild);
}

function renderCounters(c) {
  const map = {
    discovered: c.discovered || 0,
    xml: c.xml || 0,
    ingresos: c.ingresos || 0,
    gastos: c.gastos || 0,
    divisas: c.divisas || 0,
    duplicados: c.duplicados || 0,
    errores: c.errores || 0,
    declaraciones: c.declaraciones || 0,
    pdfs: c.pdfs || 0,
    zips: c.zips || 0
  };
  for (const [key, value] of Object.entries(map)) {
    document.querySelectorAll(`[data-counter="${key}"]`).forEach((el) => { el.textContent = value; });
  }
}


function showProgressPage(active = true) {
  document.querySelector('[data-upload-workspace]')?.classList.add('d-none');
  const card = document.querySelector('[data-progress-card]');
  card?.classList.remove('d-none');
  document.body.classList.add('analysis-progress-mode');
  if (active && !location.pathname.startsWith('/uploads/progreso')) {
    history.pushState({ expresoProgress: true }, '', '/uploads/progreso');
  }
  setTimeout(() => card?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
}

function showUploadPage() {
  document.querySelector('[data-upload-workspace]')?.classList.remove('d-none');
  document.querySelector('[data-progress-card]')?.classList.add('d-none');
  document.body.classList.remove('analysis-progress-mode');
  if (location.pathname.startsWith('/uploads/progreso')) history.replaceState({}, '', '/uploads');
}

function updateCurrentPeriodLabel() {
  const target = document.querySelector('[data-current-period]');
  if (!target) return;
  const filters = readFiltersFromDom();
  if (filters.month) target.textContent = periodLabel(filters.month);
  else if (filters.year) target.textContent = filters.year;
  else target.textContent = 'Todos los años';
}


function classifyInvoiceForCompanies(invoice, companies = []) {
  const relations = [];
  for (const company of companies || []) {
    const taxId = normalizeRfc(company.taxId);
    if (!taxId) continue;
    if (invoice.emisorRfc === taxId) relations.push({ companyId: company.id, companyName: company.name, taxId, kind: 'ingreso', role: 'emisor' });
    if (invoice.receptorRfc === taxId) relations.push({ companyId: company.id, companyName: company.name, taxId, kind: 'gasto', role: 'receptor' });
  }
  invoice.companyRelations = relations;
  const activeId = typeof activeCompanyId === 'function' ? activeCompanyId() : '';
  const primary = relations.find((r) => r.companyId === activeId) || relations[0] || null;
  invoice.companyId = primary?.companyId || '';
  invoice.companyName = primary?.companyName || '';
  invoice.taxId = primary?.taxId || '';
  invoice.kind = primary?.kind || 'desconocido';
  return invoice;
}

function ensureActiveCompanyRfc(taxId, company) {
  const normalized = normalizeRfc(taxId);
  if (!normalized || !company || normalizeRfc(company.taxId)) return;
  saveProfile({ taxId: normalized, businessName: company.name || getProfile().businessName });
}


async function readPdfText(file) {
  if (!window.pdfjsLib) throw new Error('No se pudo cargar el lector de PDF. Revisa tu conexión e intenta de nuevo.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  // Mantener marcadores de página para poder extraer conceptos con evidencia/page_number.
  return pages.map((page, idx) => `\n<<<SAT_DECL_PAGE_${idx + 1}>>>\n${page}`).join('\n');
}

function normalizeDeclarationText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeDeclarationSearch(text) {
  return normalizeDeclarationText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-')
    .toUpperCase();
}

function declarationPages(text) {
  const raw = String(text || '');
  if (!raw.includes('<<<SAT_DECL_PAGE_')) return [{ page: 1, text: raw, norm: normalizeDeclarationSearch(raw) }];
  return raw.split(/\n?<<<SAT_DECL_PAGE_(\d+)>>>\n?/g)
    .slice(1)
    .reduce((out, part, idx, arr) => {
      if (idx % 2 === 0) {
        const page = Number(part || 0) || (out.length + 1);
        const pageText = arr[idx + 1] || '';
        out.push({ page, text: pageText, norm: normalizeDeclarationSearch(pageText) });
      }
      return out;
    }, []);
}

function numberFromToken(token) {
  const value = Number(String(token || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

function amountTokensAfter(normText, idx, labelNorm, windowSize = 220) {
  if (idx < 0) return [];
  const after = normText.slice(idx + labelNorm.length, idx + labelNorm.length + windowSize);
  const tokens = [];
  const re = /(?:\$\s*)?(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/g;
  let m;
  while ((m = re.exec(after))) {
    tokens.push({ value: numberFromToken(m[1]), raw: m[1], offset: m.index });
  }
  return tokens;
}

function extractAmountByLabels(pages, labels, opts = {}) {
  const occurrence = opts.occurrence || 'first';
  const windowSize = opts.windowSize || 220;
  const candidates = [];
  const labelList = Array.isArray(labels) ? labels : [labels];
  for (const page of pages) {
    const source = opts.blockNorm || page.norm;
    for (const label of labelList) {
      const labelNorm = normalizeDeclarationSearch(label);
      let searchFrom = 0;
      while (true) {
        const idx = source.indexOf(labelNorm, searchFrom);
        if (idx < 0) break;
        const tokens = amountTokensAfter(source, idx, labelNorm, windowSize)
          .filter((token) => !opts.skipZero || token.value !== 0);
        if (tokens.length) {
          const token = tokens[opts.tokenIndex || 0] || tokens[0];
          candidates.push({ amount: token.value, page_number: page.page, label, idx, raw: token.raw });
        }
        searchFrom = idx + labelNorm.length;
      }
    }
  }
  if (!candidates.length) return { amount: 0, page_number: opts.defaultPage || 1, label: labelList[0] || '' };
  if (occurrence === 'last') return candidates[candidates.length - 1];
  if (typeof occurrence === 'number') return candidates[Math.max(0, Math.min(candidates.length - 1, occurrence))];
  return candidates[0];
}

function extractPercentageByLabels(pages, labels, opts = {}) {
  const labelList = Array.isArray(labels) ? labels : [labels];
  const candidates = [];
  for (const page of pages) {
    for (const label of labelList) {
      const labelNorm = normalizeDeclarationSearch(label);
      let searchFrom = 0;
      while (true) {
        const idx = page.norm.indexOf(labelNorm, searchFrom);
        if (idx < 0) break;
        const after = page.norm.slice(idx + labelNorm.length, idx + labelNorm.length + (opts.windowSize || 80));
        const match = after.match(/(\d{1,2}(?:\.\d{1,4})?)\s*%/);
        if (match) candidates.push({ amount: Number(match[1]) || 0, page_number: page.page, label });
        searchFrom = idx + labelNorm.length;
      }
    }
  }
  if (!candidates.length) return { amount: 0, page_number: opts.defaultPage || 1, label: labelList[0] || '' };
  return opts.occurrence === 'last' ? candidates[candidates.length - 1] : candidates[0];
}

function findHeaderValue(clean, labels, nextLabels = []) {
  const labelList = Array.isArray(labels) ? labels : [labels];
  const stop = nextLabels.length ? `(?=${nextLabels.map((l) => normalizeDeclarationSearch(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)` : '(.+?)';
  const norm = normalizeDeclarationSearch(clean);
  for (const label of labelList) {
    const labelNorm = normalizeDeclarationSearch(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${labelNorm}\\s*:?\\s*(.*?)\\s*${stop}`, 'i');
    const match = norm.match(re);
    if (match) return normalizeDeclarationText(match[1] || '');
  }
  return '';
}

function extractMoneyAfter(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(String(match[1]).replace(/[$,\s]/g, '')) || 0;
  }
  return 0;
}

function monthNumberFromSpanish(value) {
  const normalized = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const map = { enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06', julio:'07', agosto:'08', septiembre:'09', setiembre:'09', octubre:'10', noviembre:'11', diciembre:'12' };
  return map[normalized] || padMonth(value);
}

function parseSatDeclaration(text, file) {
  const pages = declarationPages(text);
  const clean = normalizeDeclarationText(text.replace(/<<<SAT_DECL_PAGE_\d+>>>/g, ' '));
  const norm = normalizeDeclarationSearch(clean);
  const isrPages = pages.filter((p) => /ISR SIMPLIFICADO DE CONFIANZA|IMPUESTO SOBRE LA RENTA|\bISR\b/.test(p.norm) && !/IVA SIMPLIFICADO DE CONFIANZA/.test(p.norm));
  const ivaPages = pages.filter((p) => /IVA SIMPLIFICADO DE CONFIANZA|IMPUESTO AL VALOR AGREGADO|\bIVA\b/.test(p.norm));
  const isrBlock = isrPages.length ? isrPages : pages.slice(0, Math.max(1, Math.floor(pages.length / 3)));
  const ivaBlock = ivaPages.length ? ivaPages : pages.filter((p) => p.page > (isrBlock[isrBlock.length - 1]?.page || 0));

  const rfc = normalizeRfc((norm.match(/RFC\s*:?\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/) || norm.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/) || [])[1] || '');
  const op = (norm.match(/NUMERO DE OPERACION\s*:?\s*(\d{6,})/) || norm.match(/OPERACION\s*:?\s*(\d{6,})/) || [])[1] || '';
  const type = (norm.match(/TIPO DE DECLARACION\s*:?\s*(NORMAL|COMPLEMENTARIA)/) || [])[1] || ((/COMPLEMENTARIA/.test(norm)) ? 'Complementaria' : ((/NORMAL/.test(norm)) ? 'Normal' : 'No detectada'));
  const periodicity = (norm.match(/PERIODICIDAD\s*:?\s*(MENSUAL|ANUAL|BIMESTRAL|TRIMESTRAL)/) || [])[1] || ((/MENSUAL/.test(norm)) ? 'Mensual' : ((/ANUAL/.test(norm)) ? 'Anual' : 'No detectada'));
  const year = (norm.match(/(?:EJERCICIO|ANO|AÑO)\s*:?\s*(20\d{2})/) || norm.match(/\b(20\d{2})\b/) || [])[1] || '';
  const periodText = (norm.match(/PERIODO DE LA DECLARACION\s*:?\s*([A-Z]+|\d{1,2})/) || norm.match(/PERIODO\s*:?\s*([A-Z]+|\d{1,2})/) || [])[1] || '';
  const period = monthNumberFromSpanish(periodText) || '';
  const submittedAt = (clean.match(/(?:Fecha y hora de presentación|Fecha de presentación|Presentaci[oó]n)\s*:??\s*([0-3]?\d[\/\-][01]?\d[\/\-]20\d{2}(?:\s+\d{1,2}:\d{2})?)/i) || [])[1] || new Date().toISOString().slice(0,10);
  const dueDate = (clean.match(/(?:Vencimiento Obligaci[oó]n|Fecha de vencimiento|Vencimiento)\s*:??\s*([0-3]?\d[\/\-][01]?\d[\/\-]20\d{2})/i) || [])[1] || '';
  const version = (clean.match(/Versi[oó]n\s*:??\s*([\d.]+)/i) || [])[1] || '';
  const taxpayerName = (clean.match(/Nombre\s*:??\s*([A-ZÁÉÍÓÚÑ0-9 .,&\-]{8,100}?)(?:\s+Tipo de declaración|\s+Tipo\s+de\s+declaraci[oó]n|\s+RFC\s*:|\s+Periodicidad)/i) || [])[1] || '';

  const values = [];
  const addValue = (tax_type, concept_key, concept_label, result, pageFallback = 1) => {
    const amount = typeof result === 'number' ? result : Number(result?.amount || 0);
    const page_number = typeof result === 'object' ? (result.page_number || pageFallback) : pageFallback;
    // Guardar ceros también para saldos finales importantes de conciliación.
    if (Number(amount || 0) || /final|cantidad_a_pagar|impuesto_a_cargo|saldo/.test(concept_key)) {
      values.push({ id: `${Date.now()}-${values.length}`, tax_type, concept_key, concept_label, amount: Number(amount || 0), page_number });
    }
  };

  const isrVal = (labels, opts = {}) => extractAmountByLabels(isrBlock, labels, opts);
  const ivaVal = (labels, opts = {}) => extractAmountByLabels(ivaBlock, labels, opts);
  const isrPct = (labels, opts = {}) => extractPercentageByLabels(isrBlock, labels, opts);

  addValue('ISR', 'ingresos_efectivamente_cobrados', 'Total de ingresos efectivamente cobrados', isrVal(['TOTAL DE INGRESOS EFECTIVAMENTE COBRADOS'], { occurrence: 'last' }));
  addValue('ISR', 'ingresos_actividad', 'Total de ingresos percibidos por la actividad', isrVal(['TOTAL DE INGRESOS PERCIBIDOS POR LA ACTIVIDAD'], { occurrence: 'last' }));
  addValue('ISR', 'tasa_aplicable_pct', 'Tasa aplicable RESICO', isrPct(['TASA APLICABLE']));
  addValue('ISR', 'isr_mensual', 'Impuesto mensual', isrVal(['IMPUESTO MENSUAL']));
  addValue('ISR', 'isr_retenido', 'ISR retenido acreditable', isrVal(['TOTAL DE ISR RETENIDO QUE ES CONSIDERADO PARA EFECTOS DEL ACREDITAMIENTO', 'ISR RETENIDO'], { occurrence: 'last' }));
  addValue('ISR', 'isr_impuesto_a_cargo', 'ISR impuesto a cargo antes de aplicaciones', isrVal(['IMPUESTO A CARGO']));
  addValue('ISR', 'compensaciones', 'Compensaciones aplicadas a ISR', isrVal(['COMPENSACIONES']));
  addValue('ISR', 'isr_total_aplicaciones', 'Total de aplicaciones ISR', isrVal(['TOTAL DE APLICACIONES']));
  addValue('ISR', 'isr_cantidad_a_cargo', 'ISR cantidad a cargo', isrVal(['CANTIDAD A CARGO'], { occurrence: 'last' }));
  addValue('ISR', 'isr_final', 'ISR cantidad a pagar final', isrVal(['CANTIDAD A PAGAR'], { occurrence: 'last' }));

  addValue('IVA', 'iva_base_16', 'Base IVA 16% declarada', ivaVal(['BASE IVA 16% DE FACTURAS EMITIDAS DE TIPO INGRESO', 'ACTIVIDADES GRAVADAS A LA TASA DEL 16%'], { occurrence: 'last' }));
  addValue('IVA', 'iva_base_0', 'Base IVA 0% declarada', ivaVal(['BASE IVA 0% DE FACTURAS EMITIDAS DE TIPO INGRESO', 'ACTIVIDADES GRAVADAS A LA TASA DEL 0%'], { occurrence: 'last' }));
  addValue('IVA', 'iva_base_exento', 'Base IVA exento declarada', ivaVal(['BASE IVA EXENTO DE FACTURAS EMITIDAS DE TIPO INGRESO', 'ACTIVIDADES EXENTAS'], { occurrence: 'last' }));
  addValue('IVA', 'iva_base_no_objeto', 'Base IVA no objeto declarada', ivaVal(['BASE IVA NO OBJETO DE FACTURAS EMITIDAS DE TIPO INGRESO', 'ACTIVIDADES NO OBJETO DEL IMPUESTO'], { occurrence: 'last' }));
  addValue('IVA', 'iva_trasladado_16', 'IVA trasladado 16% declarado', ivaVal(['IVA 16 % DE FACTURAS EMITIDAS DE TIPO INGRESO', 'IVA A CARGO A LA TASA DEL 16%'], { occurrence: 'last' }));
  addValue('IVA', 'iva_total_a_cargo', 'Total de IVA a cargo antes de acreditamientos', ivaVal(['TOTAL DE IVA A CARGO']));
  addValue('IVA', 'iva_retenido', 'IVA retenido', ivaVal(['IVA RETENIDO'], { occurrence: 'last' }));
  addValue('IVA', 'iva_acreditable', 'IVA acreditable del periodo', ivaVal(['IVA ACREDITABLE DEL PERIODO'], { occurrence: 'last' }));
  addValue('IVA', 'iva_pagado_gastos', 'IVA pagado en gastos y adquisiciones', ivaVal(['IVA PAGADO EN GASTOS Y ADQUISICIONES'], { occurrence: 'last' }));
  addValue('IVA', 'iva_no_acreditable_devoluciones_gastos', 'IVA por devoluciones/descuentos en gastos', ivaVal(['IVA POR DEVOLUCIONES, DESCUENTOS Y BONIFICACIONES EN GASTOS'], { occurrence: 'last' }));
  addValue('IVA', 'saldo_favor_aplicado', 'Saldo a favor aplicado/acreditado', ivaVal(['ACREDITAMIENTO DEL SALDO A FAVOR DE PERIODOS ANTERIORES', 'SALDO A FAVOR APLICADO'], { occurrence: 'last' }));
  addValue('IVA', 'iva_impuesto_a_cargo', 'IVA impuesto a cargo después de acreditamientos', ivaVal(['IMPUESTO A CARGO'], { occurrence: 'last' }));
  addValue('IVA', 'iva_final', 'IVA cantidad a pagar final', ivaVal(['CANTIDAD A PAGAR'], { occurrence: 'last' }));

  return {
    id: `${rfc || 'RFC'}-${year || '0000'}-${period || '00'}-${op || file.name}-${Date.now()}`,
    rfc,
    taxpayer_name: taxpayerName.trim(),
    declaration_type: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
    periodicity: periodicity.charAt(0).toUpperCase() + periodicity.slice(1).toLowerCase(),
    period,
    fiscal_year: year,
    period_key: year && period ? `${year}-${period}` : '',
    submitted_at: submittedAt,
    due_date: dueDate,
    operation_number: op,
    version,
    source_file_id: `${file.name}-${file.size}`,
    source_file_name: file.name,
    created_at: new Date().toISOString(),
    values,
    extraction_version: 'sat-declaration-label-v2',
    raw_text_sample: clean.slice(0, 1800)
  };
}

async function runDeclarationAnalysis(inputFiles) {
  const files = Array.from(inputFiles || []).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  const counters = { discovered: files.length, xml: 0, ingresos: 0, gastos: 0, divisas: 0, duplicados: 0, errores: 0, pdfs: files.length, zips: 0, declaraciones: 0 };
  showProgressPage(true);
  setProgress(10, `Leyendo ${files.length} PDF de declaración SAT...`);
  renderCounters(counters);
  addLog('Iniciando lectura de declaraciones SAT.');
  const declarations = [];
  for (const file of files) {
    try {
      addLog(`Leyendo PDF: ${file.name}`);
      const text = await readPdfText(file);
      const declaration = parseSatDeclaration(text, file);
      const activeTax = normalizeRfc(getActiveCompany?.().taxId || getProfile().taxId || '');
      if (!declaration.rfc && activeTax) declaration.rfc = activeTax;
      declarations.push(declaration);
      counters.declaraciones += 1;
      addLog(`DECLARACIÓN: ${declaration.rfc || 'RFC no detectado'} ${periodLabel(`${declaration.fiscal_year}-${declaration.period || '01'}`)} · Operación ${declaration.operation_number || 'sin número'}`);
    } catch (error) {
      counters.errores += 1;
      addLog(`ERROR leyendo ${file.name}: ${error.message}`);
    }
    renderCounters(counters);
    setProgress(20 + Math.round((declarations.length / Math.max(files.length, 1)) * 60), 'Procesando declaraciones SAT...');
    await waitFrame();
  }
  const current = loadAnalysis();
  const next = { ...current, declarations: mergeDeclarations(current.declarations || [], declarations), totals: { ...(current.totals || {}), pdfs: (current.totals?.pdfs || 0) + files.length } };
  const saved = await saveAnalysisRemote(recomputeAnalysis(next));
  setProgress(100, `Declaraciones guardadas: ${declarations.length}.`);
  hydrateAnalysisSummary(saved);
  updateCurrentPeriodLabel();
  addLog('Declaraciones guardadas en tu cuenta para conciliación.');
}

async function runAnalysis(inputFiles) {
  const profile = getProfile();
  const company = typeof getActiveCompany === 'function' ? getActiveCompany() : profile;
  const taxInput = document.querySelector('#business-rfc');
  let taxId = normalizeRfc(taxInput?.value || company.taxId || profile.taxId || '');
  const counters = { discovered: 0, xml: 0, ingresos: 0, gastos: 0, divisas: 0, duplicados: 0, errores: 0, pdfs: 0, zips: 0 };

  showProgressPage(true);
  setProgress(3, 'Preparando lectura de archivos...');
  renderCounters(counters);
  addLog('Iniciando análisis local de CFDI.');
  await waitFrame();

  const collected = await collectFiles(inputFiles, counters, (msg) => addLog(msg));
  counters.discovered = collected.length;
  renderCounters(counters);
  setProgress(18, `Archivos encontrados: ${collected.length}`);
  await waitFrame();

  const xmlFiles = collected.filter((f) => f.type === 'xml');
  if (taxId) {
    ensureActiveCompanyRfc(taxId, company);
  } else if (company && !normalizeRfc(company.taxId)) {
    taxId = inferTaxIdFromXmlFiles(xmlFiles);
    if (taxId) {
      ensureActiveCompanyRfc(taxId, company);
      if (taxInput) taxInput.value = taxId;
      addLog(`RFC inferido para la empresa activa: ${taxId}`, 'text-success');
    } else {
      addLog('No hay RFC configurado. Las facturas sin coincidencia con empresas registradas quedarán sin clasificar.', 'text-warning');
    }
  }
  const companiesForClassification = typeof analysisCompanies === 'function' ? analysisCompanies() : (typeof companiesArray === 'function' && typeof getCompanies === 'function' ? companiesArray(getCompanies()) : []);
  addLog(`Clasificando contra ${companiesForClassification.filter((c) => normalizeRfc(c.taxId)).length} RFC de empresas registradas en tu cuenta.`);

  let analysis = loadAnalysis();
  analysis.taxId = taxId;
  analysis.activeCompanyId = typeof activeCompanyId === 'function' ? activeCompanyId() : '';
  analysis.companies = typeof analysisCompanies === 'function' ? analysisCompanies() : [];
  analysis.profile = getProfile();
  const uploadAt = new Date().toISOString();
  const uploadBatch = { id: `upload-${Date.now()}`, uploadedAt: uploadAt, files: inputFiles.map((f) => ({ name: f.name, size: f.size })), xmlCount: 0, ingresos: 0, gastos: 0, duplicados: 0, errores: 0 };
  analysis.sourceFiles = [...(analysis.sourceFiles || []), ...inputFiles.map((f) => ({ name: f.name, size: f.size, uploadedAt: uploadAt }))];
  analysis.uploadHistory = [...(analysis.uploadHistory || []), uploadBatch];
  analysis.totals.pdfs = (analysis.totals.pdfs || 0) + counters.pdfs;
  analysis.totals.zips = (analysis.totals.zips || 0) + counters.zips;
  const seen = new Set(analysis.invoices.map((i) => i.uuid));

  for (let i = 0; i < xmlFiles.length; i += 1) {
    const file = xmlFiles[i];
    const pct = 18 + ((i + 1) / Math.max(1, xmlFiles.length)) * 72;
    try {
      const invoice = classifyInvoiceForCompanies(parseCfdiXml(file.text, file.name, ''), companiesForClassification);
      if (seen.has(invoice.uuid)) {
        counters.duplicados += 1;
        analysis.totals.duplicados = (analysis.totals.duplicados || 0) + 1;
        uploadBatch.duplicados += 1;
        addLog(`Duplicada omitida: ${invoice.uuid}`);
      } else {
        seen.add(invoice.uuid);
        invoice.uploadedAt = uploadAt;
        invoice.uploadBatchId = uploadBatch.id;
        analysis.invoices.push(invoice);
        uploadBatch.xmlCount += 1;
        counters.xml += 1;
        if (invoice.kind === 'ingreso') { counters.ingresos += 1; uploadBatch.ingresos += 1; }
        else if (invoice.kind === 'gasto') { counters.gastos += 1; uploadBatch.gastos += 1; }
        else addLog(`Sin empresa registrada para ${invoice.emisorRfc} / ${invoice.receptorRfc}. Revisa Settings.`, 'text-warning');
        if (invoice.foreignCurrency) counters.divisas += 1;
        const conversion = invoice.foreignCurrency
          ? ` (${moneyCurrency(invoice.totalOriginal, invoice.moneda)} × TC ${numberFmt(invoice.tipoCambio)} = ${money(invoice.total)})`
          : '';
        const periodNote = invoice.isGlobalInvoice ? ` · periodo ${periodLabel(invoiceMonth(invoice))} por ${invoice.indexingReason}` : '';
        addLog(`${invoice.kind.toUpperCase()}: ${invoice.emisorNombre || invoice.emisorRfc} → ${money(invoice.total)}${conversion}${periodNote}`);
      }
    } catch (error) {
      counters.errores += 1;
      analysis.totals.errores = (analysis.totals.errores || 0) + 1;
      uploadBatch.errores += 1;
      addLog(`Error en ${file.name}: ${error.message}`, 'text-danger');
    }
    renderCounters(counters);
    setProgress(pct, `Analizando XML ${i + 1} de ${xmlFiles.length}...`);
    if (i % 5 === 0) await waitFrame();
  }

  analysis = recomputeAnalysis(analysis);
  await saveAnalysisRemote(analysis);
  populateFilterControls();
  hydrateAnalysisSummary();
  updateCurrentPeriodLabel();
  window.dispatchEvent(new CustomEvent('analysis-updated', { detail: { analysis } }));
  setProgress(100, `Análisis terminado: ${counters.ingresos} ingresos, ${counters.gastos} gastos, ${counters.divisas} en divisa, ${counters.duplicados} duplicados.`);
  addLog('Análisis terminado y guardado en tu cuenta.', 'text-success');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-upload-mode]').forEach((btn) => btn.addEventListener('click', () => setUploadMode(btn.getAttribute('data-upload-mode'))));
  setUploadMode(currentUploadMode);
  const fileInput = document.querySelector('#invoice-files');
  const status = document.querySelector('[data-upload-status]');
  const dropzone = document.querySelector('[data-dropzone]');
  const list = document.querySelector('[data-file-list]');
  const taxInput = document.querySelector('#business-rfc');
  const saveRfc = document.querySelector('[data-save-rfc]');
  const reset = document.querySelector('[data-clear-analysis]');

  const profile = getProfile();
  const active = typeof getActiveCompany === 'function' ? getActiveCompany() : profile;
  if (taxInput) taxInput.value = active.taxId || profile.taxId || '';
  if (dropzone) dropzone.setAttribute('aria-disabled', 'false');
  bindFilterControls();
  hydrateAnalysisSummary();
  updateCurrentPeriodLabel();
  if (location.pathname.startsWith('/uploads/progreso')) {
    showProgressPage(false);
    setProgress(0, 'Sin análisis activo. Regresa a uploads para seleccionar archivos.');
  }

  saveRfc?.addEventListener('click', () => {
    const next = saveProfile({ taxId: taxInput?.value || '', businessName: active.name || profile.businessName });
    addLog(`RFC guardado: ${next.taxId || 'sin RFC'}`, next.taxId ? 'text-success' : 'text-warning');
  });

  reset?.addEventListener('click', () => {
    const month = document.querySelector('[data-clear-month]')?.value || '';
    const year = document.querySelector('[data-clear-year]')?.value || '';
    const scope = month ? 'month' : (year ? 'year' : 'all');
    const period = month || year;
    const msg = month
      ? `¿Borrar el análisis de ${periodLabel(month)}?`
      : (year ? `¿Borrar todo el análisis del año ${year}?` : '¿Borrar TODO el histórico guardado en tu cuenta?');
    if (!confirm(msg)) return;
    clearAnalysisRemote(scope, period).then((next) => {
      populateFilterControls();
      hydrateAnalysisSummary(next);
      updateCurrentPeriodLabel();
      renderCounters({});
      setProgress(0, 'Sin análisis activo.');
      addLog(period ? `Análisis de ${periodLabel(period)} borrado.` : 'Histórico completo borrado.', 'text-warning');
      window.dispatchEvent(new CustomEvent('analysis-updated', { detail: { analysis: next } }));
    }).catch((error) => addLog(error.message, 'text-danger')); 
  });

  window.addEventListener('analysis-filter-changed', updateCurrentPeriodLabel);
  window.addEventListener('popstate', () => {
    if (location.pathname.startsWith('/uploads/progreso')) showProgressPage(false);
    else showUploadPage();
  });

  fileInput?.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  renderFileList(files);
  try {
    if (currentUploadMode === 'declaraciones') await runDeclarationAnalysis(files);
    else await runAnalysis(files);
  } catch (error) {
    setProgress(100, `Error: ${error.message}`);
    addLog(`ERROR: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});
});
