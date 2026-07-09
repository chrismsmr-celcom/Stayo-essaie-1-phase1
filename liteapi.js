// ==========================
// liteapi.js
// LiteAPI : data/hotels (coords) + hotels/rates (prix) + sidebar + deep link
// ==========================

const API_KEY = 'prod_3a27a498-2b18-43a8-a91e-f3f241c889a7';
const BASE_URL = 'https://api.liteapi.travel/v3.0';

// ⚠️ REMPLACEZ PAR VOTRE DOMAINE WHITELABEL
const WL_DOMAIN = 'luviaplace.com';

var allMarkers = [];
var allHotelsData = [];
var updateTimeout = null;
var currentRequestId = 0;
var activeController = null;

var CACHE_TTL_MS = 60000;
var ratesCache = new Map();

var markersLayer = L.layerGroup().addTo(map);

// ========== SIDEBAR ==========

var sidebar = document.getElementById('hotelSidebar');
var sidebarOverlay = document.getElementById('sidebarOverlay');
var sidebarContent = document.getElementById('sidebarContent');

function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
    document.body.style.overflow = '';
    sidebarContent.innerHTML = '<div class="sidebar-loading"><div class="spinner"></div><p>Selectionnez un logement</p></div>';
}

sidebarOverlay.addEventListener('click', closeSidebar);
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSidebar();
});

// ========== DEEP LINK ==========

function buildHotelDeepLink(hotelId, checkin, checkout, adults, currency, language) {
    var occupancies = [{ adults: adults, children: [] }];
    var occupanciesBase64 = btoa(JSON.stringify(occupancies));
    var params = new URLSearchParams();
    params.set('checkin', checkin);
    params.set('checkout', checkout);
    params.set('occupancies', occupanciesBase64);
    if (currency) params.set('currency', currency);
    if (language) params.set('language', language);
    return 'https://' + WL_DOMAIN + '/hotels/' + hotelId + '?' + params.toString();
}

function buildBookingDeepLink(offerId, currency, language) {
    var params = new URLSearchParams();
    if (currency) params.set('currency', currency);
    if (language) params.set('language', language);
    var qs = params.toString();
    return 'https://' + WL_DOMAIN + '/booking?offerId=' + offerId + (qs ? '&' + qs : '');
}

// ========== FORMATTERS ==========

function formatCancellation(policies) {
    if (!policies || !policies.cancelPolicyInfos || policies.cancelPolicyInfos.length === 0) {
        return '<p>Aucune information disponible.</p>';
    }
    var isRefundable = policies.refundableTag === 'RFN';
    var html = '';
    if (isRefundable) {
        html += '<p class="refundable-badge"><img src="https://img.icons8.com/3d-fluency/94/cancel.png" alt="cancel" style="width:20px;height:20px;" /> Annulation gratuite possible</p>';
    } else {
        html += '<p class="non-refundable-badge"><img src="https://img.icons8.com/3d-fluency/94/cancel.png" alt="cancel" style="width:20px;height:20px;" /> Non remboursable</p>';
    }
    policies.cancelPolicyInfos.forEach(function(policy, i) {
        var d = new Date(policy.cancelTime);
        var formattedDate = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        var amount = policy.amount ? policy.amount + ' ' + policy.currency : 'Non specifie';
        html += '<div class="policy-item"><p><strong>Politique ' + (i + 1) + '</strong></p><p>Avant le : ' + formattedDate + ' (' + policy.timezone + ')</p><p>Frais : ' + amount + '</p></div>';
    });
    return html;
}

function showSidebarLoading() {
    sidebarContent.innerHTML = '<div class="sidebar-loading"><div class="spinner"></div><p>Chargement des details...</p></div>';
}

function showSidebarError(msg) {
    sidebarContent.innerHTML = '<div class="sidebar-error"><p>' + msg + '</p><button onclick="closeSidebar()">Fermer</button></div>';
}

