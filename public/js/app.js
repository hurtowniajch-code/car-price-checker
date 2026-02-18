// State
let currentListings = [];
let currentSort = { column: 'price', ascending: true };
let allEngineCapacities = [];
let engineCapacitiesByFuel = {};
let allPowers = [];
let powersByFuel = {};

// DOM elements
const form = document.getElementById('search-form');
const submitBtn = document.getElementById('submit-btn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const brandSelect = document.getElementById('brand');
const modelSelect = document.getElementById('model');
const brandAutocomplete = document.getElementById('brand-autocomplete');
const modelAutocomplete = document.getElementById('model-autocomplete');
const generationSelect = document.getElementById('generation');
const fetchOptionsBtn = document.getElementById('fetch-options-btn');
const fuelTypeSelect = document.getElementById('fuelType');
const engineCapacitySelect = document.getElementById('engineCapacity');
const powerSelect = document.getElementById('power');

// ============================================================
// Brand & Model autocomplete
// ============================================================

function showAC(list) { list.classList.add('open'); }
function hideAC(list) { list.classList.remove('open'); list.innerHTML = ''; }

function buildBrandList(filter) {
  brandAutocomplete.innerHTML = '';
  const f = filter.toLowerCase();
  const matches = f ? ALL_BRANDS.filter(b => b.toLowerCase().includes(f)) : ALL_BRANDS;

  matches.forEach((brand) => {
    const li = document.createElement('li');
    li.textContent = brand;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      brandSelect.value = brand;
      hideAC(brandAutocomplete);
      updateGenerationDropdown(brand, modelSelect.value);
    });
    brandAutocomplete.appendChild(li);
  });

  matches.length ? showAC(brandAutocomplete) : hideAC(brandAutocomplete);
}

function buildModelList(filter) {
  modelAutocomplete.innerHTML = '';
  const f = filter.toLowerCase();
  const brand = brandSelect.value;
  const hasBrand = brand && BRANDS_MODELS[brand];

  let items;
  if (hasBrand) {
    items = BRANDS_MODELS[brand]
      .filter(m => !f || m.toLowerCase().includes(f))
      .map(m => ({ model: m, brand }));
  } else {
    const filtered = f ? ALL_MODELS.filter(({ model }) => model.toLowerCase().includes(f)) : ALL_MODELS;
    items = filtered.slice(0, 150);
  }

  items.forEach(({ model, brand: b }) => {
    const li = document.createElement('li');
    if (!hasBrand) {
      li.innerHTML = escapeHtml(model) + ' <span class="brand-hint">(' + escapeHtml(b) + ')</span>';
    } else {
      li.textContent = model;
    }
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      modelSelect.value = model;
      hideAC(modelAutocomplete);
      if (!brandSelect.value || !BRANDS_MODELS[brandSelect.value]) {
        brandSelect.value = b || '';
      }
      updateGenerationDropdown(brandSelect.value, model);
      populateOptionsFromPreScraped(brandSelect.value, model, generationSelect.value);
    });
    modelAutocomplete.appendChild(li);
  });

  items.length ? showAC(modelAutocomplete) : hideAC(modelAutocomplete);
}

function setupKeyboardNav(input, list, onSelect) {
  input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('li');
    const active = list.querySelector('li.ac-active');
    let idx = active ? [...items].indexOf(active) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active?.classList.remove('ac-active');
      const next = items[Math.min(idx + 1, items.length - 1)];
      next?.classList.add('ac-active');
      next?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active?.classList.remove('ac-active');
      const prev = items[Math.max(idx - 1, 0)];
      prev?.classList.add('ac-active');
      prev?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (e.key === 'Escape') {
      hideAC(list);
    }
  });
}

// Brand events
brandSelect.addEventListener('focus', () => buildBrandList(brandSelect.value));
brandSelect.addEventListener('click', () => buildBrandList(brandSelect.value));
brandSelect.addEventListener('input', () => {
  buildBrandList(brandSelect.value);
  updateGenerationDropdown(brandSelect.value, modelSelect.value);
});
brandSelect.addEventListener('blur', () => setTimeout(() => hideAC(brandAutocomplete), 150));
setupKeyboardNav(brandSelect, brandAutocomplete);

