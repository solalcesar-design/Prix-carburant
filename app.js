/* ===== FUELRADAR — APP.JS ===== */

// ---- STATE ----
let currentMode = 'geo';
let userLat = null, userLon = null;
let currentFuel = 'gazole';
let currentSort = 'prix';
let currentStations = [];
let map = null;
let markers = [];

const FUEL_KEYS = {
    gazole: 'gazole_prix',
    e10:    'e10_prix',
    sp95:   'sp95_prix',
    sp98:   'sp98_prix',
    e85:    'e85_prix',
    gplc:   'gplc_prix'
};

const FUEL_LABELS = {
    gazole: 'GAZOLE',
    e10:    'SP95-E10',
    sp95:   'SP95',
    sp98:   'SP98',
    e85:    'E85',
    gplc:   'GPLc'
};

const MARQUES = ["INTERMARCHE","LECLERC","TOTAL","CARREFOUR","SUPER U","ESSO","AVIA","VULCO","CASINO","AUCHAN","BP","SHELL","SYSTEME U","NETTO","HYPER U","MONOPRIX","SPAR"];

// ---- MODE ----
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-geo').classList.toggle('active', mode === 'geo');
    document.getElementById('btn-addr').classList.toggle('active', mode === 'addr');
    document.getElementById('block-geo').classList.toggle('hidden', mode !== 'geo');
    document.getElementById('block-addr').classList.toggle('hidden', mode !== 'addr');
}

// ---- RAYON ----
function updateRayon(v) {
    document.getElementById('rayon-val').textContent = v;
}

// ---- FUEL CHIPS ----
document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFuel = btn.dataset.fuel;
        if (currentStations.length) renderResults(currentStations);
    });
});

// ---- GEOLOCATION ----
function locateUser() {
    const status = document.getElementById('geo-status');
    status.textContent = 'Localisation en cours...';
    status.className = 'geo-status';

    if (!navigator.geolocation) {
        status.textContent = '❌ Géolocalisation non supportée';
        status.className = 'geo-status err';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            userLat = pos.coords.latitude;
            userLon = pos.coords.longitude;
            status.textContent = `✓ Position obtenue (${userLat.toFixed(4)}, ${userLon.toFixed(4)})`;
            status.className = 'geo-status ok';
        },
        err => {
            status.textContent = '❌ Impossible d\'obtenir la position';
            status.className = 'geo-status err';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ---- SEARCH BY ADDRESS (geocoding via Nominatim) ----
async function searchByAddress() {
    const addr = document.getElementById('addrInput').value.trim();
    if (!addr) return;

    const status = document.getElementById('geo-status');
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr + ', France')}&format=json&limit=1`);
        const d = await r.json();
        if (!d.length) {
            showError('Adresse introuvable, essayez un code postal.');
            return;
        }
        userLat = parseFloat(d[0].lat);
        userLon = parseFloat(d[0].lon);
        // Trigger search immediately after finding address
        lancerRecherche();
    } catch {
        showError('Erreur réseau lors du géocodage.');
    }
}

// ---- HAVERSINE DISTANCE ----
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ---- FETCH STATIONS (bounding box) ----
async function fetchStations(lat, lon, radiusKm) {
    // Approx degrees for the bounding box
    const deg = radiusKm / 111;
    const latMin = (lat - deg).toFixed(5), latMax = (lat + deg).toFixed(5);
    const lonMin = (lon - deg).toFixed(5), lonMax = (lon + deg).toFixed(5);

    const where = `latitude > ${latMin} AND latitude < ${latMax} AND longitude > ${lonMin} AND longitude < ${lonMax}`;
    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?where=${encodeURIComponent(where)}&limit=100`;

    const res = await fetch(url);
    const data = await res.json();
    return data.results || [];
}

