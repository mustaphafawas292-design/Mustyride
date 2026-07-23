// =========================================================
// CONFIG
// =========================================================
// Change this if your backend runs on a different port/host.
// Relative path - works automatically whether you're running locally or
// deployed anywhere, since the frontend and API now share the same origin
// (served from the same Express server, see src/app.js).
const API_BASE = '/api';

// Free geocoding via OpenStreetMap's Nominatim - no API key needed.
// Scoped to a bounding box roughly covering Osun State so results stay
// relevant. This is a real address search, not a fixed list - it'll find
// pretty much any real place in Osun State as you type.
const GEOCODE_URL = 'https://nominatim.openstreetmap.org/search';
const OSUN_VIEWBOX = '4.0,8.4,5.4,7.0'; // left,top,right,bottom (lng,lat)

// Small offline fallback in case Nominatim can't be reached (no internet,
// rate-limited, etc.) - so the app still works, just with fewer choices.
const FALLBACK_LOCATIONS = [
  { label: 'Osogbo - Olaiya Junction', coords: [4.5600, 7.7719] },
  { label: 'Osogbo - Oja Oba Market', coords: [4.5590, 7.7669] },
  { label: 'Osogbo - Old Garage', coords: [4.5583, 7.7827] },
  { label: 'Osogbo - Government Reservation Area', coords: [4.5650, 7.7750] },
  { label: 'Ile-Ife - OAU Main Gate', coords: [4.5300, 7.5170] },
  { label: 'Ile-Ife - Mayfair', coords: [4.5610, 7.4890] },
  { label: 'Ile-Ife - Iwo Road', coords: [4.5540, 7.4990] },
  { label: 'Ilesa - Ereja Square', coords: [4.7333, 7.6167] },
  { label: 'Ede - Oja Timi', coords: [4.4500, 7.7333] },
  { label: 'Iwo - Oja Oba', coords: [4.1833, 7.6333] },
  { label: 'Ikirun - Post Office', coords: [4.7000, 7.9167] },
  { label: 'Gbongan - Garage', coords: [4.3833, 7.4667] },
  { label: 'Ejigbo - Central Market', coords: [4.3167, 7.9333] },
  { label: 'Iragbiji', coords: [4.6333, 7.8167] },
  { label: 'Ile-Ogbo', coords: [4.3167, 7.6667] },
  { label: 'Ipetumodu', coords: [4.4167, 7.5833] },
  { label: 'Modakeke', coords: [4.5500, 7.4667] },
  { label: 'Ada, Boripe', coords: [4.6833, 7.8833] },
  { label: 'Otan Ayegbaju', coords: [4.7500, 7.9500] },
  { label: 'Erin-Osun', coords: [4.5833, 7.6667] },
];

// ===== Shared nav toggle (every page) =====
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => navLinks.classList.remove('open')));
}

// =========================================================
// AUTH TOKEN STORAGE (sessionStorage - clears when the tab closes)
// =========================================================
const TOKEN_KEY = 'mustyride_token';
const USER_KEY = 'mustyride_user';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
function setSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}
function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

