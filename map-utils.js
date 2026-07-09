// ==========================
// map-utils.js - STAYO Premium
// ==========================

const map = L.map('map', {
    center: [48.8566, 2.3522],
    zoom: 13,
    zoomControl: false,
    attributionControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

const tooltip = document.getElementById('tooltip');
const loadingBar = document.getElementById('loadingBar');
const toast = document.getElementById('toast');

// ========== DATES — Flowbite Date Range Picker ==========

function formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

const today = new Date();
const checkinDate = new Date(today);
checkinDate.setDate(today.getDate() + 7);
const checkoutDate = new Date(today);
checkoutDate.setDate(today.getDate() + 9);

document.getElementById('checkin').value = formatDateYYYYMMDD(checkinDate);
document.getElementById('checkout').value = formatDateYYYYMMDD(checkoutDate);

// Écouter les changements Flowbite
document.getElementById('checkin').addEventListener('change', function() {
    if (typeof refreshViewportSearch === 'function') refreshViewportSearch();
});
document.getElementById('checkout').addEventListener('change', function() {
    if (typeof refreshViewportSearch === 'function') refreshViewportSearch();
});

// ========== ICONES PRIX ==========

function createPriceIcon(price, currency) {
    const symbols = { 'EUR': '€', 'GBP': '£', 'USD': '$' };
    const symbol = symbols[currency] || currency;
    let displayPrice;
    if (price >= 1000) {
        displayPrice = (price / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    } else {
        displayPrice = Math.round(price);
    }
    return L.divIcon({
        className: 'price-icon',
        html: `<div class="price-marker">${symbol}${displayPrice}</div>`,
        iconSize: [65, 36],
        iconAnchor: [32, 36],
        popupAnchor: [0, -36]
    });
}

function createNoPriceIcon() {
    return L.divIcon({
        className: 'price-icon',
        html: `<div class="price-marker no-price">&mdash;</div>`,
        iconSize: [45, 36],
        iconAnchor: [22, 36],
        popupAnchor: [0, -36]
    });
}

// ========== TOOLTIP ==========

function positionTooltip(e) {
    const tw = tooltip.offsetWidth || 300;
    const th = tooltip.offsetHeight || 350;
    let left = e.originalEvent.clientX + 16;
    let top = e.originalEvent.clientY - 20;
    if (left + tw > window.innerWidth - 10) left = e.originalEvent.clientX - tw - 16;
    if (top + th > window.innerHeight - 10) top = window.innerHeight - th - 10;
    if (left < 10) left = 10;
    if (top < 90) top = 90;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function showTooltip(e, hotel) {
    const symbols = { 'EUR': '€', 'GBP': '£', 'USD': '$' };
    const symbol = symbols[hotel.currency] || hotel.currency;

    const imageArea = document.getElementById('tooltipImageArea');
    if (hotel.thumbnail) {
        imageArea.innerHTML = `<img src="${hotel.thumbnail}" alt="${hotel.name}" onerror="this.parentElement.innerHTML='<div class=tooltip-image-placeholder><img src=https://ukbekfcjfcjcqrpxfpmq.supabase.co/storage/v1/object/public/logo%20luvia/STAYO%20ICON%20PIN.png alt=STAYO style=width:40px;height:40px;opacity:0.5; /></div>'" />`;
    } else {
        imageArea.innerHTML = `<div class="tooltip-image-placeholder"><img src="https://ukbekfcjfcjcqrpxfpmq.supabase.co/storage/v1/object/public/logo%20luvia/STAYO%20ICON%20PIN.png" alt="STAYO" style="width:40px;height:40px;opacity:0.5;" /></div>`;
    }

    document.getElementById('tooltipName').textContent = hotel.name;

    const locSpan = document.querySelector('#tooltipLocation span');
    if (locSpan) locSpan.textContent = hotel.location || '';

    const ratingEl = document.getElementById('tooltipRating');
    if (hotel.rating) {
        ratingEl.textContent = hotel.rating + (hotel.reviewCount ? ' (' + hotel.reviewCount + ')' : '');
        ratingEl.parentElement.style.display = 'inline-flex';
    } else {
        ratingEl.parentElement.style.display = 'none';
    }

    const starsEl = document.getElementById('tooltipStars');
    if (hotel.stars > 0) {
        const s = Math.min(hotel.stars, 5);
        starsEl.textContent = '\u2605'.repeat(s) + '\u2606'.repeat(5 - s);
        starsEl.style.display = 'inline-flex';
    } else {
        starsEl.style.display = 'none';
    }

    const boardSpan = document.querySelector('#tooltipBoard');
    if (hotel.boardType && boardSpan) {
        boardSpan.textContent = hotel.boardType;
        boardSpan.parentElement.style.display = 'inline-flex';
    } else if (boardSpan) {
        boardSpan.parentElement.style.display = 'none';
    }

    const cancelEl = document.getElementById('tooltipCancellation');
    if (hotel.refundable === 'RFN') {
        cancelEl.innerHTML = '<img src="https://img.icons8.com/3d-fluency/94/cancel.png" alt="cancel" style="width:14px;height:14px;" /> Annulable';
        cancelEl.className = 'badge badge-cancellation refundable';
        cancelEl.style.display = 'inline-flex';
    } else if (hotel.refundable === 'NRFN') {
        cancelEl.innerHTML = '<img src="https://img.icons8.com/3d-fluency/94/cancel.png" alt="cancel" style="width:14px;height:14px;" /> Non annulable';
        cancelEl.className = 'badge badge-cancellation';
        cancelEl.style.display = 'inline-flex';
    } else {
        cancelEl.style.display = 'none';
    }

    const priceEl = document.getElementById('tooltipPrice');
    const perNightEl = document.getElementById('tooltipPerNight');
    if (hotel.price && hotel.price > 0) {
        priceEl.textContent = symbol + hotel.price.toLocaleString() + ' total';
        priceEl.style.color = '#1a1a2e';
        perNightEl.textContent = '';
    } else {
        priceEl.textContent = '\u2014';
        priceEl.style.color = '#9ca3af';
        perNightEl.textContent = '';
    }

    positionTooltip(e);
    tooltip.classList.add('visible');
}

function hideTooltip() { tooltip.classList.remove('visible'); }

function showToast(message, isError) {
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 3500);
}

function goToMyLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocalisation non supportee.', true);
        return;
    }
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 0.6 });
        },
        function() { showToast('Impossible de vous localiser.', true); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.leaflet-marker-icon') && !e.target.closest('.price-marker')) {
        hideTooltip();
    }
});

window.addEventListener('resize', function() { map.invalidateSize(); });