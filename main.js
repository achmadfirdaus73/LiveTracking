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

        const mapContainer = document.getElementById('map-container');
        const employeeList = document.getElementById('employee-list');
        const listStatus = document.getElementById('list-status');
        const fakeAlertsDiv = document.getElementById('fake-alerts');
        const alertListUl = document.getElementById('alert-list');
        
        const map = L.map('map-container').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        let markers = {};

        const customBlueIcon = new L.Icon({
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        const customRedIcon = new L.Icon({
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        const customGrayIcon = new L.Icon({ // Ikon baru untuk status berhenti
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        db.ref('locations').on('value', (snapshot) => {
            const data = snapshot.val();
            let hasData = false;
            let listHtml = '';
            let fakeUsers = [];
            
            for (let id in markers) {
                if (!data || !data[id]) {
                    map.removeLayer(markers[id]);
                    delete markers[id];
                }
            }

            if (data) {
                hasData = true;
                for (const userId in data) {
                    const employee = data[userId];
                    const lat = employee.lat;
                    const long = employee.long;
                    const isFake = employee.isFake;
                    const status = employee.status; // Ambil status baru
                    const address = employee.address || "Alamat tidak ditemukan";
                    const timestamp = employee.timestamp || "Waktu tidak diketahui";

                    if (markers[userId]) {
                        markers[userId].setLatLng([lat, long]);
                    } else {
                        markers[userId] = L.marker([lat, long]).addTo(map);
                    }
                    
                    if (status === 'stopped') {
                        markers[userId].setIcon(customGrayIcon);
                        markers[userId].bindPopup(`<b>${userId}</b><br>Tracking Dihentikan<br>Waktu: ${timestamp}`).openPopup();
                        listHtml += `<div class="employee-status"><span class="stopped">●</span> <b>${userId}</b>: Tracking Dihentikan<br><small>Waktu: ${timestamp}</small></div>`;
                    } else if (isFake) {
                         markers[userId].setIcon(customRedIcon);
                        markers[userId].bindPopup(`<b>${userId}</b><br>LOKASI PALSU<br>Alamat: ${address}<br>Waktu: ${timestamp}`).openPopup();
                        fakeUsers.push(userId);
                        const statusText = 'LOKASI PALSU';
                        listHtml += `<div class="employee-status"><span class="fake">●</span> <b>${userId}</b>: ${statusText}<br><small>Waktu: ${timestamp}</small></div>`;
                    } else {
                        markers[userId].setIcon(customBlueIcon);
                        markers[userId].bindPopup(`<b>${userId}</b><br>Lokasi Asli<br>Alamat: ${address}<br>Waktu: ${timestamp}`).openPopup();
                        const statusText = 'Lokasi Asli';
                        listHtml += `<div class="employee-status"><span class="normal">●</span> <b>${userId}</b>: ${statusText}<br><small>Waktu: ${timestamp}</small></div>`;
                    }
                }
                
                const lastUser = Object.keys(data).pop();
                if (data[lastUser]) {
                    map.setView([data[lastUser].lat, data[lastUser].long], 16);
                }
            }
            
            listStatus.innerHTML = hasData ? listHtml : 'Menunggu data...';

            if (fakeUsers.length > 0) {
                fakeAlertsDiv.style.display = 'block';
                let alertHtml = '';
                fakeUsers.forEach(user => {
                    alertHtml += `<li><b>${user}</b> memakai fake GPS.</li>`;
                });
                alertListUl.innerHTML = alertHtml;
            } else {
                fakeAlertsDiv.style.display = 'none';
            }
        });
