/* ===== FUELRADAR — APP.JS (CORRIGÉ) ===== */

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

// ---- NAVIGATION & UI ----
function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-geo').classList.toggle('active', mode === 'geo');
    document.getElementById('btn-addr').classList.toggle('active', mode === 'addr');
    document.getElementById('block-geo').classList.toggle('hidden', mode !== 'geo');
    document.getElementById('block-addr').classList.toggle('hidden', mode !== 'addr');
}

function updateRayon(v) {
    document.getElementById('rayon-val').textContent = v;
}

document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFuel = btn.dataset.fuel;
        if (currentStations.length) renderResults(currentStations);
    });
});

// ---- GEOLOCALISATION ----
function locateUser() {
    const status = document.getElementById('geo-status');
    status.textContent = 'Demande d\'accès GPS...';
    status.className = 'geo-status';

    if (!navigator.geolocation) {
        status.textContent = '❌ GPS non supporté';
        status.className = 'geo-status err';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            userLat = pos.coords.latitude;
            userLon = pos.coords.longitude;
            status.textContent = `✓ Position OK (${userLat.toFixed(3)}, ${userLon.toFixed(3)})`;
            status.className = 'geo-status ok';
        },
        err => {
            status.textContent = '❌ Erreur GPS : Vérifiez vos réglages';
            status.className = 'geo-status err';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ---- RECHERCHE PAR ADRESSE (NOMINATIM) ----
async function searchByAddress() {
    const addr = document.getElementById('addrInput').value.trim();
    if (!addr) return;

    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr + ', France')}&format=json&limit=1`, {
            headers: { 'User-Agent': 'FuelRadar-App' }
        });
        const d = await r.json();
        if (d.length > 0) {
            userLat = parseFloat(d[0].lat);
            userLon = parseFloat(d[0].lon);
            lancerRecherche();
        } else {
            showError('Adresse introuvable. Précisez la ville.');
        }
    } catch (e) {
        showError('Erreur de connexion au service d\'adresse.');
    }
}

// ---- CALCULS & API ----
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function lancerRecherche() {
    if (currentMode === 'addr' && !userLat) {
        await searchByAddress();
        return;
    }

    if (!userLat) {
        showError(currentMode === 'geo' ? 'Activez votre GPS d\'abord.' : 'Entrez une adresse.');
        return;
    }

    const radius = parseInt(document.getElementById('rayon').value);
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('results').innerHTML = '';
    document.getElementById('stats-bar').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');

    try {
        const deg = radius / 111;
        const where = `latitude > ${userLat - deg} AND latitude < ${userLat + deg} AND longitude > ${userLon - deg} AND longitude < ${userLon + deg}`;
        const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?where=${encodeURIComponent(where)}&limit=100`;

        const res = await fetch(url);
        const data = await res.json();
        let stations = (data.results || []).map(s => ({
            ...s,
            _dist: haversine(userLat, userLon, parseFloat(s.latitude), parseFloat(s.longitude))
        })).filter(s => s._dist <= radius);

        currentStations = stations;
        document.getElementById('loader').classList.add('hidden');

        if (!stations.length) {
            showError('Aucune station dans ce périmètre.');
            return;
        }

        updateStats(stations);
        initMap(stations);
        renderResults(stations);

    } catch (e) {
        showError('Erreur de chargement des prix.');
    }
}

// ---- AFFICHAGE ----
function updateStats(stations) {
    const prices = stations.map(s => parseFloat(s[FUEL_KEYS[currentFuel]])).filter(v => v > 0);
    const minP = prices.length ? Math.min(...prices) : null;
    const avgP = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length) : null;

    document.getElementById('stat-count').textContent = stations.length;
    document.getElementById('stat-min').textContent = minP ? minP.toFixed(3) + '€' : '--';
    document.getElementById('stat-avg').textContent = avgP ? avgP.toFixed(3) + '€' : '--';
    document.getElementById('stats-bar').classList.remove('hidden');
}

function initMap(stations) {
    document.getElementById('map-container').classList.remove('hidden');
    if (!map) {
        map = L.map('map').setView([userLat, userLon], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    markers.forEach(m => m.remove());
    markers = [];

    const userIcon = L.divIcon({ html: '<div style="width:14px;height:14px;background:#00f5a0;border:2px solid #fff;border-radius:50%;"></div>' });
    markers.push(L.marker([userLat, userLon], {icon: userIcon}).addTo(map).bindPopup('Vous êtes ici'));

    stations.forEach(s => {
        const price = parseFloat(s[FUEL_KEYS[currentFuel]]);
        if (!price) return;
        const m = L.marker([s.latitude, s.longitude]).addTo(map)
            .bindPopup(`<b>${getBrand(s)}</b><br>${price.toFixed(3)}€`);
        markers.push(m);
    });

    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
}

function renderResults(stations) {
    const fuelKey = FUEL_KEYS[currentFuel];
    let sorted = [...stations].sort((a,b) => {
        if (currentSort === 'prix') return (parseFloat(a[fuelKey]) || 9) - (parseFloat(b[fuelKey]) || 9);
        return a._dist - b._dist;
    });

    const container = document.getElementById('results');
    container.innerHTML = `
        <div class="sort-bar">
            <span class="sort-label">Trier par :</span>
            <button class="sort-btn ${currentSort==='prix'?'active':''}" onclick="setSort('prix')">💰 Prix</button>
            <button class="sort-btn ${currentSort==='dist'?'active':''}" onclick="setSort('dist')">📍 Distance</button>
        </div>
        <p class="results-header">${sorted.length} stations trouvées</p>
    `;

    sorted.forEach((s, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.animationDelay = `${i * 0.05}s`;
        const brand = getBrand(s);
        const price = parseFloat(s[fuelKey]);

        card.innerHTML = `
            <div class="card-top">
                <div class="card-info">
                    <div class="brand">${brand}</div>
                    <div class="address">${s.adresse}, ${s.ville}</div>
                </div>
                <div class="distance-badge">${s._dist.toFixed(1)} km</div>
            </div>
            <div class="price-grid">
                ${['gazole','e10','sp95','sp98','e85','gplc'].map(f => `
                    <div class="price-item ${FUEL_KEYS[f] === fuelKey ? 'highlight' : ''}">
                        <span class="f-name">${FUEL_LABELS[f]}</span>
                        <span class="f-val">${parseFloat(s[FUEL_KEYS[f]]) > 0 ? parseFloat(s[FUEL_KEYS[f]]).toFixed(3) + '€' : '—'}</span>
                    </div>
                `).join('')}
            </div>
            <div class="card-bottom">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.adresse + ' ' + s.ville)}" target="_blank" class="btn-nav">🗺️ Itinéraire</a>
                <a href="https://waze.com/ul?q=${encodeURIComponent(s.adresse + ' ' + s.ville)}&navigate=yes" target="_blank" class="btn-nav btn-waze">🔵 Waze</a>
            </div>
        `;
        container.appendChild(card);
    });
}

function getBrand(s) {
    const text = ((s.nom||'') + ' ' + (s.marque||'') + ' ' + (s.adresse||'')).toUpperCase();
    for (let m of MARQUES) if (text.includes(m)) return m;
    return (s.nom || s.marque || 'STATION').toUpperCase().slice(0, 20);
}

function setSort(sort) {
    currentSort = sort;
    renderResults(currentStations);
}

function showError(msg) {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('results').innerHTML = `<div class="empty-state"><h3>${msg}</h3></div>`;
}

window.addEventListener('scroll', () => {
    const btn = document.getElementById('back-top');
    if (window.scrollY > 400) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
});
