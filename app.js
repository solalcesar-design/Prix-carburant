/* ===== FUELRADAR — VERSION RECHERCHE ADRESSE ===== */

let userLat = null, userLon = null;
let currentFuel = 'gazole';
let map = null;
let markers = [];

const FUEL_KEYS = { gazole: 'gazole_prix', e10: 'e10_prix', sp95: 'sp95_prix', sp98: 'sp98_prix', e85: 'e85_prix' };
const MARQUES = ["INTERMARCHE","LECLERC","TOTAL","CARREFOUR","SUPER U","ESSO","AVIA","AUCHAN","BP","SHELL","NETTO"];

// Gestion des boutons de carburant
document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFuel = btn.dataset.fuel;
    });
});

async function lancerRecherche() {
    const query = document.getElementById('addrInput').value.trim();
    if (!query) return alert("Entrez une ville ou un code postal");

    const loader = document.getElementById('loader');
    const resultsDiv = document.getElementById('results');
    loader.classList.remove('hidden');
    resultsDiv.innerHTML = "";

    try {
        // 1. Convertir l'adresse en coordonnées (Géocodage)
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', France')}&format=json&limit=1`);
        const geoData = await geoRes.json();

        if (geoData.length === 0) {
            loader.classList.add('hidden');
            return resultsDiv.innerHTML = "<p class='empty'>Lieu introuvable.</p>";
        }

        userLat = parseFloat(geoData[0].lat);
        userLon = parseFloat(geoData[0].lon);

        // 2. Chercher les stations à la ronde (API Prix Carburants)
        const radius = document.getElementById('rayon').value;
        const deg = radius / 111; // Conversion km en degrés approx.
        
        const where = `latitude > ${userLat - deg} AND latitude < ${userLat + deg} AND longitude > ${userLon - deg} AND longitude < ${userLon + deg}`;
        const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?where=${encodeURIComponent(where)}&limit=50`;

        const res = await fetch(url);
        const data = await res.json();
        
        loader.classList.add('hidden');
        renderResults(data.results || []);
        initMap(data.results || []);

    } catch (e) {
        loader.classList.add('hidden');
        alert("Erreur de connexion");
    }
}

function initMap(stations) {
    document.getElementById('map-container').classList.remove('hidden');
    if (!map) {
        map = L.map('map').setView([userLat, userLon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    } else {
        map.setView([userLat, userLon], 12);
    }

    markers.forEach(m => m.remove());
    markers = [];

    // Marqueur centre recherche
    markers.push(L.circle([userLat, userLon], { radius: 500, color: '#00f5a0' }).addTo(map));

    stations.forEach(s => {
        if (!s.latitude || !s.longitude) return;
        const p = s[FUEL_KEYS[currentFuel]];
        if (!p) return;

        const m = L.marker([s.latitude, s.longitude])
            .addTo(map)
            .bindPopup(`<b>${getBrand(s)}</b><br>${p}€`);
        markers.push(m);
    });
}

function renderResults(stations) {
    const container = document.getElementById('results');
    const fuelKey = FUEL_KEYS[currentFuel];

    // Trier par prix
    const sorted = stations
        .filter(s => s[fuelKey] > 0)
        .sort((a, b) => a[fuelKey] - b[fuelKey]);

    if (sorted.length === 0) {
        container.innerHTML = "<p class='empty'>Aucune station avec ce carburant dans cette zone.</p>";
        return;
    }

    sorted.forEach(s => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="brand">${getBrand(s)}</div>
            <div class="address">📍 ${s.adresse}, ${s.ville}</div>
            <div class="price-main">${s[fuelKey]}€</div>
            <div class="card-bottom">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.adresse + ' ' + s.ville)}" target="_blank" class="btn-nav">Y ALLER</a>
            </div>
        `;
        container.appendChild(card);
    });
}

function getBrand(s) {
    const text = ((s.nom||'') + ' ' + (s.marque||'') + ' ' + (s.adresse||'')).toUpperCase();
    for (let m of MARQUES) if (text.includes(m)) return m;
    return "STATION";
}