async function api(path, { method = 'GET', body = null, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error('You need to be logged in for this.');
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error('Could not reach the server. Is the backend running at ' + API_BASE + '?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data.data;
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}
function hideError(el) {
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
}

// ===== Auth-aware nav button (every page) =====
const navAuthBtn = document.getElementById('navAuthBtn');
if (navAuthBtn) {
  if (getToken()) {
    navAuthBtn.textContent = 'Dashboard';
    navAuthBtn.setAttribute('href', 'dashboard.html');
  } else {
    navAuthBtn.textContent = 'Register';
    navAuthBtn.setAttribute('href', 'register.html');
  }
}

// =========================================================
// LIVE ADDRESS SEARCH (real geocoding, with an offline fallback)
// =========================================================
// Tracks the currently-selected {label, coords} per input id. Cleared
// whenever the person types again without picking a fresh suggestion,
// so we never submit a booking with stale/mismatched coordinates.
const selectedLocations = {};

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function searchAddress(query) {
  const url = `${GEOCODE_URL}?format=json&q=${encodeURIComponent(query + ', Osun State, Nigeria')}&viewbox=${OSUN_VIEWBOX}&bounded=1&limit=6&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('geocode request failed');
    const results = await res.json();
    return results.map((r) => ({
      label: r.display_name.split(',').slice(0, 2).join(',').trim(),
      full: r.display_name,
      coords: [parseFloat(r.lon), parseFloat(r.lat)],
    }));
  } catch (err) {
    // Network blocked, offline, or rate-limited - fall back to the local list.
    const q = query.toLowerCase();
    return FALLBACK_LOCATIONS.filter((l) => l.label.toLowerCase().includes(q)).map((l) => ({
      label: l.label,
      full: l.label + ' (offline suggestion)',
      coords: l.coords,
    }));
  }
}

/** Reverse geocodes a [lng, lat] pair into a human-readable address, for the
 *  map-pin picker (drag the map, we tell you what's under the pin). */
async function reverseGeocode(lng, lat) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('reverse geocode failed');
    const r = await res.json();
    return r.display_name ? r.display_name.split(',').slice(0, 3).join(',').trim() : `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  } catch (err) {
    return `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }
}

function attachLocationSearch(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(suggestionsId);
  if (!input || !box) return;

  const runSearch = debounce(async () => {
    const query = input.value.trim();
    if (query.length < 3) {
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }

    const results = await searchAddress(query);
    box.innerHTML = '';

    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'location-suggestion suggestion-empty';
      empty.textContent = 'No matches yet - keep typing, or try a nearby landmark.';
      box.appendChild(empty);
    } else {
      results.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'location-suggestion';
        item.innerHTML = `${r.label}<small>${r.full}</small>`;
        item.addEventListener('click', () => {
          input.value = r.label;
          selectedLocations[inputId] = { label: r.label, coords: r.coords };
          if (window.updateBookingMap) window.updateBookingMap();
          box.classList.remove('show');
          box.innerHTML = '';
        });
        box.appendChild(item);
      });
    }
    box.classList.add('show');
  }, 400);

  input.addEventListener('input', () => {
    delete selectedLocations[inputId]; // invalidate until they pick a fresh suggestion
    runSearch();
  });

  input.addEventListener('focus', () => {
    if (box.innerHTML) box.classList.add('show');
  });

  // Close the dropdown on outside click, with a short delay so a click on a
  // suggestion registers first.
  document.addEventListener('click', (e) => {
    if (e.target !== input && !box.contains(e.target)) {
      box.classList.remove('show');
    }
  });
}

// =========================================================
// REGISTER PAGE (login / create account / OTP)
// =========================================================
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const otpForm = document.getElementById('otpForm');

if (tabLogin && tabSignup && loginForm && signupForm) {
  function showAuthTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabSignup.classList.toggle('active', !isLogin);
    loginForm.classList.toggle('active', isLogin);
    signupForm.classList.toggle('active', !isLogin);
    otpForm.style.display = 'none';
  }
  tabLogin.addEventListener('click', () => showAuthTab('login'));
  tabSignup.addEventListener('click', () => showAuthTab('signup'));

  let pendingSignupPhone = null;

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    hideError(errEl);
    if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }

    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const data = await api('/auth/customer/login', { method: 'POST', body: { phone, password } });
      setSession(data.token, data.user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const errEl = document.getElementById('signupError');
    hideError(errEl);
    if (!signupForm.checkValidity()) { signupForm.reportValidity(); return; }

    const fullName = document.getElementById('suName').value.trim();
    const phone = document.getElementById('suPhone').value.trim();
    const email = document.getElementById('suEmail').value.trim();
    const password = document.getElementById('suPassword').value;

    try {
      await api('/auth/customer/signup', { method: 'POST', body: { fullName, phone, email: email || undefined, password } });
      pendingSignupPhone = phone;
      signupForm.classList.remove('active');
      otpForm.style.display = 'grid';
      otpForm.classList.add('active');
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  otpForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const errEl = document.getElementById('otpError');
    hideError(errEl);

    const code = document.getElementById('otpCode').value.trim();
    try {
      const data = await api('/auth/customer/verify-otp', { method: 'POST', body: { phone: pendingSignupPhone, code } });
      setSession(data.token, data.user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  // ---- Forgot password ----
  const showForgotPassword = document.getElementById('showForgotPassword');
  const forgotForm = document.getElementById('forgotForm');
  const resetForm2 = document.getElementById('resetForm2');
  const backToLoginFromForgot = document.getElementById('backToLoginFromForgot');
  let pendingResetPhone = null;

  if (showForgotPassword) {
    showForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.classList.remove('active');
      forgotForm.style.display = 'grid';
      forgotForm.classList.add('active');
    });

    backToLoginFromForgot.addEventListener('click', (e) => {
      e.preventDefault();
      forgotForm.style.display = 'none';
      resetForm2.style.display = 'none';
      loginForm.classList.add('active');
    });

    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('forgotError');
      hideError(errEl);
      const phone = document.getElementById('forgotPhone').value.trim();

      try {
        await api('/auth/customer/forgot-password', { method: 'POST', body: { phone } });
        pendingResetPhone = phone;
        forgotForm.style.display = 'none';
        forgotForm.classList.remove('active');
        resetForm2.style.display = 'grid';
        resetForm2.classList.add('active');
      } catch (err) {
        showError(errEl, err.message);
      }
    });

    resetForm2.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('resetError');
      hideError(errEl);
      const code = document.getElementById('resetCode').value.trim();
      const newPassword = document.getElementById('resetNewPassword').value;

      try {
        await api('/auth/customer/reset-password', { method: 'POST', body: { phone: pendingResetPhone, code, newPassword } });
        resetForm2.style.display = 'none';
        resetForm2.classList.remove('active');
        loginForm.classList.add('active');
        document.getElementById('loginPhone').value = pendingResetPhone;
        alert('Password reset! Log in with your new password.');
      } catch (err) {
        showError(errEl, err.message);
      }
    });
  }
}

// =========================================================
// DASHBOARD PAGE
// =========================================================
const lockedCard = document.getElementById('lockedCard');
const dashboardShell = document.getElementById('dashboardShell');

if (lockedCard && dashboardShell) {
  (async function initDashboard() {
    const token = getToken();
    if (!token) {
      lockedCard.style.display = 'block';
      dashboardShell.style.display = 'none';
      return;
    }

    try {
      const data = await api('/auth/customer/me', { auth: true });
      lockedCard.style.display = 'none';
      dashboardShell.style.display = 'block';
      const greet = document.getElementById('dashboardGreeting');
      if (greet) greet.textContent = data.user.fullName ? `Welcome, ${data.user.fullName.split(' ')[0]}` : 'Welcome back';
    } catch (err) {
      clearSession();
      lockedCard.style.display = 'block';
      dashboardShell.style.display = 'none';
    }
  })();

  attachLocationSearch('pickup', 'pickupSuggestions');
  attachLocationSearch('dropoff', 'dropoffSuggestions');

  // ---- Live map (Leaflet + free OpenStreetMap tiles, no API key needed) ----
  let bookingMap = null;
  let pickupMarker = null;
  let dropoffMarker = null;

  if (document.getElementById('bookingMap') && window.L) {
    bookingMap = L.map('bookingMap').setView([7.7719, 4.5600], 12); // Osogbo, Osun State
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(bookingMap);

    const pickupIcon = L.divIcon({ className: '', html: '<div style="background:#E15A2B;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>', iconSize: [16, 16] });
    const dropoffIcon = L.divIcon({ className: '', html: '<div style="background:#211D1A;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>', iconSize: [16, 16] });

    window.updateBookingMap = function () {
      const pickupLoc = selectedLocations['pickup'];
      const dropoffLoc = selectedLocations['dropoff'];

      if (pickupLoc) {
        const latlng = [pickupLoc.coords[1], pickupLoc.coords[0]];
        if (pickupMarker) pickupMarker.setLatLng(latlng);
        else pickupMarker = L.marker(latlng, { icon: pickupIcon }).addTo(bookingMap).bindPopup('Pickup: ' + pickupLoc.label);
      }
      if (dropoffLoc) {
        const latlng = [dropoffLoc.coords[1], dropoffLoc.coords[0]];
        if (dropoffMarker) dropoffMarker.setLatLng(latlng);
        else dropoffMarker = L.marker(latlng, { icon: dropoffIcon }).addTo(bookingMap).bindPopup('Delivery: ' + dropoffLoc.label);
      }

      const points = [pickupMarker, dropoffMarker].filter(Boolean).map((m) => m.getLatLng());
      if (points.length === 2) bookingMap.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
      else if (points.length === 1) bookingMap.setView(points[0], 14);
    };

    // Let the customer click directly on the map to set pickup/dropoff too,
    // not just search text and pick a suggestion. Fills pickup first, then
    // dropoff; clicking again after both are set moves the dropoff pin.
    bookingMap.on('click', function (e) {
      const { lat, lng } = e.latlng;
      const coords = [lng, lat];
      const label = `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

      if (!selectedLocations['pickup']) {
        selectedLocations['pickup'] = { label, coords };
        document.getElementById('pickup').value = label;
      } else {
        selectedLocations['dropoff'] = { label, coords };
        document.getElementById('dropoff').value = label;
      }

      window.updateBookingMap();
    });
  }

  // ---- Map picker modal (drag the map under a fixed center pin, Bolt/Chowdeck-style) ----
  (function initMapPicker() {
    const modal = document.getElementById('mapPickerModal');
    if (!modal) return;

    let pickerMap = null;
    let activeField = null; // 'pickup' | 'dropoff'
    let pendingCoords = null; // [lng, lat] currently under the pin
    const addressLabel = document.getElementById('mapPickerAddress');
    const confirmBtn = document.getElementById('mapPickerConfirmBtn');
    const titleLabel = document.getElementById('mapPickerLabel');

    function ensurePickerMap() {
      if (pickerMap) return;
      pickerMap = L.map('mapPickerMap', { zoomControl: true }).setView([7.7719, 4.5600], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(pickerMap);

      pickerMap.on('moveend', async () => {
        const center = pickerMap.getCenter();
        pendingCoords = [center.lng, center.lat];
        addressLabel.textContent = 'Looking up this address...';
        const address = await reverseGeocode(center.lng, center.lat);
        addressLabel.textContent = address;
      });
    }

    document.querySelectorAll('[data-open-picker]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeField = btn.dataset.openPicker; // 'pickup' or 'dropoff'
        titleLabel.textContent = activeField === 'pickup' ? 'Set pickup location' : 'Set delivery location';
        modal.classList.add('show');

        ensurePickerMap();
        // Give the modal a tick to become visible before Leaflet measures it,
        // otherwise the map renders at 0 height/width.
        setTimeout(() => {
          pickerMap.invalidateSize();
          const existing = selectedLocations[activeField];
          const startLatLng = existing ? [existing.coords[1], existing.coords[0]] : [7.7719, 4.5600];
          pickerMap.setView(startLatLng, 15);
          pendingCoords = existing ? existing.coords : [startLatLng[1], startLatLng[0]];
          addressLabel.textContent = existing ? existing.label : 'Move the map to pinpoint your location...';
        }, 50);
      });
    });

    confirmBtn.addEventListener('click', () => {
      if (!activeField || !pendingCoords) return;
      const label = addressLabel.textContent;
      selectedLocations[activeField] = { label, coords: pendingCoords };
      document.getElementById(activeField).value = label;
      if (window.updateBookingMap) window.updateBookingMap();
      modal.classList.remove('show');
    });
  })();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      clearSession();
      window.location.href = 'index.html';
    });
  }

  // ---- Notification bell (customer side) ----
  (function initCustomerNotifications() {
    const bellBtn = document.getElementById('notifBellBtn');
    const dropdown = document.getElementById('notifDropdown');
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    const markAllBtn = document.getElementById('notifMarkAllRead');
    if (!bellBtn) return;

    function timeAgo(dateStr) {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }

    async function refreshNotifications() {
      try {
        const data = await api('/notifications', { auth: true });
        if (data.unreadCount > 0) {
          badge.textContent = data.unreadCount > 9 ? '9+' : data.unreadCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }

        if (!data.notifications.length) {
          list.innerHTML = '<div style="padding:20px 14px;color:var(--muted);font-size:13px;text-align:center;">No notifications yet.</div>';
          return;
        }

        list.innerHTML = data.notifications
          .map((n) => `
            <div class="notif-item" data-id="${n._id}" style="padding:10px 12px;border-radius:8px;cursor:pointer;${n.read ? '' : 'background:rgba(225,90,43,0.08);'}">
              <div style="display:flex;justify-content:space-between;gap:8px;">
                <b style="font-size:13px;">${n.title}</b>
                ${n.read ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:var(--orange);flex-shrink:0;margin-top:4px;"></span>'}
              </div>
              <div style="color:var(--muted);font-size:12.5px;margin-top:2px;">${n.message}</div>
              <div style="color:var(--muted);font-size:11px;margin-top:4px;opacity:0.7;">${timeAgo(n.createdAt)}</div>
            </div>
          `)
          .join('');
      } catch (err) {
        // silent - next poll retries
      }
    }

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'block';
      dropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) refreshNotifications();
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== bellBtn) {
        dropdown.style.display = 'none';
      }
    });

    list.addEventListener('click', async (e) => {
      const item = e.target.closest('.notif-item');
      if (!item) return;
      try {
        await api(`/notifications/${item.dataset.id}/read`, { method: 'PATCH', auth: true });
        refreshNotifications();
      } catch (err) { /* silent */ }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        try {
          await api('/notifications/read-all', { method: 'PATCH', auth: true });
          refreshNotifications();
        } catch (err) { /* silent */ }
      });
    }

    refreshNotifications();
    setInterval(refreshNotifications, 10000);
  })();

  // ---- Mode tabs: Send a Package / Track / My Orders ----
  const modeTabPackage = document.getElementById('modeTabPackage');
  const modeTabTrack = document.getElementById('modeTabTrack');
  const modeTabOrders = document.getElementById('modeTabOrders');
  const modePanelPackage = document.getElementById('modePanelPackage');
  const modePanelTrack = document.getElementById('modePanelTrack');
  const modePanelOrders = document.getElementById('modePanelOrders');

  if (modeTabPackage && modeTabTrack && modeTabOrders) {
    function showMode(mode) {
      modeTabPackage.classList.toggle('active', mode === 'package');
      modeTabTrack.classList.toggle('active', mode === 'track');
      modeTabOrders.classList.toggle('active', mode === 'orders');
      modePanelPackage.classList.toggle('active', mode === 'package');
      modePanelTrack.classList.toggle('active', mode === 'track');
      modePanelOrders.classList.toggle('active', mode === 'orders');
      if (mode === 'orders') refreshMyOrders();
    }
    modeTabPackage.addEventListener('click', () => showMode('package'));
    modeTabTrack.addEventListener('click', () => showMode('track'));
    modeTabOrders.addEventListener('click', () => showMode('orders'));
  }

  const ORDER_STATUS_LABELS = {
    awaiting_payment: 'Awaiting payment',
    pending_match: 'Finding a rider',
    rider_assigned: 'Rider assigned',
    rider_arrived_pickup: 'Rider at pickup',
    picked_up: 'Picked up',
    in_transit: 'On the way',
    arrived_destination: 'Arrived',
    delivered: 'Delivered',
    cancelled_by_customer: 'Cancelled',
    cancelled_by_rider: 'Cancelled by rider',
    no_riders_available: 'No riders were available',
    failed: 'Failed',
  };

  const CANCELLABLE_STATUSES = ['awaiting_payment', 'pending_match', 'rider_assigned', 'rider_arrived_pickup'];

  async function refreshMyOrders() {
    const list = document.getElementById('myOrdersList');
    try {
      const data = await api('/bookings', { auth: true });
      if (!data.bookings.length) {
        list.innerHTML = "You haven't booked anything yet.";
        return;
      }
      list.innerHTML = '';
      data.bookings.forEach((b) => {
        const isDone = ['delivered', 'cancelled_by_customer', 'cancelled_by_rider', 'no_riders_available', 'failed'].includes(b.status);
        const canCancel = CANCELLABLE_STATUSES.includes(b.status);
        const canChat = !isDone && b.rider;
        const needsReceiptConfirmation = b.status === 'delivered' && b.receiptConfirmation === 'pending';
        const canRate = b.status === 'delivered' && b.receiptConfirmation !== 'pending';
        // Once a rider accepts, a wallet-paying customer needs to pay before
        // the rider can head to pickup.
        const needsWalletPayment = !isDone && b.rider && b.paymentMethod === 'wallet' && b.paymentStatus !== 'paid';
        // b.rider is now a populated object (fullName/phone/ratingAverage/photo)
        // rather than a raw id, thanks to the .populate() fix in listMyBookings.
        const rider = typeof b.rider === 'object' ? b.rider : null;

        const card = document.createElement('div');
        card.className = 'book-shell narrow';
        card.style.cssText = 'padding:18px;margin-bottom:14px;';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:12.5px;color:var(--gold);letter-spacing:1px;margin-bottom:6px;">${b.trackingId}</div>
              <b>${b.pickup.address}</b> <span style="color:var(--muted);">→</span> <b>${b.destination.address}</b>
              <div style="color:var(--muted);font-size:13px;margin-top:4px;">${b.serviceType.replace(/_/g, ' ')} · ${b.deliveryType}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:${isDone ? 'var(--muted)' : 'var(--orange)'};font-weight:800;">${ORDER_STATUS_LABELS[b.status] || b.status}</div>
              <div style="color:var(--muted);font-size:13px;margin-top:4px;">₦${b.fare.total.toLocaleString()}</div>
            </div>
          </div>
          ${rider ? `
          <div style="display:flex;align-items:center;gap:12px;margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-sm);">
            <img src="${rider.documents?.passportPhotoUrl || ''}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,0.06);flex-shrink:0;">
            <div style="flex:1;">
              <b style="display:block;font-size:14px;">${rider.fullName}</b>
              <span style="color:var(--muted);font-size:12.5px;">⭐ ${rider.ratingAverage ? rider.ratingAverage.toFixed(1) : 'New rider'}${rider.documents?.plateNumber ? ` · Plate: ${rider.documents.plateNumber}` : ''}</span>
            </div>
            <a href="tel:${rider.phone}" class="btn btn-ghost" style="padding:6px 12px;font-size:12.5px;">Call</a>
          </div>` : ''}
          ${!isDone && b.deliveryConfirmationCode ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07);font-size:13px;color:var(--muted);">Delivery code: <b style="color:var(--orange);letter-spacing:2px;">${b.deliveryConfirmationCode}</b></div>` : ''}
          ${needsWalletPayment ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07);font-size:13px;color:var(--orange);font-weight:700;">A rider accepted! Chat with them, then complete payment so they can head to pickup.</div>` : ''}
          ${needsReceiptConfirmation ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07);font-size:13px;color:var(--muted);">Did it arrive okay?</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${canCancel ? `<button class="btn btn-ghost" data-action="cancel" data-id="${b._id}" style="padding:8px 14px;font-size:13px;">Cancel Order</button>` : ''}
            ${canChat ? `<button class="btn btn-ghost" data-action="chat" data-id="${b._id}" style="padding:8px 14px;font-size:13px;">Chat with Rider</button>` : ''}
            ${needsWalletPayment ? `<button class="btn btn-primary" data-action="pay-wallet" data-id="${b._id}" style="padding:8px 14px;font-size:13px;">Pay Now (₦${b.fare.total.toLocaleString()})</button>` : ''}
            ${needsReceiptConfirmation ? `<button class="btn btn-primary" data-action="confirm-ok" data-id="${b._id}" style="padding:8px 14px;font-size:13px;">Package is okay ✅</button>` : ''}
            ${needsReceiptConfirmation ? `<button class="btn btn-ghost" data-action="confirm-issue" data-id="${b._id}" style="padding:8px 14px;font-size:13px;color:var(--danger);">Report a problem ⚠️</button>` : ''}
            ${canRate ? `<button class="btn btn-ghost" data-action="rate" data-id="${b._id}" style="padding:8px 14px;font-size:13px;">Rate this delivery</button>` : ''}
          </div>
        `;
        list.appendChild(card);
      });
    } catch (err) {
      list.textContent = 'Could not load your orders right now.';
    }
  }

  // ---- Order card actions (event delegation, since cards are re-rendered) ----
  document.getElementById('myOrdersList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'cancel') {
      if (!confirm('Cancel this order?')) return;
      try {
        await api(`/bookings/${id}/cancel`, { method: 'POST', auth: true, body: { reason: 'Cancelled by customer' } });
        refreshMyOrders();
      } catch (err) {
        alert(err.message);
      }
    }

    if (action === 'pay-wallet') {
      if (!confirm('Complete payment now so your rider can start heading to pickup?')) return;
      try {
        await api(`/bookings/${id}/pay-wallet`, { method: 'POST', auth: true });
        alert('Payment successful! Your rider has been notified and can now proceed.');
        refreshMyOrders();
      } catch (err) {
        alert(err.message);
      }
    }

    if (action === 'confirm-ok') {
      if (!confirm('Confirm the package arrived in good condition? This releases payment to your rider.')) return;
      try {
        await api(`/bookings/${id}/confirm-receipt`, { method: 'POST', auth: true, body: { status: 'ok' } });
        refreshMyOrders();
      } catch (err) {
        alert(err.message);
      }
    }

    if (action === 'confirm-issue') {
      const note = prompt('What went wrong? This opens a support ticket and holds the payment for review.');
      if (note === null) return;
      try {
        await api(`/bookings/${id}/confirm-receipt`, { method: 'POST', auth: true, body: { status: 'issue', note } });
        alert("We've opened a support ticket and held the payment - our team will review it.");
        refreshMyOrders();
      } catch (err) {
        alert(err.message);
      }
    }

    if (action === 'rate') {
      document.getElementById('ratingBookingId').value = id;
      document.getElementById('ratingStarsValue').value = '0';
      document.querySelectorAll('#starPicker .star-btn').forEach((s) => s.classList.remove('active'));
      document.getElementById('ratingComment').value = '';
      hideError(document.getElementById('ratingError'));
      document.getElementById('ratingResult').classList.remove('show');
      document.getElementById('starPicker').style.display = 'flex';
      document.getElementById('submitRatingBtn').style.display = 'inline-flex';
      openModal('ratingModal');
    }

    if (action === 'chat') {
      document.getElementById('chatBookingId').value = id;
      openModal('chatModal');
      loadChatMessages(id);
      if (chatPollTimer) clearInterval(chatPollTimer);
      chatPollTimer = setInterval(() => loadChatMessages(id), 4000);
    }
  });

  // ---- Star rating picker ----
  document.querySelectorAll('#starPicker .star-btn').forEach((starBtn) => {
    starBtn.addEventListener('click', () => {
      const value = Number(starBtn.dataset.star);
      document.getElementById('ratingStarsValue').value = value;
      document.querySelectorAll('#starPicker .star-btn').forEach((s) => {
        s.classList.toggle('active', Number(s.dataset.star) <= value);
      });
    });
  });

  document.getElementById('submitRatingBtn')?.addEventListener('click', async () => {
    const errEl = document.getElementById('ratingError');
    hideError(errEl);
    const bookingId = document.getElementById('ratingBookingId').value;
    const stars = Number(document.getElementById('ratingStarsValue').value);
    const comment = document.getElementById('ratingComment').value.trim();

    if (!stars) { showError(errEl, 'Pick a star rating first.'); return; }

    try {
      await api('/ratings', { method: 'POST', auth: true, body: { bookingId, stars, comment: comment || undefined } });
      document.getElementById('starPicker').style.display = 'none';
      document.getElementById('submitRatingBtn').style.display = 'none';
      const result = document.getElementById('ratingResult');
      result.textContent = 'Thanks for the feedback!';
      result.classList.add('show');
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  // ---- Chat modal ----
  let chatPollTimer = null;
  const chatForm = document.getElementById('chatForm');

  async function loadChatMessages(bookingId) {
    try {
      const data = await api(`/bookings/${bookingId}/messages`, { auth: true });
      const log = document.getElementById('chatLog');
      log.innerHTML = data.messages
        .map((m) => {
          const mine = m.senderType === 'customer';
          const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `<div class="chat-bubble ${mine ? 'mine' : 'theirs'}">${m.text}<span class="chat-time">${time}</span></div>`;
        })
        .join('');
      log.scrollTop = log.scrollHeight;
    } catch (err) {
      // silent - next poll will try again
    }
  }

  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;
      const bookingId = document.getElementById('chatBookingId').value;

      try {
        await api(`/bookings/${bookingId}/messages`, { method: 'POST', auth: true, body: { text } });
        input.value = '';
        loadChatMessages(bookingId);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ---- Package delivery form ----
  const form = document.getElementById('bookingForm');
  const confirmPanel = document.getElementById('confirmPanel');
  if (form && confirmPanel) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const errEl = document.getElementById('bookingError');
      hideError(errEl);
      if (!form.checkValidity()) { form.reportValidity(); return; }

      const pickupLoc = selectedLocations['pickup'];
      const dropoffLoc = selectedLocations['dropoff'];
      if (!pickupLoc || !dropoffLoc) {
        showError(errEl, 'Please pick a pickup and delivery location from the suggestions list.');
        return;
      }

      const serviceType = document.getElementById('serviceType').value;
      const rname = document.getElementById('rname').value.trim();
      const rphone = document.getElementById('rphone').value.trim();
      const pkgdesc = document.getElementById('pkgdesc').value.trim();
      const dtype = form.querySelector('input[name="dtype"]:checked').value;

      try {
        const data = await api('/bookings', {
          method: 'POST',
          auth: true,
          body: {
            serviceType,
            deliveryType: dtype,
            pickup: { address: pickupLoc.label, coordinates: pickupLoc.coords },
            destination: { address: dropoffLoc.label, coordinates: dropoffLoc.coords },
            receiverName: rname,
            receiverPhone: rphone,
            packageDescription: pkgdesc,
            paymentMethod: 'wallet',
          },
        });

        const booking = data.booking;
        document.getElementById('trackId').textContent = booking.trackingId;
        document.getElementById('cDeliveryCode').textContent = booking.deliveryConfirmationCode;
        document.getElementById('cPickup').textContent = booking.pickup.address;
        document.getElementById('cDropoff').textContent = booking.destination.address;
        document.getElementById('cReceiver').textContent = booking.receiverName;
        document.getElementById('cType').textContent = dtype === 'express' ? 'Express' : 'Normal';
        document.getElementById('cFare').textContent = `₦${booking.fare.total.toLocaleString()}`;
        document.getElementById('cTime').textContent = `${booking.fare.estimatedMinutes} min`;

        form.style.display = 'none';
        confirmPanel.classList.add('show');
        confirmPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        showError(errEl, err.message);
      }
    });

    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
      resetForm.addEventListener('click', function () {
        form.reset();
        delete selectedLocations['pickup'];
        delete selectedLocations['dropoff'];
        form.style.display = 'grid';
        confirmPanel.classList.remove('show');
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  // ---- Account menu (tap to open) ----
  const accountMenuToggle = document.getElementById('accountMenuToggle');
  const accountMenu = document.getElementById('accountMenu');
  if (accountMenuToggle && accountMenu) {
    accountMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      accountMenu.classList.toggle('show');
      accountMenuToggle.classList.toggle('open');
    });
    accountMenu.querySelectorAll('.sidebar-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        accountMenu.classList.remove('show');
        accountMenuToggle.classList.remove('open');
      });
    });
    document.addEventListener('click', (e) => {
      if (!accountMenu.contains(e.target) && e.target !== accountMenuToggle) {
        accountMenu.classList.remove('show');
        accountMenuToggle.classList.remove('open');
      }
    });
  }

  // ---- Modal open/close plumbing ----
  function openModal(id) {
    document.getElementById(id)?.classList.add('show');
  }
  function closeModal(id) {
    document.getElementById(id)?.classList.remove('show');
  }
  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });

  // ---- Wallet modal (fund / withdraw) ----
  const openWalletModal = document.getElementById('openWalletModal');
  const openWalletModalHandler = async () => {
    openModal('walletModal');
    try {
      const data = await api('/wallet/me', { auth: true });
      document.getElementById('walletBalanceDisplay').textContent = `₦${data.wallet.availableBalance.toLocaleString()}`;
    } catch (err) {
      document.getElementById('walletBalanceDisplay').textContent = '₦0';
    }
  };

  ['fundFromBookingLink', 'fundFromRideLink'].forEach((id) => {
    const link = document.getElementById(id);
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openWalletModalHandler();
      });
    }
  });

  if (openWalletModal) {
    openWalletModal.addEventListener('click', openWalletModalHandler);

    const tabFund = document.getElementById('tabFund');
    const tabWithdraw = document.getElementById('tabWithdraw');
    const fundForm = document.getElementById('fundForm');
    const withdrawForm = document.getElementById('withdrawForm');

    tabFund.addEventListener('click', () => {
      tabFund.classList.add('active'); tabWithdraw.classList.remove('active');
      fundForm.classList.add('active'); withdrawForm.classList.remove('active');
    });
    tabWithdraw.addEventListener('click', () => {
      tabWithdraw.classList.add('active'); tabFund.classList.remove('active');
      withdrawForm.classList.add('active'); fundForm.classList.remove('active');
    });

    fundForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('fundError');
      hideError(errEl);
      const amount = Number(document.getElementById('fundAmount').value);

      try {
        const data = await api('/payments/initiate', { method: 'POST', auth: true, body: { purpose: 'wallet_topup', amount } });
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        }
      } catch (err) {
        showError(errEl, err.message);
      }
    });

    withdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('withdrawError');
      hideError(errEl);
      const amount = Number(document.getElementById('withdrawAmount').value);
      const bankCode = document.getElementById('withdrawBankCode').value.trim();
      const accountNumber = document.getElementById('withdrawAccount').value.trim();

      try {
        await api('/wallet/customer/withdraw', { method: 'POST', auth: true, body: { amount, bankCode, accountNumber } });
        const result = document.getElementById('walletActionResult');
        result.textContent = 'Withdrawal initiated - it should reach your bank account shortly.';
        result.classList.add('show');
        withdrawForm.reset();
      } catch (err) {
        showError(errEl, err.message);
      }
    });
  }

  // ---- Refund request modal ----
  const openRefundModal = document.getElementById('openRefundModal');
  if (openRefundModal) {
    openRefundModal.addEventListener('click', () => openModal('refundModal'));

    const refundForm = document.getElementById('refundForm');
    refundForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('refundError');
      hideError(errEl);
      const trackingId = document.getElementById('refundTrackId').value.trim().toUpperCase();
      const reason = document.getElementById('refundReason').value.trim();

      try {
        const trackData = await api(`/tracking/by-code/${encodeURIComponent(trackingId)}`);
        const data = await api('/support/tickets', {
          method: 'POST',
          auth: true,
          body: {
            category: 'refund_request',
            subject: `Refund request for ${trackingId}`,
            message: reason,
            relatedBooking: trackData.bookingId,
            refundRequested: true,
          },
        });
        document.getElementById('refundRef').textContent = data.ticket.reference;
        refundForm.style.display = 'none';
        document.getElementById('refundResult').classList.add('show');
      } catch (err) {
        showError(errEl, err.message);
      }
    });
  }

  // ---- Call Rider modal ----
  const openCallModal = document.getElementById('openCallModal');
  if (openCallModal) {
    openCallModal.addEventListener('click', () => openModal('callModal'));

    const callForm = document.getElementById('callForm');
    callForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('callError');
      hideError(errEl);
      const trackingId = document.getElementById('callTrackId').value.trim().toUpperCase();
      const resultEl = document.getElementById('callResult');
      resultEl.classList.remove('show');

      try {
        const trackData = await api(`/tracking/by-code/${encodeURIComponent(trackingId)}`);
        if (!trackData.rider) {
          showError(errEl, 'No rider has accepted this booking yet - check back once one does.');
          return;
        }

        const data = await api('/calls/rider', { method: 'POST', auth: true, body: { bookingId: trackData.bookingId } });
        resultEl.innerHTML = data.dialNumber
          ? `<b>${trackData.rider.fullName}</b>'s number: <b style="color:var(--orange);">${data.dialNumber}</b><br><span style="color:var(--muted);font-size:13px;">(shown directly since no live call bridge is set up yet)</span>`
          : `Connecting your call to ${trackData.rider.fullName}...`;
        resultEl.classList.add('show');
      } catch (err) {
        showError(errEl, err.message);
      }
    });
  }
}

