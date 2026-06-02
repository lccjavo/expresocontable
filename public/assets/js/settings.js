requireAuth();

function persistSettingsRemote() {
  const analysis = loadAnalysis();
  analysis.profile = getProfile();
  analysis.companies = analysisCompanies();
  analysis.activeCompanyId = activeCompanyId();
  return saveAnalysisRemote(analysis).catch((error) => {
    console.warn('No se pudo guardar settings remoto:', error.message);
    return analysis;
  });
}

function renderSettings() {
  const profile = getProfile();
  const companies = analysisCompanies();
  const active = getActiveCompany();
  const list = document.querySelector('[data-company-list]');
  if (list) {
    list.innerHTML = companies.map((company) => `
      <div class="list-group-item d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 px-0">
        <div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <strong>${company.name}</strong>
            ${company.id === active.id ? '<span class="badge rounded-pill text-bg-success">Activa</span>' : ''}
          </div>
          <div class="small text-secondary">RFC: ${company.taxId || 'Sin RFC'} · Régimen: ${regimeLabel(company.taxRegime)}</div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-outline-primary rounded-pill" data-edit-company="${company.id}">Editar</button>
          ${company.id !== active.id ? `<button class="btn btn-sm btn-primary rounded-pill" data-switch-company="${company.id}">Usar</button>` : ''}
          ${companies.length > 1 ? `<button class="btn btn-sm btn-outline-danger rounded-pill" data-delete-company="${company.id}">Borrar</button>` : ''}
        </div>
      </div>
    `).join('');
  }
  document.querySelectorAll('[data-active-company-name]').forEach((el) => { el.textContent = active.name || 'Mi empresa'; });
  document.querySelectorAll('[data-active-company-rfc]').forEach((el) => { el.textContent = active.taxId || 'Sin RFC'; });
  bindCompanyActions();
}

function regimeLabel(value) {
  return {
    'actividad-empresarial': 'PF actividad empresarial',
    'persona-moral': 'Persona moral',
    'resico-pf': 'RESICO PF'
  }[value] || value || 'No definido';
}

function fillForm(company = null) {
  const active = company || getActiveCompany();
  document.querySelector('[data-company-id]').value = active.id || '';
  document.querySelector('[data-company-name-input]').value = active.name || '';
  document.querySelector('[data-company-rfc-input]').value = active.taxId || '';
  document.querySelector('[data-company-regime-input]').value = active.taxRegime || 'actividad-empresarial';
}

function bindCompanyActions() {
  document.querySelectorAll('[data-edit-company]').forEach((btn) => {
    btn.onclick = () => {
      const company = analysisCompanies().find((c) => c.id === btn.dataset.editCompany);
      if (company) fillForm(company);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });
  document.querySelectorAll('[data-switch-company]').forEach((btn) => {
    btn.onclick = async () => {
      switchActiveCompany(btn.dataset.switchCompany);
      saveFilters({});
      await persistSettingsRemote();
      renderSettings();
      hydrateNav();
      setMessage('[data-settings-message]', 'Empresa activa actualizada.', 'text-success');
    };
  });
  document.querySelectorAll('[data-delete-company]').forEach((btn) => {
    btn.onclick = async () => {
      const company = analysisCompanies().find((c) => c.id === btn.dataset.deleteCompany);
      if (!company || !confirm(`¿Borrar ${company.name}? Sus CFDI cargados seguirán guardados, pero no se mostrarán hasta que vuelvas a crear una empresa con ese RFC.`)) return;
      deleteCompany(btn.dataset.deleteCompany);
      await persistSettingsRemote();
      renderSettings();
      fillForm(getActiveCompany());
      hydrateNav();
      setMessage('[data-settings-message]', 'Empresa borrada.', 'text-warning');
    };
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await loadAnalysisRemote(); } catch {}
  renderSettings();
  fillForm(getActiveCompany());

  document.querySelector('[data-new-company]')?.addEventListener('click', () => {
    const id = `company-${Date.now()}`;
    fillForm({ id, name: '', taxId: '', taxRegime: 'actividad-empresarial' });
    setMessage('[data-settings-message]', 'Captura los datos de la nueva empresa y guarda.', 'text-secondary');
  });

  document.querySelector('[data-company-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.querySelector('[data-company-id]').value || `company-${Date.now()}`;
    const name = document.querySelector('[data-company-name-input]').value.trim() || 'Mi empresa';
    const taxId = normalizeRfc(document.querySelector('[data-company-rfc-input]').value);
    const taxRegime = document.querySelector('[data-company-regime-input]').value;
    saveCompany({ id, name, taxId, taxRegime });
    saveFilters({});
    await persistSettingsRemote();
    renderSettings();
    fillForm(getActiveCompany());
    hydrateNav();
    setMessage('[data-settings-message]', 'Settings guardados y sincronizados.', 'text-success');
  });
});
