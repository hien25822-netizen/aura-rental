/**
 * ============================================================
 * AURA RENTAL — Supabase Integration Layer
 * ============================================================
 *
 * This file integrates Supabase with the existing app.js.
 * It provides:
 * - Auth UI (login modal)
 * - Data sync from Supabase
 * - Offline fallback to localStorage
 * - Realtime subscriptions
 *
 * HOW IT WORKS:
 * 1. On load, check if Supabase is configured (via APP_CONFIG)
 * 2. If configured: try auth → load from Supabase → enable realtime
 * 3. If not configured or offline: use localStorage (backward compatible)
 * 4. All saves go to both localStorage AND Supabase (when online)
 *
 * Usage:
 *   1. Set window.APP_CONFIG with Supabase credentials
 *   2. Include this file AFTER app.js
 *   3. The app will automatically use Supabase if configured
 */

// ============================================================
// CONFIG CHECK
// ============================================================

const IS_DEMO_MODE = !window.APP_CONFIG?.supabaseUrl;

// ============================================================
// AUTH UI
// ============================================================

function showLoginModal() {
  const html = `
    <div class="sheet-head">
      <h2 style="font-family:var(--font-display);font-style:italic">🔐 Đăng nhập</h2>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="sheet-body" style="padding:24px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:48px;margin-bottom:12px">👗</div>
        <h3 style="font-family:var(--font-display);font-size:20px;margin:0">Aura Rental</h3>
        <p class="muted" style="font-size:13px;margin:8px 0 0">Quản lý thuê váy chuyên nghiệp</p>
      </div>
      <form id="supabase-login-form" onsubmit="handleSupabaseLogin(event)">
        <div class="form-group">
          <label>Email <span class="req">*</span></label>
          <input type="email" name="email" required placeholder="phuong@aura.vn"
                 style="width:100%;padding:14px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:15px" />
        </div>
        <div class="form-group">
          <label>Mật khẩu <span class="req">*</span></label>
          <input type="password" name="password" required placeholder="••••••••"
                 style="width:100%;padding:14px 16px;border:1.5px solid var(--border);border-radius:10px;font-size:15px" />
        </div>
        <button type="submit" class="btn primary" style="width:100%;padding:14px;font-size:15px;font-weight:700">
          Đăng nhập
        </button>
        <p class="muted" style="text-align:center;margin-top:16px;font-size:13px">
          Chưa có tài khoản? Liên hệ Phuong để được tạo.
        </p>
      </form>
    </div>
  `;
  $('#cf-body').innerHTML = html;
  openModal('m-confirm');
}