// ---- MAIN SEARCH ----
async function lancerRecherche() {
    // If address mode, geocode first
    if (currentMode === 'addr') {
        const addr = document.getElementById('addrInput').value.trim();
        if (!addr) { showError('Entrez une adresse ou un code postal.'); return; }
        if (!userLat) {
            await searchByAddress();
            return; // searchByAddress calls lancerRecherche again
        }
    }

    if (!userLat) {
        if (currentMode === 'geo') showError('Cliquez d\'abord sur "Détecter ma position GPS".');
        else showError('Entrez une adresse ou un code postal.');
        return;
    }

    const radius = parseInt(document.getElementById('rayon').value);

    // Show loader
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('results').innerHTML = '';
    document.getElementById('stats-bar').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('back-top').classList.add('hidden');

    try {
        let stations = await fetchStations(userLat, userLon, radius);

        // Compute distance & filter
        stations = stations
            .map(s => ({
                ...s,
                _dist: (s.latitude && s.longitude)
                    ? haversine(userLat, userLon, parseFloat(s.latitude), parseFloat(s.longitude))
                    : 999
            }))
            .filter(s => s._dist <= radius)
            .sort((a, b) => a._dist - b._dist);

        currentStations = stations;

        document.getElementById('loader').classList.add('hidden');

        if (!stations.length) {
            document.getElementById('results').innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">🔍</span>
                    <h3>Aucune station trouvée</h3>
                    <p>Essayez d'augmenter le rayon de recherche.</p>
                </div>`;
            return;
        }

        // Stats
        const prices = stations.map(s => parseFloat(s[FUEL_KEYS[currentFuel]])).filter(v => v > 0);
        const minP = prices.length ? Math.min(...prices) : null;
        const avgP = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length) : null;

        document.getElementById('stat-count').textContent = stations.length;
        document.getElementById('stat-min').textContent = minP ? minP.toFixed(3) + '€' : '--';
        document.getElementById('stat-avg').textContent = avgP ? avgP.toFixed(3) + '€' : '--';
        document.getElementById('stats-bar').classList.remove('hidden');

        // Map
        initMap(stations);

        // Render cards
        renderResults(stations);

        // Back to top
        setTimeout(() => document.getElementById('back-top').classList.remove('hidden'), 800);

    } catch (e) {
        document.getElementById('loader').classList.add('hidden');
        showError('Erreur de connexion à l\'API.');
    }
}

// ---- MAP ----
function initMap(stations) {
    document.getElementById('map-container').classList.remove('hidden');

    if (!map) {
        map = L.map('map', { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM',
            maxZoom: 18
        }).addTo(map);
    }

    // Clear old markers
    markers.forEach(m => m.remove());
    markers = [];

    // User marker
    const userIcon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#00f5a0;border:3px solid #fff;box-shadow:0 0 12px #00f5a0;"></div>`,
        iconSize: [18,18],
        iconAnchor: [9,9]
    });
    const userMarker = L.marker([userLat, userLon], { icon: userIcon }).addTo(map);
    userMarker.bindPopup('<b style="color:#00f5a0">📍 Votre position</b>');
    markers.push(userMarker);

    // Station markers
    const fuelKey = FUEL_KEYS[currentFuel];
    const prices = stations.map(s => parseFloat(s[fuelKey])).filter(v => v > 0);
    const minP = prices.length ? Math.min(...prices) : null;
    const maxP = prices.length ? Math.max(...prices) : null;

    stations.forEach((s, i) => {
        if (!s.latitude || !s.longitude) return;
        const price = parseFloat(s[fuelKey]);
        const isMin = price === minP;
        const color = isMin ? '#00f5a0' : (price === maxP ? '#ff4a6a' : '#e8edf5');

        const icon = L.divIcon({
            className: '',
            html: `<div style="background:${color};color:#080c12;padding:3px 7px;border-radius:8px;font-family:Orbitron,monospace;font-size:0.62rem;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${price > 0 ? price.toFixed(2)+'€' : '?'}</div>`,
            iconAnchor: [24, 10]
        });

        const nom = getBrand(s);
        const m = L.marker([parseFloat(s.latitude), parseFloat(s.longitude)], { icon })
            .addTo(map)
            .bindPopup(`<b style="color:#00f5a0">${nom}</b><br><small>${s.adresse}, ${s.ville}</small><br>${FUEL_LABELS[currentFuel]}: <b>${price > 0 ? price.toFixed(3)+'€' : 'N/A'}</b><br>${s._dist.toFixed(1)} km`);
        markers.push(m);
    });

    // Fit bounds
    const bounds = L.latLngBounds(stations.filter(s=>s.latitude).map(s => [parseFloat(s.latitude), parseFloat(s.longitude)]));
    bounds.extend([userLat, userLon]);
    map.fitBounds(bounds, { padding: [30, 30] });
}

