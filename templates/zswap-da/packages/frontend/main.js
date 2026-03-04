// ── Config ───────────────────────────────────────────────────────────────────
// Set window.API_BASE before this script to override (e.g. for production).
const API_BASE = window.API_BASE ?? `http://${location.hostname}:9999`;

let knownTokens = [];
let zswapLimit = 100;
let zswapOffset = 0;
let zswapFilterToken = "";
let zswapFilterSide = "any";

async function loadKnownTokens() {
  try {
    const res = await fetch(`${API_BASE}/api/known-tokens`);
    knownTokens = await res.json();
    // Since we're injecting into dynamically generated inputs,
    // we'll update any existing token entries that have been generated
    const selects = document.querySelectorAll('select[id$="-token"]');
    selects.forEach(select => {
      // Keep the current selection if any
      const currentVal = select.value;

      // Rebuild options
      select.innerHTML = `
            <option value="">Select Token</option>
            ${knownTokens.map(t => `<option value="${t.token_color}">${t.name}</option>`).join('')}
            <option value="custom">Custom Token...</option>
          `;

      // Restore selection
      if (currentVal) select.value = currentVal;
    });

    // Update ZSwap filter token select with known tokens
    const filterSelect = document.getElementById('zswap-filter-token-select');
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = `
            <option value="">Any token</option>
            ${knownTokens.map(t => `<option value="${t.token_color}">${t.name}</option>`).join('')}
            <option value="custom">Custom token...</option>
          `;
      if (currentVal) filterSelect.value = currentVal;
    }
  } catch (e) {
    console.error("Failed to load known tokens", e);
  }
}

// ── Entry Builder ────────────────────────────────────────────────────────────

let givesCount = 0;
let wantsCount = 0;

// ── Modal ────────────────────────────────────────────────────────────────────

function openMintModal() {
  document.getElementById('mint-modal').classList.add('active');
}

function closeMintModal() {
  document.getElementById('mint-modal').classList.remove('active');
  document.getElementById('mint-result').style.display = 'none';
  document.getElementById('mint-result').textContent = '';
}

function addEntry(side) {
  const container = document.getElementById(side + '-entries');
  const idx = side === 'gives' ? givesCount++ : wantsCount++;
  const id = `${side}-${idx}`;

  const div = document.createElement('div');
  div.className = 'token-entry-dex';
  div.id = 'entry-' + id;

  // Only show remove button if there's more than one entry in this panel
  // We evaluate this by checking if the container already has children
  const hasExistingEntries = container.children.length > 0;

  div.innerHTML = `
        <div class="token-input-row">
          <input id="${id}-amount" type="number" class="token-amount-input" placeholder="0.0" min="0">

          <div class="token-selector">
            <select id="${id}-token" onchange="updateTokenType('${id}')">
              <option value="">Select Token</option>
              ${knownTokens.map(t => `<option value="${t.token_color}">${t.name}</option>`).join('')}
              <option value="custom">Custom Token...</option>
            </select>
          </div>
        </div>

        <div id="${id}-custom-row" style="display:none; margin-top:12px;">
          <input id="${id}-custom-token" type="text" placeholder="Token hex address..." style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <select id="${id}-type" style="width: auto; padding: 4px 8px;">
              <option value="shielded">Shielded</option>
              <option value="unshielded">Unshielded</option>
            </select>
          </div>
        </div>

        ${hasExistingEntries ? `
          <div style="text-align: right; margin-top: 8px;">
            <button class="btn-small btn-danger" onclick="removeEntry('${id}')" style="margin:0; padding: 2px 8px; font-size: 0.75rem; background: transparent; color: #ef4444; border: 1px solid #ef4444;">Remove</button>
          </div>
        ` : ''}

        <!-- Hidden input to store type for known tokens, default to shielded -->
        <input type="hidden" id="${id}-hidden-type" value="shielded">
      `;
  container.appendChild(div);
}

