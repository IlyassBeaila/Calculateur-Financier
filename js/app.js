(function (Calc) {
  'use strict';

  const E = Calc.Engine;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Helpers ──

  function syncSlider(sliderId, inputId) {
    const slider = $(sliderId);
    const input = $(inputId);
    if (!slider || !input) return;
    slider.addEventListener('input', () => { input.value = slider.value; recalc(); });
    input.addEventListener('input', () => { slider.value = input.value; recalc(); });
  }

  function radioVal(name) {
    const el = $(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  }

  function renderBar(container, segments) {
    const total = segments.reduce((s, seg) => s + Math.abs(seg.value), 0);
    if (!total) { container.innerHTML = ''; return; }

    let html = '<div class="bar-container">';
    for (const seg of segments) {
      const pct = (Math.abs(seg.value) / total) * 100;
      if (pct < 0.5) continue;
      html += `<div class="bar-segment" style="flex:${pct};background:${seg.color}" title="${seg.label}: ${E.formatEuro(seg.value)}"></div>`;
    }
    html += '</div><div class="bar-legend">';
    for (const seg of segments) {
      html += `<div class="bar-legend-item">
        <div class="bar-legend-dot" style="background:${seg.color}"></div>
        ${seg.label} <span class="bar-legend-value">${E.formatEuro(seg.value)}</span>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // ── SEO: page titles per tab ──

  const TAB_META = {
    freelance: {
      title: 'Simulateur Freelance — Calculateur Financier France',
      description: 'Calculez votre revenu net freelance : micro-entrepreneur, SASU, EURL, portage salarial. TJM, charges, impôts.',
    },
    salaire: {
      title: 'Convertisseur Brut → Net — Calculateur Financier France',
      description: 'Convertissez votre salaire brut en net. Cadre ou non-cadre, avec calcul de l\'impôt sur le revenu.',
    },
    comparateur: {
      title: 'Comparateur Freelance vs Salarié — Calculateur Financier France',
      description: 'Comparez vos revenus freelance et salarié. Trouvez le salaire brut équivalent à votre CA freelance.',
    },
    crypto: {
      title: 'Fiscalité Crypto — Calculateur Financier France',
      description: 'Calculez l\'imposition de vos plus-values crypto. Flat tax 30% ou barème progressif.',
    },
    impots: {
      title: 'Simulateur Impôt sur le Revenu — Calculateur Financier France',
      description: 'Simulez votre impôt sur le revenu avec le barème 2024. Tranches, décote, quotient familial.',
    },
  };

  function updateMeta(tab) {
    const meta = TAB_META[tab];
    if (!meta) return;
    document.title = meta.title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', meta.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', meta.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', meta.description);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', `https://calculateur-financier.netlify.app/${tab === 'freelance' ? '' : tab}`);
  }

  // ── Routing ──

  const VALID_TABS = ['freelance', 'salaire', 'comparateur', 'crypto', 'impots'];

  function getTabFromPath() {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (VALID_TABS.includes(path)) return path;
    return 'freelance'; // default
  }

  function switchTab(tab, pushState) {
    if (!VALID_TABS.includes(tab)) tab = 'freelance';

    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = $(`.tab-btn[data-tab="${tab}"]`);
    const panel = $(`#tab-${tab}`);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');

    updateMeta(tab);

    if (pushState) {
      const url = tab === 'freelance' ? '/' : `/${tab}`;
      history.pushState({ tab }, '', url);
    }

    recalc();
  }

  // ── Tab switching ──

  function initTabs() {
    for (const btn of $$('.tab-btn')) {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab, true);
      });
    }

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const tab = (e.state && e.state.tab) || getTabFromPath();
      switchTab(tab, false);
    });

    // Initial route
    const initialTab = getTabFromPath();
    switchTab(initialTab, false);
    // Replace current state so back button works correctly
    const url = initialTab === 'freelance' ? '/' : `/${initialTab}`;
    history.replaceState({ tab: initialTab }, '', url);
  }

  // ── Freelance ──

  function getFreelanceCA() {
    const mode = radioVal('fl-mode');
    const amount = parseFloat($('#fl-amount').value) || 0;
    const jours = parseInt($('#fl-jours').value) || 218;
    if (mode === 'tjm') return amount * jours;
    if (mode === 'mensuel') return amount * 12;
    return amount; // annuel
  }

  function updateFreelanceUI() {
    const mode = radioVal('fl-mode');
    const label = $('#fl-amount-label');
    const slider = $('#fl-slider');
    if (mode === 'tjm') {
      label.textContent = 'TJM (€)';
      slider.min = 100; slider.max = 2000; slider.step = 10;
    } else if (mode === 'mensuel') {
      label.textContent = 'Mensuel (€)';
      slider.min = 1000; slider.max = 30000; slider.step = 100;
    } else {
      label.textContent = 'CA annuel (€)';
      slider.min = 10000; slider.max = 500000; slider.step = 1000;
    }

    const statut = $('#fl-statut').value;
    $('#fl-vfl-row').style.display = statut === 'micro' ? '' : 'none';
    $('#fl-split-row').style.display = (statut === 'sasu' || statut === 'eurl') ? '' : 'none';
    $('#fl-frais-row').style.display = statut === 'portage' ? '' : 'none';

    const split = parseInt($('#fl-split').value);
    $('#fl-split-label').textContent = `${split}% / ${100 - split}%`;
  }

  function calcFreelance() {
    updateFreelanceUI();
    const ca = getFreelanceCA();
    const r = E.computeFreelance({
      ca,
      statut: $('#fl-statut').value,
      jours: parseInt($('#fl-jours').value) || 218,
      parts: parseFloat($('#fl-parts').value) || 1,
      vfl: $('#fl-vfl').checked,
      splitSalaire: parseInt($('#fl-split').value),
      fraisGestion: parseInt($('#fl-frais-val').value),
    });

    const container = $('#fl-results');
    let html = `
      <div class="result-hero">
        <div class="label">Net mensuel après impôts</div>
        <div class="value">${E.formatEuro(r.mensuelNet)}</div>
        <div class="sub">${E.formatEuro(r.netApresIR)} / an · Taux de charges effectif : ${r.tauxCharges}%</div>
      </div>
      <div class="result-grid">
        <div class="result-item"><div class="label">CA brut annuel</div><div class="value">${E.formatEuro(r.caBrut)}</div></div>
        <div class="result-item"><div class="label">CA brut mensuel</div><div class="value">${E.formatEuro(r.mensuelBrut)}</div></div>
        <div class="result-item"><div class="label">Net avant IR</div><div class="value">${E.formatEuro(r.netAvantIR)}</div></div>
        <div class="result-item"><div class="label">Impôt sur le revenu</div><div class="value" style="color:var(--orange)">${E.formatEuro(r.ir)}</div></div>
        <div class="result-item"><div class="label">Total charges + IR</div><div class="value" style="color:var(--red)">${E.formatEuro(r.charges)}</div></div>
        <div class="result-item"><div class="label">TJM équivalent</div><div class="value">${E.formatEuro(r.tjm)}</div></div>
      </div>
      <div class="breakdown" id="fl-bar"></div>
    `;
    container.innerHTML = html;

    // Bar
    const colors = ['var(--green)', 'var(--accent)', 'var(--orange)', 'var(--red)', 'var(--purple)', 'var(--cyan)'];
    const segments = [];
    let i = 0;
    if (r.chargesDetail) {
      for (const [label, val] of Object.entries(r.chargesDetail)) {
        segments.push({ label, value: val, color: colors[i % colors.length] });
        i++;
      }
    }
    segments.push({ label: 'Net après IR', value: r.netApresIR, color: 'var(--green)' });
    renderBar($('#fl-bar'), segments);
  }

  // ── Salaire ──

  function getSalaireBrut() {
    const mode = radioVal('sal-mode');
    const amount = parseFloat($('#sal-amount').value) || 0;
    return mode === 'mensuel' ? amount * 12 : amount;
  }

  function updateSalaireUI() {
    const mode = radioVal('sal-mode');
    const label = $('#sal-amount-label');
    const slider = $('#sal-slider');
    if (mode === 'mensuel') {
      label.textContent = 'Brut mensuel (€)';
      slider.min = 1500; slider.max = 15000; slider.step = 50;
    } else {
      label.textContent = 'Brut annuel (€)';
      slider.min = 18000; slider.max = 180000; slider.step = 500;
    }
  }

  function calcSalaire() {
    updateSalaireUI();
    const brutAnnuel = getSalaireBrut();
    const cadre = radioVal('sal-cadre') === 'cadre';
    const parts = parseFloat($('#sal-parts').value) || 1;
    const r = E.computeSalaire({ brutAnnuel, cadre, parts });

    const container = $('#sal-results');
    container.innerHTML = `
      <div class="result-hero">
        <div class="label">Net mensuel après impôts</div>
        <div class="value">${E.formatEuro(r.netMensuelApresIR)}</div>
        <div class="sub">${E.formatEuro(r.netAnnuelApresIR)} / an</div>
      </div>
      <div class="result-grid">
        <div class="result-item"><div class="label">Brut annuel</div><div class="value">${E.formatEuro(r.brutAnnuel)}</div></div>
        <div class="result-item"><div class="label">Brut mensuel</div><div class="value">${E.formatEuro(r.brutMensuel)}</div></div>
        <div class="result-item"><div class="label">Cotisations (${r.tauxCharges}%)</div><div class="value" style="color:var(--orange)">${E.formatEuro(r.charges)}</div></div>
        <div class="result-item"><div class="label">Net avant IR</div><div class="value">${E.formatEuro(r.netAnnuelAvantIR)}</div></div>
        <div class="result-item"><div class="label">Net mensuel avant IR</div><div class="value">${E.formatEuro(r.netMensuelAvantIR)}</div></div>
        <div class="result-item"><div class="label">Impôt sur le revenu</div><div class="value" style="color:var(--orange)">${E.formatEuro(r.ir)}</div></div>
        <div class="result-item"><div class="label">Coût employeur</div><div class="value" style="color:var(--text3)">${E.formatEuro(r.coutEmployeur)}</div></div>
      </div>
      <div class="breakdown" id="sal-bar"></div>
    `;

    renderBar($('#sal-bar'), [
      { label: 'Net après IR', value: r.netAnnuelApresIR, color: 'var(--green)' },
      { label: 'IR', value: r.ir, color: 'var(--orange)' },
      { label: 'Cotisations', value: r.charges, color: 'var(--red)' },
    ]);
  }

  // ── Comparateur ──

  function calcComparateur() {
    const ca = parseFloat($('#cmp-ca').value) || 0;
    const statut = $('#cmp-statut').value;
    const brutAnnuel = parseFloat($('#cmp-brut').value) || 0;
    const parts = parseFloat($('#cmp-parts').value) || 1;

    const r = E.computeComparaison(
      { ca, statut, parts, jours: 218 },
      { brutAnnuel, cadre: true, parts }
    );

    const fl = r.freelance;
    const sal = r.salarie;
    const flBetter = fl.netApresIR > sal.netAnnuelApresIR;

    const container = $('#cmp-results');
    container.innerHTML = `
      <div class="equiv-box">
        <div class="label">Pour gagner autant en freelance (${statut}), il faudrait un salaire brut annuel de</div>
        <div class="value">${E.formatEuro(r.brutEquivalent)}</div>
        <div class="label" style="margin-top:4px">(${E.formatEuro(r.brutEquivalentMensuel)} / mois brut)</div>
      </div>

      <div class="compare-cols">
        <div class="compare-col freelance">
          <div class="col-header">Freelance ${statut.toUpperCase()}</div>
          <div class="compare-row"><span class="cr-label">CA brut</span><span class="cr-value">${E.formatEuro(fl.caBrut)}</span></div>
          <div class="compare-row"><span class="cr-label">Charges + IR</span><span class="cr-value" style="color:var(--red)">${E.formatEuro(fl.charges)}</span></div>
          <div class="compare-row"><span class="cr-label">Net annuel</span><span class="cr-value ${flBetter ? 'better' : ''}">${E.formatEuro(fl.netApresIR)}</span></div>
          <div class="compare-row"><span class="cr-label">Net mensuel</span><span class="cr-value ${flBetter ? 'better' : ''}">${E.formatEuro(fl.mensuelNet)}</span></div>
          <div class="compare-row"><span class="cr-label">Taux charges</span><span class="cr-value">${fl.tauxCharges}%</span></div>
        </div>
        <div class="compare-col salarie">
          <div class="col-header">Salarié cadre</div>
          <div class="compare-row"><span class="cr-label">Brut annuel</span><span class="cr-value">${E.formatEuro(sal.brutAnnuel)}</span></div>
          <div class="compare-row"><span class="cr-label">Charges + IR</span><span class="cr-value" style="color:var(--red)">${E.formatEuro(sal.charges + sal.ir)}</span></div>
          <div class="compare-row"><span class="cr-label">Net annuel</span><span class="cr-value ${!flBetter ? 'better' : ''}">${E.formatEuro(sal.netAnnuelApresIR)}</span></div>
          <div class="compare-row"><span class="cr-label">Net mensuel</span><span class="cr-value ${!flBetter ? 'better' : ''}">${E.formatEuro(sal.netMensuelApresIR)}</span></div>
          <div class="compare-row"><span class="cr-label">Taux charges</span><span class="cr-value">${sal.tauxCharges}%</span></div>
        </div>
      </div>

      <div class="avantages-grid">
        <div class="avantage-card">
          <h4>Avantages salarié</h4>
          ${r.avantages.salarie.map(a => `<div class="avantage-row"><span>${a.label}</span><span>${a.valeur}</span></div>`).join('')}
        </div>
        <div class="avantage-card">
          <h4>Avantages freelance</h4>
          ${r.avantages.freelance.map(a => `<div class="avantage-row"><span>${a.label}</span><span>${a.valeur}</span></div>`).join('')}
        </div>
      </div>
    `;
  }

  // ── Crypto ──

  function updateCryptoUI() {
    const regime = radioVal('cr-regime');
    $('#cr-parts-row').style.display = regime === 'bareme' ? '' : 'none';
  }

  function calcCrypto() {
    updateCryptoUI();
    const r = E.computeCrypto({
      prixAchat: parseFloat($('#cr-achat').value) || 0,
      prixVente: parseFloat($('#cr-vente').value) || 0,
      quantite: parseFloat($('#cr-qty').value) || 1,
      optionBareme: radioVal('cr-regime') === 'bareme',
      parts: parseFloat($('#cr-parts').value) || 1,
    });

    const isGain = r.plusValueBrute > 0;
    const container = $('#cr-results');
    container.innerHTML = `
      <div class="result-hero" style="${!isGain ? 'border-color:var(--red);background:rgba(239,68,68,0.08)' : ''}">
        <div class="label">${isGain ? 'Gain net après impôts' : 'Moins-value (non imposable)'}</div>
        <div class="value" style="${!isGain ? 'color:var(--red)' : ''}">${E.formatEuro(r.net)}</div>
        <div class="sub">Taux effectif d'imposition : ${r.tauxEffectif}%</div>
      </div>
      <div class="result-grid">
        <div class="result-item"><div class="label">Plus-value brute</div><div class="value">${E.formatEuro(r.plusValueBrute)}</div></div>
        <div class="result-item"><div class="label">Impôt total</div><div class="value" style="color:var(--orange)">${E.formatEuro(r.impot)}</div></div>
      </div>
      <div class="breakdown" id="cr-bar"></div>
    `;

    if (isGain) {
      const segments = [];
      const colors = ['var(--orange)', 'var(--red)'];
      let i = 0;
      for (const [label, val] of Object.entries(r.impotDetail)) {
        segments.push({ label, value: val, color: colors[i % colors.length] });
        i++;
      }
      segments.push({ label: 'Net', value: r.net, color: 'var(--green)' });
      renderBar($('#cr-bar'), segments);
    }
  }

  // ── Impôts IR ──

  function calcIR() {
    const revenu = parseFloat($('#ir-revenu').value) || 0;
    const parts = parseFloat($('#ir-parts').value) || 1;
    const r = E.computeIR(revenu, parts);

    const container = $('#ir-results');
    let tranchesHtml = r.tranches.map(t =>
      `<div class="compare-row">
        <span class="cr-label">${E.formatEuro(t.de)} → ${t.a === Infinity ? '∞' : E.formatEuro(t.a)} (${t.taux * 100}%)</span>
        <span class="cr-value">${E.formatEuro(t.montant)}</span>
      </div>`
    ).join('');

    container.innerHTML = `
      <div class="result-hero">
        <div class="label">Impôt sur le revenu</div>
        <div class="value">${E.formatEuro(r.impotNet)}</div>
        <div class="sub">Taux moyen : ${r.tauxMoyen}% · Taux marginal : ${r.tauxMarginal}%</div>
      </div>
      <div class="result-grid">
        <div class="result-item"><div class="label">Revenu net déclaré</div><div class="value">${E.formatEuro(r.revenuNet)}</div></div>
        <div class="result-item"><div class="label">Abattement 10%</div><div class="value">${E.formatEuro(r.abattement)}</div></div>
        <div class="result-item"><div class="label">Revenu imposable</div><div class="value">${E.formatEuro(r.revenuImposable)}</div></div>
        <div class="result-item"><div class="label">Quotient familial</div><div class="value">${E.formatEuro(r.quotientFamilial)}</div></div>
        <div class="result-item"><div class="label">Impôt brut</div><div class="value">${E.formatEuro(r.impotBrut)}</div></div>
        <div class="result-item"><div class="label">Décote</div><div class="value" style="color:var(--green)">${E.formatEuro(r.decote)}</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title">Détail par tranche</div>
        ${tranchesHtml}
      </div>
      <div class="breakdown" id="ir-bar"></div>
    `;

    const colors = ['var(--green)', 'var(--cyan)', 'var(--accent)', 'var(--orange)', 'var(--red)'];
    renderBar($('#ir-bar'), r.tranches.map((t, i) => ({
      label: `${t.taux * 100}%`,
      value: t.montant,
      color: colors[i % colors.length],
    })));
  }

  // ── Recalc dispatcher ──

  function recalc() {
    const active = $('.tab-panel.active');
    if (!active) return;
    const id = active.id;
    if (id === 'tab-freelance') calcFreelance();
    else if (id === 'tab-salaire') calcSalaire();
    else if (id === 'tab-comparateur') calcComparateur();
    else if (id === 'tab-crypto') calcCrypto();
    else if (id === 'tab-impots') calcIR();
  }

  // ── Init ──

  function init() {
    initTabs();

    // Sync sliders ↔ inputs
    syncSlider('#fl-slider', '#fl-amount');
    syncSlider('#fl-jours-slider', '#fl-jours');
    syncSlider('#fl-frais', '#fl-frais-val');
    syncSlider('#sal-slider', '#sal-amount');
    syncSlider('#cmp-slider', '#cmp-ca');
    syncSlider('#cmp-brut-slider', '#cmp-brut');
    syncSlider('#ir-slider', '#ir-revenu');

    // Listen to all inputs/selects/radios for recalc
    for (const el of $$('input, select')) {
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    }

    // Split slider label
    $('#fl-split').addEventListener('input', () => {
      const v = parseInt($('#fl-split').value);
      $('#fl-split-label').textContent = `${v}% / ${100 - v}%`;
    });

    // Report button
    const reportBtn = $('#btn-report');
    if (reportBtn) {
      reportBtn.addEventListener('click', generateReport);
    }
  }

  // ── Report generation ──

  function generateReport() {
    const activePanel = $('.tab-panel.active');
    if (!activePanel) return;

    const tabName = activePanel.id.replace('tab-', '');
    const tabLabel = TAB_META[tabName] ? TAB_META[tabName].title.split('—')[0].trim() : tabName;
    const resultsEl = activePanel.querySelector('.results');
    if (!resultsEl || !resultsEl.innerHTML.trim()) {
      alert('Aucun résultat à exporter. Lancez d\'abord une simulation.');
      return;
    }

    // Collect all result data from the active panel
    const heroEl = resultsEl.querySelector('.result-hero');
    const gridItems = resultsEl.querySelectorAll('.result-item');
    const compareRows = resultsEl.querySelectorAll('.compare-row');

    let reportLines = [];
    reportLines.push(`RAPPORT — ${tabLabel}`);
    reportLines.push(`Date : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    reportLines.push('');

    // Collect input parameters
    const card = activePanel.querySelector('.card');
    if (card) {
      reportLines.push('═══ PARAMÈTRES ═══');
      const inputs = card.querySelectorAll('input[type="number"], select');
      for (const inp of inputs) {
        const row = inp.closest('.input-row');
        if (row) {
          const labelEl = row.querySelector('label');
          if (labelEl) {
            const val = inp.tagName === 'SELECT' ? inp.options[inp.selectedIndex].text : inp.value;
            reportLines.push(`${labelEl.textContent.trim()} : ${val}`);
          }
        }
      }
      // Radio buttons
      const radios = card.querySelectorAll('input[type="radio"]:checked');
      for (const r of radios) {
        const span = r.parentElement.querySelector('span');
        const row = r.closest('.input-row');
        if (span && row) {
          const labelEl = row.querySelector('label:first-child');
          if (labelEl && labelEl !== r.parentElement) {
            reportLines.push(`${labelEl.textContent.trim()} : ${span.textContent.trim()}`);
          }
        }
      }
      reportLines.push('');
    }

    // Hero result
    if (heroEl) {
      reportLines.push('═══ RÉSULTAT PRINCIPAL ═══');
      const label = heroEl.querySelector('.label');
      const value = heroEl.querySelector('.value');
      const sub = heroEl.querySelector('.sub');
      if (label) reportLines.push(label.textContent.trim());
      if (value) reportLines.push(`>>> ${value.textContent.trim()} <<<`);
      if (sub) reportLines.push(sub.textContent.trim());
      reportLines.push('');
    }

    // Grid items
    if (gridItems.length > 0) {
      reportLines.push('═══ DÉTAILS ═══');
      for (const item of gridItems) {
        const label = item.querySelector('.label');
        const value = item.querySelector('.value');
        if (label && value) {
          reportLines.push(`${label.textContent.trim()} : ${value.textContent.trim()}`);
        }
      }
      reportLines.push('');
    }

    // Compare rows (for comparateur tab)
    if (compareRows.length > 0) {
      reportLines.push('═══ COMPARAISON ═══');
      for (const row of compareRows) {
        const label = row.querySelector('.cr-label');
        const value = row.querySelector('.cr-value');
        if (label && value) {
          reportLines.push(`${label.textContent.trim()} : ${value.textContent.trim()}`);
        }
      }
      reportLines.push('');
    }

    // Equiv box
    const equivBox = resultsEl.querySelector('.equiv-box');
    if (equivBox) {
      const labels = equivBox.querySelectorAll('.label');
      const value = equivBox.querySelector('.value');
      reportLines.push('═══ ÉQUIVALENCE ═══');
      for (const l of labels) reportLines.push(l.textContent.trim());
      if (value) reportLines.push(`>>> ${value.textContent.trim()} <<<`);
      reportLines.push('');
    }

    reportLines.push('─'.repeat(50));
    reportLines.push('Simulation indicative — calculateur-financier.netlify.app');
    reportLines.push('Ne constitue pas un conseil fiscal.');

    // Create and download the report
    const text = reportLines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-${tabName}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.addEventListener('DOMContentLoaded', init);

})(window.Calc);