// Model events
modelSelect.addEventListener('focus', () => buildModelList(modelSelect.value));
modelSelect.addEventListener('click', () => buildModelList(modelSelect.value));
modelSelect.addEventListener('input', () => {
  buildModelList(modelSelect.value);
  const m = modelSelect.value;
  if (!m) { updateGenerationDropdown('', ''); return; }
  if (!brandSelect.value || !BRANDS_MODELS[brandSelect.value]) {
    const b = MODEL_TO_BRAND[m.toLowerCase()];
    if (b && BRANDS_MODELS[b] && BRANDS_MODELS[b].includes(m)) {
      brandSelect.value = b;
    }
  }
  updateGenerationDropdown(brandSelect.value, m);
  populateOptionsFromPreScraped(brandSelect.value, m, generationSelect.value);
});
modelSelect.addEventListener('blur', () => setTimeout(() => hideAC(modelAutocomplete), 150));
setupKeyboardNav(modelSelect, modelAutocomplete);

// Close on outside click
document.addEventListener('click', (e) => {
  if (!brandSelect.closest('.autocomplete-wrapper').contains(e.target)) hideAC(brandAutocomplete);
  if (!modelSelect.closest('.autocomplete-wrapper').contains(e.target)) hideAC(modelAutocomplete);
});

// Populate generation dropdown based on brand + model
function updateGenerationDropdown(brand, model) {
  generationSelect.innerHTML = '';
  const gens = (GENERATIONS[brand] && GENERATIONS[brand][model]) || [];

  if (gens.length === 0) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- brak danych o generacjach --';
    generationSelect.appendChild(placeholder);
    generationSelect.disabled = true;
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- wybierz generację --';
  generationSelect.appendChild(placeholder);

  gens.forEach((gen) => {
    const opt = document.createElement('option');
    opt.value = gen.slug;
    opt.textContent = gen.name;
    generationSelect.appendChild(opt);
  });

  generationSelect.disabled = false;
}

// When generation changes: re-populate options with generation-specific data
generationSelect.addEventListener('change', () => {
  if (brandSelect.value && modelSelect.value) {
    populateOptionsFromPreScraped(brandSelect.value, modelSelect.value, generationSelect.value);
  }
});

// ============================================================
// Auto-populate options from pre-scraped data
// ============================================================

const transmissionSelect = document.getElementById('transmission');

function populateOptionsFromPreScraped(brand, model, genSlug) {
  if (typeof MODEL_OPTIONS === 'undefined') return;

  const modelOpts = MODEL_OPTIONS[brand] && MODEL_OPTIONS[brand][model];
  if (!modelOpts) {
    // No pre-scraped data — show fetch button as fallback
    fetchOptionsBtn.style.display = '';
    return;
  }

  // Use generation-specific data if available, otherwise fall back to model-level
  const opts = (genSlug && modelOpts.byGeneration && modelOpts.byGeneration[genSlug])
    ? modelOpts.byGeneration[genSlug]
    : modelOpts;

  // Populate fuel type dropdown
  const currentFuel = fuelTypeSelect.value;
  fuelTypeSelect.innerHTML = '<option value="">-- dowolny --</option>';
  (opts.fuelTypes || []).forEach((fuel) => {
    const opt = document.createElement('option');
    opt.value = fuel;
    opt.textContent = fuel;
    fuelTypeSelect.appendChild(opt);
  });
  if (currentFuel) fuelTypeSelect.value = currentFuel;

  // Populate transmission dropdown from pre-scraped gearboxes
  if (opts.gearboxes && opts.gearboxes.length > 0) {
    const gearboxToValue = {
      'Manualna': 'Manual',
      'Automatyczna': 'Automatic',
    };
    const currentTrans = transmissionSelect.value;
    transmissionSelect.innerHTML = '<option value="">-- dowolna --</option>';
    opts.gearboxes.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = gearboxToValue[g] || g;
      opt.textContent = g;
      transmissionSelect.appendChild(opt);
    });
    if (currentTrans) transmissionSelect.value = currentTrans;
  }

  // Store engine capacity data for fuel-type filtering
  allEngineCapacities = opts.engineCapacities || [];
  engineCapacitiesByFuel = opts.engineCapacitiesByFuel || {};
  updateEngineCapacityDropdown();

  // Store power data
  allPowers = opts.powers || [];
  powersByFuel = opts.powersByFuel || {};
  updatePowerDropdown();

  // Keep fetch button visible as fallback
  fetchOptionsBtn.style.display = '';
}

// ============================================================
// Fetch options from Otomoto (fallback when no pre-scraped data)
// ============================================================

