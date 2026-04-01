// Dans app.js, modifiez la partie card.innerHTML comme ceci :
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
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.adresse + ' ' + s.ville)}" 
           target="_blank" class="btn-nav">
            🗺️ Google Maps
        </a>
        <a href="https://waze.com/ul?q=${encodeURIComponent(s.adresse + ' ' + s.ville)}&navigate=yes" 
           target="_blank" class="btn-nav btn-waze">
            🔵 Waze
        </a>
    </div>
`;