function updateTokenType(id) {
  const select = document.getElementById(`${id}-token`);
  const customRow = document.getElementById(`${id}-custom-row`);
  const hiddenType = document.getElementById(`${id}-hidden-type`);

  if (select.value === 'custom') {
    customRow.style.display = 'block';
  } else {
    customRow.style.display = 'none';
    // When using known tokens, assume shielded for simplicity in this UI
    // In a real app, this would be determined by the token metadata
    hiddenType.value = 'shielded';
  }
}

function removeEntry(id) {
  const el = document.getElementById('entry-' + id);
  if (el) el.remove();
}

function collectEntries(side) {
  const container = document.getElementById(side + '-entries');
  const entries = [];
  for (const div of container.querySelectorAll('.token-entry-dex')) {
    const rawId = div.id.replace('entry-', '');

    const tokenSelect = document.getElementById(rawId + '-token');
    const customTokenInput = document.getElementById(rawId + '-custom-token');
    const amountEl = document.getElementById(rawId + '-amount');
    const typeSelect = document.getElementById(rawId + '-type');
    const hiddenType = document.getElementById(rawId + '-hidden-type');

    if (!tokenSelect || !amountEl) continue;

    let token = tokenSelect.value;
    let type = hiddenType.value;

    if (token === 'custom') {
      token = customTokenInput.value.trim();
      type = typeSelect.value;
    } else if (token === '') {
      continue; // Skip empty selections
    }

    const amount = amountEl.value.trim();
    if (!token || !amount || amount <= 0) continue;

    entries.push({ type, token, amount });
  }
  return entries;
}

function swapSides() {
  // Get all current entries for both sides
  const givesEntries = collectEntries('gives');
  const wantsEntries = collectEntries('wants');

  // Clear containers
  document.getElementById('gives-entries').innerHTML = '';
  document.getElementById('wants-entries').innerHTML = '';

  // Reset counters to keep IDs clean
  givesCount = 0;
  wantsCount = 0;

  // Re-add wants to gives
  if (wantsEntries.length === 0) {
    addEntry('gives');
  } else {
    wantsEntries.forEach(entry => {
      addEntry('gives');
      const id = `gives-${givesCount - 1}`;
      populateEntry(id, entry);
    });
  }

  // Re-add gives to wants
  if (givesEntries.length === 0) {
    addEntry('wants');
  } else {
    givesEntries.forEach(entry => {
      addEntry('wants');
      const id = `wants-${wantsCount - 1}`;
      populateEntry(id, entry);
    });
  }
}

function populateEntry(id, data) {
  setTimeout(() => {
    const amountEl = document.getElementById(`${id}-amount`);
    const tokenSelect = document.getElementById(`${id}-token`);

    if (amountEl) amountEl.value = data.amount;

    if (tokenSelect) {
      // Check if token exists in dropdown
      const options = Array.from(tokenSelect.options).map(o => o.value);
      if (options.includes(data.token)) {
        tokenSelect.value = data.token;
        updateTokenType(id);
      } else {
        // It's a custom token
        tokenSelect.value = 'custom';
        updateTokenType(id);

        const customInput = document.getElementById(`${id}-custom-token`);
        const typeSelect = document.getElementById(`${id}-type`);

        if (customInput) customInput.value = data.token;
        if (typeSelect) typeSelect.value = data.type;
      }
    }
  }, 0);
}

// ── Mint type toggle ─────────────────────────────────────────────────────────