// =========================================================
// TRACK RIDER PAGE - calls the real public tracking endpoint,
// then subscribes to live Socket.io updates for that booking.
// =========================================================
const trackForm = document.getElementById('trackForm');
if (trackForm) {
  const trackResult = document.getElementById('trackResult');
  const trackNotFound = document.getElementById('trackNotFound');
  const timeline = document.getElementById('timeline');

  const STATUS_STEPS = [
    { key: 'pending_match', label: 'Request placed', sub: 'Your booking was received.' },
    { key: 'rider_assigned', label: 'Rider matched', sub: 'A rider nearby accepted the job.' },
    { key: 'rider_arrived_pickup', label: 'Rider at pickup', sub: 'Rider has arrived at the pickup point.' },
    { key: 'picked_up', label: 'Picked up', sub: 'Rider has collected it from the pickup point.' },
    { key: 'in_transit', label: 'On the way', sub: 'Heading to the delivery location.' },
    { key: 'delivered', label: 'Delivered', sub: 'Handed to the receiver.' },
  ];

  // ---- Live map + socket wiring (created once, reused across searches) ----
  let liveMap = null;
  let liveRiderMarker = null;
  let socket = null;
  let subscribedBookingId = null;

  function ensureSocket() {
    if (socket || typeof io === 'undefined') return;
    socket = io(); // same-origin, server.js already has Socket.io mounted
  }

  function ensureLiveMap() {
    if (liveMap || !window.L) return;
    liveMap = L.map('liveTrackMap').setView([7.7719, 4.5600], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(liveMap);
  }

  function updateRiderMarker(coords) {
    if (!coords) return;
    ensureLiveMap();
    document.getElementById('liveTrackMapWrap').style.display = 'block';
    // Leaflet map containers need a redraw kick if they were previously hidden
    setTimeout(() => liveMap.invalidateSize(), 0);

    const latlng = [coords[1], coords[0]];
    const riderIcon = L.divIcon({
      className: '',
      html: '<div style="background:#E15A2B;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>',
      iconSize: [18, 18],
    });
    if (liveRiderMarker) liveRiderMarker.setLatLng(latlng);
    else liveRiderMarker = L.marker(latlng, { icon: riderIcon }).addTo(liveMap).bindPopup('Your rider');
    liveMap.setView(latlng, 14);
  }

  function subscribeToBooking(bookingId) {
    ensureSocket();
    if (!socket) return;
    if (subscribedBookingId && subscribedBookingId !== bookingId) {
      socket.emit('booking:unsubscribe', subscribedBookingId);
    }
    subscribedBookingId = bookingId;
    socket.emit('booking:subscribe', bookingId);
  }

  // Live push - server emits this whenever the rider pings their location
  // (see trackingController.js submitPing -> io.to(`booking:${id}`).emit(...))
  function attachLiveListener() {
    ensureSocket();
    if (!socket || socket._trackingListenerAttached) return;
    socket._trackingListenerAttached = true;
    socket.on('tracking:update', (liveTracking) => {
      if (liveTracking?.riderLocation?.coordinates) {
        updateRiderMarker(liveTracking.riderLocation.coordinates);
      }
      if (liveTracking?.etaMinutes != null) {
        document.getElementById('resultEta').textContent = `${liveTracking.etaMinutes} min`;
      }
    });
  }

  function renderRiderCard(rider) {
    const card = document.getElementById('resultRiderCard');
    if (!rider) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'flex';
    document.getElementById('resultRiderName').textContent = rider.fullName;
    document.getElementById('resultRiderRating').textContent = rider.ratingAverage ? rider.ratingAverage.toFixed(1) : 'New rider';
    const plateWrap = document.getElementById('resultRiderPlateWrap');
    if (rider.documents?.plateNumber) {
      document.getElementById('resultRiderPlate').textContent = rider.documents.plateNumber;
      plateWrap.style.display = 'inline';
    } else {
      plateWrap.style.display = 'none';
    }
    document.getElementById('resultRiderPhoto').src = rider.documents?.passportPhotoUrl || '';
    document.getElementById('resultRiderCallLink').href = rider.phone ? `tel:${rider.phone}` : '#';
  }

  trackForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const idInput = document.getElementById('trackIdInput');
    const id = idInput.value.trim().toUpperCase();

    trackResult.classList.remove('show');
    trackNotFound.classList.remove('show');

    try {
      const data = await api(`/tracking/by-code/${encodeURIComponent(id)}`);
      const currentIndex = Math.max(0, STATUS_STEPS.findIndex((s) => s.key === data.status));

      timeline.innerHTML = '';
      STATUS_STEPS.forEach((step, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending';
        const div = document.createElement('div');
        div.className = 't-step ' + state;
        div.innerHTML = `<div class="t-dot"></div><div class="t-body"><b>${step.label}</b><span>${step.sub}</span></div>`;
        timeline.appendChild(div);
      });

      document.getElementById('resultId').textContent = data.trackingId;
      document.getElementById('resultRider').textContent = data.rider ? data.rider.fullName : 'Not assigned yet';
      document.getElementById('resultEta').textContent =
        data.status === 'delivered' ? 'Delivered' : data.liveTracking?.etaMinutes ? `${data.liveTracking.etaMinutes} min` : 'Awaiting rider';

      renderRiderCard(data.rider);

      // Show the live map + subscribe for real-time updates once a rider is assigned.
      const liveWrap = document.getElementById('liveTrackMapWrap');
      const activeStatuses = ['rider_assigned', 'rider_arrived_pickup', 'picked_up', 'in_transit'];
      if (data.rider && activeStatuses.includes(data.status)) {
        subscribeToBooking(data.bookingId);
        attachLiveListener();
        if (data.liveTracking?.riderLocation?.coordinates) {
          updateRiderMarker(data.liveTracking.riderLocation.coordinates);
        } else if (data.rider.currentLocation?.coordinates?.some((n) => n !== 0)) {
          updateRiderMarker(data.rider.currentLocation.coordinates);
        } else {
          liveWrap.style.display = 'none';
        }
      } else {
        liveWrap.style.display = 'none';
      }

      trackResult.classList.add('show');
      trackResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      trackNotFound.querySelector('p').textContent = err.message;
      trackNotFound.classList.add('show');
      trackNotFound.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

// =========================================================
// CONTACT / COMPLAINTS PAGE
// =========================================================
const complaintForm = document.getElementById('complaintForm');
if (complaintForm) {
  const complaintConfirm = document.getElementById('complaintConfirm');
  complaintForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!complaintForm.checkValidity()) { complaintForm.reportValidity(); return; }

    const category = document.getElementById('cplCategory').value;
    const message = document.getElementById('cplMessage').value.trim();
    const trackingId = document.getElementById('cplTrackId').value.trim();

    let refText = 'OSR-CMP-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    if (getToken()) {
      try {
        const data = await api('/support/tickets', {
          method: 'POST',
          auth: true,
          body: { category, subject: category, message, relatedBooking: trackingId || undefined },
        });
        refText = data.ticket.reference;
      } catch (err) {
        console.warn('Complaint API call failed, showing local confirmation instead:', err.message);
      }
    }

    document.getElementById('complaintRef').textContent = refText;
    complaintForm.style.display = 'none';
    complaintConfirm.classList.add('show');
    complaintConfirm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const resetComplaint = document.getElementById('resetComplaint');
  if (resetComplaint) {
    resetComplaint.addEventListener('click', function () {
      complaintForm.reset();
      complaintForm.style.display = 'grid';
      complaintConfirm.classList.remove('show');
      complaintForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

// =========================================================
// RIDER PORTAL (separate session from the customer one)
// =========================================================
const RIDER_TOKEN_KEY = 'mustyride_rider_token';
const RIDER_USER_KEY = 'mustyride_rider_user';

function getRiderToken() { return sessionStorage.getItem(RIDER_TOKEN_KEY); }
function setRiderSession(token, rider) {
  sessionStorage.setItem(RIDER_TOKEN_KEY, token);
  sessionStorage.setItem(RIDER_USER_KEY, JSON.stringify(rider || {}));
}
function clearRiderSession() {
  sessionStorage.removeItem(RIDER_TOKEN_KEY);
  sessionStorage.removeItem(RIDER_USER_KEY);
}

/** Same shape as api(), but always authenticates with the rider token. */
async function riderApi(path, { method = 'GET', body = null, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getRiderToken();
    if (!token) throw new Error('You need to be logged in as a rider for this.');
    headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    throw new Error('Could not reach the server. Is the backend running at ' + API_BASE + '?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data.data;
}

/** Multipart upload (rider documents), authenticated with the rider token. */
async function riderApiUpload(path, formData) {
  const token = getRiderToken();
  if (!token) throw new Error('You need to be logged in as a rider for this.');
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  } catch (networkErr) {
    throw new Error('Could not reach the server. Is the backend running at ' + API_BASE + '?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data.data;
}

// ---- rider-register.html ----
const riderTabLogin = document.getElementById('riderTabLogin');
const riderTabSignup = document.getElementById('riderTabSignup');
const riderLoginForm = document.getElementById('riderLoginForm');
const riderSignupForm = document.getElementById('riderSignupForm');
const riderOtpForm = document.getElementById('riderOtpForm');

if (riderTabLogin && riderTabSignup && riderLoginForm && riderSignupForm) {
  function showRiderAuthTab(tab) {
    const isLogin = tab === 'login';
    riderTabLogin.classList.toggle('active', isLogin);
    riderTabSignup.classList.toggle('active', !isLogin);
    riderLoginForm.classList.toggle('active', isLogin);
    riderSignupForm.classList.toggle('active', !isLogin);
    riderOtpForm.style.display = 'none';
  }
  riderTabLogin.addEventListener('click', () => showRiderAuthTab('login'));
  riderTabSignup.addEventListener('click', () => showRiderAuthTab('signup'));

  let pendingRiderPhone = null;

  riderLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('riderLoginError');
    hideError(errEl);
    if (!riderLoginForm.checkValidity()) { riderLoginForm.reportValidity(); return; }

    const phone = document.getElementById('riderLoginPhone').value.trim();
    const password = document.getElementById('riderLoginPassword').value;

    try {
      const data = await riderApi('/auth/rider/login', { method: 'POST', body: { phone, password } });
      setRiderSession(data.token, data.rider);
      window.location.href = 'rider-dashboard.html';
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  riderSignupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('riderSignupError');
    hideError(errEl);
    if (!riderSignupForm.checkValidity()) { riderSignupForm.reportValidity(); return; }

    const fullName = document.getElementById('riderSuName').value.trim();
    const phone = document.getElementById('riderSuPhone').value.trim();
    const password = document.getElementById('riderSuPassword').value;

    try {
      await riderApi('/auth/rider/signup', { method: 'POST', body: { fullName, phone, password } });
      pendingRiderPhone = phone;
      riderSignupForm.classList.remove('active');
      riderOtpForm.style.display = 'grid';
      riderOtpForm.classList.add('active');
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  riderOtpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('riderOtpError');
    hideError(errEl);
    const code = document.getElementById('riderOtpCode').value.trim();

    try {
      const data = await riderApi('/auth/rider/verify-otp', { method: 'POST', body: { phone: pendingRiderPhone, code } });
      setRiderSession(data.token, data.rider);
      window.location.href = 'rider-documents.html';
    } catch (err) {
      showError(errEl, err.message);
    }
  });

  // ---- Rider forgot password ----
  const riderShowForgotPassword = document.getElementById('riderShowForgotPassword');
  const riderForgotForm = document.getElementById('riderForgotForm');
  const riderResetForm2 = document.getElementById('riderResetForm2');
  const riderBackToLoginFromForgot = document.getElementById('riderBackToLoginFromForgot');
  let pendingRiderResetPhone = null;

  if (riderShowForgotPassword) {
    riderShowForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      riderLoginForm.classList.remove('active');
      riderForgotForm.style.display = 'grid';
      riderForgotForm.classList.add('active');
    });

    riderBackToLoginFromForgot.addEventListener('click', (e) => {
      e.preventDefault();
      riderForgotForm.style.display = 'none';
      riderResetForm2.style.display = 'none';
      riderLoginForm.classList.add('active');
    });

    riderForgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('riderForgotError');
      hideError(errEl);
      const phone = document.getElementById('riderForgotPhone').value.trim();

      try {
        await riderApi('/auth/rider/forgot-password', { method: 'POST', body: { phone } });
        pendingRiderResetPhone = phone;
        riderForgotForm.style.display = 'none';
        riderForgotForm.classList.remove('active');
        riderResetForm2.style.display = 'grid';
        riderResetForm2.classList.add('active');
      } catch (err) {
        showError(errEl, err.message);
      }
    });

    riderResetForm2.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('riderResetError');
      hideError(errEl);
      const code = document.getElementById('riderResetCode').value.trim();
      const newPassword = document.getElementById('riderResetNewPassword').value;

      try {
        await riderApi('/auth/rider/reset-password', { method: 'POST', body: { phone: pendingRiderResetPhone, code, newPassword } });
        riderResetForm2.style.display = 'none';
        riderResetForm2.classList.remove('active');
        riderLoginForm.classList.add('active');
        document.getElementById('riderLoginPhone').value = pendingRiderResetPhone;
        alert('Password reset! Log in with your new password.');
      } catch (err) {
        showError(errEl, err.message);
      }
    });
  }
}

// ---- rider-documents.html ----
const riderLockedCard = document.getElementById('riderLockedCard');
const riderDocsShell = document.getElementById('riderDocsShell');

if (riderLockedCard && riderDocsShell) {
  (async function initRiderDocs() {
    const token = getRiderToken();
    if (!token) {
      riderLockedCard.style.display = 'block';
      riderDocsShell.style.display = 'none';
      return;
    }

    try {
      const data = await riderApi('/auth/rider/me', { auth: true });
      riderLockedCard.style.display = 'none';
      riderDocsShell.style.display = 'block';

      const rider = data.rider;
      const heading = document.getElementById('statusHeading');
      const message = document.getElementById('statusMessage');
      const submitBtn = document.getElementById('docsSubmitBtn');
      const docsForm = document.getElementById('riderDocsForm');
      const alreadySubmitted = !!rider.documents?.passportPhotoUrl;

      if (rider.verificationStatus === 'approved') {
        heading.textContent = "You're approved! 🎉";
        message.textContent = 'Taking you to your dashboard...';
        window.location.href = 'rider-dashboard.html';
        return;
      } else if (rider.verificationStatus === 'rejected') {
        heading.textContent = 'Documents not approved';
        message.textContent = rider.verificationNote || 'Please check your details and resubmit below.';
        submitBtn.textContent = 'Resubmit for review';
      } else if (rider.verificationStatus === 'suspended') {
        heading.textContent = 'Account suspended';
        message.textContent = rider.suspensionReason || 'Contact support for help.';
        docsForm.style.display = 'none';
      } else if (alreadySubmitted) {
        // Pending, and they've already sent something in - don't show the form
        // again, just tell them what's happening.
        heading.textContent = 'Your documents are being reviewed';
        message.textContent = "We've got everything we need - an admin is checking it over. This usually doesn't take long.";
        docsForm.style.display = 'none';
      } else {
        heading.textContent = 'Tell us about you and your bike';
        message.textContent = 'Fill this in so an admin can verify you and get you approved.';
      }

      if (rider.homeAddress) document.getElementById('homeAddress').value = rider.homeAddress;
      if (rider.documents?.plateNumber) document.getElementById('plateNumber').value = rider.documents.plateNumber;
    } catch (err) {
      clearRiderSession();
      riderLockedCard.style.display = 'block';
      riderDocsShell.style.display = 'none';
    }
  })();

  // ---- Live camera capture (replaces plain file pickers) ----
  const capturedPhotos = {}; // fieldName -> File

  document.querySelectorAll('.camera-capture').forEach((widget) => {
    const field = widget.dataset.field;
    const facing = widget.dataset.facing || 'environment';
    const video = widget.querySelector('.camera-video');
    const preview = widget.querySelector('.camera-preview');
    const canvas = widget.querySelector('canvas');
    const startBtn = widget.querySelector('.camera-start-btn');
    const captureBtn = widget.querySelector('.camera-capture-btn');
    const retakeBtn = widget.querySelector('.camera-retake-btn');
    let stream = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
        video.srcObject = stream;
        video.classList.add('active');
        preview.classList.remove('active');
        startBtn.style.display = 'none';
        captureBtn.style.display = 'inline-flex';
        retakeBtn.style.display = 'none';
      } catch (err) {
        alert("Couldn't access your camera. Please allow camera permission and try again.");
      }
    }

    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
    }

    function capturePhoto() {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        const file = new File([blob], `${field}.jpg`, { type: 'image/jpeg' });
        capturedPhotos[field] = file;
        preview.src = URL.createObjectURL(blob);
        preview.classList.add('active');
        video.classList.remove('active');
        stopCamera();
        captureBtn.style.display = 'none';
        retakeBtn.style.display = 'inline-flex';
      }, 'image/jpeg', 0.9);
    }

    startBtn.addEventListener('click', startCamera);
    captureBtn.addEventListener('click', capturePhoto);
    retakeBtn.addEventListener('click', () => {
      delete capturedPhotos[field];
      preview.classList.remove('active');
      retakeBtn.style.display = 'none';
      startBtn.style.display = 'inline-flex';
      startCamera();
    });
  });

  const docsForm = document.getElementById('riderDocsForm');
  docsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('docsError');
    hideError(errEl);
    if (!docsForm.checkValidity()) { docsForm.reportValidity(); return; }

    if (!capturedPhotos.passportPhoto || !capturedPhotos.bikePhoto || !capturedPhotos.meansOfId) {
      showError(errEl, 'Please capture all three photos using the camera before submitting.');
      return;
    }

    const formData = new FormData();
    formData.append('homeAddress', document.getElementById('homeAddress').value.trim());
    formData.append('plateNumber', document.getElementById('plateNumber').value.trim());
    formData.append('meansOfIdType', document.getElementById('meansOfIdType').value);
    formData.append('passportPhoto', capturedPhotos.passportPhoto);
    formData.append('bikePhoto', capturedPhotos.bikePhoto);
    formData.append('meansOfId', capturedPhotos.meansOfId);

    try {
      await riderApiUpload('/auth/rider/documents', formData);
      docsForm.style.display = 'none';
      document.getElementById('statusHeading').textContent = 'Your documents are being reviewed';
      document.getElementById('statusMessage').textContent = "We've got everything we need - an admin is checking it over. This usually doesn't take long.";
      document.getElementById('docsSuccess').classList.add('show');
    } catch (err) {
      showError(errEl, err.message);
    }
  });
}

