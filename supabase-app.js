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
 */

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

  error(message) {
    if (!this.container) this.init();
    document.getElementById('sync-banner-icon').textContent = '❌';
    document.getElementById('sync-banner-text').textContent = message;
    this.container.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    this.container.style.transform = 'translateY(0)';
    setTimeout(() => {
      this.hide();
      // reset background after hide so next success/info shows green
      this.container.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    }, 4000);
  },

  info(message) {
    this.show(message, '📋');
    setTimeout(() => this.hide(), 3000);
  }
};

// Debounce helper — collapse rapid SyncBanner calls (realtime events fire in bursts)
const _bannerDebounce = {};
function debouncedBanner(method, msg, icon, delay = 2000) {
  const key = method;
  if (_bannerDebounce[key]) {
    clearTimeout(_bannerDebounce[key].t);
    _bannerDebounce[key].pending = msg;
    _bannerDebounce[key].t = setTimeout(() => {
      const pendingMsg = _bannerDebounce[key].pending || msg;
      SyncBanner[method](pendingMsg, icon);
      _bannerDebounce[key] = null;
    }, delay);
    return;
  }
  SyncBanner[method](msg, icon);
  _bannerDebounce[key] = {
    t: setTimeout(() => { _bannerDebounce[key] = null; }, delay)
  };
}

// Smart diff — compare two arrays by JSON shape. Returns true if they differ.
function arraysDiffer(a, b) {
  if (!a || !b) return true;
  if (a.length !== b.length) return true;
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  return sa !== sb;
}

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
    // Cleanup: unsubscribe realtime channels + stop all polling
    window.SupabaseService.unsubscribeAll();
    stopAllPolling();
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
  if (!btn) return;
  if (btn.disabled) return; // already in progress — ignore double-click

  // Snapshot before so we can detect whether anything actually changed
  const prevSnapshot = JSON.stringify({
    don: db.don || [],
    vay: db.vay || [],
    pk: db.pk || [],
    tt: db.tt || [],
    bookings: db.form || []
  });

  btn.disabled = true;
  btn.classList.add('is-loading');
  const origText = btn.textContent;
  btn.textContent = '⏳';

  if (typeof SyncBanner !== 'undefined') {
    SyncBanner.show('Đang tải dữ liệu mới nhất...', '🔄');
  }

  // 12s hard timeout — if Supabase hangs, fall back to localStorage so user still gets feedback
  const RESYNC_TIMEOUT_MS = 12000;
  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error('Supabase không phản hồi sau 12s — dùng dữ liệu offline'));
    }, RESYNC_TIMEOUT_MS);
  });

  try {
    if (window.SupabaseService.isConfigured()) {
      try {
        await Promise.race([loadFromSupabase(true), timeoutPromise]);
        await syncBookingsToLocal();
      } catch (supErr) {
        // Supabase hung/failed — fall back to localStorage so app still usable
        console.warn('[forceResync] Supabase failed, falling back to localStorage:', supErr);
        if (typeof loadFromLocalStorage === 'function') loadFromLocalStorage();
        if (typeof toast === 'function') {
          toast(timedOut ? 'Mạng chậm — dùng dữ liệu offline' : 'Lỗi mạng — dùng dữ liệu offline', 'warn');
        }
        if (typeof SyncBanner !== 'undefined') {
          SyncBanner.error(timedOut ? '⚠️ Mạng chậm — dùng dữ liệu offline' : '❌ Lỗi mạng — dùng dữ liệu offline');
        }
        // Re-render so user sees fresh localStorage, then bail out
        if (typeof refreshCurView === 'function') refreshCurView();
        return;
      }
    }

    // Check whether anything actually changed — if not, user may think button is broken
    const newSnapshot = JSON.stringify({
      don: db.don || [],
      vay: db.vay || [],
      pk: db.pk || [],
      tt: db.tt || [],
      bookings: db.form || []
    });
    const changed = prevSnapshot !== newSnapshot;

    if (typeof refreshCurView === 'function') refreshCurView();

    if (changed) {
      if (typeof toast === 'function') toast('Đã cập nhật dữ liệu mới nhất', 'success');
      if (typeof SyncBanner !== 'undefined') {
        SyncBanner.success('✅ Cập nhật thành công');
      }
    } else {
      if (typeof toast === 'function') toast('Dữ liệu đã mới nhất', 'info');
      if (typeof SyncBanner !== 'undefined') {
        SyncBanner.info('📋 Dữ liệu đã mới nhất');
      }
    }
  } catch (err) {
    console.error('Force resync error:', err);
    if (typeof toast === 'function') toast('Lỗi cập nhật: ' + err.message, 'error');
    if (typeof SyncBanner !== 'undefined') {
      SyncBanner.error('❌ Lỗi cập nhật');
    }
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.textContent = origText || '🔄';
  }
};

// ============================================================
// DATA LOADING
// ============================================================

let _loadInProgress = false;