window.handleSupabaseLogin = async function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Đang đăng nhập...';

  try {
    await SupabaseService.signIn(fd.get('email'), fd.get('password'));
    closeModal('m-confirm');
    toast('Đăng nhập thành công!', 'success');
    await loadFromSupabase();
    setupRealtime();
    renderCurrentView();
  } catch (err) {
    toast('Đăng nhập thất bại: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

function showLogoutConfirm() {
  const html = `
    <div class="sheet-head">
      <h2 style="font-family:var(--font-display);font-style:italic">Đăng xuất</h2>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="sheet-body" style="padding:24px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">👋</div>
      <p>Bạn có chắc muốn đăng xuất?</p>
      <div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn ghost" style="flex:1" onclick="closeModal('m-confirm')">Hủy</button>
        <button class="btn danger" style="flex:1" onclick="handleSupabaseLogout()">Đăng xuất</button>
      </div>
    </div>
  `;
  $('#cf-body').innerHTML = html;
  openModal('m-confirm');
}

window.handleSupabaseLogout = async function() {
  try {
    await SupabaseService.signOut();
    closeModal('m-confirm');
    toast('Đã đăng xuất', 'success');
    showLoginModal();
  } catch (err) {
    toast('Lỗi đăng xuất: ' + err.message, 'error');
  }
};

// ============================================================
// DATA LOADING
// ============================================================

async function loadFromSupabase() {
  if (!SupabaseService.isConfigured()) {
    console.log('Supabase not configured - using localStorage');
    return;
  }

  try {
    toast('Đang tải dữ liệu...', '', 2000);

    const [dresses, accessories, orders, payments] = await Promise.all([
      SupabaseService.fetchDresses(),
      SupabaseService.fetchAccessories(),
      SupabaseService.fetchOrders(),
      SupabaseService.fetchPayments()
    ]);

    // Build maps from Supabase data
    const supDresses = {};
    (dresses || []).forEach(v => { if (v._dbId) supDresses[v._dbId] = v; });
    const supAccessories = {};
    (accessories || []).forEach(p => { if (p._dbId) supAccessories[p._dbId] = p; });
    const supOrders = {};
    (orders || []).forEach(o => { if (o._dbId) supOrders[o._dbId] = o; });

    // Merge: Keep local data, update from Supabase if Supabase has newer data
    // Prefer Supabase for records that exist in both (it's the source of truth)
    const mergedDresses = [];
    const localDressIds = new Set((db.vay || []).map(v => v._dbId));
    const supDressIds = new Set(Object.keys(supDresses));

    // Add all Supabase dresses
    (dresses || []).forEach(v => mergedDresses.push(v));

    // Add local-only dresses (not in Supabase yet)
    (db.vay || []).forEach(v => {
      if (!v._dbId || !supDresses[v._dbId]) {
        mergedDresses.push(v);
      }
    });

    const mergedAccessories = [];
    (accessories || []).forEach(p => mergedAccessories.push(p));
    (db.pk || []).forEach(p => {
      if (!p._dbId || !supAccessories[p._dbId]) {
        mergedAccessories.push(p);
      }
    });

    const mergedOrders = [];
    (orders || []).forEach(o => mergedOrders.push(o));
    (db.don || []).forEach(o => {
      if (!o._dbId || !supOrders[o._dbId]) {
        mergedOrders.push(o);
      }
    });

    db.vay = mergedDresses;
    db.pk = mergedAccessories;
    db.don = mergedOrders;
    db.tt = payments || [];

    // Save merged data to localStorage
    localStorage.setItem(STORE, JSON.stringify(db));

    toast('Đã tải dữ liệu từ Supabase', 'success');
    console.log('Loaded:', {
      dresses: db.vay.length,
      accessories: db.pk.length,
      orders: db.don.length,
      payments: db.tt.length
    });
  } catch (err) {
    console.error('Load from Supabase failed:', err);
    toast('Lỗi tải dữ liệu: ' + err.message, 'error');
    // Fallback to localStorage
    loadFromLocalStorage();
  }
}

function loadFromLocalStorage() {
  const stored = localStorage.getItem(STORE);
  if (stored) {
    try {
      db = JSON.parse(stored);
      // Ensure all arrays exist
      if (!db.don) db.don = [];
      if (!db.vay) db.vay = [];
      if (!db.pk) db.pk = [];
      if (!db.tt) db.tt = [];
      if (!db.dhv) db.dhv = [];
      if (!db.form) db.form = [];
    } catch (e) {
      console.error('Failed to parse localStorage:', e);
    }
  }
}

// ============================================================
// REALTIME SUBSCRIPTIONS
// ============================================================

function setupRealtime() {
  if (!SupabaseService.isConfigured()) return;

  SupabaseService.unsubscribeAll();

  // Subscribe to dress changes
  SupabaseService.subscribeToChanges('dresses', payload => {
    handleRealtimeDressChange(payload);
  });

  // Subscribe to accessory changes
  SupabaseService.subscribeToChanges('accessories', payload => {
    handleRealtimeAccessoryChange(payload);
  });

  // Subscribe to order changes
  SupabaseService.subscribeToChanges('orders', payload => {
    handleRealtimeOrderChange(payload);
  });

  // Subscribe to payment changes
  SupabaseService.subscribeToChanges('payments', payload => {
    handleRealtimePaymentChange(payload);
  });

  // Subscribe to booking changes
  SupabaseService.subscribeToChanges('bookings', payload => {
    handleRealtimeBookingChange(payload);
  });

  // Poll for bookings every 30 seconds
  startBookingPolling();

  console.log('✅ Realtime subscriptions active');
}

async function handleRealtimeDressChange(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  if (eventType === 'INSERT') {
    const dress = SupabaseService.normalizeDress(newRecord);
    if (!db.vay.find(d => d._dbId === dress._dbId)) {
      db.vay.push(dress);
      if (curView === 'v-kho') renderKho();
    }
  } else if (eventType === 'UPDATE') {
    const idx = db.vay.findIndex(d => d._dbId === newRecord.id);
    if (idx >= 0) {
      db.vay[idx] = SupabaseService.normalizeDress(newRecord);
      if (curView === 'v-kho') renderKho();
    }
  } else if (eventType === 'DELETE') {
    db.vay = db.vay.filter(d => d._dbId !== oldRecord.id);
    if (curView === 'v-kho') renderKho();
  }

  localStorage.setItem(STORE, JSON.stringify(db));
}

async function handleRealtimeAccessoryChange(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  if (eventType === 'INSERT') {
    const acc = SupabaseService.normalizeAccessory(newRecord);
    if (!db.pk.find(p => p._dbId === acc._dbId)) {
      db.pk.push(acc);
      if (curView === 'v-pk') renderPk();
    }
  } else if (eventType === 'UPDATE') {
    const idx = db.pk.findIndex(p => p._dbId === newRecord.id);
    if (idx >= 0) {
      db.pk[idx] = SupabaseService.normalizeAccessory(newRecord);
      if (curView === 'v-pk') renderPk();
    }
  } else if (eventType === 'DELETE') {
    db.pk = db.pk.filter(p => p._dbId !== oldRecord.id);
    if (curView === 'v-pk') renderPk();
  }

  localStorage.setItem(STORE, JSON.stringify(db));
}

async function handleRealtimeOrderChange(payload) {
  // For orders, we reload all to get relations
  try {
    const orders = await SupabaseService.fetchOrders();
    db.don = orders || [];
    localStorage.setItem(STORE, JSON.stringify(db));

    if (['v-cal', 'v-orders', 'v-avail'].includes(curView)) {
      renderCurrentView();
    }
  } catch (err) {
    console.warn('Realtime order sync error:', err);
  }
}

async function handleRealtimePaymentChange(payload) {
  const payments = await SupabaseService.fetchPayments();
  db.tt = payments || [];
  localStorage.setItem(STORE, JSON.stringify(db));

  if (curView === 'v-soc') {
    renderSoc();
  }
}

async function handleRealtimeBookingChange(payload) {
  await syncBookingsToLocal();
}

async function syncBookingsToLocal() {
  if (!SupabaseService.isConfigured()) return;
  try {
    const bookings = await SupabaseService.fetchBookings();
    // Build dress map for name resolution
    const dressMap = {};
    (db.vay || []).forEach(v => { if (v._dbId) dressMap[v._dbId] = v; });
    const accMap = {};
    (db.pk || []).forEach(p => { if (p._dbId) accMap[p._dbId] = p; });

    const normalized = (bookings || []).map(b => {
      const nb = SupabaseService.normalizeBooking(b, dressMap, accMap);
      // Resolve dress IDs to dress objects with names
      nb.dhvs = (b._dressIds || []).map(dressId => {
        const dress = dressMap[dressId];
        return dress ? { vay: dress._dbId || dressId, Ten_Vay: dress.Ten_Vay || dress.ma || 'Váy', Size: dress.Size || '' } : { vay: dressId };
      });
      // Resolve accessory IDs to names
      nb.Ma_PK = (b._accIds || []).map(accId => {
        const acc = accMap[accId];
        return acc ? { Ma_PK: acc.Ma_PK || accId, Ten_PK: acc.Ten_PK || 'Phụ kiện' } : accId;
      });
      return nb;
    });

    // Merge into db.don - bookings have Ma_Don starting with 'B'
    const existingBookings = db.don.filter(d => d._fromBooking);
    const existingIds = new Set(existingBookings.map(b => b._dbId));
    const newBookings = normalized.filter(b => !existingIds.has(b._dbId));
    if (newBookings.length > 0) {
      db.don = [...db.don, ...newBookings];
      localStorage.setItem(STORE, JSON.stringify(db));
      if (['v-cal', 'v-orders', 'v-avail'].includes(curView)) {
        renderCurrentView();
      }
      toast(`📋 Có ${newBookings.length} đơn đặt thuê mới!`, 'success');
    }
  } catch (err) {
    console.warn('Booking sync error:', err);
  }
}

let bookingPollInterval = null;
function startBookingPolling() {
  if (bookingPollInterval) clearInterval(bookingPollInterval);
  bookingPollInterval = setInterval(() => {
    syncBookingsToLocal();
  }, 30000);
}

// ============================================================
// SUPABASE-AWARE SAVE FUNCTIONS
// Override existing save functions to sync with Supabase
// ============================================================

// Store original save function
const _origSave = window.save;

// Enhanced save that syncs to Supabase
window.saveToSupabase = async function() {
  if (!SupabaseService.isConfigured()) return;

  // Save to localStorage first (always)
  localStorage.setItem(STORE, JSON.stringify(db));

  // Then sync to Supabase
  try {
    // For now, we rely on realtime subscriptions
    // Manual sync would go here for specific records
    console.log('Saved to localStorage + Supabase realtime active');
  } catch (err) {
    console.warn('Supabase sync failed:', err);
  }
};

// ============================================================
// SUPABASE CRUD WRAPPERS
// These wrap the existing functions to also save to Supabase
// ============================================================

// Wrapper for createDress
const _origSaveNewItem = window.saveNewItem;
window.saveNewItem = async function(kind) {
  const result = await _origSaveNewItem(kind);

  if (result && SupabaseService.isConfigured()) {
    try {
      if (kind === 'vay') {
        const dress = db.vay.find(v => v.Ten_Vay === result.Ten_Vay);
        if (dress && !dress._dbId) {
          // This is a new local record - sync to Supabase
          const supabaseRecord = await SupabaseService.createDress(dress);
          dress._dbId = supabaseRecord._dbId;
          dress.id = supabaseRecord.id;
          localStorage.setItem(STORE, JSON.stringify(db));
        }
      } else if (kind === 'pk') {
        const acc = db.pk.find(p => p.Ten_PK === result.Ten_PK);
        if (acc && !acc._dbId) {
          const supabaseRecord = await SupabaseService.createAccessory(acc);
          acc._dbId = supabaseRecord._dbId;
          acc.id = supabaseRecord.id;
          localStorage.setItem(STORE, JSON.stringify(db));
        }
      }
    } catch (err) {
      console.warn('Failed to sync new item to Supabase:', err);
    }
  }

  return result;
};

// Wrapper for saveNewOrder
const _origSaveNewOrder = window.saveNewOrder;
window.saveNewOrder = async function() {
  const result = await _origSaveNewOrder();

  if (result && SupabaseService.isConfigured()) {
    try {
      const order = db.don[0]; // Most recent
      if (order && !order._dbId) {
        const supabaseOrder = await SupabaseService.createOrder(order);
        order._dbId = supabaseOrder._dbId;
        order.id = supabaseOrder.id;

        // Update dress rental counts
        if (order.dhvs) {
          for (const dhv of order.dhvs) {
            if (dhv.vay) {
              await SupabaseService.incrementDressRentalCount(dhv.vay);
            }
          }
        }

        localStorage.setItem(STORE, JSON.stringify(db));
      }
    } catch (err) {
      console.warn('Failed to sync new order to Supabase:', err);
    }
  }

  return result;
};

// Wrapper for saveEditOrder
const _origSaveEditOrder = window.saveEditOrder;
window.saveEditOrder = async function(id) {
  const result = await _origSaveEditOrder(id);

  if (result && SupabaseService.isConfigured()) {
    try {
      const order = db.don.find(o => (o.Ma_Don || o.id) === id);
      if (order && order._dbId) {
        await SupabaseService.updateOrder(order._dbId, order);
      }
    } catch (err) {
      console.warn('Failed to sync edit order to Supabase:', err);
    }
  }

  return result;
};

// Wrapper for submitItem (add/edit dress/accessory)
const _origSubmitItem = window.submitItem;
window.submitItem = async function(kind, id) {
  // Call original first
  await _origSubmitItem(kind, id);

  if (SupabaseService.isConfigured()) {
    try {
      const table = kind === 'vay' ? 'vay' : 'pk';
      const item = id ? db[table].find(x => (kind === 'vay' ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) === id) : null;

      if (!item) return;

      if (id && item._dbId) {
        // Update existing
        if (kind === 'vay') {
          await SupabaseService.updateDress(item._dbId, item);
        } else {
          await SupabaseService.updateAccessory(item._dbId, item);
        }
      } else if (!id) {
        // New item - find the one we just added
        const newItem = db[table].find(x =>
          (kind === 'vay' ? x.Ten_Vay === item.Ten_Vay : x.Ten_PK === item.Ten_PK) && !x._dbId
        );
        if (newItem) {
          const supabaseRecord = kind === 'vay'
            ? await SupabaseService.createDress(newItem)
            : await SupabaseService.createAccessory(newItem);
          newItem._dbId = supabaseRecord._dbId;
          newItem.id = supabaseRecord.id;
          localStorage.setItem(STORE, JSON.stringify(db));
        }
      }
    } catch (err) {
      console.warn('Failed to sync item to Supabase:', err);
    }
  }
};

// Wrapper for deleteItem
const _origDeleteItem = window.deleteItem;
window.deleteItem = function(kind, id) {
  // Get item before deletion for Supabase sync
  const table = kind === 'vay' ? 'vay' : 'pk';
  const item = db[table].find(x => (kind === 'vay' ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) === id);

  // Call original
  _origDeleteItem(kind, id);

  // Sync to Supabase
  if (item && item._dbId && SupabaseService.isConfigured()) {
    setTimeout(async () => {
      try {
        if (kind === 'vay') {
          await SupabaseService.deleteDress(item._dbId);
        } else {
          await SupabaseService.deleteAccessory(item._dbId);
        }
      } catch (err) {
        console.warn('Failed to delete item from Supabase:', err);
      }
    }, 100);
  }
};

// ============================================================
// INITIALIZATION
// ============================================================

async function initWithSupabase() {
  if (IS_DEMO_MODE) {
    console.log('🎭 Demo mode - using localStorage only');
    loadFromLocalStorage();
    go('v-cal');
    return;
  }

  try {
    // Initialize Supabase auth
    const user = await SupabaseService.init();

    if (user) {
      // Logged in - load from Supabase
      console.log('✅ Logged in as:', user.email);
      await loadFromSupabase();
      setupRealtime();
      syncBookingsToLocal();
    } else {
      // Not logged in - show login
      console.log('🔐 Not authenticated');
      loadFromLocalStorage(); // Load cached data while showing login
      showLoginModal();
    }

    go('v-cal');

  } catch (err) {
    console.error('Init failed:', err);
    loadFromLocalStorage();
    toast('Offline mode - dữ liệu cục bộ', 'warn');
    go('v-cal');
  }
}

// Add auth button to header
function addAuthButton() {
  const header = document.querySelector('header');
  if (!header) return;

  // Create auth button
  const authBtn = document.createElement('button');
  authBtn.className = 'header-btn';
  authBtn.id = 'auth-btn';
  authBtn.title = 'Tài khoản';

  // Update button based on auth state
  SupabaseService.onAuthChange((user) => {
    const btn = document.getElementById('auth-btn');
    if (btn) {
      if (user) {
        btn.textContent = '👤';
        btn.onclick = showLogoutConfirm;
        btn.title = user.email;
      } else {
        btn.textContent = '🔐';
        btn.onclick = showLoginModal;
        btn.title = 'Đăng nhập';
      }
    }
  });

  // Set initial state
  if (SupabaseService.isAuthenticated()) {
    authBtn.textContent = '👤';
    authBtn.onclick = showLogoutConfirm;
  } else {
    authBtn.textContent = '🔐';
    authBtn.onclick = showLoginModal;
  }

  // Insert before the last header button
  const lastBtn = header.querySelector('.header-btn:last-child');
  if (lastBtn) {
    header.insertBefore(authBtn, lastBtn);
  } else {
    header.appendChild(authBtn);
  }
}

// Override go function to add auth button after nav
const _origGo = window.go;
window.go = function(view) {
  _origGo(view);

  // Add auth button once
  if (!document.getElementById('auth-btn') && !IS_DEMO_MODE) {
    addAuthButton();
  }
};

// ============================================================
// DEMO MODE INDICATOR
// ============================================================

function showDemoModeBanner() {
  if (IS_DEMO_MODE) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: relative;
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      color: #92400e;
      text-align: center;
      padding: 6px 16px;
      font-size: 12px;
      font-weight: 500;
      z-index: 50;
      flex-shrink: 0;
      border-bottom: 1px solid #fcd34d;
    `;
    banner.innerHTML = `
      🎭 <b>Demo Mode</b> — Dữ liệu chỉ lưu local. <span style="opacity:0.7">Cấu hình Supabase để có database thực sự.</span>
    `;
    const appEl = document.querySelector('.app');
    if (appEl) {
      appEl.insertBefore(banner, appEl.firstChild);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }
}

// ============================================================
// AUTO-INIT
// Wait for DOM and app.js to load, then initialize
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      showDemoModeBanner();
      initWithSupabase();
    }, 100);
  });
} else {
  setTimeout(() => {
    showDemoModeBanner();
    initWithSupabase();
  }, 100);
}

console.log('✅ Supabase integration loaded');
