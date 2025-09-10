const firebaseConfig = {
    apiKey: "AIzaSyATp2TW5seBULA5-vAfBV8tfnS9jYEhRDo",
    authDomain: "absensi-48cef.firebaseapp.com",
    databaseURL: "https://absensi-48cef-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "absensi-48cef",
    storageBucket: "absensi-48cef.firebasestorage.app",
    messagingSenderId: "652126290992",
    appId: "1:652126290992:web:ede30d62f3141b690799f5"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/***** MAP INIT *****/
const map = L.map('map').setView([-6.200, 106.816], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

/***** ICONS *****/
const blueIcon = new L.Icon({ iconUrl:'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41]});
const redIcon  = new L.Icon({ iconUrl:'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41]});
const orangeIcon = new L.Icon({ iconUrl:'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41]});
const grayIcon = new L.Icon({ iconUrl:'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41]});

/***** STATE *****/
const MAX_HISTORY = 150;
let markers = {};
let polylines = {};
let history = {};     
let lastPos = {};     

const listWrap = document.getElementById('listWrap');
const alertsBox = document.getElementById('alertsBox');
const searchInput = document.getElementById('searchInput');
const btnShowAll = document.getElementById('btnShowAll');

const bottomSheet = document.getElementById('bottomSheet');
const sheetHandle = document.getElementById('sheetHandle');
const sheetList = document.getElementById('sheetList');
const sheetAlerts = document.getElementById('sheetAlerts');
const sheetSearch = document.getElementById('sheetSearch');
const sheetShowAll = document.getElementById('sheetShowAll');

// Cache alamat
const addressCache = {}; 

async function getAddress(lat, lng) {
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (addressCache[key]) return addressCache[key];
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        const addr = data.display_name || 'Alamat tidak ditemukan';
        addressCache[key] = addr;
        return addr;
    } catch(err) {
        console.error(err);
        return 'Gagal ambil alamat';
    }
}

// Utility: haversine -> meters
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R*c;
}

// Hybrid detection
function detectSuspicious(userId, lat, lon, timestamp) {
    const last = lastPos[userId];
    let suspicious = false;
    let reason = '';

    if (last) {
        const dist = haversine(last.lat, last.lon, lat, lon);
        const dt = Math.max(1, (timestamp - last.time) / 1000);
        const speedKmh = (dist / dt) * 3.6;
        if (speedKmh > 300) { suspicious = true; reason = `speed:${Math.round(speedKmh)}km/h`; }
    }
    return { suspicious, reason };
}

// Render list & alerts
function renderListAndAlerts(latestData) {
    const fragment = document.createDocumentFragment();
    const sheetFragment = document.createDocumentFragment();
    let alerts = [];

    const keys = Object.keys(latestData || {});
    keys.sort((a,b) => {
        const ta = latestData[a]?.timestamp ? new Date(latestData[a].timestamp).getTime() : 0;
        const tb = latestData[b]?.timestamp ? new Date(latestData[b].timestamp).getTime() : 0;
        return tb - ta;
    });

    keys.forEach(userId => {
        const emp = latestData[userId];
        if (!emp || typeof emp.lat === 'undefined' || typeof emp.long === 'undefined') return;

        const lastHist = history[userId] && history[userId].slice(-1)[0];
        const computedSusp = !!(lastHist && lastHist._suspicious);

        const card = document.createElement('div'); card.className = 'user-card';
        card.onclick = () => focusEmployee(userId);
        const left = document.createElement('div'); left.className = 'user-left';
        const avatar = document.createElement('div'); avatar.className='avatar'; avatar.textContent = userId.slice(0,2).toUpperCase();
        const nameWrap = document.createElement('div');
        const name = document.createElement('div'); name.className='u-name'; name.textContent = userId;
        const meta = document.createElement('div'); meta.className='u-meta'; meta.textContent = emp.timestamp || '';
        nameWrap.appendChild(name); nameWrap.appendChild(meta);
        left.appendChild(avatar); left.appendChild(nameWrap);

        const right = document.createElement('div');
        const dot = document.createElement('div'); dot.className = 'status-dot ' + (emp.isFake ? 'status-fake' : (computedSusp ? 'status-susp' : (emp.status === 'stopped' ? 'status-stopped' : 'status-normal')));
        right.appendChild(dot);
        card.appendChild(left); card.appendChild(right);
        fragment.appendChild(card);

        const sCard = card.cloneNode(true);
        sCard.onclick = () => { focusEmployee(userId); toggleSheet(false); };
        sheetFragment.appendChild(sCard);

        if (emp.isFake) alerts.push(`🚨 ${userId} terdeteksi Fake GPS (device).`);
        if (computedSusp) alerts.push(`⚠️ ${userId} pergerakan mencurigakan.`);
    });

    listWrap.innerHTML = '';
    listWrap.appendChild(fragment);
    sheetList.innerHTML = '';
    sheetList.appendChild(sheetFragment);

    if (alerts.length) {
        alertsBox.style.display = 'block';
        alertsBox.innerHTML = alerts.map(a => `<div>${a}</div>`).join('');
        sheetAlerts.style.display = 'block';
        sheetAlerts.innerHTML = alerts.map(a => `<div>${a}</div>`).join('');
    } else {
        alertsBox.style.display = 'none';
        sheetAlerts.style.display = 'none';
        alertsBox.innerHTML = '';
        sheetAlerts.innerHTML = '';
    }
}

// Focus helpers
function focusEmployee(userId) {
    for (const id in markers) { try { map.removeLayer(markers[id]); } catch(e){} }
    for (const id in polylines) { try { map.removeLayer(polylines[id]); } catch(e){} }
    if (polylines[userId]) map.addLayer(polylines[userId]);
    if (markers[userId]) { map.addLayer(markers[userId]); markers[userId].openPopup(); map.setView(markers[userId].getLatLng(), 15); }
}
function showAll() {
    for (const id in markers) { try { map.addLayer(markers[id]); } catch(e){} }
    for (const id in polylines) { try { map.addLayer(polylines[id]); } catch(e){} }
}

// Toggle bottom sheet
function toggleSheet(open=true) {
    if (open) { bottomSheet.classList.add('open'); bottomSheet.setAttribute('aria-hidden','false'); }
    else { bottomSheet.classList.remove('open'); bottomSheet.setAttribute('aria-hidden','true'); }
}

// Drag handle
(function attachSheetDrag(){
    let startY = 0, currentY = 0, dragging = false;
    sheetHandle.addEventListener('touchstart', e => { dragging=true; startY = e.touches[0].clientY; });
    sheetHandle.addEventListener('touchmove', e => {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 40) { toggleSheet(false); dragging=false; }
    });
    sheetHandle.addEventListener('touchend', () => { dragging=false; });
    sheetHandle.addEventListener('click', () => {
        const isOpen = bottomSheet.classList.contains('open');
        toggleSheet(!isOpen);
    });
})();

// Search
searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll('.user-card'));
    if (!q) { cards.forEach(c => c.style.display='flex'); return; }
    cards.forEach(c => {
        const name = c.querySelector('.u-name')?.textContent?.toLowerCase() || '';
        c.style.display = name.includes(q) ? 'flex' : 'none';
    });
    sheetSearch.value = searchInput.value;
    sheetSearch.dispatchEvent(new Event('input'));
});
sheetSearch.addEventListener('input', () => {
    const q = sheetSearch.value.trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll('#sheetList .user-card'));
    if (!q) { cards.forEach(c => c.style.display='flex'); return; }
    cards.forEach(c => {
        const name = c.querySelector('.u-name')?.textContent?.toLowerCase() || '';
        c.style.display = name.includes(q) ? 'flex' : 'none';
    });
    searchInput.value = sheetSearch.value;
});

btnShowAll.addEventListener('click', () => { showAll(); searchInput.value=''; searchInput.dispatchEvent(new Event('input')); });
sheetShowAll.addEventListener('click', () => { showAll(); sheetSearch.value=''; sheetSearch.dispatchEvent(new Event('input')); toggleSheet(false); });

// MAIN: listen firebase data
db.ref('locations').on('value', snap => {
    const data = snap.val() || {};

    for (const userId in data) {
        const emp = data[userId];
        if (!emp || typeof emp.lat === 'undefined' || typeof emp.long === 'undefined') continue;
        const lat = Number(emp.lat);
        const lon = Number(emp.long);
        const now = Date.now();

        if (!history[userId]) history[userId] = [];
        const entry = { lat, lon, time: now, _isFakeDevice: !!emp.isFake, _suspicious: false };
        history[userId].push(entry);
        if (history[userId].length > MAX_HISTORY) history[userId].shift();

        const det = detectSuspicious(userId, lat, lon, now);
        if (det.suspicious) entry._suspicious = true;

        lastPos[userId] = { lat, lon, time: now };

        if (!markers[userId]) {
            markers[userId] = L.marker([lat, lon], { icon: blueIcon }).addTo(map);
        } else {
            markers[userId].setLatLng([lat, lon]);
        }

        const coords = history[userId].map(h => [h.lat, h.lon]);
        const color = emp.isFake ? '#ef4444' : (entry._suspicious ? '#f59e0b' : '#3b82f6');
        if (!polylines[userId]) {
            polylines[userId] = L.polyline(coords, { color: color, weight: 4 }).addTo(map);
        } else {
            polylines[userId].setLatLngs(coords);
            polylines[userId].setStyle({ color: color });
        }

        if (emp.isFake) markers[userId].setIcon(redIcon);
        else if (entry._suspicious) markers[userId].setIcon(orangeIcon);
        else if (emp.status === 'stopped') markers[userId].setIcon(grayIcon);
        else markers[userId].setIcon(blueIcon);

        // **Popup alamat**
        const alertText = (emp.isFake || entry._suspicious) ? '🚨 Fake GPS Terdeteksi' : 'Lokasi Terverifikasi';
        getAddress(lat, lon).then(address => {
            const popup = `<b>${userId}</b><br>${alertText}<br>${address}<br>${emp.timestamp || ''}`;
            markers[userId].bindPopup(popup);
        });
    }

    for (const id in markers) {
        if (!data[id]) {
            try { map.removeLayer(markers[id]); } catch(e){}
            try { map.removeLayer(polylines[id]); } catch(e){}
            delete markers[id]; delete polylines[id]; delete history[id]; delete lastPos[id];
        }
    }

    renderListAndAlerts(data);

    const ids = Object.keys(data);
    if (ids.length) {
        const last = ids[ids.length-1];
        if (data[last]) map.setView([data[last].lat, data[last].long], 12);
    }
});

// Mobile toggle
(function addMobileToggle(){
    const btn = document.createElement('button');
    btn.textContent = '☰';
    btn.title = 'Buka daftar';
    btn.style.position = 'fixed';
    btn.style.right = '12px';
    btn.style.bottom = '12px';
    btn.style.zIndex = 1200;
    btn.style.padding = '12px';
    btn.style.border = 'none';
    btn.style.borderRadius = '12px';
    btn.style.background = 'rgba(0,0,0,0.6)';
    btn.style.color = 'white';
    btn.style.boxShadow = '0 8px 20px rgba(0,0,0,0.4)';
    btn.addEventListener('click', () => toggleSheet(true));
    document.body.appendChild(btn);
})();

window.addEventListener('resize', () => {
    try { map.invalidateSize(); } catch(e){}
});