function onMintTypeChange() {
  const type = document.getElementById('mint-type').value;
  document.getElementById('mint-nonce-row').style.display = type === 'shielded' ? 'block' : 'none';
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function mintToken() {
  const btn = document.getElementById('btn-mint');
  const el = document.getElementById('mint-result');
  const type = document.getElementById('mint-type').value;
  const domainSep = document.getElementById('mint-domain-sep').value.trim();
  const amount = document.getElementById('mint-amount').value.trim();
  const nonce = document.getElementById('mint-nonce').value.trim() || '0';
  el.style.display = 'block';

  if (!domainSep || !amount) {
    el.innerHTML = '<span class="error">Domain separator and amount are required.</span>';
    return;
  }

  btn.disabled = true;
  el.textContent = 'Submitting token mint to Midnight…';
  try {
    const endpoint = type === 'shielded' ? '/api/token/mint-shielded' : '/api/token/mint-unshielded';
    const body = type === 'shielded'
      ? { domainSep, amount, nonce }
      : { domainSep, amount };
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    el.textContent = JSON.stringify(data, null, 2);
    loadKnownTokens();
  } catch (e) {
    el.innerHTML = `<span class="error">${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
}

async function submitOffer() {
  const btn = document.getElementById('btn-submit');
  const el  = document.getElementById('submit-result');
  el.style.display = 'block';

  const gives = collectEntries('gives');
  const wants = collectEntries('wants');

  if (!gives.length || !wants.length) {
    el.innerHTML = '<span class="error">Add at least one token entry for both Giving and Wanting.</span>';
    return;
  }

  btn.disabled = true;
  el.textContent = 'Generating Midnight swap transaction…';

  try {
    const resCreate = await fetch(`${API_BASE}/api/zswap/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gives, wants }),
    });
    const dataCreate = await resCreate.json();
    if (!resCreate.ok) throw new Error(dataCreate.message || 'Failed to create swap offer');

    const transaction = dataCreate.transaction;
    el.textContent = 'Submitting blob to Celestia…';

    const res = await fetch(`${API_BASE}/api/zswap/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction, gives, wants }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
    el.textContent = "Transaction created and submitted successfully!\n\n" + JSON.stringify(data, null, 2);

    // Refresh list after a short delay (node needs to pick up the blob)
    setTimeout(loadZSwaps, 2000);
  } catch (e) {
    el.innerHTML = `<span class="error">${e.message}</span>`;
  }

  btn.disabled = false;
}

// ── Accept ────────────────────────────────────────────────────────────────────

function loadMidnightState() {
  // Stub function since it's referenced but undefined
}

async function completeOffer(id) {
  const el = document.getElementById('complete-result-' + id);
  if (el) {
    el.style.display = 'block';
    el.textContent = 'Submitting completion to Midnight…';
  }
  try {
    const res = await fetch(`${API_BASE}/api/zswap/${id}/complete`, { method: 'POST' });
    const data = await res.json();
    if (el) el.textContent = JSON.stringify(data, null, 2);
    loadZSwaps();
    loadMidnightState();
  } catch (e) {
    if (el) el.innerHTML = `<span class="error">${e.message}</span>`;
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

function renderTokens(arr) {
  if (!arr?.length) return '—';
  return arr.map(t => {
    if (!t.token) return `? × ${t.amount ?? '?'}`;
    const known = knownTokens.find(k => k.token_color === t.token);
    if (known) {
      return `<span class="badge badge-token" title="${t.token}">${known.name}</span> × ${t.amount ?? '?'}`;
    }
    return `${shortToken(t.token)} × ${t.amount ?? '?'}`;
  }).join(', ');
}

function shortToken(t) {
  if (!t) return '?';
  if (t.length <= 12) return t;
  return t.slice(0, 6) + '…' + t.slice(-4);
}

function onZswapFilterTokenChange() {
  const select = document.getElementById('zswap-filter-token-select');
  const customInput = document.getElementById('zswap-filter-token-custom');
  if (!select || !customInput) return;

  if (select.value === 'custom') {
    customInput.style.display = 'block';
  } else {
    customInput.style.display = 'none';
  }
}

function applyZswapFilters() {
  const tokenSelect = document.getElementById('zswap-filter-token-select');
  const customTokenInput = document.getElementById('zswap-filter-token-custom');
  const sideSelect = document.getElementById('zswap-filter-side');
  const limitSelect = document.getElementById('zswap-limit');

  let tokenValue = "";
  if (tokenSelect) {
    if (tokenSelect.value === 'custom' && customTokenInput) {
      tokenValue = customTokenInput.value.trim();
    } else {
      tokenValue = tokenSelect.value;
    }
  }
  zswapFilterToken = tokenValue;
  if (sideSelect) zswapFilterSide = sideSelect.value || "any";
  if (limitSelect) {
    const parsed = parseInt(limitSelect.value, 10);
    zswapLimit = Number.isFinite(parsed) ? parsed : 100;
  }

  zswapOffset = 0;
  loadZSwaps();
}

function resetZswapFilters() {
  const tokenSelect = document.getElementById('zswap-filter-token-select');
  const customTokenInput = document.getElementById('zswap-filter-token-custom');
  const sideSelect = document.getElementById('zswap-filter-side');
  const limitSelect = document.getElementById('zswap-limit');

  if (tokenSelect) tokenSelect.value = "";
  if (customTokenInput) {
    customTokenInput.value = "";
    customTokenInput.style.display = 'none';
  }
  if (sideSelect) sideSelect.value = "any";
  if (limitSelect) limitSelect.value = "100";

  zswapFilterToken = "";
  zswapFilterSide = "any";
  zswapLimit = 100;
  zswapOffset = 0;
  loadZSwaps();
}

function toggleZswapFilters() {
  const container = document.getElementById('zswap-filters-container');
  const btn = document.getElementById('zswap-filters-toggle');
  if (!container || !btn) return;
  const isHidden = container.classList.toggle('hidden');
  btn.textContent = isHidden ? 'Filter' : 'Hide Filters';
}

function nextZswapPage() {
  zswapOffset += zswapLimit;
  loadZSwaps();
}

function prevZswapPage() {
  zswapOffset = Math.max(0, zswapOffset - zswapLimit);
  loadZSwaps();
}

async function loadZSwaps() {
  const el = document.getElementById('zswaps-list');
  const countEl = document.getElementById('zswap-count');
  const pageInfoEl = document.getElementById('zswap-page-info');
  const prevBtn = document.getElementById('zswap-prev-btn');
  const nextBtn = document.getElementById('zswap-next-btn');

  try {
    const params = new URLSearchParams();
    params.set('limit', String(zswapLimit));
    params.set('offset', String(zswapOffset));
    if (zswapFilterToken) params.set('token', zswapFilterToken);
    if (zswapFilterSide && zswapFilterSide !== "any") {
      params.set('direction', zswapFilterSide);
    }

    const res = await fetch(`${API_BASE}/api/zswaps?${params.toString()}`);
    const zswaps = await res.json();

    if (!Array.isArray(zswaps) || !zswaps.length) {
      countEl.textContent = '(0)';
      el.innerHTML = '<span style="color:#64748b;font-size:0.85rem;">No ZSwap offers indexed yet. Submit one above and wait for the node to pick it up from Celestia.</span>';
      if (pageInfoEl) pageInfoEl.textContent = '';
      if (prevBtn) prevBtn.disabled = zswapOffset <= 0;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    countEl.textContent = `(${zswaps.length})`;

    if (pageInfoEl) {
      const from = zswapOffset + 1;
      const to = zswapOffset + zswaps.length;
      pageInfoEl.textContent = `Showing ${from}–${to}`;
    }

    if (prevBtn) prevBtn.disabled = zswapOffset <= 0;
    if (nextBtn) nextBtn.disabled = zswaps.length < zswapLimit;

    // Build table header
    let html = `
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Giving</th>
                <th>Wanting</th>
                <th>Celestia Height</th>
                <th>Transaction</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
        `;
    // Build table rows
    html += zswaps.map(z => `
              <tr>
                <td>#${z.id}</td>
                <td>${renderTokens(z.gives)}</td>
                <td>${renderTokens(z.wants)}</td>
                <td>${z.celestia_height ?? '—'}</td>
                <td title="${z.transaction_hex}">${z.transaction_hex ? shortToken(z.transaction_hex) : '—'}</td>
                <td>
                  <button class="btn-small" style="margin:0;" onclick="completeOffer(${z.id})">Complete</button>
                  <div id="complete-result-${z.id}" class="result" style="display:none;margin-top:6px;position:absolute;z-index:10;"></div>
                </td>
              </tr>
        `).join('');

    html += `
            </tbody>
          </table>
        `;

    el.innerHTML = html;

    document.querySelectorAll('[id^="complete-result-"]').forEach(elem => {
      if (!elem.textContent) elem.style.display = 'none';
    });
  } catch (e) {
    el.innerHTML = `<span class="error">Failed to load: ${e.message}</span>`;
    if (pageInfoEl) pageInfoEl.textContent = '';
    if (prevBtn) prevBtn.disabled = zswapOffset <= 0;
    if (nextBtn) nextBtn.disabled = true;
  }
}

// ── 3D Logo Setup ────────────────────────────────────────────────────────────

let scene, camera, renderer, logoGroup;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

function init3DLogo() {
    const container = document.getElementById('logo-container');
    const width = 100; // container.clientWidth;
    const height = 100; // container.clientHeight;

    scene = new THREE.Scene();
    scene.background = null;

    const aspect = width / height;
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    camera.position.set(0, 0, 14);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 2.5);
    frontLight.position.set(0, 0, 20);
    scene.add(frontLight);

    const frontLight2 = new THREE.DirectionalLight(0xffffff, 2.5);
    frontLight2.position.set(0, 0, -20);
    scene.add(frontLight2);

    const topFrontLight = new THREE.PointLight(0xffffff, 1.0);
    topFrontLight.position.set(0, 10, 10);
    scene.add(topFrontLight);

    const rimLight = new THREE.PointLight(0xffffff, 1.2);
    rimLight.position.set(-10, -5, -10);
    scene.add(rimLight);

    const material = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.9,
        roughness: 0.15,
    });

    logoGroup = new THREE.Group();

    const outerRadius = 3.6;
    const innerRadius = 3.1;
    const ringWidth = outerRadius - innerRadius;

    const ringShape = new THREE.Shape();
    ringShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
    ringShape.holes.push(holePath);

    const extrudeSettings = {
        depth: 0.8,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 8,
        curveSegments: 128
    };

    const ringGeo = new THREE.ExtrudeGeometry(ringShape, extrudeSettings);
    const ring = new THREE.Mesh(ringGeo, material);
    ring.position.z = -0.4;
    logoGroup.add(ring);

    const cubeSize = ringWidth * 1.5;
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    const g = (innerRadius - (2.5 * cubeSize)) / 3;
    const yPositions = [0, cubeSize + g, cubeSize * 2 + g * 2];

    for (let i = 0; i < 3; i++) {
        const cube = new THREE.Mesh(cubeGeo, material);
        cube.position.y = yPositions[i];
        cube.position.x = 0;
        logoGroup.add(cube);
    }

    logoGroup.rotation.x = Math.PI * 0.05;
    logoGroup.rotation.y = -Math.PI * 0.1;

    logoGroup.scale.set(0.9, 0.9, 0.9);

    scene.add(logoGroup);

    setupLogoEvents(container);
    animateLogo();
}

function setupLogoEvents(container) {
    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        updateRotation(e.clientX, e.clientY);
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    container.addEventListener('touchstart', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, {passive: false});
    window.addEventListener('touchend', () => { isDragging = false; });
    window.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        updateRotation(e.touches[0].clientX, e.touches[0].clientY);
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        e.preventDefault();
    }, {passive: false});

    container.style.cursor = 'grab';
    container.addEventListener('mousedown', () => container.style.cursor = 'grabbing');
    window.addEventListener('mouseup', () => container.style.cursor = 'grab');
}

function updateRotation(currentX, currentY) {
    const deltaMove = {
        x: currentX - previousMousePosition.x,
        y: currentY - previousMousePosition.y
    };
    const deltaRotationQuaternion = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(
            (deltaMove.y * 0.4) * (Math.PI / 180),
            (deltaMove.x * 0.4) * (Math.PI / 180),
            0,
            'XYZ'
        ));
    logoGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, logoGroup.quaternion);
}

function animateLogo() {
    requestAnimationFrame(animateLogo);
    if (!isDragging) {
        logoGroup.rotation.y += 0.005;
    }
    renderer.render(scene, camera);
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadKnownTokens();
addEntry('gives');
addEntry('wants');
loadZSwaps();
init3DLogo();