async function loadFromSupabase(force = false) {
  if (_loadInProgress && !force) {
    console.log('[loadFromSupabase] Skipped — already in progress');
    return;
  }
  if (!_loadInProgress) _loadInProgress = true;
  try {
    if (!db || !window.SupabaseService.isConfigured()) {
      console.log('Supabase not configured - using localStorage');
      return;
    }
    // No banner — sync runs silently in background

    const [dresses, accessories, orders, payments] = await Promise.all([
      window.SupabaseService.fetchDresses(),
      window.SupabaseService.fetchAccessories(),
      window.SupabaseService.fetchOrders(),
      window.SupabaseService.fetchPayments()
    ]);

    // Build maps from Supabase data (dual-key: _dbId + Ma_Vay/Ma_PK)
    const supDresses = {};
    (dresses || []).forEach(v => {
      if (v._dbId) supDresses[v._dbId] = v;
      if (v.Ma_Vay) supDresses[v.Ma_Vay] = v;
    });
    const supAccessories = {};
    (accessories || []).forEach(p => {
      if (p._dbId) supAccessories[p._dbId] = p;
      if (p.Ma_PK) supAccessories[p.Ma_PK] = p;
    });
    const supOrders = {};
    (orders || []).forEach(o => { if (o._dbId) supOrders[o._dbId] = o; });

    // Merge: Keep local data, update from Supabase if Supabase has newer data
    // Prefer Supabase for records that exist in both (it's the source of truth)
    const GRACE_MS = 30000;
    const nowItem = Date.now();
    const recentlyDeletedItems = new Set();
    if (db._deletedItemIds) {
      Object.entries(db._deletedItemIds).forEach(([dbId, ts]) => {
        if (nowItem - ts < GRACE_MS) recentlyDeletedItems.add(dbId);
      });
    }
    const mergedDresses = [];
    const localDressIds = new Set((db.vay || []).map(v => v._dbId));
    const supDressIds = new Set(Object.keys(supDresses));

    // CRITICAL: Supabase returned empty — protect local data
    // This can happen when RLS policies block reads or Supabase is unreachable
    // Never wipe local storage when Supabase has no data
    const hasSupDresses = (dresses || []).length > 0;
    const hasSupAccessories = (accessories || []).length > 0;

    // Add all Supabase dresses (filter out locally-tombstoned)
    // Only if Supabase actually has data — never overwrite local with empty
    if (hasSupDresses) {
      (dresses || []).forEach(v => {
        if (!recentlyDeletedItems.has(v._dbId)) mergedDresses.push(v);
      });
      // Add local-only dresses (not in Supabase yet)
      (db.vay || []).forEach(v => {
        if (!v._dbId || !supDresses[v._dbId]) {
          mergedDresses.push(v);
        }
      });
    } else {
      // Supabase empty — preserve all local dresses
      mergedDresses.push(...(db.vay || []));
    }

    const mergedAccessories = [];
    if (hasSupAccessories) {
      (accessories || []).forEach(p => {
        if (!recentlyDeletedItems.has(p._dbId)) mergedAccessories.push(p);
      });
      (db.pk || []).forEach(p => {
        if (!p._dbId || !supAccessories[p._dbId]) {
          mergedAccessories.push(p);
        }
      });
    } else {
      // Supabase empty — preserve all local accessories
      mergedAccessories.push(...(db.pk || []));
    }

    // Merge orders: prefer newer version by _ts (timestamp-based conflict resolution)
    // GRACE PERIOD: orders modified in the last 30s always win — prevents race
    // condition where Supabase fetch returns old data before the latest update landed
    const now = Date.now();
    const mergedOrders = [];
    const orderTimestamps = {};
    // Record local timestamps first
    (db.don || []).forEach(o => { if (o._ts) orderTimestamps[o._dbId] = o._ts; });

    // Build set of pending creates (orders awaiting _dbId assignment from Supabase)
    const pendingCreateIds = new Set();
    if (db._pendingCreate && typeof window.isPendingCreate === 'function') {
      Object.keys(db._pendingCreate).forEach(maDon => {
        if (window.isPendingCreate(maDon)) pendingCreateIds.add(maDon);
      });
    }

    // Add Supabase orders, but keep local if local is newer OR within grace period
    // Also skip orders deleted locally within grace period (Supabase delete may not have landed yet)
    // Also skip orders with locally-pending Ma_Don (waiting for _dbId assignment)
    const recentlyDeleted = new Set();
    if (db._deletedOrderIds) {
      Object.entries(db._deletedOrderIds).forEach(([dbId, ts]) => {
        if (now - ts < GRACE_MS) recentlyDeleted.add(dbId);
      });
    }
    (orders || []).forEach(o => {
      if (recentlyDeleted.has(o._dbId)) return; // skip locally-deleted orders
      if (pendingCreateIds.has(o.Ma_Don)) return; // pending create — keep local copy
      const localTs = orderTimestamps[o._dbId];
      const remoteTs = o._ts;
      const local = db.don.find(x => x._dbId === o._dbId);
      const isRecent = localTs && (now - localTs) < GRACE_MS;
      if (isRecent && local) {
        // Within grace period — keep local (user just edited this order)
        mergedOrders.push(local);
      } else if (localTs && remoteTs && localTs > remoteTs) {
        // Local is older but still newer than remote
        mergedOrders.push(local);
      } else {
        mergedOrders.push(o);
      }
    });
    // Add local-only orders (not in Supabase yet) — includes pending creates
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
    // Pass pre-built maps to avoid redundant fetches
    await syncBookingsToLocal(supDresses, supAccessories);

    // Save merged data to localStorage
    localStorage.setItem(STORE, JSON.stringify(db));
    // Rebuild in-memory indexes after remote data lands
    if (typeof rebuildIndexes === 'function') rebuildIndexes();

    // Silent — no banner after sync
    console.log('Loaded:', {
      dresses: db.vay.length,
      accessories: db.pk.length,
      orders: db.don.length,
      payments: db.tt.length
    });
  } catch (err) {
    console.error('Load from Supabase failed:', err);
    toast('Lỗi tải dữ liệu: ' + err.message, 'error');
    // Don't overwrite db with localStorage — would clobber any partial merge
  } finally {
    _loadInProgress = false;
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
  // Rebuild in-memory indexes after remote mutation
  if (typeof rebuildIndexes === 'function') rebuildIndexes();
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

// Track _dbId vừa tới từ realtime (khác local create) — highlight row slide-in
// Cleared sau 5s vì row đã animate xong.
const _recentRemoteIds = new Set();
function markRemoteInsert(table, dbId) {
  if (!dbId) return;
  _recentRemoteIds.add(`${table}:${dbId}`);
  setTimeout(() => _recentRemoteIds.delete(`${table}:${dbId}`), 5000);
}
function isRecentRemote(table, dbId) {
  return _recentRemoteIds.has(`${table}:${dbId}`);
}
// Expose cho app.js (load order: app.js trước, supabase-app.js sau)
window.markRemoteInsert = markRemoteInsert;
window.isRecentRemote = isRecentRemote;

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

  // If not connected in 8 seconds, fallback to polling
  setTimeout(() => {
    if (_realtimeStatus !== 'connected') {
      console.warn('⚠️ Realtime not connected — enabling polling fallback');
      _realtimeStatus = 'polling-only';
      startFastPolling();
    }
  }, 8000);

  // Single polling interval — avoids overlapping loadFromSupabase() calls
  // 1 loop duy nhất, mỗi 5s check sub-threshold (booking 10s, full 15s)
  startPollingLoop({ fastMode: false });

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
// → bật fastMode trên polling loop đã có (không tạo timer mới)
let fastPollingInterval = null;
function startFastPolling() {
  if (fastPollingInterval) return; // đã ở fast mode
  fastPollingInterval = 'fast-mode-marker'; // dummy — chỉ để check đã bật
  console.log('⚡ Fast polling active — sync mỗi 5s (realtime fail)');
  _realtimeStatus = 'polling';
  // Bật fast mode trên loop đã có (startPollingLoop đã chạy từ startRealtimeSync)
  if (_pollingLoop) {
    _pollingLoopFastMode = true;
    _lastFullSync = 0; // force full sync ngay tick kế tiếp
  } else {
    // Fallback: nếu loop chưa chạy → start mới với fastMode
    startPollingLoop({ fastMode: true });
  }
}

async function handleRealtimeDressChange(payload) {
  if (!db) return;
  try {
    const GRACE_MS = 30000;
    const now = Date.now();
    const recentlyDeleted = new Set();
    if (db._deletedItemIds) {
      Object.entries(db._deletedItemIds).forEach(([dbId, ts]) => {
        if (now - ts < GRACE_MS) recentlyDeleted.add(dbId);
      });
    }

    // Apply payload directly when eventType is known — avoids full refetch on every event
    if (payload && payload.eventType === 'DELETE' && payload.old?._dbId) {
      const idx = (db.vay || []).findIndex(v => v._dbId === payload.old._dbId);
      if (idx !== -1) {
        db.vay.splice(idx, 1);
        localStorage.setItem(STORE, JSON.stringify(db));
        if (typeof rebuildIndexes === 'function') rebuildIndexes();
        syncStateAndRender();
      }
      return;
    }
    if (payload && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
      const sup = payload.new;
      const idx = (db.vay || []).findIndex(v => v._dbId === sup._dbId);
      const local = idx !== -1 ? db.vay[idx] : null;
      const merged = local ? { ...sup, So_Lan_Thue: local.So_Lan_Thue } : sup;
      if (idx !== -1) db.vay[idx] = merged;
      else {
        db.vay.push(merged);
        if (payload.eventType === 'INSERT') markRemoteInsert('vay', sup._dbId);
      }
      localStorage.setItem(STORE, JSON.stringify(db));
      if (typeof rebuildIndexes === 'function') rebuildIndexes();
      syncStateAndRender();
      return;
    }

    // Fallback: full refetch (eventType undefined / not provided)
    const dresses = await window.SupabaseService.fetchDresses();
    const localByDbId = {};
    (db.vay || []).forEach(v => { if (v._dbId) localByDbId[v._dbId] = v; });
    const merged = (dresses || [])
      .filter(v => !recentlyDeleted.has(v._dbId))
      .map(sup => {
        const local = localByDbId[sup._dbId];
        return local ? { ...sup, So_Lan_Thue: local.So_Lan_Thue } : sup;
      });
    const prev = db.vay || [];
    db.vay = merged;
    if (arraysDiffer(prev, merged)) {
      syncStateAndRender();
      debouncedBanner('info', '📋 Váy được cập nhật từ thiết bị khác', '📋');
    }
  } catch (err) {
    console.warn('Realtime dress sync error:', err);
  }
}

async function handleRealtimeAccessoryChange(payload) {
  if (!db) return;
  try {
    const GRACE_MS = 30000;
    const now = Date.now();
    const recentlyDeleted = new Set();
    if (db._deletedItemIds) {
      Object.entries(db._deletedItemIds).forEach(([dbId, ts]) => {
        if (now - ts < GRACE_MS) recentlyDeleted.add(dbId);
      });
    }

    // Apply payload directly when eventType is known — avoids full refetch on every event
    if (payload && payload.eventType === 'DELETE' && payload.old?._dbId) {
      const idx = (db.pk || []).findIndex(p => p._dbId === payload.old._dbId);
      if (idx !== -1) {
        db.pk.splice(idx, 1);
        localStorage.setItem(STORE, JSON.stringify(db));
        if (typeof rebuildIndexes === 'function') rebuildIndexes();
        syncStateAndRender();
      }
      return;
    }
    if (payload && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
      const sup = payload.new;
      const idx = (db.pk || []).findIndex(p => p._dbId === sup._dbId);
      const local = idx !== -1 ? db.pk[idx] : null;
      const merged = local ? { ...sup, So_Luong_Tong: local.So_Luong_Tong } : sup;
      if (idx !== -1) db.pk[idx] = merged;
      else {
        db.pk.push(merged);
        if (payload.eventType === 'INSERT') markRemoteInsert('pk', sup._dbId);
      }
      localStorage.setItem(STORE, JSON.stringify(db));
      if (typeof rebuildIndexes === 'function') rebuildIndexes();
      syncStateAndRender();
      return;
    }

    // Fallback: full refetch (eventType undefined / not provided)
    const accessories = await window.SupabaseService.fetchAccessories();
    const localByDbId = {};
    (db.pk || []).forEach(p => { if (p._dbId) localByDbId[p._dbId] = p; });
    const merged = (accessories || [])
      .filter(p => !recentlyDeleted.has(p._dbId))
      .map(sup => {
        const local = localByDbId[sup._dbId];
        return local ? { ...sup, So_Luong_Tong: local.So_Luong_Tong } : sup;
      });
    const prev = db.pk || [];
    db.pk = merged;
    if (arraysDiffer(prev, merged)) {
      syncStateAndRender();
      debouncedBanner('info', '📋 Phụ kiện được cập nhật từ thiết bị khác', '📋');
    }
  } catch (err) {
    console.warn('Realtime accessory sync error:', err);
  }
}

async function handleRealtimeOrderChange(payload) {
  if (!db) return;
  try {
    const GRACE_MS = 30000;
    const now = Date.now();
    const localByDbId = {};
    const recentlyDeleted = new Set();
    (db.don || []).forEach(o => { if (o._dbId) localByDbId[o._dbId] = o; });
    if (db._deletedOrderIds) {
      Object.entries(db._deletedOrderIds).forEach(([dbId, ts]) => {
        if (now - ts < GRACE_MS) recentlyDeleted.add(dbId);
      });
    }
    // Pending creates (orders awaiting _dbId assignment) — keep local copy untouched
    const pendingCreateMaDon = new Set();
    if (db._pendingCreate && typeof window.isPendingCreate === 'function') {
      Object.keys(db._pendingCreate).forEach(maDon => {
        if (window.isPendingCreate(maDon)) pendingCreateMaDon.add(maDon);
      });
    }

    // Apply payload directly when eventType is known — avoids full refetch on every event
    if (payload && payload.eventType === 'DELETE' && payload.old?._dbId) {
      const idx = (db.don || []).findIndex(o => o._dbId === payload.old._dbId);
      if (idx !== -1) {
        db.don.splice(idx, 1);
        localStorage.setItem(STORE, JSON.stringify(db));
        if (typeof rebuildIndexes === 'function') rebuildIndexes();
        syncStateAndRender();
      }
      return;
    }
    if (payload && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new) {
      const supOrder = payload.new;
      if (pendingCreateMaDon.has(supOrder.Ma_Don)) {
        // Pending create — keep local copy untouched; will reconcile when _dbId arrives
        return;
      }
      if (recentlyDeleted.has(supOrder._dbId)) return;
      const idx = (db.don || []).findIndex(o => o._dbId === supOrder._dbId);
      const local = idx !== -1 ? db.don[idx] : null;
      // Preserve local edit if within grace period
      const localTs = local?._ts || 0;
      const isRecent = localTs && (now - localTs) < GRACE_MS;
      const merged = (local && isRecent)
        ? local
        : (local ? { ...supOrder, _fromBooking: local._fromBooking } : supOrder);
      if (idx !== -1) db.don[idx] = merged;
      else {
        db.don.push(merged);
        if (payload.eventType === 'INSERT') markRemoteInsert('don', supOrder._dbId);
      }
      localStorage.setItem(STORE, JSON.stringify(db));
      if (typeof rebuildIndexes === 'function') rebuildIndexes();
      syncStateAndRender();
      return;
    }

    // Fallback: full refetch (eventType undefined / not provided)
    const orders = await window.SupabaseService.fetchOrders();
    const mergedAll = (orders || [])
      .filter(supOrder => !recentlyDeleted.has(supOrder._dbId))
      .filter(supOrder => !pendingCreateMaDon.has(supOrder.Ma_Don))
      .map(supOrder => {
      const local = localByDbId[supOrder._dbId];
      if (!local) return supOrder;
      const localTs = local._ts || 0;
      const isRecent = localTs && (now - localTs) < GRACE_MS;
      if (isRecent) return local; // preserve local edit
      return {
        ...supOrder,
        _fromBooking: local._fromBooking,
        // supOrder.dhvs/Ma_PK come from fetchOrders which reads junction tables — use them
      };
    });
    const prevOrders = db.don || [];
    db.don = mergedAll;
    if (arraysDiffer(prevOrders, mergedAll)) {
      localStorage.setItem(STORE, JSON.stringify(db));
      await syncBookingsToLocal();
      syncStateAndRender();
      debouncedBanner('info', '📋 Đơn hàng được cập nhật từ thiết bị khác', '📋');
    }
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

// Junction table change — apply payload.new (order_id + dress_id/accessory_id) directly when possible
async function handleRealtimeOrderDressChange(payload) {
  if (!db) return;
  console.log('[Realtime] order_dresses changed:', payload.eventType, payload.new?.id || payload.old?.id);
  try {
    const GRACE_MS = 30000;
    const now = Date.now();
    const recentlyDeleted = new Set();
    if (db._deletedOrderIds) {
      Object.entries(db._deletedOrderIds).forEach(([dbId, ts]) => {
        if (now - ts < GRACE_MS) recentlyDeleted.add(dbId);
      });
    }
    const pendingCreateMaDon = new Set();
    if (db._pendingCreate && typeof window.isPendingCreate === 'function') {
      Object.keys(db._pendingCreate).forEach(maDon => {
        if (window.isPendingCreate(maDon)) pendingCreateMaDon.add(maDon);
      });
    }

    // Apply payload directly when we have order_id + dress_id
    if (payload && payload.new && payload.new.order_id && payload.new.dress_id) {
      const order = (db.don || []).find(o => o._dbId === payload.new.order_id);
      if (order && !recentlyDeleted.has(order._dbId) && !pendingCreateMaDon.has(order.Ma_Don)) {
        const dressMa = vayByMaDon?.get?.(payload.new.dress_id) || (db.vay || []).find(v => v._dbId === payload.new.dress_id)?.Ma_Vay;
        // Just trigger a re-render — the full junction-table state requires a refetch to stay accurate
        syncStateAndRender();
        debouncedBanner('info', '👗 Váy trong đơn được cập nhật từ thiết bị khác', '📋');
        return;
      }
    }

    // Fallback: full refetch
    const orders = await window.SupabaseService.fetchOrders();
    const localByDbId = {};
    (db.don || []).forEach(o => { if (o._dbId) localByDbId[o._dbId] = o; });
    const merged = (orders || [])
      .filter(supOrder => !recentlyDeleted.has(supOrder._dbId))
      .filter(supOrder => !pendingCreateMaDon.has(supOrder.Ma_Don))
      .map(supOrder => {
      const local = localByDbId[supOrder._dbId];
      if (!local) return supOrder;
      const localTs = local._ts || 0;
      if (localTs && (now - localTs) < GRACE_MS) return local;
      return { ...supOrder, _fromBooking: local._fromBooking };
    });
    const prevDressesJ = db.don || [];
    db.don = merged;
    if (arraysDiffer(prevDressesJ, merged)) {
      localStorage.setItem(STORE, JSON.stringify(db));
      if (typeof rebuildIndexes === 'function') rebuildIndexes();
      syncStateAndRender();
      debouncedBanner('info', '👗 Váy trong đơn được cập nhật từ thiết bị khác', '📋');
    }
  } catch (err) {
    console.warn('Realtime order_dresses sync error:', err);
  }
}

async function handleRealtimeOrderAccessoryChange(payload) {
  if (!db) return;
  console.log('[Realtime] order_accessories changed:', payload.eventType, payload.new?.id || payload.old?.id);
  try {
    const GRACE_MS = 30000;
    const now = Date.now();
    const recentlyDeleted = new Set();
    if (db._deletedOrderIds) {
      Object.entries(db._deletedOrderIds).forEach(([dbId, ts]) => {
        if (now - ts < GRACE_MS) recentlyDeleted.add(dbId);
      });
    }
    const pendingCreateMaDon = new Set();
    if (db._pendingCreate && typeof window.isPendingCreate === 'function') {
      Object.keys(db._pendingCreate).forEach(maDon => {
        if (window.isPendingCreate(maDon)) pendingCreateMaDon.add(maDon);
      });
    }

    // Apply payload directly when we have order_id + accessory_id
    if (payload && payload.new && payload.new.order_id && payload.new.accessory_id) {
      const order = (db.don || []).find(o => o._dbId === payload.new.order_id);
      if (order && !recentlyDeleted.has(order._dbId) && !pendingCreateMaDon.has(order.Ma_Don)) {
        syncStateAndRender();
        debouncedBanner('info', '💍 Phụ kiện trong đơn được cập nhật từ thiết bị khác', '📋');
        return;
      }
    }

    // Fallback: full refetch
    const orders = await window.SupabaseService.fetchOrders();
    const localByDbId = {};
    (db.don || []).forEach(o => { if (o._dbId) localByDbId[o._dbId] = o; });
    const merged = (orders || [])
      .filter(supOrder => !recentlyDeleted.has(supOrder._dbId))
      .filter(supOrder => !pendingCreateMaDon.has(supOrder.Ma_Don))
      .map(supOrder => {
      const local = localByDbId[supOrder._dbId];
      if (!local) return supOrder;
      const localTs = local._ts || 0;
      if (localTs && (now - localTs) < GRACE_MS) return local;
      return { ...supOrder, _fromBooking: local._fromBooking };
    });
    const prevAcc = db.don || [];
    db.don = merged;
    if (arraysDiffer(prevAcc, merged)) {
      localStorage.setItem(STORE, JSON.stringify(db));
      if (typeof rebuildIndexes === 'function') rebuildIndexes();
      syncStateAndRender();
      debouncedBanner('info', '💍 Phụ kiện trong đơn được cập nhật từ thiết bị khác', '📋');
    }
  } catch (err) {
    console.warn('Realtime order_accessories sync error:', err);
  }
}

async function handleRealtimeBookingChange(payload) {
  if (!db) return;
  await syncBookingsToLocal();
  if (typeof refreshCurView === 'function') refreshCurView();
}

// Accept pre-fetched maps to avoid redundant fetches when called from loadFromSupabase
async function syncBookingsToLocal(preDresses, preAccessories) {
  if (!db || !window.SupabaseService.isConfigured()) return;
  try {
    const bookings = await window.SupabaseService.fetchBookings();

    let allDresses = preDresses || {};
    let allAccessories = preAccessories || {};
    // Build dual-key maps: index by both _dbId AND Ma_Vay/Ma_PK
    // _dressIds/_accIds from booking_dresses/_accessories tables may contain either
    if (!preDresses || !preAccessories) {
      try {
        const [dresses, accessories] = await Promise.all([
          window.SupabaseService.fetchDresses(),
          window.SupabaseService.fetchAccessories()
        ]);
        (dresses || []).forEach(v => {
          if (v._dbId) allDresses[v._dbId] = v;
          if (v.Ma_Vay) allDresses[v.Ma_Vay] = v;
        });
        (accessories || []).forEach(p => {
          if (p._dbId) allAccessories[p._dbId] = p;
          if (p.Ma_PK) allAccessories[p.Ma_PK] = p;
        });
      } catch (e) {
        (db.vay || []).forEach(v => {
          if (v._dbId) allDresses[v._dbId] = v;
          if (v.Ma_Vay) allDresses[v.Ma_Vay] = v;
        });
        (db.pk || []).forEach(p => {
          if (p._dbId) allAccessories[p._dbId] = p;
          if (p.Ma_PK) allAccessories[p.Ma_PK] = p;
        });
      }
    }

    const normalized = (bookings || []).map(b => {
      // Prefer _dressDetails from fetchBookings (Supabase dresses), fallback to allDresses map
      const dhvs = ((b._dressDetails || b._dressIds || [])).map(entry => {
        const dressId = entry.id || entry;
        const detail = entry.detail || allDresses[dressId];
        if (detail) {
          return { vay: detail.ma_vay || dressId, Ma_Vay: detail.ma_vay || dressId, Ten_Vay: detail.ten_vay || detail.Ten_Vay || detail.ten || 'Váy', Size: detail.size || detail.Size || '' };
        }
        const localDress = (db.vay || []).find(v => (v.Ma_Vay || v.ma) === dressId);
        if (localDress) {
          return { vay: dressId, Ma_Vay: dressId, Ten_Vay: localDress.Ten_Vay || localDress.ten || 'Váy', Size: localDress.Size || '' };
        }
        return { vay: dressId, Ma_Vay: dressId };
      });
      const Ma_PK = ((b._accDetails || b._accIds || [])).map(entry => {
        const accId = entry.id || entry;
        const detail = entry.detail || allAccessories[accId];
        if (detail) {
          return detail.ma_pk || detail.Ma_PK || accId;
        }
        const localAcc = (db.pk || []).find(p => (p.Ma_PK || p.ma) === accId);
        return localAcc ? (localAcc.Ma_PK || accId) : accId;
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
        _bookingId: b.id, // Track source booking to prevent duplicate inserts
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
    // Index by _dbId, Ma_Don, AND _bookingId to prevent duplicates
    const existingById = {};
    const existingByMa = {};
    const existingByBooking = {};
    (db.don || []).forEach(d => {
      if (d._dbId) existingById[d._dbId] = d;
      if (d.Ma_Don) existingByMa[d.Ma_Don] = d;
      if (d._bookingId) existingByBooking[d._bookingId] = d;
    });

    let newCount = 0;
    normalized.forEach(b => {
      const existing = existingById[b._dbId] || existingByMa[b.Ma_Don] || existingByBooking[b._bookingId];
      if (existing) {
        // Update existing — preserve local _ts so realtime merge doesn't overwrite newer edits
        // Only overwrite dhvs/Ma_PK if booking from Supabase actually has them
        const update = {
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
          _dressIds: b._dressIds,
          _accIds: b._accIds,
        };
        // Only update dresses/accessories if Supabase has them
        if (b.dhvs && b.dhvs.length > 0) update.dhvs = b.dhvs;
        if (b.Ma_PK && b.Ma_PK.length > 0) update.Ma_PK = b.Ma_PK;
        Object.assign(existing, update);
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

// ============================================================
// CONSOLIDATED POLLING LOOP — replaces 3 separate setInterval calls
// ============================================================
//
// Trước đây có 3 polling loop chạy song song:
//   - startFullSyncPolling (15s) — full Supabase → localStorage
//   - startBookingPolling (10s)   — booking → localStorage
//   - startFastPolling (5s)       — fallback khi realtime fail
//
// → Khi 5 thiết bị: 3 timer × 5 thiết bị × 12 lần/phút = ~180 refetch/phút
//   Overlap ngẫu nhiên → có thể 2-3 lần loadFromSupabase() chạy đồng thời.
//
// GIỜ: 1 loop duy nhất, mỗi tick check sub-threshold rồi chạy tác vụ tương ứng.
//   - Tick mỗi 5s (lowest interval)
//   - Nếu đủ 10s từ lần booking sync cuối → syncBookingsToLocal()
//   - Nếu đủ 15s từ lần full sync cuối    → loadFromSupabase() + retry pending
//
// Lợi ích:
//   - Không overlap giữa các polling
//   - Khi realtime OK → chỉ 1 loop idle, chỉ booking poll chạy
//   - Khi realtime fail → loop này thay thế startFastPolling

let _pollingLoop = null;
let _lastBookingSync = 0;
let _lastFullSync = 0;
let _pollingLoopFastMode = false; // true khi realtime fail

function startPollingLoop({ fastMode = false } = {}) {
  if (_pollingLoop) {
    // Mode change: nếu chuyển từ normal → fast, giữ nguyên loop
    _pollingLoopFastMode = fastMode;
    return;
  }
  _pollingLoopFastMode = fastMode;

  _pollingLoop = setInterval(async () => {
    if (!db) return;

    // Chế độ fast (realtime fail): full sync mỗi 5s thay vì 15s
    const fullInterval = _pollingLoopFastMode ? 5000 : 15000;
    const now = Date.now();

    // Booking poll
    if (now - _lastBookingSync > 10000) {
      try {
        await syncBookingsToLocal();
        _lastBookingSync = now;
      } catch (err) {
        console.warn('Booking poll error:', err);
      }
    }

    // Full sync
    if (now - _lastFullSync > fullInterval) {
      try {
        await loadFromSupabase();
        refreshCurView();
        _lastFullSync = now;
      } catch (err) {
        console.warn('Full sync poll error:', err);
      }
      // Retry pending
      if (typeof retryPendingOrders === 'function') {
        try { await retryPendingOrders(); } catch (err) { console.warn('Retry orders:', err); }
      }
      if (typeof retryPendingDeletes === 'function') {
        try { await retryPendingDeletes(); } catch (err) { console.warn('Retry deletes:', err); }
      }
    }
  }, 5000);

  console.log('🔁 Polling loop started (fastMode:', fastMode, ')');
}

function stopPollingLoop() {
  if (_pollingLoop) {
    clearInterval(_pollingLoop);
    _pollingLoop = null;
    _lastBookingSync = 0;
    _lastFullSync = 0;
    _pollingLoopFastMode = false;
    console.log('⏹ Polling loop stopped');
  }
}

// Stop tất cả polling. Dùng khi logout.
function stopAllPolling() {
  // fastPollingInterval là marker (không phải timer thật), chỉ reset
  fastPollingInterval = null;
  // Loop mới
  stopPollingLoop();
}

// ============================================================
// CROSS-TAB SYNC (same device, multiple browser tabs)
// ============================================================
let crossTabDebounce = null;

function setupCrossTabSync() {
  // Listen to main app storage (aura_v8)
  window.addEventListener('storage', e => {
    if (e.key !== STORE) return;
    if (e.newValue === null) return;

    clearTimeout(crossTabDebounce);
    crossTabDebounce = setTimeout(() => {
      try {
        const remote = JSON.parse(e.newValue);
        if (!remote || typeof remote !== 'object') return;

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

  // Listen to booking-form storage (aura_bookings) — convert bookings → orders in db.don
  window.addEventListener('storage', e => {
    if (e.key !== 'aura_bookings') return;
    if (e.newValue === null) return;

    clearTimeout(bookingDebounce);
    bookingDebounce = setTimeout(() => {
      try {
        const bookings = JSON.parse(e.newValue);
        if (!Array.isArray(bookings) || bookings.length === 0) return;

        let newCount = 0;
        bookings.forEach(b => {
          // Skip if already in db.don (by Ma_Don)
          if (b.id && db.don.some(o => (o.Ma_Don || o.id) === b.id)) return;

          const order = {
            _fromBooking: true,
            _bookingId: b.id,
            Ma_Don: b.id,
            Trang_Thai_Don: 'Chờ xác nhận',
            Insta_Khach: b.Insta_Khach || b.insta_khach || '',
            SDT: b.SDT || b.sdt || '',
            dhvs: Array.isArray(b.dhvs) ? b.dhvs : [],
            Ma_PK: Array.isArray(b.Ma_PK) ? b.Ma_PK : [],
            Goi_Thue: b.Goi_Thue || b.goi_thue || '',
            Ngay_Lay: b.Ngay_Lay || b.ngay_lay || '',
            Gio_Lay: b.Gio_Lay || b.gio_lay || '',
            Ngay_Tra: b.Ngay_Tra || b.ngay_tra || '',
            Hinh_Thuc_Nhan: b.Hinh_Thuc_Nhan || b.hinh_thuc_nhan || '',
            Hinh_Thuc_Coc: b.Hinh_Thuc_Coc || b.hinh_thuc_coc || '',
            Dia_Chi: b.Dia_Chi || b.dia_chi || '',
            Su_Kien: b.Su_Kien || b.su_kien || '',
            Ghi_Chu: b.Ghi_Chu || b.ghi_chu || '',
            _ts: b.Ngay_Tao ? new Date(b.Ngay_Tao).getTime() : (b._ts || Date.now()),
          };

          db.don.push(order);
          newCount++;
        });

        if (newCount > 0) {
          syncStateAndRender();
          SyncBanner.success(`📋 Có ${newCount} đơn đặt thuê mới từ website!`);
        }
      } catch (err) {
        console.warn('Booking cross-tab sync error:', err);
      }
    }, 300);
  });

  // ── Khi tab được focus / hiển thị, kiểm tra booking mới ──
  let lastBookingsLen = 0;
  function checkNewBookings() {
    try {
      const raw = localStorage.getItem('aura_bookings');
      if (!raw) return;
      const bookings = JSON.parse(raw);
      if (!Array.isArray(bookings) || bookings.length === lastBookingsLen) return;
      lastBookingsLen = bookings.length;
      importBookingsFromLocalStorage();
    } catch (e) {}
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkNewBookings();
  });

  // Polling: kiểm tra định kỳ phòng khi event bị miss
  setInterval(checkNewBookings, 5000);
}

let bookingDebounce = null;

// Import bookings from aura_bookings localStorage (same-tab: booking-form + main app in same tab)
function importBookingsFromLocalStorage() {
  try {
    const raw = localStorage.getItem('aura_bookings');
    if (!raw) return;
    const bookings = JSON.parse(raw);
    if (!Array.isArray(bookings) || bookings.length === 0) return;

    let newCount = 0;
    bookings.forEach(b => {
      if (b.id && db.don.some(o => (o.Ma_Don || o.id) === b.id)) return;

      db.don.push({
        _fromBooking: true,
        _bookingId: b.id,
        Ma_Don: b.id,
        Trang_Thai_Don: 'Chờ xác nhận',
        Insta_Khach: b.Insta_Khach || b.insta_khach || '',
        SDT: b.SDT || b.sdt || '',
        dhvs: Array.isArray(b.dhvs) ? b.dhvs : [],
        Ma_PK: Array.isArray(b.Ma_PK) ? b.Ma_PK : [],
        Goi_Thue: b.Goi_Thue || b.goi_thue || '',
        Ngay_Lay: b.Ngay_Lay || b.ngay_lay || '',
        Gio_Lay: b.Gio_Lay || b.gio_lay || '',
        Ngay_Tra: b.Ngay_Tra || b.ngay_tra || '',
        Hinh_Thuc_Nhan: b.Hinh_Thuc_Nhan || b.hinh_thuc_nhan || '',
        Hinh_Thuc_Coc: b.Hinh_Thuc_Coc || b.hinh_thuc_coc || '',
        Dia_Chi: b.Dia_Chi || b.dia_chi || '',
        Su_Kien: b.Su_Kien || b.su_kien || '',
        Ghi_Chu: b.Ghi_Chu || b.ghi_chu || '',
        _ts: b.Ngay_Tao ? new Date(b.Ngay_Tao).getTime() : (b._ts || Date.now()),
      });
      newCount++;
    });

    if (newCount > 0) {
      syncStateAndRender();
      console.log(`📋 Imported ${newCount} bookings from aura_bookings`);
    }
  } catch (err) {
    console.warn('importBookingsFromLocalStorage error:', err);
  }
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
// DELETE-ORDER WRAPPER (soft-delete in Supabase)
// All other CRUD ops (saveNewOrder, saveEditOrder, setOrderType,
// submitItem, saveRefund, deleteItem) are handled inline in app.js.
// Keeping this wrapper because deleteOrder in app.js does NOT await
// the Supabase delete — it fires-and-forgets via .catch().
// ============================================================

const _origDeleteOrder = window.deleteOrder;
window.deleteOrder = function(id) {
  const order = db.don.find(o => (o.Ma_Don || o.id) === id);
  _origDeleteOrder(id);
  if (order && order._dbId && window.SupabaseService.isConfigured()) {
    window.SupabaseService.deleteOrder(order._dbId).catch(err =>
      console.warn('Failed to delete order from Supabase:', err)
    );
  }
};

// ============================================================
// INITIALIZATION
// ============================================================

async function initWithSupabase() {
  // Cross-tab sync works in ALL modes (demo or full)
  setupCrossTabSync();

  // Also read bookings from aura_bookings (same-tab scenario: booking-form + main app)
  importBookingsFromLocalStorage();

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
    // Also import from aura_bookings (same-tab: booking-form + main app)
    importBookingsFromLocalStorage();
    syncStateAndRender();
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
      importBookingsFromLocalStorage();
      syncStateAndRender();
      showLoginModal();
      document.body.classList.add('auth-locked');
    }

  } catch (err) {
    console.error('Init failed:', err);
    loadFromLocalStorage();
    importBookingsFromLocalStorage();
    syncStateAndRender();
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

  const _origSave2 = window.save;
  window.save = function() {
    _origSave2.apply(this, arguments);
    if (window.SupabaseService.isConfigured()) {
      clearTimeout(window._syncTimer);
    }
  };
}

console.log('✅ Supabase integration loaded v22');