// ---- RENDER CARDS ----
function renderResults(stations) {
    const fuelKey = FUEL_KEYS[currentFuel];
    const prices = stations.map(s => parseFloat(s[fuelKey])).filter(v => v > 0);
    const minP = prices.length ? Math.min(...prices) : null;
    const maxP = prices.length ? Math.max(...prices) : null;

    // Sort
    let sorted = [...stations];
    if (currentSort === 'prix') {
        sorted.sort((a,b) => {
            const pA = parseFloat(a[fuelKey]) || 999;
            const pB = parseFloat(b[fuelKey]) || 999;
            return pA - pB;
        });
    } else {
        sorted.sort((a,b) => a._dist - b._dist);
    }

    const container = document.getElementById('results');
    container.innerHTML = '';

    // Sort bar
    const sortBar = document.createElement('div');
    sortBar.className = 'sort-bar';
    sortBar.innerHTML = `
        <span class="sort-label">Trier par :</span>
        <button class="sort-btn ${currentSort==='prix'?'active':''}" onclick="setSort('prix')">💰 Prix ${FUEL_LABELS[currentFuel]}</button>
        <button class="sort-btn ${currentSort==='dist'?'active':''}" onclick="setSort('dist')">📍 Distance</button>
    `;
    container.appendChild(sortBar);

    const header = document.createElement('p');
    header.className = 'results-header';
    header.textContent = `${sorted.length} station${sorted.length>1?'s':''} — rayon ${document.getElementById('rayon').value} km`;
    container.appendChild(header);

    sorted.forEach((s, i) => {
        const nom = getBrand(s);
        const priceVal = parseFloat(s[fuelKey]);
        const priceStr = priceVal > 0 ? priceVal.toFixed(3) + '€' : null;
        const distStr = s._dist < 999 ? s._dist.toFixed(1) + ' km' : '';

        const isMin = priceVal === minP;
        const isMax = priceVal === maxP;

        const card = document.createElement('div');
        card.className = 'card';
        card.style.animationDelay = `${Math.min(i * 0.05, 0.5)}s`;

        card.innerHTML = `
            <div class="card-top">
                <div class="card-info">
                    <div class="brand">${nom}${isMin ? '<span class="rank-badge top">🏆 Moins cher</span>' : ''}</div>
                    <div class="address">📍 ${s.adresse}, ${s.ville}</div>
                </div>
                ${distStr ? `<div class="distance-badge">${distStr}</div>` : ''}
            </div>

            <div class="price-grid">
                ${renderPriceItem('gazole', s.gazole_prix, fuelKey, minP, maxP)}
                ${renderPriceItem('e10', s.e10_prix, fuelKey, minP, maxP)}
                ${renderPriceItem('sp95', s.sp95_prix, fuelKey, minP, maxP)}
                ${renderPriceItem('sp98', s.sp98_prix, fuelKey, minP, maxP)}
                ${renderPriceItem('e85', s.e85_prix, fuelKey, minP, maxP)}
                ${renderPriceItem('gplc', s.gplc_prix, fuelKey, minP, maxP)}
            </div>

            <div class="card-bottom">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.adresse+' '+s.ville)}" 
                   target="_blank" class="btn-nav">
                    🗺️ Google Maps
                </a>
                <a href="https://waze.com/ul?q=${encodeURIComponent(s.adresse+' '+s.ville)}&navigate=yes" 
                   target="_blank" class="btn-nav btn-waze">
                    🔵 Waze
                </a>
            </div>
        `;

        container.appendChild(card);
    });
}

function renderPriceItem(fuel, val, activeFuelKey, minP, maxP) {
    const price = parseFloat(val);
    const fuelKey = FUEL_KEYS[fuel];
    const isActive = fuelKey === activeFuelKey;
    const hasVal = price > 0;

    let cls = '';
    if (isActive && hasVal) {
        if (price === minP) cls = 'best';
        else if (price === maxP) cls = 'worst';
    }

    return `
        <div class="price-item${isActive ? ' highlight' : ''}">
            <span class="f-name">${FUEL_LABELS[fuel]}</span>
            <span class="f-val${cls ? ' '+cls : ''}${!hasVal ? ' na' : ''}">
                ${hasVal ? price.toFixed(3)+'€' : '—'}
            </span>
        </div>
    `;
}

function getBrand(s) {
    const full = ((s.nom||'') + ' ' + (s.marque||'') + ' ' + (s.adresse||'')).toUpperCase();
    for (let m of MARQUES) { if (full.includes(m)) return m; }
    return (s.nom || s.marque || 'STATION').toUpperCase().slice(0, 20);
}

function setSort(sort) {
    currentSort = sort;
    if (currentStations.length) renderResults(currentStations);
}

function showError(msg) {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('results').innerHTML = `
        <div class="empty-state">
            <span class="empty-icon">⚠️</span>
            <h3>${msg}</h3>
        </div>`;
}

// ---- SCROLL BACK TO TOP VISIBILITY ----
window.addEventListener('scroll', () => {
    const btn = document.getElementById('back-top');
    if (window.scrollY > 400) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}, { passive: true });