fetchOptionsBtn.addEventListener('click', async () => {
  if (!brandSelect.value || !modelSelect.value) {
    showError('Wypełnij markę i model przed pobraniem danych.');
    return;
  }
  hideError();

  fetchOptionsBtn.disabled = true;
  fetchOptionsBtn.textContent = 'Pobieram...';

  try {
    const response = await fetch('/api/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: brandSelect.value,
        model: modelSelect.value,
        generation: generationSelect.value || undefined,
        year: document.getElementById('year').value || undefined,
        yearRange: document.getElementById('yearRange').value,
        mileage: document.getElementById('mileage').value ? document.getElementById('mileage').value * 1000 : undefined,
        mileageRange: document.getElementById('mileageRange').value,
        damaged: document.getElementById('damaged').value || undefined,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      showError(data.error || 'Nie udało się pobrać danych.');
      return;
    }

    // Populate fuel type dropdown
    const currentFuel = fuelTypeSelect.value;
    fuelTypeSelect.innerHTML = '<option value="">-- dowolny --</option>';
    data.fuelTypes.forEach((fuel) => {
      const opt = document.createElement('option');
      opt.value = fuel;
      opt.textContent = fuel;
      fuelTypeSelect.appendChild(opt);
    });
    if (currentFuel) fuelTypeSelect.value = currentFuel;

    // Store engine capacity data for fuel-type filtering
    allEngineCapacities = data.engineCapacities || [];
    engineCapacitiesByFuel = data.engineCapacitiesByFuel || {};

    // Populate engine capacity dropdown (filtered by current fuel type if selected)
    updateEngineCapacityDropdown();

    // Store power data
    allPowers = data.powers || [];
    powersByFuel = data.powersByFuel || {};

    // Populate power dropdown (filtered by current fuel type if selected)
    updatePowerDropdown();

    fetchOptionsBtn.textContent = 'Pobrano (' + data.listingsScanned + ' ogłoszeń)';
  } catch (err) {
    showError('Błąd połączenia: ' + err.message);
    fetchOptionsBtn.textContent = 'Pobierz dane z Otomoto';
  } finally {
    fetchOptionsBtn.disabled = false;
  }
});

// ============================================================
// Engine capacity filtering by fuel type
// ============================================================

function updateEngineCapacityDropdown() {
  const currentEngine = engineCapacitySelect.value;
  const selectedFuel = fuelTypeSelect.value;

  // Pick the right list: filtered by fuel or all
  const capacities = selectedFuel && engineCapacitiesByFuel[selectedFuel]
    ? engineCapacitiesByFuel[selectedFuel]
    : allEngineCapacities;

  engineCapacitySelect.innerHTML = '<option value="">-- dowolna --</option>';
  capacities.forEach((cc) => {
    const opt = document.createElement('option');
    opt.value = cc;
    opt.textContent = new Intl.NumberFormat('pl-PL').format(cc) + ' ccm';
    engineCapacitySelect.appendChild(opt);
  });

  // Keep previous selection if it still exists in the filtered list
  if (currentEngine && capacities.includes(Number(currentEngine))) {
    engineCapacitySelect.value = currentEngine;
  }
}

// Update power dropdown (optionally filtered by fuel type)
function updatePowerDropdown() {
  const currentPower = powerSelect.value;
  const selectedFuel = fuelTypeSelect.value;

  const powers = selectedFuel && powersByFuel[selectedFuel]
    ? powersByFuel[selectedFuel]
    : allPowers;

  powerSelect.innerHTML = '<option value="">-- dowolna --</option>';
  powers.forEach((hp) => {
    const opt = document.createElement('option');
    opt.value = hp;
    opt.textContent = hp + ' KM';
    powerSelect.appendChild(opt);
  });

  if (currentPower && powers.includes(Number(currentPower))) {
    powerSelect.value = currentPower;
  }
}

// When fuel type changes, update engine capacities and powers
fuelTypeSelect.addEventListener('change', () => {
  if (allEngineCapacities.length > 0) {
    updateEngineCapacityDropdown();
  }
  if (allPowers.length > 0) {
    updatePowerDropdown();
  }
});

// ============================================================
// Form submit & search
// ============================================================

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await performSearch();
});

