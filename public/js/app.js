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
const generationSelect = document.getElementById('generation');
const fetchOptionsBtn = document.getElementById('fetch-options-btn');
const fuelTypeSelect = document.getElementById('fuelType');
const engineCapacitySelect = document.getElementById('engineCapacity');
const powerSelect = document.getElementById('power');

// ============================================================
// Brand & Model dropdown logic
// ============================================================

// Populate brand dropdown
function initBrandDropdown() {
  brandSelect.innerHTML = '<option value="">-- wybierz markę --</option>';
  ALL_BRANDS.forEach((brand) => {
    const opt = document.createElement('option');
    opt.value = brand;
    opt.textContent = brand;
    brandSelect.appendChild(opt);
  });
}

// Populate model dropdown based on selected brand (or all models if no brand)
function updateModelDropdown(selectedBrand) {
  const currentModel = modelSelect.value;
  modelSelect.innerHTML = '';

  if (selectedBrand && BRANDS_MODELS[selectedBrand]) {
    // Brand selected: show only that brand's models
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- wybierz model --';
    modelSelect.appendChild(placeholder);

    BRANDS_MODELS[selectedBrand].forEach((model) => {
      const opt = document.createElement('option');
      opt.value = model;
      opt.textContent = model;
      modelSelect.appendChild(opt);
    });

    // Keep previously selected model if it exists in this brand
    if (currentModel && BRANDS_MODELS[selectedBrand].includes(currentModel)) {
      modelSelect.value = currentModel;
    }
  } else {
    // No brand selected: show all models grouped by brand
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- wybierz model (lub najpierw markę) --';
    modelSelect.appendChild(placeholder);

    ALL_MODELS.forEach(({ brand, model }) => {
      const opt = document.createElement('option');
      opt.value = model;
      opt.textContent = model + '  (' + brand + ')';
      opt.dataset.brand = brand;
      modelSelect.appendChild(opt);
    });
  }
}

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

// When brand changes: update model list and reset generation
brandSelect.addEventListener('change', () => {
  updateModelDropdown(brandSelect.value);
  updateGenerationDropdown(brandSelect.value, modelSelect.value);
});

// When model changes: auto-fill brand if needed, then update generation + options
modelSelect.addEventListener('change', () => {
  const selectedModel = modelSelect.value;
  if (!selectedModel) {
    updateGenerationDropdown('', '');
    return;
  }

  if (!brandSelect.value) {
    // No brand selected - auto-detect from model
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];

    if (selectedOption.dataset.brand) {
      brandSelect.value = selectedOption.dataset.brand;
      updateModelDropdown(brandSelect.value);
      modelSelect.value = selectedModel;
    } else {
      const brand = MODEL_TO_BRAND[selectedModel.toLowerCase()];
      if (brand) {
        brandSelect.value = brand;
        updateModelDropdown(brand);
        modelSelect.value = selectedModel;
      }
    }
  }

  updateGenerationDropdown(brandSelect.value, selectedModel);
  populateOptionsFromPreScraped(brandSelect.value, selectedModel, generationSelect.value);
});

// When generation changes: re-populate options with generation-specific data
generationSelect.addEventListener('change', () => {
  if (brandSelect.value && modelSelect.value) {
    populateOptionsFromPreScraped(brandSelect.value, modelSelect.value, generationSelect.value);
  }
});

// Initialize dropdowns on page load
initBrandDropdown();
updateModelDropdown('');

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

  // Hide fetch button since we have pre-scraped data
  fetchOptionsBtn.style.display = 'none';
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