async function fetchHotelDetails(hotelId) {
    try {
        var res = await fetch(BASE_URL + '/data/hotel?hotelId=' + hotelId + '&language=fr', {
            headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('Erreur ' + res.status);
        var json = await res.json();
        return json.data || null;
    } catch (err) { return null; }
}

async function openHotelSidebar(hotelData) {
    var hotelId = hotelData.id;
    var checkin = document.getElementById('checkin').value;
    var checkout = document.getElementById('checkout').value;
    var adults = parseInt(document.getElementById('adults').value, 10) || 2;
    var currency = document.getElementById('currency').value;
    var language = 'fr';

    openSidebar();
    showSidebarLoading();

    var details = await fetchHotelDetails(hotelId);
    if (!details) { showSidebarError('Impossible de charger les details.'); return; }

    var symbols = { 'EUR': '\u20AC', 'GBP': '\u00A3', 'USD': '$' };
    var symbol = symbols[currency] || currency;

    var mainImage = (details.hotelImages && details.hotelImages.find(function(img) { return img.defaultImage; }))
        ? details.hotelImages.find(function(img) { return img.defaultImage; }).url
        : ((details.hotelImages && details.hotelImages[0]) ? details.hotelImages[0].url : (hotelData.thumbnail || null));

    var facilities = details.hotelFacilities || [];
    var facilitiesList = facilities.slice(0, 12).map(function(f) { return '<li>' + f + '</li>'; }).join('');
    var hasMore = facilities.length > 12;
    var checkinTime = (details.checkinCheckoutTimes && details.checkinCheckoutTimes.checkin) ? details.checkinCheckoutTimes.checkin : 'Non specifie';
    var checkoutTime = (details.checkinCheckoutTimes && details.checkinCheckoutTimes.checkout) ? details.checkinCheckoutTimes.checkout : 'Non specifie';
    var checkinStart = (details.checkinCheckoutTimes && details.checkinCheckoutTimes.checkinStart) ? details.checkinCheckoutTimes.checkinStart : '';
    var stars = details.starRating || hotelData.stars || 0;
    var rating = details.rating || hotelData.rating || null;
    var reviewCount = details.reviewCount || hotelData.reviewCount || 0;
    var priceDisplay = hotelData.price ? symbol + hotelData.price.toLocaleString() : 'Prix non disponible';
    var nights = Math.max(1, Math.round((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)));
    var pricePerNight = hotelData.price ? Math.round(hotelData.price / nights) : null;
    var pricePerNightDisplay = pricePerNight ? symbol + pricePerNight.toLocaleString() : null;
    var cancellationHtml = formatCancellation(details.cancellationPolicies);
    var galleryImages = (details.hotelImages || []).slice(0, 8);
    var galleryHtml = galleryImages.map(function(img) { return '<img src="' + img.url + '" alt="' + (img.caption || 'Hotel') + '" loading="lazy" onerror="this.style.display=\'none\'" />'; }).join('');
    var hotelDeepLink = buildHotelDeepLink(hotelId, checkin, checkout, adults, currency, language);
    var bookingDeepLink = hotelData.offerId ? buildBookingDeepLink(hotelData.offerId, currency, language) : null;
    var checkinFormatted = new Date(checkin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    var checkoutFormatted = new Date(checkout).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    var addressText = [details.address, details.city, details.country].filter(Boolean).join(', ') || 'Adresse non disponible';
    var starsText = '';
    if (stars > 0) {
        var s = Math.min(Math.round(stars), 5);
        starsText = '\u2605'.repeat(s) + '\u2606'.repeat(Math.max(0, 5 - s));
    }

    sidebarContent.innerHTML =
        '<button class="sidebar-close-btn" onclick="closeSidebar()">&times;</button>' +
        '<div class="sidebar-hero">' +
            (mainImage
                ? '<img src="' + mainImage + '" alt="' + (details.name || '') + '" onerror="this.parentElement.innerHTML=\'<div class=sidebar-hero-placeholder><img src=https://ukbekfcjfcjcqrpxfpmq.supabase.co/storage/v1/object/public/logo%20luvia/STAYO%20ICON%20PIN.png alt=STAYO style=width:50px;height:50px;opacity:0.4; /></div>\'" />'
                : '<div class="sidebar-hero-placeholder"><img src="https://ukbekfcjfcjcqrpxfpmq.supabase.co/storage/v1/object/public/logo%20luvia/STAYO%20ICON%20PIN.png" alt="STAYO" style="width:50px;height:50px;opacity:0.4;" /></div>') +
            '<div class="sidebar-hero-price">' + priceDisplay + '<span> total</span></div>' +
        '</div>' +
        '<div class="sidebar-body">' +
            '<h2>' + (details.name || hotelData.name) + '</h2>' +
            '<p class="sidebar-address">' +
                '<img src="https://img.icons8.com/isometric/50/map-pin.png" alt="pin" />' +
                addressText +
            '</p>' +
            '<div class="sidebar-badges">' +
                (stars > 0 ? '<span class="sidebar-stars"><img src="https://img.icons8.com/3d-sugary/100/star-17.png" alt="star" /> ' + starsText + '</span>' : '') +
                (rating ? '<span class="sidebar-rating">' + rating + ' / 5</span>' : '') +
                (reviewCount > 0 ? '<span class="sidebar-reviews">(' + reviewCount + ' avis)</span>' : '') +
            '</div>' +

            '<a href="' + hotelDeepLink + '" target="_blank" rel="noopener" class="sidebar-book-btn">' +
                '<img src="https://img.icons8.com/3d-fluency/94/shopping-cart.png" alt="cart" />' +
                'Reserver maintenant' +
            '</a>' +
            (bookingDeepLink ? '<a href="' + bookingDeepLink + '" target="_blank" rel="noopener" class="sidebar-book-btn secondary">Paiement direct</a>' : '') +

            '<div class="sidebar-section">' +
                '<h3><img src="https://img.icons8.com/3d-fluency/94/calendar--v2.png" alt="calendar" /> Votre sejour</h3>' +
                '<div class="stay-summary">' +
                    '<div class="stay-dates"><span>' + checkinFormatted + '</span><span class="stay-arrow">&rarr;</span><span>' + checkoutFormatted + '</span></div>' +
                    '<div class="stay-details"><span>' + nights + ' nuit' + (nights > 1 ? 's' : '') + '</span><span>&middot;</span><span>' + adults + ' adulte' + (adults > 1 ? 's' : '') + '</span></div>' +
                '</div>' +
            '</div>' +

            '<div class="sidebar-section">' +
                '<h3><img src="https://img.icons8.com/isometric/50/bulleted-list.png" alt="list" /> Detail du prix</h3>' +
                '<div class="price-breakdown">' +
                    '<div class="price-row"><span>Prix total</span><span class="price-value">' + priceDisplay + '</span></div>' +
                    (pricePerNightDisplay ? '<div class="price-row"><span>Par nuit (' + nights + ' nuits)</span><span class="price-value-secondary">' + pricePerNightDisplay + '</span></div>' : '') +
                    (hotelData.boardType ? '<div class="price-row"><span>Pension</span><span class="board-badge"><img src="https://img.icons8.com/3d-fluency/94/tableware.png" alt="board" /> ' + hotelData.boardType + '</span></div>' : '') +
                '</div>' +
            '</div>' +

            (details.hotelDescription ? '<div class="sidebar-section"><h3><img src="https://img.icons8.com/isometric/50/content.png" alt="desc" /> Description</h3><div class="sidebar-description">' + details.hotelDescription.substring(0, 500) + '...</div></div>' : '') +

            (facilitiesList ? '<div class="sidebar-section"><h3><img src="https://img.icons8.com/3d-fluency/94/pool.png" alt="pool" /> Equipements</h3><ul class="sidebar-facilities">' + facilitiesList + (hasMore ? '<li class="more-facilities">...et ' + (facilities.length - 12) + ' autres</li>' : '') + '</ul></div>' : '') +

            '<div class="sidebar-section">' +
                '<h3><img src="https://img.icons8.com/3d-fluency/94/time.png" alt="time" /> Horaires</h3>' +
                '<div class="check-times">' +
                    '<div class="check-item"><span class="check-label">Check-in</span><span class="check-value">' + checkinTime + '</span>' + (checkinStart ? '<span class="check-sub">(des ' + checkinStart + ')</span>' : '') + '</div>' +
                    '<div class="check-item"><span class="check-label">Check-out</span><span class="check-value">' + checkoutTime + '</span></div>' +
                '</div>' +
            '</div>' +

            '<div class="sidebar-section">' +
                '<h3><img src="https://img.icons8.com/3d-fluency/94/cancel.png" alt="cancel" /> Conditions d\'annulation</h3>' +
                '<div class="sidebar-cancellation">' + cancellationHtml + '</div>' +
            '</div>' +

            (details.hotelImportantInformation ? '<div class="sidebar-section"><h3><img src="https://img.icons8.com/3d-fluency/94/error.png" alt="info" /> Informations importantes</h3><div class="sidebar-important">' + details.hotelImportantInformation + '</div></div>' : '') +

            (galleryHtml ? '<div class="sidebar-section"><h3><img src="https://img.icons8.com/3d-fluency/94/stack-of-photos.png" alt="photos" /> Galerie (' + galleryImages.length + ' photos)</h3><div class="sidebar-gallery">' + galleryHtml + '</div></div>' : '') +

            (details.location && details.location.latitude ? '<div class="sidebar-section"><a href="https://maps.google.com/?q=' + details.location.latitude + ',' + details.location.longitude + '" target="_blank" rel="noopener" class="sidebar-maps-link"><img src="https://img.icons8.com/isometric/50/map-pin.png" alt="pin" style="width:16px;height:16px;" /> Voir sur Google Maps</a></div>' : '') +

            '<a href="' + hotelDeepLink + '" target="_blank" rel="noopener" class="sidebar-book-btn" style="margin-top:20px;">' +
                '<img src="https://img.icons8.com/3d-fluency/94/shopping-cart.png" alt="cart" />' +
                'Reserver sur STAYO' +
            '</a>' +
        '</div>';
}

// ========== API ==========

function clearAllMarkers() { markersLayer.clearLayers(); allMarkers = []; allHotelsData = []; }

function haversineMeters(a, b) {
    var R = 6371000;
    var toRad = function(d) { return d * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)*Math.sin(dLng/2)));
}

function getRadiusFromBounds() {
    var bounds = map.getBounds(), center = map.getCenter();
    var corners = [bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthWest(), bounds.getSouthEast()];
    var max = 0;
    for (var i = 0; i < corners.length; i++) {
        max = Math.max(max, haversineMeters(center, corners[i]));
    }
    return Math.max(1000, Math.ceil(max * 1.10));
}

function makeCacheKey() {
    var c = map.getCenter(), zoom = map.getZoom();
    var grid = zoom >= 15 ? 0.01 : zoom >= 12 ? 0.03 : 0.06;
    var latKey = (Math.round(c.lat / grid) * grid).toFixed(4);
    var lngKey = (Math.round(c.lng / grid) * grid).toFixed(4);
    var checkin = document.getElementById('checkin').value;
    var checkout = document.getElementById('checkout').value;
    var adults = document.getElementById('adults').value;
    var currency = document.getElementById('currency').value;
    return latKey + ',' + lngKey + ',z' + zoom + '|' + checkin + '|' + checkout + '|a' + adults + '|' + currency;
}

function getCached(key) {
    var v = ratesCache.get(key);
    if (!v) return null;
    if (Date.now() - v.t > CACHE_TTL_MS) { ratesCache.delete(key); return null; }
    return v.data;
}

function setCached(key, data) {
    ratesCache.forEach(function(v, k) { if (Date.now() - v.t > CACHE_TTL_MS) ratesCache.delete(k); });
    ratesCache.set(key, { t: Date.now(), data: data });
}

async function fetchHotelsData(lat, lng, radius, requestId) {
    var params = new URLSearchParams({ latitude: lat, longitude: lng, radius: radius, limit: 200, offset: 0, language: 'fr' });
    if (activeController) activeController.abort();
    activeController = new AbortController();
    var res;
    try {
        res = await fetch(BASE_URL + '/data/hotels?' + params.toString(), {
            headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' },
            signal: activeController.signal
        });
    } catch (err) { if (err.name !== 'AbortError') console.error(err); return null; }
    if (requestId !== currentRequestId || !res.ok) return null;
    var json = await res.json();
    var hotelsMap = {};
    if (Array.isArray(json.data)) {
        json.data.forEach(function(h) {
            if (h.id && h.latitude && h.longitude) {
                hotelsMap[h.id] = {
                    id: h.id, name: h.name || 'Hotel', lat: parseFloat(h.latitude), lng: parseFloat(h.longitude),
                    address: h.address || '', city: h.city || '', country: h.country || '',
                    thumbnail: h.thumbnail || h.main_photo || null,
                    rating: h.rating ? parseFloat(h.rating).toFixed(1) : null,
                    reviewCount: h.reviewCount || 0, stars: h.stars || 0
                };
            }
        });
    }
    return hotelsMap;
}

async function fetchRates(hotelIds, checkin, checkout, currency, adults, requestId) {
    if (!hotelIds.length) return {};
    var body = {
        checkin: checkin, checkout: checkout, currency: currency,
        guestNationality: 'FR', occupancies: [{ adults: adults }],
        hotelIds: hotelIds.slice(0, 100), maxRatesPerHotel: 1, limit: 100, timeout: 8
    };
    var ctrl = new AbortController(), tid = setTimeout(function() { ctrl.abort(); }, 15000);
    var res;
    try {
        res = await fetch(BASE_URL + '/hotels/rates', {
            method: 'POST',
            headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: ctrl.signal
        });
    } catch (err) { clearTimeout(tid); if (err.name !== 'AbortError') console.error(err); return {}; }
    clearTimeout(tid);
    if (requestId !== currentRequestId || !res.ok) return {};
    var json = await res.json();
    var pm = {};
    if (Array.isArray(json.data)) {
        json.data.forEach(function(h) {
            var rt = h.roomTypes && h.roomTypes[0];
            var p = (rt && rt.offerRetailRate && rt.offerRetailRate.amount)
                || (rt && rt.rates && rt.rates[0] && rt.rates[0].retailRate && rt.rates[0].retailRate.total && rt.rates[0].retailRate.total[0] && rt.rates[0].retailRate.total[0].amount)
                || (rt && rt.rates && rt.rates[0] && rt.rates[0].retailRate && rt.rates[0].retailRate.amount)
                || null;
            p = p != null ? Math.round(Number(p)) : null;
            pm[h.hotelId] = {
                price: p,
                offerId: (rt && rt.offerId) || null,
                boardType: (rt && rt.rates && rt.rates[0] && (rt.rates[0].boardName || rt.rates[0].boardType)) || null,
                refundable: (rt && rt.cancellationPolicies && rt.cancellationPolicies.refundableTag) || null
            };
        });
    }
    return pm;
}

function renderHotels(hotelsMap, pricesMap) {
    clearAllMarkers();
    var currency = document.getElementById('currency').value;
    var wp = 0;
    Object.values(hotelsMap).forEach(function(h) {
        var pd = pricesMap[h.id] || {};
        var hd = {
            id: h.id, name: h.name, lat: h.lat, lng: h.lng,
            address: h.address, city: h.city, country: h.country,
            thumbnail: h.thumbnail, rating: h.rating, reviewCount: h.reviewCount, stars: h.stars,
            price: pd.price || null, offerId: pd.offerId || null, currency: currency,
            boardType: pd.boardType || null, refundable: pd.refundable || null,
            location: [h.address, h.city, h.country].filter(Boolean).join(', ') || 'Localisation non disponible'
        };
        var icon = hd.price ? createPriceIcon(hd.price, currency) : createNoPriceIcon();
        var m = L.marker([hd.lat, hd.lng], { icon: icon, interactive: true });
        m.on('mouseover', function(e) { showTooltip(e, hd); });
        m.on('mousemove', function(e) { positionTooltip(e); });
        m.on('mouseout', hideTooltip);
        m.on('click', function() {
            map.setView([hd.lat, hd.lng], Math.max(map.getZoom(), 15), { animate: true, duration: 0.3 });
            openHotelSidebar(hd);
        });
        m.addTo(markersLayer); allMarkers.push(m); allHotelsData.push(hd);
        if (hd.price) wp++;
    });
    document.getElementById('hotelCount').textContent = String(allMarkers.length);
}

async function loadHotelsForViewport() {
    var key = makeCacheKey(), rid = ++currentRequestId;
    var cached = getCached(key);
    if (cached) { renderHotels(cached.hotels, cached.prices); return; }
    loadingBar.classList.add('active'); clearAllMarkers();
    var center = map.getCenter(), radius = getRadiusFromBounds();
    var ci = document.getElementById('checkin').value, co = document.getElementById('checkout').value;
    var ad = parseInt(document.getElementById('adults').value, 10) || 2;
    var cu = document.getElementById('currency').value;
    try {
        var hm = await fetchHotelsData(center.lat, center.lng, radius, rid);
        if (!hm || rid !== currentRequestId) { loadingBar.classList.remove('active'); return; }
        var ids = Object.keys(hm);
        if (!ids.length) { loadingBar.classList.remove('active'); return; }
        var pm = await fetchRates(ids, ci, co, cu, ad, rid);
        if (rid !== currentRequestId) { loadingBar.classList.remove('active'); return; }
        setCached(key, { hotels: hm, prices: pm });
        renderHotels(hm, pm);
    } catch (e) { if (e.name !== 'AbortError') showToast('Erreur: ' + e.message, true); }
    finally { if (rid === currentRequestId) loadingBar.classList.remove('active'); }
}

map.on('moveend', function() { clearTimeout(updateTimeout); updateTimeout = setTimeout(loadHotelsForViewport, 400); });

function refreshViewportSearch() { ratesCache.clear(); clearTimeout(updateTimeout); updateTimeout = setTimeout(loadHotelsForViewport, 0); }

document.getElementById('checkin').addEventListener('change', refreshViewportSearch);
document.getElementById('checkout').addEventListener('change', refreshViewportSearch);
document.getElementById('adults').addEventListener('change', refreshViewportSearch);
document.getElementById('currency').addEventListener('change', refreshViewportSearch);

setTimeout(loadHotelsForViewport, 500);