// ---- rider-dashboard.html ----
const riderMainDashboard = document.getElementById('riderMainDashboard');
const riderNotApproved = document.getElementById('riderNotApproved');

if (riderMainDashboard && riderNotApproved) {
  let offerPollTimer = null;
  let tripPollTimer = null;
  let riderChatPollTimer = null;
  let gpsPingTimer = null;

  (async function initRiderDashboard() {
    const token = getRiderToken();
    if (!token) { window.location.href = 'rider-register.html'; return; }

    try {
      const data = await riderApi('/auth/rider/me', { auth: true });
      const rider = data.rider;
      document.getElementById('riderGreeting').textContent = `Welcome, ${rider.fullName.split(' ')[0]}`;

      if (rider.verificationStatus !== 'approved') {
        riderNotApproved.style.display = 'block';
        riderMainDashboard.style.display = 'none';
        document.getElementById('notApprovedHeading').textContent =
          rider.verificationStatus === 'rejected' ? 'Documents rejected' :
          rider.verificationStatus === 'suspended' ? 'Account suspended' : 'Still under review';
        document.getElementById('notApprovedMessage').textContent =
          rider.verificationNote || rider.suspensionReason || 'Your documents are still being reviewed by an admin.';
        return;
      }

      riderNotApproved.style.display = 'none';
      riderMainDashboard.style.display = 'block';

      const currentRadio = document.querySelector(`input[name="availability"][value="${rider.availability}"]`);
      if (currentRadio) currentRadio.checked = true;
      if (rider.availability === 'online') startIdleLocationUpdates();

      refreshWallet();
      refreshOffers();
      refreshActiveTrip();
      offerPollTimer = setInterval(refreshOffers, 6000);
      tripPollTimer = setInterval(refreshActiveTrip, 8000);
    } catch (err) {
      clearRiderSession();
      window.location.href = 'rider-register.html';
    }
  })();

  // ---- Jobs / Wallet tabs ----
  const riderTabJobs = document.getElementById('riderTabJobs');
  const riderTabWallet = document.getElementById('riderTabWallet');
  const riderPanelJobs = document.getElementById('riderPanelJobs');
  const riderPanelWallet = document.getElementById('riderPanelWallet');
  if (riderTabJobs && riderTabWallet) {
    riderTabJobs.addEventListener('click', () => {
      riderTabJobs.classList.add('active'); riderTabWallet.classList.remove('active');
      riderPanelJobs.classList.add('active'); riderPanelWallet.classList.remove('active');
    });
    riderTabWallet.addEventListener('click', () => {
      riderTabWallet.classList.add('active'); riderTabJobs.classList.remove('active');
      riderPanelWallet.classList.add('active'); riderPanelJobs.classList.remove('active');
      refreshWallet();
    });
  }

  // ---- Manual location override (useful for testing, or when GPS is off) ----
  attachLocationSearch('manualLocation', 'manualLocationSuggestions');

  const setManualLocationBtn = document.getElementById('setManualLocationBtn');
  if (setManualLocationBtn) {
    setManualLocationBtn.addEventListener('click', async () => {
      const loc = selectedLocations['manualLocation'];
      if (!loc) { alert('Search for your location and pick a suggestion first.'); return; }

      const [lng, lat] = loc.coords;
      const currentStatus = document.querySelector('input[name="availability"]:checked')?.value || 'online';

      try {
        await riderApi('/auth/rider/availability', { method: 'PATCH', auth: true, body: { status: currentStatus, lng, lat } });
        const msg = document.getElementById('locationSetMessage');
        msg.textContent = 'Location updated!';
        msg.style.display = 'inline';
        setTimeout(() => { msg.style.display = 'none'; }, 3000);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ---- Continuous background location updates while online ----
  // Previously the rider's currentLocation (used for matching nearby jobs)
  // was only set once, the moment they flipped to "online" - so if they
  // then drove around for 20 minutes waiting for a job, the system kept
  // matching against their old, stale position. This keeps it fresh.
  let idleLocationTimer = null;
  function startIdleLocationUpdates() {
    if (idleLocationTimer || !navigator.geolocation) return;
    idleLocationTimer = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          riderApi('/auth/rider/availability', {
            method: 'PATCH',
            auth: true,
            body: { status: 'online', lng: pos.coords.longitude, lat: pos.coords.latitude },
          }).catch(() => {});
        },
        () => {}
      );
    }, 30000);
  }
  function stopIdleLocationUpdates() {
    if (idleLocationTimer) {
      clearInterval(idleLocationTimer);
      idleLocationTimer = null;
    }
  }

  document.querySelectorAll('input[name="availability"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (radio.value === 'online' && navigator.geolocation) {
        // Riders only get matched to nearby bookings if the system knows
        // where they actually are - grab that the moment they go online.
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await riderApi('/auth/rider/availability', {
                method: 'PATCH',
                auth: true,
                body: { status: 'online', lng: pos.coords.longitude, lat: pos.coords.latitude },
              });
              startIdleLocationUpdates();
            } catch (err) {
              alert(err.message);
            }
          },
          async () => {
            // Permission denied or unavailable - still let them go online,
            // just without an updated location (they may not get matched
            // until they share it, e.g. from an active trip's Navigate button).
            try {
              await riderApi('/auth/rider/availability', { method: 'PATCH', auth: true, body: { status: 'online' } });
              alert("You're online, but we couldn't get your location - allow location access so nearby jobs can find you.");
            } catch (err) {
              alert(err.message);
            }
          }
        );
        return;
      }

      stopIdleLocationUpdates();
      try {
        await riderApi('/auth/rider/availability', { method: 'PATCH', auth: true, body: { status: radio.value } });
      } catch (err) {
        alert(err.message);
      }
    });
  });

  async function refreshWallet() {
    try {
      const wallet = await riderApi('/wallet/me', { auth: true });
      document.getElementById('riderWalletBalance').textContent = `₦${wallet.wallet.availableBalance.toLocaleString()}`;
      document.getElementById('totalEarnings').textContent = `₦${wallet.wallet.totalEarnings.toLocaleString()}`;
      document.getElementById('totalBonuses').textContent = `₦${wallet.wallet.totalBonuses.toLocaleString()}`;

      const summary = await riderApi('/wallet/me/summary', { auth: true });
      document.getElementById('dailyEarnings').textContent = `₦${summary.dailyEarnings.toLocaleString()}`;
      document.getElementById('weeklyEarnings').textContent = `₦${summary.weeklyEarnings.toLocaleString()}`;
    } catch (err) { /* silent - wallet just won't update this cycle */ }
  }

  async function refreshOffers() {
    const list = document.getElementById('offersList');
    try {
      const data = await riderApi('/bookings/offers/mine', { auth: true });
      if (!data.offers.length) {
        list.innerHTML = 'No job offers right now - stay online and they\'ll show up here.';
        return;
      }
      list.innerHTML = '';
      data.offers.forEach((offer) => {
        const b = offer.booking;
        const card = document.createElement('div');
        card.className = 'book-shell narrow';
        card.style.cssText = 'padding:18px;margin-bottom:14px;';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
            <div>
              <b>${b.pickup.address}</b> <span style="color:var(--muted);">→</span> <b>${b.destination.address}</b>
              <div style="color:var(--muted);font-size:13px;margin-top:4px;">${b.serviceType.replace(/_/g, ' ')} · ${b.deliveryType} · ${offer.distanceToPickupKm}km to pickup</div>
            </div>
            <div style="text-align:right;">
              <div style="color:var(--orange);font-weight:800;font-size:18px;">₦${b.fare.total.toLocaleString()}</div>
              <div style="color:var(--muted);font-size:12px;">${b.fare.estimatedMinutes} min trip</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary offer-accept" data-id="${offer._id}" style="flex:1;">Accept</button>
            <button class="btn btn-ghost offer-decline" data-id="${offer._id}" style="flex:1;">Decline</button>
          </div>
        `;
        list.appendChild(card);
      });

      list.querySelectorAll('.offer-accept').forEach((btn) => {
        btn.addEventListener('click', () => respondToOffer(btn.dataset.id, 'accept'));
      });
      list.querySelectorAll('.offer-decline').forEach((btn) => {
        btn.addEventListener('click', () => respondToOffer(btn.dataset.id, 'decline'));
      });
    } catch (err) {
      list.textContent = 'Could not load offers right now.';
    }
  }

  async function respondToOffer(matchRequestId, action) {
    try {
      await riderApi('/bookings/x/respond', { method: 'POST', auth: true, body: { matchRequestId, action } });
      refreshOffers();
      refreshActiveTrip();
      refreshWallet();
    } catch (err) {
      alert(err.message);
      refreshOffers(); // clear the stale/taken offer card even though this attempt failed
    }
  }

  const TRIP_STEPS = ['rider_arrived_pickup', 'picked_up', 'in_transit', 'arrived_destination', 'delivered'];
  const TRIP_LABELS = {
    rider_arrived_pickup: "I've arrived at pickup",
    picked_up: "I've picked it up",
    in_transit: "I'm on the way",
    arrived_destination: "I've arrived at destination",
    delivered: 'Mark as delivered',
  };

  // Background GPS pinging while a trip is active, so the customer's live
  // map (see the TRACK RIDER PAGE section) actually gets periodic updates
  // instead of only whenever the rider happens to tap "Navigate".
  function startGpsPinging(bookingId) {
    if (gpsPingTimer) return; // already running
    const ping = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          riderApi('/tracking/ping', {
            method: 'POST',
            auth: true,
            body: { lng: pos.coords.longitude, lat: pos.coords.latitude, bookingId },
          }).catch(() => {});
        },
        () => {}
      );
    };
    ping();
    gpsPingTimer = setInterval(ping, 15000);
  }

  function stopGpsPinging() {
    if (gpsPingTimer) {
      clearInterval(gpsPingTimer);
      gpsPingTimer = null;
    }
  }

  async function refreshActiveTrip() {
    const box = document.getElementById('activeTrip');
    try {
      const data = await riderApi('/bookings', { auth: true });
      const active = data.bookings.find((b) => !['delivered', 'cancelled_by_customer', 'cancelled_by_rider', 'no_riders_available', 'failed'].includes(b.status) && b.rider);

      if (!active) {
        box.innerHTML = 'No active trip right now.';
        stopGpsPinging();
        return;
      }

      const currentIdx = TRIP_STEPS.indexOf(active.status);
      const nextStep = currentIdx === -1 ? TRIP_STEPS[0] : TRIP_STEPS[currentIdx + 1];

      // card/bank_transfer/wallet must be paid before the rider can proceed
      // past acceptance. Cash is exempt.
      const paymentPending = active.paymentMethod !== 'cash' && active.paymentStatus !== 'paid';

      if (!paymentPending) startGpsPinging(active._id);
      else stopGpsPinging();

      box.innerHTML = `
        <div style="margin-bottom:14px;">
          <b>${active.pickup.address}</b> <span style="color:var(--muted);">→</span> <b>${active.destination.address}</b>
          <div style="color:var(--muted);font-size:13px;margin-top:4px;">Status: ${active.status.replace(/_/g, ' ')}</div>
          ${active.receiverName ? `<div style="color:var(--muted);font-size:13px;">Receiver: ${active.receiverName} (${active.receiverPhone})</div>` : ''}
          ${active.riderNotes ? `<div style="color:var(--muted);font-size:13px;">Notes: ${active.riderNotes}</div>` : ''}
          ${paymentPending ? `<div style="color:var(--orange);font-size:13px;margin-top:8px;font-weight:700;">⏳ Waiting on customer payment before you can head to pickup. Chat with them below.</div>` : ''}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost" id="chatWithCustomerBtn" data-id="${active._id}">Chat with Customer</button>
          <button class="btn btn-ghost" id="navigateBtn">Navigate</button>
          ${nextStep && !paymentPending ? `<button class="btn btn-primary" id="nextStepBtn" data-status="${nextStep}" data-id="${active._id}">${TRIP_LABELS[nextStep]}</button>` : ''}
        </div>
      `;

      const chatBtn = document.getElementById('chatWithCustomerBtn');
      if (chatBtn) {
        chatBtn.addEventListener('click', () => {
          document.getElementById('riderChatBookingId').value = chatBtn.dataset.id;
          document.getElementById('riderChatModal').classList.add('show');
          loadRiderChatMessages(chatBtn.dataset.id);
          if (riderChatPollTimer) clearInterval(riderChatPollTimer);
          riderChatPollTimer = setInterval(() => loadRiderChatMessages(chatBtn.dataset.id), 4000);
        });
      }

      const navBtn = document.getElementById('navigateBtn');
      if (navBtn) {
        navBtn.addEventListener('click', () => {
          const destCoords = currentIdx >= 1 ? active.destination.location.coordinates : active.pickup.location.coordinates;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              riderApi('/tracking/ping', { method: 'POST', auth: true, body: { lng: longitude, lat: latitude, bookingId: active._id } }).catch(() => {});
              window.open(`https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destCoords[1]},${destCoords[0]}&travelmode=driving`, '_blank');
            },
            () => {
              window.open(`https://www.google.com/maps/dir/?api=1&destination=${destCoords[1]},${destCoords[0]}&travelmode=driving`, '_blank');
            }
          );
        });
      }

      const nextBtn = document.getElementById('nextStepBtn');
      if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
          const body = { status: nextBtn.dataset.status };

          if (nextBtn.dataset.status === 'delivered') {
            const code = prompt("Ask the customer for their 4-digit delivery code to confirm this:");
            if (!code) return; // they cancelled the prompt
            body.confirmationCode = code.trim();
          }

          try {
            await riderApi(`/bookings/${nextBtn.dataset.id}/status`, { method: 'PATCH', auth: true, body });
            refreshActiveTrip();
            refreshWallet();
          } catch (err) {
            alert(err.message);
          }
        });
      }
    } catch (err) {
      box.textContent = 'Could not load your active trip right now.';
    }
  }

  // ---- Chat modal (rider side) ----
  async function loadRiderChatMessages(bookingId) {
    try {
      const data = await riderApi(`/bookings/${bookingId}/messages`, { auth: true });
      const log = document.getElementById('riderChatLog');
      log.innerHTML = data.messages
        .map((m) => {
          const mine = m.senderType === 'rider';
          const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `<div class="chat-bubble ${mine ? 'mine' : 'theirs'}">${m.text}<span class="chat-time">${time}</span></div>`;
        })
        .join('');
      log.scrollTop = log.scrollHeight;
    } catch (err) {
      // silent - next poll retries
    }
  }

  const riderChatForm = document.getElementById('riderChatForm');
  if (riderChatForm) {
    riderChatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('riderChatInput');
      const text = input.value.trim();
      if (!text) return;
      const bookingId = document.getElementById('riderChatBookingId').value;

      try {
        await riderApi(`/bookings/${bookingId}/messages`, { method: 'POST', auth: true, body: { text } });
        input.value = '';
        loadRiderChatMessages(bookingId);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const riderLogoutBtn = document.getElementById('riderLogoutBtn');
  if (riderLogoutBtn) {
    riderLogoutBtn.addEventListener('click', () => {
      clearRiderSession();
      clearInterval(offerPollTimer);
      clearInterval(tripPollTimer);
      clearInterval(riderChatPollTimer);
      stopGpsPinging();
      stopIdleLocationUpdates();
      window.location.href = 'index.html';
    });
  }

  // ---- Notification bell (rider side) ----
  (function initRiderNotifications() {
    const bellBtn = document.getElementById('notifBellBtn');
    const dropdown = document.getElementById('notifDropdown');
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    const markAllBtn = document.getElementById('notifMarkAllRead');
    if (!bellBtn) return;

    function timeAgo(dateStr) {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }

    async function refreshNotifications() {
      try {
        const data = await riderApi('/notifications', { auth: true });
        if (data.unreadCount > 0) {
          badge.textContent = data.unreadCount > 9 ? '9+' : data.unreadCount;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }

        if (!data.notifications.length) {
          list.innerHTML = '<div style="padding:20px 14px;color:var(--muted);font-size:13px;text-align:center;">No notifications yet.</div>';
          return;
        }

        list.innerHTML = data.notifications
          .map((n) => `
            <div class="notif-item" data-id="${n._id}" style="padding:10px 12px;border-radius:8px;cursor:pointer;${n.read ? '' : 'background:rgba(225,90,43,0.08);'}">
              <div style="display:flex;justify-content:space-between;gap:8px;">
                <b style="font-size:13px;">${n.title}</b>
                ${n.read ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:var(--orange);flex-shrink:0;margin-top:4px;"></span>'}
              </div>
              <div style="color:var(--muted);font-size:12.5px;margin-top:2px;">${n.message}</div>
              <div style="color:var(--muted);font-size:11px;margin-top:4px;opacity:0.7;">${timeAgo(n.createdAt)}</div>
            </div>
          `)
          .join('');
      } catch (err) {
        // silent - next poll retries
      }
    }

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display === 'block';
      dropdown.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) refreshNotifications();
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== bellBtn) {
        dropdown.style.display = 'none';
      }
    });

    list.addEventListener('click', async (e) => {
      const item = e.target.closest('.notif-item');
      if (!item) return;
      try {
        await riderApi(`/notifications/${item.dataset.id}/read`, { method: 'PATCH', auth: true });
        refreshNotifications();
      } catch (err) { /* silent */ }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        try {
          await riderApi('/notifications/read-all', { method: 'PATCH', auth: true });
          refreshNotifications();
        } catch (err) { /* silent */ }
      });
    }

    refreshNotifications();
    setInterval(refreshNotifications, 10000);
  })();

  // Rider withdraw modal
  const openRiderWithdraw = document.getElementById('openRiderWithdraw');
  if (openRiderWithdraw) {
    openRiderWithdraw.addEventListener('click', () => document.getElementById('riderWithdrawModal').classList.add('show'));

    const riderWithdrawForm = document.getElementById('riderWithdrawForm');
    riderWithdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('rwError');
      hideError(errEl);
      const amount = Number(document.getElementById('rwAmount').value);
      const bankCode = document.getElementById('rwBankCode').value.trim();
      const accountNumber = document.getElementById('rwAccount').value.trim();

      try {
        await riderApi('/wallet/rider/withdraw', { method: 'POST', auth: true, body: { amount, bankCode, accountNumber } });
        const result = document.getElementById('rwResult');
        result.textContent = 'Withdrawal initiated - it should reach your bank account shortly.';
        result.classList.add('show');
        riderWithdrawForm.reset();
        refreshWallet();
      } catch (err) {
        showError(errEl, err.message);
      }
    });
  }
}

