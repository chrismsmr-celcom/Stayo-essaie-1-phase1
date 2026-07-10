// ==========================
// map-utils.js - STAYO Phase 2 Final
// ==========================

const map = L.map('map', {
    center: [48.8566, 2.3522],
    zoom: 13,
    zoomControl: false,
    attributionControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Fond de carte premium (gratuit)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

const loadingBar = document.getElementById('loadingBar');
const toast = document.getElementById('toast');

// ========== ICONES PRIX ==========
function createPriceIcon(price, currency) {
    var symbols = { 'EUR': '€', 'GBP': '£', 'USD': '$' };
    var symbol = symbols[currency] || currency;
    var dp = price >= 1000 ? (price / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(price);
    return L.divIcon({
        className: 'price-icon',
        html: '<div class="price-marker">' + symbol + dp + '</div>',
        iconSize: [65, 36], iconAnchor: [32, 36], popupAnchor: [0, -36]
    });
}

function createNoPriceIcon() {
    return L.divIcon({
        className: 'price-icon',
        html: '<div class="price-marker no-price">&mdash;</div>',
        iconSize: [45, 36], iconAnchor: [22, 36], popupAnchor: [0, -36]
    });
}

// ========== TOAST ==========
function showToast(message, isError) {
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 3500);
}

// ========== COUNTER TOAST ==========
var counterTimeout;
function showHotelCount(count) {
    var el = document.getElementById('hotelCount');
    var info = document.getElementById('resultsInfo');
    if (el) el.textContent = String(count);
    if (info) {
        info.classList.add('show');
        clearTimeout(counterTimeout);
        counterTimeout = setTimeout(function() { info.classList.remove('show'); }, 2500);
    }
}

// ========== GEOLOC ==========
var userMarker = null; // Marqueur de position utilisateur

function goToMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            
            // Icône personnalisée pour la position utilisateur
            var userIcon = L.icon({
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAACpElEQVR4nO3a30tTYRzH8QeJiC676a7+iG6TUFDwZtNNGWcTtqmbP4bp3HA4xOk2xY2JXuzmoLd1IVhQInLcOmyEIz12oxf5s6nNBKPEX0Xp+cTEhrmsKcZ5jpw3fP6A18X34oGHEKXcAs/fSI/IuXmfz7hqseysVlXtL3Z324jcWgqFHqw0NS1vqNXYUKkyS9psm8uh0ENCe3N9fXeW29rGPpSXi6cBp5fSarHiciU2BwfvEhpb8Hp9awbDj/MAZ7eu1x8udXSw8HjyCA3N9/QwSat1O1fA2SWrq/cW/f4aSRFJl2v27B1camo13jmds5JBjior8amlBR81mksjUmo1pqxWjBYVQTIIdDqk981iwWZj44URc2YzxsvK8DI//3hEasiv7aYxZvM/AQt6PaIGQwZAHQQ6HUSGwRe7HRsMkwVYq6jAa4sFowUFWQjqIDjZodGILbsdqdJSpFQqzNTUYKyk5I8AqiE42de6OoxrNH8FyAICnS4nhAK5ihRIvgL5P10byI7DsX5VkHGTaZ1I2ZbfX3dQX79/WciYVnvwyu1+TGgIPH9jy+djv5tMRzlDiovFiebmZ8Mez01CW6ne3nuf29vfiAbDuZAXhYXgamvfRn2++4T2ZicmsO12Z0GGbTaEAgHpjvqiCYKA9BZGRnDQ0IDnDINwMIjOzs7jEblBBEHAzNQUurq6MgjZQgRB+A2hQKRIgdCWAqEtBUJbCoS2FAhtKRDaujaQycnJ99PT01mQ9LtkYGBgl8ileDzORKNRMZFIZCDBYBB+v19kWdZI5BTP81GO4xCLxRAIBOB0OtHf3x8hcovn+VuRSGQ3jXE4HPB6vXssy94mciwejz/iOE5sbW3F0NBQMZFzsVjsaTgcfkLkHoA8Dy3fNIgM+gklaLWio5vstAAAAABJRU5ErkJggg==',
                iconSize: [50, 50],
                iconAnchor: [25, 50],
                popupAnchor: [0, -50]
            });
            
            // Supprimer l'ancien marqueur s'il existe
            if (userMarker) map.removeLayer(userMarker);
            
            // Ajouter le marqueur rouge
            userMarker = L.marker([lat, lng], {
                icon: userIcon,
                zIndexOffset: 1000
            }).addTo(map);
            
            // Centrer la carte
            map.setView([lat, lng], 15, { animate: true });
            
            // Trouver l'hôtel le plus proche
            if (typeof findNearestHotel === 'function') findNearestHotel(lat, lng);
        },
        function() { showToast('Impossible de vous localiser.', true); },
        { enableHighAccuracy: true }
    );
}

// ========== UI HELPERS ==========
function toggleFilters() {
    var f = document.getElementById('quickFilters');
    if (f) f.style.display = f.style.display === 'none' ? 'flex' : 'none';
}

function updateSearch(type) {
    var i = document.getElementById('aiSearchInput');
    if (i) i.value = type;
}

window.addEventListener('resize', function() { map.invalidateSize(); });