async function performSearch() {
  showLoading();
  hideError();
  hideResults();

  // Parse generation year range from selected option text (e.g. "B8 (2007-2015)")
  let generationYearFrom = undefined;
  let generationYearTo = undefined;
  if (generationSelect.value) {
    const genText = generationSelect.options[generationSelect.selectedIndex].textContent || '';
    const yearMatch = genText.match(/\((\d{4})-(\d{4})?\)/);
    if (yearMatch) {
      generationYearFrom = yearMatch[1];
      generationYearTo = yearMatch[2] || undefined;
    }
  }

  const formData = {
    brand: brandSelect.value,
    model: modelSelect.value,
    generation: generationSelect.value || undefined,
    generationYearFrom,
    generationYearTo,
    year: document.getElementById('year').value || undefined,
    yearRange: document.getElementById('yearRange').value,
    mileage: document.getElementById('mileage').value ? document.getElementById('mileage').value * 1000 : undefined,
    mileageRange: document.getElementById('mileageRange').value,
    version: document.getElementById('version').value.trim() || undefined,
    fuelType: document.getElementById('fuelType').value || undefined,
    engineCapacity: document.getElementById('engineCapacity').value || undefined,
    power: document.getElementById('power').value || undefined,
    transmission: document.getElementById('transmission').value || undefined,
    damaged: document.getElementById('damaged').value || undefined,
    trimPercent: document.getElementById('trimPercent').value,
  };

  try {
    const response = await fetch('/api/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (!data.success) {
      showError(data.error || 'Wystąpił nieznany błąd.');
      return;
    }

    if (data.listings.length === 0) {
      showError('Nie znaleziono ogłoszeń dla tych kryteriów. Spróbuj poszerzyć wyszukiwanie (np. usuń wersję lub zwiększ zakres roku).');
      return;
    }

    currentListings = data.listings;
    renderStats(data.stats);
    renderListings(data.listings);
    setOtomotoLink(data.searchUrl);
    showResults();
  } catch (err) {
    showError('Błąd połączenia: ' + err.message);
  } finally {
    hideLoading();
  }
}

// Render price stats
function renderStats(stats) {
  if (!stats) return;
  document.getElementById('stat-count').textContent = stats.count;
  document.getElementById('stat-min').textContent = formatPrice(stats.min);
  document.getElementById('stat-max').textContent = formatPrice(stats.max);
  document.getElementById('stat-avg').textContent = formatPrice(stats.average);
  document.getElementById('stat-median').textContent = formatPrice(stats.median);
}

// Render listings table
function renderListings(listings) {
  const tbody = document.getElementById('listings-body');
  tbody.innerHTML = '';

  listings.forEach((listing) => {
    const row = document.createElement('tr');
    row.innerHTML =
      '<td>' + escapeHtml(listing.title) + '</td>' +
      '<td class="price-cell">' + formatPrice(listing.price) + '</td>' +
      '<td>' + (listing.year || '-') + '</td>' +
      '<td>' + (listing.mileage ? formatMileage(listing.mileage) : '-') + '</td>' +
      '<td>' + (listing.fuelType || '-') + '</td>' +
      '<td>' + (listing.engineCapacity ? new Intl.NumberFormat('pl-PL').format(listing.engineCapacity) + ' ccm' : '-') + '</td>' +
      '<td>' + (listing.power ? listing.power + ' KM' : '-') + '</td>' +
      '<td>' + (listing.link ? '<a href="' + escapeHtml(listing.link) + '" target="_blank" rel="noopener">Zobacz</a>' : '-') + '</td>';
    tbody.appendChild(row);
  });
}

// Table sorting
document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const column = th.getAttribute('data-sort');

    if (currentSort.column === column) {
      currentSort.ascending = !currentSort.ascending;
    } else {
      currentSort.column = column;
      currentSort.ascending = true;
    }

    // Update header indicators
    document.querySelectorAll('th[data-sort]').forEach((h) => {
      h.classList.remove('active');
      h.textContent = h.textContent.replace(/ [▲▼]$/, '');
    });
    th.classList.add('active');
    th.textContent += currentSort.ascending ? ' ▲' : ' ▼';

    // Sort listings
    const sorted = [...currentListings].sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return currentSort.ascending ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      const cmp = strA.localeCompare(strB, 'pl');
      return currentSort.ascending ? cmp : -cmp;
    });

    renderListings(sorted);
  });
});

// Set otomoto search link
function setOtomotoLink(url) {
  const link = document.getElementById('otomoto-link');
  link.href = url;
}

// Formatting helpers
function formatPrice(n) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMileage(n) {
  return new Intl.NumberFormat('pl-PL').format(n) + ' km';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// UI toggles
function showLoading() {
  loadingEl.classList.remove('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Szukam...';
}

function hideLoading() {
  loadingEl.classList.add('hidden');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Sprawdź cenę na Otomoto';
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function showResults() {
  resultsEl.classList.remove('hidden');
}

function hideResults() {
  resultsEl.classList.add('hidden');
}