// Generic rider-logout button on pages that only need the button (e.g. rider-dashboard nav already handled above)
document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', () => document.getElementById(btn.dataset.closeModal)?.classList.remove('show'));
});
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('show'); });
});

// =========================================================
// AI ASSISTANT WIDGET (floats on every page)
// =========================================================
(function initAiWidget() {
  const btn = document.createElement('button');
  btn.id = 'aiWidgetBtn';
  btn.setAttribute('aria-label', 'Chat with the help assistant');
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 12C21 16.4 16.9 20 12 20C10.6 20 9.3 19.7 8.1 19.2L3 20L4.5 15.7C3.6 14.6 3 13.4 3 12C3 7.6 7.1 4 12 4C16.9 4 21 7.6 21 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  const panel = document.createElement('div');
  panel.id = 'aiWidgetPanel';
  panel.innerHTML = `
    <div id="aiWidgetHeader">
      <b>MustyRide Help</b>
      <button id="aiWidgetClose" aria-label="Close">&times;</button>
    </div>
    <div id="aiWidgetLog"></div>
    <form id="aiWidgetForm">
      <input type="text" id="aiWidgetInput" placeholder="Ask a question..." autocomplete="off">
      <button type="submit" class="btn btn-primary" style="padding:10px 16px;">Send</button>
    </form>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const log = panel.querySelector('#aiWidgetLog');
  const form = panel.querySelector('#aiWidgetForm');
  const input = panel.querySelector('#aiWidgetInput');
  let history = [];
  let greeted = false;

  function addBubble(text, mine) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (mine ? 'mine' : 'theirs');
    bubble.style.alignSelf = mine ? 'flex-end' : 'flex-start';
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  }

  btn.addEventListener('click', () => {
    panel.classList.toggle('show');
    if (!greeted && panel.classList.contains('show')) {
      addBubble("Hi! I'm here to help with bookings, wallet, delivery codes, or anything else on MustyRide. What's up?", false);
      greeted = true;
    }
  });
  panel.querySelector('#aiWidgetClose').addEventListener('click', () => panel.classList.remove('show'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    addBubble(message, true);
    input.value = '';

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      const reply = data.data?.reply || "Sorry, I couldn't process that.";
      addBubble(reply, false);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
      if (history.length > 10) history = history.slice(-10); // keep it light
    } catch (err) {
      addBubble('Could not reach the assistant right now.', false);
    }
  });
})();

// =========================================================
// LIGHT / DARK THEME TOGGLE (persists across visits)
// =========================================================
(function initThemeToggle() {
  const THEME_KEY = 'mustyride_theme';
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  const navCta = document.querySelector('.nav-cta');
  if (!navCta) return;

  const btn = document.createElement('button');
  btn.id = 'themeToggleBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Toggle light/dark theme');

  function renderIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark
      ? '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><path d="M12 2V4M12 20V22M4 12H2M22 12H20M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none"><path d="M21 12.8C19.8 13.6 18.4 14 17 14C12.6 14 9 10.4 9 6C9 4.6 9.4 3.2 10.2 2C6.3 2.8 3 6.3 3 10.5C3 15.7 7.3 20 12.5 20C16.7 20 20.2 16.7 21 12.8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  }
  renderIcon();

  btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(THEME_KEY, 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(THEME_KEY, 'dark');
    }
    renderIcon();
  });

  navCta.insertBefore(btn, navCta.firstChild);
})();
