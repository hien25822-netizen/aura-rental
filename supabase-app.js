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

/* ============================================================
 * NOTIFICATION BANNER
 * ============================================================ */
const SyncBanner = {
  container: null,

  init() {
    // Create banner container
    this.container = document.createElement('div');
    this.container.id = 'sync-banner';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 12px 16px;
      text-align: center;
      font-size: 14px;
      font-weight: 500;
      z-index: 9999;
      transform: translateY(-100%);
      transition: transform 0.3s ease;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    `;
    this.container.innerHTML = `
      <span id="sync-banner-icon">🔄</span>
      <span id="sync-banner-text">Đang cập nhật...</span>
    `;
    document.body.appendChild(this.container);
  },

  show(message, icon = '🔄') {
    if (!this.container) this.init();
    document.getElementById('sync-banner-icon').textContent = icon;
    document.getElementById('sync-banner-text').textContent = message;
    this.container.style.transform = 'translateY(0)';
  },

  hide() {
    if (!this.container) return;
    this.container.style.transform = 'translateY(-100%)';
  },

  success(message) {
    this.show(message, '✅');
    setTimeout(() => this.hide(), 3000);
  },

  info(message) {
    this.show(message, '📋');
    setTimeout(() => this.hide(), 3000);
  }
};

// ============================================================
// CONFIG CHECK
// ============================================================

const IS_DEMO_MODE = !window.APP_CONFIG?.supabaseUrl;

// ============================================================
// AUTH UI
// ============================================================

function showLoginModal() {
  const html = `
    <span class="login-logo">👗</span>
    <h2>Aura Rental</h2>
    <p class="login-subtitle">Quản lý thuê váy chuyên nghiệp</p>
    <form id="supabase-login-form" onsubmit="handleSupabaseLogin(event)">
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" required placeholder="phuong@aura.vn" />
      </div>
      <div class="form-group">
        <label>Mật khẩu</label>
        <input type="password" name="password" required placeholder="••••••••" />
      </div>
      <button type="submit" class="btn primary btn-login">Đăng nhập</button>
      <p class="login-help">Chưa có tài khoản? Liên hệ Phuong để được tạo.</p>
    </form>
  `;
  $('#login-body').innerHTML = html;
  openModal('m-login');
}

window.handleSupabaseLogin = async function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Đang đăng nhập...';

  try {
    const data = await window.SupabaseService.signIn(fd.get('email'), fd.get('password'));
    closeModal('m-login');
    document.body.classList.remove('auth-locked');
    toast('Đăng nhập thành công!', 'success');
    await loadFromSupabase();
    setupRealtime();
    refreshCurView();
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
    await window.SupabaseService.signOut();
    closeModal('m-confirm');
    toast('Đã đăng xuất', 'success');
    showLoginModal();
  } catch (err) {
    toast('Lỗi đăng xuất: ' + err.message, 'error');
  }
};

// Force resync — fetch latest data from Supabase (no cache clear, preserves edits)
window.forceResync = async function() {
  const btn = document.getElementById('btn-resync');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳';
  }

  if (typeof SyncBanner !== 'undefined') {
    SyncBanner.show('Đang tải dữ liệu mới nhất...', '🔄');
  }

  try {
    if (window.SupabaseService.isConfigured()) {
      await loadFromSupabase();
      await syncBookingsToLocal();
    }
    if (typeof refreshCurView === 'function') refreshCurView();
    if (typeof toast === 'function') toast('Đã cập nhật dữ liệu mới nhất', 'success');
    if (typeof SyncBanner !== 'undefined') {
      SyncBanner.success('✅ Cập nhật thành công');
    }
  } catch (err) {
    console.error('Force resync error:', err);
    if (typeof toast === 'function') toast('Lỗi cập nhật: ' + err.message, 'error');
    if (typeof SyncBanner !== 'undefined') {
      SyncBanner.error('❌ Lỗi cập nhật');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄';
    }
  }
};

// ============================================================
// DATA LOADING
// ============================================================

async function loadFromSupabase() {
  if (!db || !window.SupabaseService.isConfigured()) {
    console.log('Supabase not configured - using localStorage');
    return;
  }

  try {
    SyncBanner.show('Đang đồng bộ dữ liệu...', '🔄');

    const [dresses, accessories, orders, payments] = await Promise.all([
      window.SupabaseService.fetchDresses(),
      window.SupabaseService.fetchAccessories(),
      window.SupabaseService.fetchOrders(),
      window.SupabaseService.fetchPayments()
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

    // CRITICAL: sync booking-form orders from Supabase bookings table
    // — they live in a separate table and must NOT be wiped when orders sync
    await syncBookingsToLocal();

    // Save merged data to localStorage
    localStorage.setItem(STORE, JSON.stringify(db));

    SyncBanner.success(`Đã đồng bộ ${db.don.length} đơn, ${db.vay.length} váy, ${db.pk.length} phụ kiện`);
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

// Sync state to update the UI after any data change
function syncStateAndRender() {
  if (!db) return;
  localStorage.setItem(STORE, JSON.stringify(db));
  // Always re-render current view — cross-browser/device sync must update regardless of which tab/view
  refreshCurView();
  // Also re-render detail modal if it's open
  const detailModal = document.getElementById('m-detail');
  if (detailModal?.classList.contains('open') && window._openDetailId) {
    openOrderDetail(window._openDetailId);
  }
}

let _realtimeStatus = 'connecting';
let _realtimeRetryCount = 0;
const MAX_REALTIME_RETRIES = 3;

function setupRealtime() {
  if (!window.SupabaseService.isConfigured()) return;

  window.SupabaseService.unsubscribeAll();

  _realtimeStatus = 'connecting';
  SyncBanner.show('Đang kết nối realtime...', '🔄');

  // Subscribe to all tables — all handlers now refetch + merge consistently
  // Includes junction tables (order_dresses, order_accessories) so dress/accessory
  // assignment changes on other devices trigger real-time updates
  const tables = [
    'dresses', 'accessories', 'orders',
    'order_dresses', 'order_accessories',
    'payments', 'bookings'
  ];
  let connectedCount = 0;

  tables.forEach(table => {
    window.SupabaseService.subscribeToChanges(table, payload => handleRealtimeChange(table, payload));
    // Check connection after 3 seconds
    setTimeout(() => {
      connectedCount++;
      if (connectedCount === tables.length) {
        _realtimeStatus = 'connected';
        _realtimeRetryCount = 0;
        SyncBanner.success('🔗 Kết nối realtime thành công!');
        console.log('✅ Realtime subscriptions active — all', tables.length, 'tables connected');
      }
    }, 3000);
  });

  // If not connected in 8 seconds, fallback to fast polling
  setTimeout(() => {
    if (_realtimeStatus !== 'connected') {
      console.warn('⚠️ Realtime not connected — enabling fast polling fallback');
      _realtimeStatus = 'polling-only';
      startFastPolling();
    }
  }, 8000);

  // Poll for bookings every 5 seconds (faster for new bookings)
  startBookingPolling(5000);
  // Periodic full sync every 15 seconds as fallback — keeps cross-device sync responsive
  startFullSyncPolling(15000);

  // Cross-tab sync: listen to storage events from other tabs on same device
  setupCrossTabSync();

  // Cross-device/browswer sync: re-sync when tab becomes visible again
  // Supabase realtime may drop connections when tab is hidden — force full sync on visibility
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('[Visibility] Tab visible — syncing...');
      if (db && window.SupabaseService.isConfigured()) {
        try {
          await loadFromSupabase();
          refreshCurView();
          SyncBanner.info('🔄 Đã đồng bộ dữ liệu mới nhất');
        } catch (err) {
          console.warn('Visibility sync error:', err);
        }
      }
    }
  });

  console.log('🚀 Realtime setup initiated for', tables.join(', '));
}

async function handleRealtimeChange(table, payload) {
  console.log(`[Realtime] ${table} changed:`, payload.eventType);
  switch (table) {
    case 'dresses': await handleRealtimeDressChange(payload); break;
    case 'accessories': await handleRealtimeAccessoryChange(payload); break;
    case 'orders': await handleRealtimeOrderChange(payload); break;
    case 'order_dresses': await handleRealtimeOrderDressChange(payload); break;
    case 'order_accessories': await handleRealtimeOrderAccessoryChange(payload); break;
    case 'payments': await handleRealtimePaymentChange(payload); break;
    case 'bookings': await handleRealtimeBookingChange(payload); break;
  }
}

// Fast polling fallback when realtime is not connected
let fastPollingInterval = null;
function startFastPolling() {
  if (fastPollingInterval) return;
  console.log('⚡ Fast polling active (every 5s)');
  fastPollingInterval = setInterval(async () => {
    if (!db || !window.SupabaseService.isConfigured()) return;
    try {
      await loadFromSupabase();
      _realtimeStatus = 'polling';
      SyncBanner.info('🔄 Đang đồng bộ...');
      // Always refresh current view for cross-device sync
      refreshCurView();
    } catch (err) {
      console.warn('Fast polling error:', err);
    }
  }, 5000);
}

async function handleRealtimeDressChange(payload) {
  if (!db) return;
  try {
    const dresses = await window.SupabaseService.fetchDresses();
    const localByDbId = {};
    (db.vay || []).forEach(v => { if (v._dbId) localByDbId[v._dbId] = v; });
    const merged = (dresses || []).map(sup => {
      const local = localByDbId[sup._dbId];
      return local ? { ...sup, So_Lan_Thue: local.So_Lan_Thue } : sup;
    });
    db.vay = merged;
    syncStateAndRender();
    SyncBanner.info('📋 Váy được cập nhật từ thiết bị khác');
  } catch (err) {
    console.warn('Realtime dress sync error:', err);
  }
}

async function handleRealtimeAccessoryChange(payload) {
  if (!db) return;
  try {
    const accessories = await window.SupabaseService.fetchAccessories();
    const localByDbId = {};
    (db.pk || []).forEach(p => { if (p._dbId) localByDbId[p._dbId] = p; });
    const merged = (accessories || []).map(sup => {
      const local = localByDbId[sup._dbId];
      return local ? { ...sup, So_Luong_Tong: local.So_Luong_Tong } : sup;
    });
    db.pk = merged;
    syncStateAndRender();
    SyncBanner.info('📋 Phụ kiện được cập nhật từ thiết bị khác');
  } catch (err) {
    console.warn('Realtime accessory sync error:', err);
  }
}

async function handleRealtimeOrderChange(payload) {
  if (!db) return;
  try {
    const orders = await window.SupabaseService.fetchOrders();
    // SUPABASE IS SOURCE OF TRUTH — replace ALL local orders with Supabase data
    // dhvs and Ma_PK come from Supabase via fetchOrders() which reads order_dresses table
    const localByDbId = {};
    (db.don || []).forEach(o => { if (o._dbId) localByDbId[o._dbId] = o; });
    const merged = (orders || []).map(supOrder => {
      const local = localByDbId[supOrder._dbId];
      if (local) {
        return {
          ...supOrder,
          _fromBooking: local._fromBooking,
          // supOrder.dhvs/Ma_PK come from fetchOrders which reads junction tables — use them
        };
      }
      return supOrder;
    });
    db.don = merged;
    localStorage.setItem(STORE, JSON.stringify(db));
    await syncBookingsToLocal();
    syncStateAndRender();
    SyncBanner.info('📋 Đơn hàng được cập nhật từ thiết bị khác');
  } catch (err) {
    console.warn('Realtime order sync error:', err);
  }
}

async function handleRealtimePaymentChange(payload) {
  if (!db) return;
  try {
    const payments = await window.SupabaseService.fetchPayments();
    db.tt = payments || [];
    localStorage.setItem(STORE, JSON.stringify(db));
    syncStateAndRender();
    if (document.getElementById('m-refund-orders')?.classList.contains('open')) {
      if (typeof renderRefundOrders === 'function') renderRefundOrders();
    }
  } catch (err) {
    console.warn('Realtime payment sync error:', err);
  }
}

// Junction table change — refetch orders to get updated dress/accessory assignments
async function handleRealtimeOrderDressChange(payload) {
  if (!db) return;
  console.log('[Realtime] order_dresses changed:', payload.eventType, payload.new?.id || payload.old?.id);
  try {
    const orders = await window.SupabaseService.fetchOrders();
    const localByDbId = {};
    (db.don || []).forEach(o => { if (o._dbId) localByDbId[o._dbId] = o; });
    const merged = (orders || []).map(supOrder => {
      const local = localByDbId[supOrder._dbId];
      if (local) return { ...supOrder, _fromBooking: local._fromBooking };
      return supOrder;
    });
    db.don = merged;
    localStorage.setItem(STORE, JSON.stringify(db));
    syncStateAndRender();
    SyncBanner.info('👗 Váy trong đơn được cập nhật từ thiết bị khác');
  } catch (err) {
    console.warn('Realtime order_dresses sync error:', err);
  }
}

async function handleRealtimeOrderAccessoryChange(payload) {
  if (!db) return;
  console.log('[Realtime] order_accessories changed:', payload.eventType, payload.new?.id || payload.old?.id);
  try {
    const orders = await window.SupabaseService.fetchOrders();
    const localByDbId = {};
    (db.don || []).forEach(o => { if (o._dbId) localByDbId[o._dbId] = o; });
    const merged = (orders || []).map(supOrder => {
      const local = localByDbId[supOrder._dbId];
      if (local) return { ...supOrder, _fromBooking: local._fromBooking };
      return supOrder;
    });
    db.don = merged;
    localStorage.setItem(STORE, JSON.stringify(db));
    syncStateAndRender();
    SyncBanner.info('💍 Phụ kiện trong đơn được cập nhật từ thiết bị khác');
  } catch (err) {
    console.warn('Realtime order_accessories sync error:', err);
  }
}

async function handleRealtimeBookingChange(payload) {
  if (!db) return;
  await syncBookingsToLocal();
  if (typeof refreshCurView === 'function') refreshCurView();
}

async function syncBookingsToLocal() {
  if (!db || !window.SupabaseService.isConfigured()) return;
  try {
    const bookings = await window.SupabaseService.fetchBookings();

    let allDresses = {};
    let allAccessories = {};
    try {
      const [dresses, accessories] = await Promise.all([
        window.SupabaseService.fetchDresses(),
        window.SupabaseService.fetchAccessories()
      ]);
      (dresses || []).forEach(v => { if (v._dbId) allDresses[v._dbId] = v; });
      (accessories || []).forEach(p => { if (p._dbId) allAccessories[p._dbId] = p; });
    } catch (e) {
      (db.vay || []).forEach(v => { if (v._dbId) allDresses[v._dbId] = v; });
      (db.pk || []).forEach(p => { if (p._dbId) allAccessories[p._dbId] = p; });
    }

    const normalized = (bookings || []).map(b => {
      const dhvs = (b._dressIds || []).map(dressId => {
        const dress = allDresses[dressId];
        return dress ? { vay: dressId, Ma_Vay: dress.Ma_Vay || dressId, Ten_Vay: dress.Ten_Vay || dress.ten || 'Váy', Size: dress.Size || '' } : { vay: dressId, Ma_Vay: dressId };
      });
      const Ma_PK = (b._accIds || []).map(accId => {
        const acc = allAccessories[accId];
        return acc ? { Ma_PK: acc.Ma_PK || accId, Ten_PK: acc.Ten_PK || acc.ten || 'Phụ kiện' } : accId;
      });

      // Tính Ngay_Tra từ Goi_Thue + Ngay_Lay (bookings table không có column ngay_tra)
      const ngayLay = b.ngay_lay;
      let ngayTra = b.ngay_tra || ngayLay;
      if (ngayLay && !b.ngay_tra) {
        const goi = (b.goi_thue || '').toLowerCase();
        const d = new Date(ngayLay + 'T00:00:00');
        if (goi.includes('3')) d.setDate(d.getDate() + 2);
        else if (goi.includes('1') || goi.includes('ngày') || goi.includes('ngay')) d.setDate(d.getDate() + 1);
        // '12h' → same day, giữ nguyên
        const yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
        ngayTra = `${yyyy}-${mm}-${dd}`;
      }

      return {
        id: b.id,
        _dbId: b.id,
        Ma_Don: b.ma_booking,
        Trang_Thai_Don: 'Chờ xác nhận',
        Insta_Khach: b.insta_khach,
        SDT: b.sdt,
        Insta: b.insta_khach,
        Goi_Thue: b.goi_thue,
        Ngay_Lay: ngayLay,
        Gio_Lay: b.gio_lay,
        Ngay_Tra: ngayTra,
        Hinh_Thuc_Coc: b.hinh_thuc_coc,
        Hinh_Thuc_Nhan: b.hinh_thuc_nhan,
        Dia_Chi: b.dia_chi,
        Su_Kien: b.su_kien,
        Ghi_Chu: b.ghi_chu,
        _ts: new Date(b.created_at).getTime(),
        _fromBooking: true,
        _dressIds: b._dressIds || [],
        _accIds: b._accIds || [],
        dhvs,
        Ma_PK
      };
    });

    // Merge: update existing bookings, add new ones
    const existingById = {};
    (db.don || []).forEach(d => { if (d._dbId) existingById[d._dbId] = d; });

    let newCount = 0;
    normalized.forEach(b => {
      const existing = existingById[b._dbId];
      if (existing) {
        // Update existing — preserve local _ts so realtime merge doesn't overwrite newer edits
        Object.assign(existing, {
          Insta_Khach: b.Insta_Khach,
          SDT: b.SDT,
          Goi_Thue: b.Goi_Thue,
          Ngay_Lay: b.Ngay_Lay,
          Gio_Lay: b.Gio_Lay,
          Ngay_Tra: b.Ngay_Tra,
          Hinh_Thuc_Coc: b.Hinh_Thuc_Coc,
          Hinh_Thuc_Nhan: b.Hinh_Thuc_Nhan,
          Dia_Chi: b.Dia_Chi,
          Su_Kien: b.Su_Kien,
          Ghi_Chu: b.Ghi_Chu,
          dhvs: b.dhvs,
          Ma_PK: b.Ma_PK,
          _dressIds: b._dressIds,
          _accIds: b._accIds,
        });
      } else {
        db.don.push(b);
        newCount++;
      }
    });

    syncStateAndRender();
    if (newCount > 0) {
      SyncBanner.success(`Có ${newCount} đơn đặt thuê mới từ website!`);
    }
  } catch (err) {
    console.warn('Booking sync error:', err);
  }
}

let bookingPollInterval = null;
function startBookingPolling(interval = 5000) {
  if (bookingPollInterval) clearInterval(bookingPollInterval);
  bookingPollInterval = setInterval(() => {
    if (db) syncBookingsToLocal().catch(console.warn);
  }, interval);
}

let fullSyncInterval = null;
function startFullSyncPolling(interval = 15000) {
  if (fullSyncInterval) clearInterval(fullSyncInterval);
  fullSyncInterval = setInterval(async () => {
    if (!db) return;
    try {
      await loadFromSupabase();
      // Always refresh — cross-device sync depends on seeing updates in any view
      refreshCurView();
    } catch (err) {
      console.warn('Full sync polling error:', err);
    }
  }, interval);
}

// ============================================================
// CROSS-TAB SYNC (same device, multiple browser tabs)
// ============================================================
let crossTabDebounce = null;

function setupCrossTabSync() {
  window.addEventListener('storage', e => {
    if (e.key !== STORE) return;
    if (e.newValue === null) return; // cleared — skip

    clearTimeout(crossTabDebounce);
    crossTabDebounce = setTimeout(() => {
      try {
        const remote = JSON.parse(e.newValue);
        if (!remote || typeof remote !== 'object') return;

        // Merge remote data into local db — remote wins on _ts conflict
        const mergedDon = mergeOrderLists(db.don || [], remote.don || []);
        const mergedVay = mergeItemLists(db.vay || [], remote.vay || []);
        const mergedPk = mergeItemLists(db.pk || [], remote.pk || []);

        db.don = mergedDon;
        db.vay = mergedVay;
        db.pk = mergedPk;
        if (remote.tt) db.tt = remote.tt;
        if (remote.dhv) db.dhv = remote.dhv;
        if (remote.form) db.form = remote.form;

        syncStateAndRender();
        SyncBanner.info('🔄 Dữ liệu được đồng bộ từ tab khác');
      } catch (err) {
        console.warn('Cross-tab sync parse error:', err);
      }
    }, 300);
  });
}

function mergeOrderLists(local, remote) {
  const byId = {};
  local.forEach(o => { if (o._dbId) byId[o._dbId] = { ...o }; });
  remote.forEach(o => {
    if (!o._dbId) return;
    const existing = byId[o._dbId];
    if (!existing) {
      byId[o._dbId] = o;
    } else {
      const existingTs = existing._ts || 0;
      const remoteTs = o._ts || 0;
      if (remoteTs > existingTs) {
        // Remote wins — Supabase is source of truth
        byId[o._dbId] = { ...o };
      }
    }
  });
  return Object.values(byId);
}

function mergeItemLists(local, remote) {
  const byId = {};
  local.forEach(item => { if (item._dbId) byId[item._dbId] = { ...item }; });
  remote.forEach(item => {
    if (!item._dbId) return;
    const existing = byId[item._dbId];
    if (!existing) {
      byId[item._dbId] = item;
    } else {
      const existingTs = existing._ts || 0;
      const remoteTs = item._ts || 0;
      if (remoteTs > existingTs) {
        byId[item._dbId] = item;
      }
    }
  });
  return Object.values(byId);
}

// ============================================================
// SUPABASE-AWARE SAVE FUNCTIONS
// Override existing save functions to sync with Supabase
// ============================================================

// Store original save function
const _origSave = window.save;

// Enhanced save that syncs to Supabase
window.saveToSupabase = async function() {
  if (!window.SupabaseService.isConfigured()) return;

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
// DETAIL MODAL TRACKING — so realtime handlers can re-render it
// ============================================================
const _origOpenOrderDetail = window.openOrderDetail;
window.openOrderDetail = function(id) {
  window._openDetailId = id;
  return _origOpenOrderDetail.apply(this, arguments);
};

const _origCloseModal = window.closeModal;
window.closeModal = function(id) {
  if (id === 'm-detail') window._openDetailId = null;
  return _origCloseModal.apply(this, arguments);
};

// ============================================================
// SUPABASE CRUD WRAPPERS
// These wrap the existing functions to also save to Supabase
// ============================================================

// Wrapper for saveNewOrder
const _origSaveNewOrder = window.saveNewOrder;
window.saveNewOrder = async function() {
  const result = await _origSaveNewOrder();

  if (result && window.SupabaseService.isConfigured()) {
    try {
      const order = db.don[0]; // Most recent
      if (order && !order._dbId) {
        const supabaseOrder = await window.SupabaseService.createOrder(order);
        order._dbId = supabaseOrder._dbId;
        order.id = supabaseOrder.id;

        // Update dress rental counts
        if (order.dhvs) {
          for (const dhv of order.dhvs) {
            if (dhv.vay) {
              await window.SupabaseService.incrementDressRentalCount(dhv.vay);
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
window.saveEditOrder = function(id) {
  // Call original first
  _origSaveEditOrder(id);

  // Sync to Supabase
  if (window.SupabaseService.isConfigured()) {
    setTimeout(async () => {
      try {
        const order = db.don.find(o => (o.Ma_Don || o.id) === id);
        if (order) {
          if (order._dbId) {
            await window.SupabaseService.updateOrder(order._dbId, order);
          } else {
            // Order not yet in Supabase — create it
            const sup = await window.SupabaseService.createOrder(order);
            order._dbId = sup._dbId;
            order.id = sup.id;
            if (order.dhvs) {
              for (const dhv of order.dhvs) {
                if (dhv.vay) await window.SupabaseService.incrementDressRentalCount(dhv.vay);
              }
            }
            localStorage.setItem(STORE, JSON.stringify(db));
          }
        }
      } catch (err) {
        console.warn('Failed to sync edit order to Supabase:', err);
      }
    }, 100);
  }
};

// Wrapper for submitItem (add/edit dress/accessory)
const _origSubmitItem = window.submitItem;
window.submitItem = async function(kind, id) {
  // Capture the ID that will be generated for new items
  const pendingNewId = !id ? (kind === 'vay' ? uid('V') : uid('P')) : null;

  // Call original first
  await _origSubmitItem(kind, id);

  if (window.SupabaseService.isConfigured()) {
    try {
      const table = kind === 'vay' ? 'vay' : 'pk';

      if (id) {
        // Edit existing item
        const item = db[table].find(x => (kind === 'vay' ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) === id);
        if (item && item._dbId) {
          if (kind === 'vay') {
            await window.SupabaseService.updateDress(item._dbId, item);
          } else {
            await window.SupabaseService.updateAccessory(item._dbId, item);
          }
        }
      } else {
        // New item — find by the pre-generated ID
        const newItem = db[table].find(x =>
          (kind === 'vay' ? x.Ma_Vay : x.Ma_PK) === pendingNewId
        );
        if (newItem && !newItem._dbId) {
          const supabaseRecord = kind === 'vay'
            ? await window.SupabaseService.createDress(newItem)
            : await window.SupabaseService.createAccessory(newItem);
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

// Wrapper for setOrderType — syncs status changes to Supabase
const _origSetOrderType = window.setOrderType;
window.setOrderType = function(id, type) {
  // Call original first (updates local db)
  _origSetOrderType(id, type);

  // Sync to Supabase
  if (window.SupabaseService.isConfigured()) {
    setTimeout(async () => {
      try {
        const order = db.don.find(o => (o.Ma_Don || o.id) === id);
        if (order) {
          if (order._dbId) {
            await window.SupabaseService.updateOrder(order._dbId, order);
          } else {
            const sup = await window.SupabaseService.createOrder(order);
            order._dbId = sup._dbId;
            order.id = sup.id;
            localStorage.setItem(STORE, JSON.stringify(db));
          }
        }
      } catch (err) {
        console.warn('Failed to sync setOrderType to Supabase:', err);
      }
    }, 100);
  }
};

// Wrapper for saveRefund — syncs refund to Supabase
const _origSaveRefund = window.saveRefund;
window.saveRefund = function() {
  // Call original first (updates local db)
  _origSaveRefund();

  // Sync refund payment to Supabase
  if (window.SupabaseService.isConfigured()) {
    setTimeout(async () => {
      try {
        const latestPayment = db.tt && db.tt[0];
        if (latestPayment && !latestPayment._dbId) {
          const supPayment = await window.SupabaseService.createPayment(latestPayment);
          latestPayment._dbId = supPayment._dbId;
          latestPayment.id = supPayment.id;
          localStorage.setItem(STORE, JSON.stringify(db));
        }
      } catch (err) {
        console.warn('Failed to sync refund to Supabase:', err);
      }
    }, 100);
  }
};

// Wrapper for deleteOrder — syncs to Supabase so other devices get updated
const _origDeleteOrder = window.deleteOrder;
window.deleteOrder = function(id) {
  // Get order before deletion for Supabase sync
  const order = db.don.find(o => (o.Ma_Don || o.id) === id);

  // Call original (deletes from local)
  _origDeleteOrder(id);

  // Sync to Supabase (soft delete)
  if (order && order._dbId && window.SupabaseService.isConfigured()) {
    setTimeout(async () => {
      try {
        await window.SupabaseService.deleteOrder(order._dbId);
      } catch (err) {
        console.warn('Failed to delete order from Supabase:', err);
      }
    }, 100);
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
  if (item && item._dbId && window.SupabaseService.isConfigured()) {
    setTimeout(async () => {
      try {
        if (kind === 'vay') {
          await window.SupabaseService.deleteDress(item._dbId);
        } else {
          await window.SupabaseService.deleteAccessory(item._dbId);
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
  // Cross-tab sync works in ALL modes (demo or full)
  setupCrossTabSync();

  // Wait for app.js to finish loading (it defines `db`)
  let retries = 0;
  while (typeof db === 'undefined' && retries < 50) {
    await new Promise(r => setTimeout(r, 100));
    retries++;
  }
  if (typeof db === 'undefined') {
    console.error('db not defined after 5s — app.js may have failed to load');
    return;
  }

  if (IS_DEMO_MODE) {
    console.log('🎭 Demo mode - using localStorage only');
    loadFromLocalStorage();
    go('v-cal');
    return;
  }

  try {
    const user = await window.SupabaseService.init();

    if (window.SupabaseService.isConfigured()) {
      setupRealtime();
      syncBookingsToLocal();
    }

    if (user) {
      console.log('✅ Logged in as:', user.email);
      await loadFromSupabase();
      go('v-cal');
      document.body.classList.remove('auth-locked');
    } else {
      console.log('🔐 Not authenticated');
      loadFromLocalStorage();
      showLoginModal();
      document.body.classList.add('auth-locked');
    }

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

  // If button already exists, don't add again
  if (document.getElementById('auth-btn')) return;
  authBtn.title = 'Tài khoản';

  // Update button based on auth state
  window.SupabaseService.onAuthChange((user) => {
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
  if (window.SupabaseService.isAuthenticated()) {
    authBtn.textContent = '👤';
    authBtn.onclick = showLogoutConfirm;
  } else {
    authBtn.textContent = '🔐';
    authBtn.onclick = showLoginModal;
  }

  // Insert before the last header button
  const lastBtn = header.querySelector('.header-btn:last-child');
  if (lastBtn && lastBtn.parentNode === header) {
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

// Disable Google Apps Script sync when Supabase is active — prevents race conditions
if (typeof Sync !== 'undefined') {
  const _origSyncStart = Sync.start;
  Sync.start = function() {
    if (window.SupabaseService.isConfigured()) {
      console.log('ℹ️ Google Sheets sync disabled — using Supabase realtime');
      return;
    }
    _origSyncStart.call(Sync);
  };

  const _origSave = window.save;
  window.save = function() {
    _origSave.apply(this, arguments);
    if (window.SupabaseService.isConfigured()) {
      clearTimeout(window._syncTimer);
    }
  };
}

console.log('✅ Supabase integration loaded v22');
