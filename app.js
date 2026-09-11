const STORE = 'aura_v9';
const DELETED_IDS_KEY = 'aura_deleted_ids_v1'; // Persistent tombstone - survives cache clear
const TOMBSTONE_GRACE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year - tombstone is permanent

// Bump STORAGE_VERSION mỗi khi schema localStorage thay đổi —
// khi user mở web, nếu thấy version cũ sẽ tự động xóa cache cũ
// trước khi Supabase sync dữ liệu mới nhất về.
const STORAGE_VERSION = 10;
const STORAGE_VERSION_KEY = 'aura_storage_version';
const _storedVersion = parseInt(localStorage.getItem(STORAGE_VERSION_KEY) || '0', 10);

// Load persistent tombstone BEFORE clearing cache
let _persistentDeletedIds = {};
try {
  _persistentDeletedIds = JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '{}');
} catch (e) { _persistentDeletedIds = {}; }

// Cleanup old tombstones (older than 1 hour)
const now = Date.now();
let tombstoneCleaned = false;
Object.keys(_persistentDeletedIds).forEach(key => {
  if (now - _persistentDeletedIds[key] > TOMBSTONE_GRACE_MS) {
    delete _persistentDeletedIds[key];
    tombstoneCleaned = true;
  }
});
if (tombstoneCleaned) {
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(_persistentDeletedIds));
}

if (_storedVersion < STORAGE_VERSION) {
  // PRESERVE deleted IDs across version bumps - DON'T clear DELETED_IDS_KEY
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('aura_') && k !== STORAGE_VERSION_KEY && k !== DELETED_IDS_KEY && k !== 'aura_v9') localStorage.removeItem(k);
  });
  localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
  // Reload để RAM cũng được refresh (tránh hiện data cũ trong bộ nhớ tạm)
  console.log(`🧹 Wiped old cache (storage v${_storedVersion} → v${STORAGE_VERSION}) — reloading...`);
  location.reload();
}

/* ============================================================
 *  SYNC CONFIG — multi-device real-time
 *  Paste Web App URL từ Google Apps Script deploy vào đây.
 *  Xem hướng dẫn trong README_DEPLOY.md
 * ============================================================ */
const SYNC = {
 WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbyuiLkssHm3lybpdhvzZR5qaUeaE_DlopF4_M1EVJq0oKH41m_uEeJS_ItHpaJzZi4Giw/exec',
  POLL_MS: 10000,        // pull mỗi 10 giây (real-time)
  DEVICE_ID: 'dev_' + Math.random().toString(36).slice(2, 8),
  LAST_PULL_TS: 'aura_last_pull_ts',
  ENABLED: true,
  pendingPush: [],
  pushing: false,
  online: navigator.onLine !== false,
};

window.addEventListener('online',  () => { SYNC.online = true;  Sync.flushQueue(); });
window.addEventListener('offline', () => { SYNC.online = false; });

// === Persistent Tombstone Functions ===
// Track deleted IDs in separate localStorage key that survives cache clear
function markDeleted(table, dbId) {
  if (!dbId) return;
  _persistentDeletedIds[`${table}:${dbId}`] = Date.now();
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(_persistentDeletedIds));
}
function clearDeleted(table, dbId) {
  if (!dbId) return;
  delete _persistentDeletedIds[`${table}:${dbId}`];
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(_persistentDeletedIds));
}
function isRecentlyDeleted(table, dbId) {
  if (!dbId) return false;
  const ts = _persistentDeletedIds[`${table}:${dbId}`];
  if (!ts) return false;
  // Auto-expire after tombstone period (1 year)
  if (Date.now() - ts > TOMBSTONE_GRACE_MS) {
    clearDeleted(table, dbId);
    return false;
  }
  return true;
}
// Expose to global scope for supabase-app.js
window.markDeleted = markDeleted;
window.clearDeleted = clearDeleted;
window.isRecentlyDeleted = isRecentlyDeleted;
// === End Persistent Tombstone ===

const fmtVND = n => (n||0).toLocaleString('vi-VN') + 'd';
const parseD = s => { const x=new Date(s); x.setHours(0,0,0,0); return x; };
const today = () => { const x=new Date(); x.setHours(0,0,0,0); return x; };
const addD  = (s,n) => { const x=parseD(s); x.setDate(x.getDate()+n); return x; };
// BUG FIX: use local date components instead of UTC toISOString().
// In VN time (UTC+7), toISOString() shifts the date back one day near midnight,
// causing the calendar to show events on the wrong day.
const isoOf = d => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,'0');
  const day = String(x.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};

var db = JSON.parse(localStorage.getItem(STORE) || '{}');
// Normalize: đôi khi dhvs/pks bị Apps Script serialize thành chuỗi Java
// ("[Ljava.lang.Object;@...") thay vì mảng — chuyển về [] để không crash
(db.don || []).forEach(o => {
  if (o.dhvs !== undefined && !Array.isArray(o.dhvs)) o.dhvs = [];
  if (o.pks !== undefined && !Array.isArray(o.pks)) o.pks = [];
});
// Debounce utility — prevents search re-render on every keystroke
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// Migration: convert old lowercase format → PascalCase
if (db.don && db.don.length && !db.don[0].Ma_Don) {
  db.don = db.don.map(r => migrateRecord(r, 'order'));
  db.vay = (db.vay || []).map(r => migrateRecord(r, 'dress'));
  db.pk  = (db.pk  || []).map(r => migrateRecord(r, 'pk'));
  if (db.tt) db.tt = db.tt.map(r => migrateRecord(r, 'payment'));
  localStorage.setItem(STORE, JSON.stringify(db));
}
if (!db.don) db.don = [];
if (!db.vay) db.vay = [];
if (!db.pk)  db.pk  = [];
if (!db.tt)  db.tt  = [];
if (!db.dhv) db.dhv = [];
if (!db.form) db.form = [];
if (!db.don.length) seed();

function save(){ localStorage.setItem(STORE, JSON.stringify(db)); }

// Phase 1 — Performance: O(1) lookup by id
const vayById = new Map();
const pkById = new Map();
const donByMaDon = new Map();
const donByDbId = new Map();

function rebuildIndexes() {
  vayById.clear();
  pkById.clear();
  donByMaDon.clear();
  donByDbId.clear();
  (db.vay || []).forEach(v => { const id = v.Ma_Vay || v.ma; if (id) vayById.set(id, v); });
  (db.pk || []).forEach(p => { const id = p.Ma_PK || p.ma; if (id) pkById.set(id, p); });
  (db.don || []).forEach(o => {
    const ma = o.Ma_Don || o.id;
    if (ma) donByMaDon.set(ma, o);
    if (o._dbId) donByDbId.set(o._dbId, o);
  });
}

// Auto-rebuild indexes on every save (db mutation)
const _origSaveApp = save;
save = function() { _origSaveApp(); rebuildIndexes(); };
rebuildIndexes();

/* ============================================================
 *  PHASE 3 — UX polish helpers
 * ============================================================ */
function showSkeleton(container, rows = 6) {
  if (!container) return;
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += '<div class="skeleton skeleton-row"></div>';
  }
  container.innerHTML = html;
}

// Pending creates: orders created locally but not yet confirmed by Supabase.
// Prevents full-refetch from deleting them while awaiting _dbId.
function markPendingCreate(maDon) {
  db._pendingCreate = db._pendingCreate || {};
  db._pendingCreate[maDon] = Date.now();
  save();
}
function clearPendingCreate(maDon) {
  if (db._pendingCreate) {
    delete db._pendingCreate[maDon];
    if (!Object.keys(db._pendingCreate).length) delete db._pendingCreate;
    save();
  }
}
function isPendingCreate(maDon) {
  if (!db._pendingCreate) return false;
  const ts = db._pendingCreate[maDon];
  if (!ts) return false;
  // Expire after 24h — if Supabase still hasn't responded, treat as failure
  if (Date.now() - ts > 24 * 60 * 60 * 1000) {
    delete db._pendingCreate[maDon];
    return false;
  }
  return true;
}
window.isPendingCreate = isPendingCreate;

// Honest toasts — differentiate "saved + synced" vs "saved locally, will sync later"
function toastSave(message, isPending) {
  if (isPending) {
    toast(message + ' — sẽ đồng bộ sau', 'warning');
  } else {
    toast(message, 'success');
  }
}

// Mark order as pending sync (failed Supabase update)
function markOrderPendingSync(order) {
  if (!order) return;
  order._pendingSync = true;
  order._pendingSyncAt = Date.now();
  save();
  updatePendingSyncBadge();
}

// Retry all pending orders (called from polling & realtime)
async function retryPendingOrders() {
  if (!db || !db.don || !window.SupabaseService?.isConfigured()) return;
  const pending = (db.don || []).filter(o => o._pendingSync);
  if (!pending.length) return;

  let synced = 0;
  for (const o of pending) {
    try {
      if (o._dbId) {
        await window.SupabaseService.updateOrder(o._dbId, o);
      } else {
        const existing = await window.SupabaseService.findOrderByMaDon(o.Ma_Don);
        if (existing) {
          o._dbId = existing._dbId;
          await window.SupabaseService.updateOrder(existing._dbId, o);
        } else {
          const created = await window.SupabaseService.createOrder(o);
          if (created?._dbId) o._dbId = created._dbId;
        }
      }
      delete o._pendingSync;
      delete o._pendingSyncAt;
      synced++;
    } catch (err) {
      console.warn('Retry pending failed for', o.Ma_Don, err);
    }
  }
  if (synced > 0) {
    save();
    console.log(`[PendingSync] Synced ${synced} pending orders`);
  }
  updatePendingSyncBadge();
}

// Retry pending soft-deletes against Supabase — keeps retrying until deleted_at is confirmed
async function retryPendingDeletes() {
  if (!db || !db._deletedOrderIds || !window.SupabaseService?.isConfigured()) return;
  const ids = Object.keys(db._deletedOrderIds || {});
  if (!ids.length) return;
  for (const dbId of ids) {
    try {
      await window.SupabaseService.deleteOrder(dbId);
      delete db._deletedOrderIds[dbId];
      console.log('[Delete] Supabase confirmed on retry for', dbId);
    } catch (err) {
      console.warn('Retry delete failed for', dbId, err);
    }
  }
  localStorage.setItem(STORE, JSON.stringify(db));
}

// UI badge for pending count
function updatePendingSyncBadge() {
  const count = (db.don || []).filter(o => o._pendingSync).length;
  const badge = document.getElementById('pending-sync-badge');
  if (!badge) return;
  if (count > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = `🔄 ${count} chưa đồng bộ`;
    badge.onclick = async () => {
      badge.style.opacity = '0.5';
      await retryPendingOrders();
      badge.style.opacity = '1';
      toast(count > 0 ? `Vẫn còn ${count} đơn chưa đồng bộ` : 'Đã đồng bộ tất cả', count > 0 ? 'warn' : 'success');
    };
  } else {
    badge.style.display = 'none';
  }
}

// Simple unique ID generator
function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function seed(){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = (off)=>{ const x=new Date(today); x.setDate(x.getDate()+off); return isoOf(x); };
  db = {
    don: [
      {id:'A00001',insta:'@mimi.fit',sdt:'0901234567',goi:'3 ngày',lay:d(1),gio:'09:00',tra:d(4),
       coc:'Cọc 50% + CCCD',nhan:'Không đặt ship',dc:'Q1',chiphi:0,hoan:false,dhvs:[
         {id:'DHV1',vay:'V001'},{id:'DHV2',vay:'V002'}],pks:['P001'],
       ghichu:'Iron carefully',time_hoan:null,tao:new Date().toISOString()},
      {id:'A00002',insta:'@thuy.tran',sdt:'0912345678',goi:'12h',lay:d(0),gio:'08:00',tra:d(0),
       coc:'Cọc 100%',nhan:'Đặt ship',dc:'Q7',chiphi:50000,hoan:false,dhvs:[{id:'DHV3',vay:'V003'}],
       pks:[],ghichu:'',time_hoan:null,tao:new Date().toISOString()},
      {id:'A00003',insta:'@lan.anh',sdt:'0933445566',goi:'1 ngày',lay:d(-2),gio:'10:00',tra:d(-1),
       coc:'Cọc 50% + CCCD',nhan:'Không đặt ship',dc:'Binh Thanh',chiphi:0,hoan:true,dhvs:[
         {id:'DHV4',vay:'V001'}],pks:['P002'],ghichu:'Trả trễ 2 tiếng',time_hoan:new Date().toISOString(),
       tao:new Date().toISOString()}
    ],
    vay: [
      {ma:'V001',ten:'Váy lụa hồng',size:'S',goc:1500000,t12:900000,t1:1200000,t3:1800000,anh:'',
       gchu:'Hồng pastel, dáng chữ A',sl:5},
      {ma:'V002',ten:'Váy đen body',size:'M',goc:2000000,t12:1100000,t1:1500000,t3:2200000,anh:'',
       gchu:'Đen, dáng ôm',sl:3},
      {ma:'V003',ten:'Váy trắng công chúa',size:'M',goc:1800000,t12:1000000,t1:1400000,t3:2000000,anh:'',
       gchu:'',sl:2},
      {ma:'V004',ten:'Váy đỏ đất',size:'L',goc:1600000,t12:950000,t1:1300000,t3:1900000,anh:'',gchu:'',sl:1}
    ],
    pk: [
      {ma:'P001',ten:'Túi mini đen',loai:'Túi',t12:100000,t1:150000,t3:200000,anh:'',sl:2,gchu:''},
      {ma:'P002',ten:'Giày cao gót',loai:'Giày',t12:120000,t1:180000,t3:250000,anh:'',sl:3,gchu:''}
    ],
    tt: []
  };
  // Apply migration if old format
  if (db.don.length && !db.don[0].Ma_Don) {
    db.don = db.don.map(r => migrateRecord(r, 'order'));
    db.vay = db.vay.map(r => migrateRecord(r, 'dress'));
    db.pk  = db.pk.map(r => migrateRecord(r, 'pk'));
  }
  save();
}

/* BUG FIX: per user spec, "3 ngày" rental = 3 calendar days (lay, lay+1, lay+2).
 * So Ngay_Tra_Thuc_Te = lay + 2 (the day AFTER the last rental day = return day).
 * Same logic for "1 ngày" — if user takes on 1/1, returns on 1/2 morning = Ngay_Lay + 1.
 * For "12h", trả trong ngày = Ngay_Lay (same day).
 * Note: AppSheet spec said "+3" but the user's example "1/1 đến 3/1 = 1/1 green, 2/1 orange, 3/1 red"
 * proves the return day is lay+2 (3 rental days = 3 cells), so +3 is a typo for +2.
 */
function ngayTraThuc(goi, lay){
  if (!goi || !lay) return null;
  if (goi === '12h') return parseD(lay); // Trả cùng ngày
  if (goi === '1 ngày') return addD(lay, 1); // Trả ngày mai
  if (goi === '3 ngày') return addD(lay, 3); // Trả sau 3 ngày (01→02→03→04)
  return parseD(lay);
}

/* ============================================================
 *  CONSTANTS — status colors, labels
 * ============================================================ */
const STATUS_COLORS = {
  Chuan_Bi:  { bg: '#10b981', fg: '#ffffff', cls: 'status-chuan-bi',  badge: 'badge-green' },
  Dang_Thue: { bg: '#f59e0b', fg: '#000000', cls: 'status-dang-thue', badge: 'badge-yellow' },
  Tra_Ve:    { bg: '#ef4444', fg: '#ffffff', cls: 'status-tra-ve',    badge: 'badge-red' },
  Qua_Han:   { bg: '#6b7280', fg: '#ffffff', cls: 'status-qua-han',   badge: 'badge-gray' },
  Sap_Toi:   { bg: '#3b82f6', fg: '#ffffff', cls: 'status-sap-toi',   badge: 'badge-blue' },
};
const STATUS_LABELS = {
  Chuan_Bi:  'Cần lấy',
  Dang_Thue: 'Đang thuê',
  Tra_Ve:    'Trả hôm nay',
  Qua_Han:   'Quá hạn',
  Sap_Toi:   'Sắp tới',
};
const ORDER_TYPES = ['Chốt thuê', 'Fitting', 'Fitting xa', 'Đặt ship'];
const PK_TYPES = ['Giày', 'Túi', 'Dây chuyền', 'Khăn', 'Khác'];

/* ============================================================
 *  SCHEMA ADAPTER — convert old lowercase → PascalCase on load
 *  Old format: { id:'A00001', insta:'@x', sdt:'09', goi:'3 days',
 *                lay:'2026-06-28', tra:'2026-07-01', dhvs:[{vay:'V001'}] }
 *  New format: { Ma_Don:'A00001', Insta_Khach:'@x', SDT:'09',
 *                Goi_Thue:'3 ngày', Ngay_Lay:'2026-06-28', Ngay_Tra:'2026-07-01',
 *                dhvs:[{vay:'V001'}] }
 * ============================================================ */
function migrateRecord(rec, kind) {
  if (!rec || typeof rec !== 'object') return rec;
  // Already PascalCase?
  if (kind === 'order' && rec.Ma_Don) return rec;
  if (kind === 'dress' && (rec.Ma_Vay || rec.Ten_Vay || rec.ma_vay || rec.ten_vay)) return rec;
  if (kind === 'pk' && (rec.Ma_PK || rec.Ten_PK || rec.ma_pk || rec.ten_pk)) return rec;
  if (kind === 'payment' && (rec.Ma_TT !== undefined || rec.ma_tt !== undefined)) return rec;

  if (kind === 'order') {
    return {
      Ma_Don: rec.id,
      Trang_Thai_Don: rec.type || 'Chốt thuê',
      Insta_Khach: rec.insta,
      SDT: rec.sdt,
      Ma_PK: rec.pks || [],
      Goi_Thue: rec.goi,
      Ngay_Lay: rec.lay,
      Gio_Lay: rec.gio,
      Ngay_Tra: rec.tra,
      Hinh_Thuc_Coc: rec.coc,
      Hinh_Thuc_Nhan: rec.nhan,
      Dia_Chi: rec.dc,
      Su_Kien: rec.Su_Kien || '',
      Ghi_Chu: rec.ghichu,
      Chi_Phi_Khac: rec.chiphi || 0,
      Trang_Thai_Hoan_Coc: rec.hoan || false,
      Thoi_Gian_Hoan_Coc: rec.time_hoan,
      Ngay_Tao: rec.tao,
      dhvs: (rec.dhvs || []).map(x => ({ vay: x.vay || x.Ma_Vay })),
      _ts: rec._ts || Date.now(),
    };
  }
  if (kind === 'dress') {
    // rec can be old lowercase format (ma/ten/size/...), old snake_case (ma_vay/ten_vay/...), or already PascalCase
    return {
      Ma_Vay: rec.Ma_Vay || rec.ma_vay || rec.ma,
      Ten_Vay: rec.Ten_Vay || rec.ten_vay || rec.ten,
      Size: rec.Size || rec.size,
      Gia_Vay_Goc: rec.Gia_Vay_Goc ?? rec.gia_vay_goc ?? rec.goc ?? 0,
      Gia_Thue_12h: rec.Gia_Thue_12h ?? rec.gia_thue_12h ?? rec.t12 ?? 0,
      Gia_Thue_1_Ngay: rec.Gia_Thue_1_Ngay ?? rec.gia_thue_1_ngay ?? rec.t1 ?? 0,
      Gia_Thue_3_Ngay: rec.Gia_Thue_3_Ngay ?? rec.gia_thue_3_ngay ?? rec.t3 ?? 0,
      Anh_Vay: rec.Anh_Vay || rec.anh_vay || rec.anh || '',
      Ghi_Chu: rec.Ghi_Chu || rec.ghi_chu || rec.gchu || '',
      So_Lan_Thue: rec.So_Lan_Thue ?? rec.so_lan_thue ?? rec.sl ?? 0,
      _ts: rec._ts || Date.now(),
    };
  }
  if (kind === 'pk') {
    return {
      Ma_PK: rec.Ma_PK || rec.ma_pk || rec.ma,
      Ten_PK: rec.Ten_PK || rec.ten_pk || rec.ten,
      Loai: rec.Loai || rec.loai,
      So_Luong_Tong: rec.So_Luong_Tong ?? rec.so_luong_tong ?? rec.sl ?? 1,
      Gia_Thue_12h: rec.Gia_Thue_12h ?? rec.gia_thue_12h ?? rec.t12 ?? 0,
      Gia_Thue_1_Ngay: rec.Gia_Thue_1_Ngay ?? rec.gia_thue_1_ngay ?? rec.t1 ?? 0,
      Gia_Thue_3_Ngay: rec.Gia_Thue_3_Ngay ?? rec.gia_thue_3_ngay ?? rec.t3 ?? 0,
      Anh_PK: rec.Anh_PK || rec.anh_pk || rec.anh || '',
      Ghi_Chu: rec.Ghi_Chu || rec.ghi_chu || rec.gchu || '',
      _ts: rec._ts || Date.now(),
    };
  }
  if (kind === 'payment') {
    return {
      Ma_TT: rec.id || ('TT' + Date.now()),
      Ngay_TT: rec.Ngay_TT || rec.ngay_tt || rec.ngay?.slice(0, 10),
      Ma_Don: rec.Ma_Don || rec.ma_don || rec.ma,
      Tien_Coc: rec.Tien_Coc ?? rec.tien_coc ?? rec.tienCoc ?? 0,
      Chi_Phi_Khac: rec.Chi_Phi_Khac ?? rec.chi_phi_khac ?? rec.chiphi ?? 0,
      Ghi_Chu: rec.Ghi_Chu || rec.ghi_chu || rec.ghichu || '',
      _ts: rec._ts || Date.now(),
    };
  }
  return rec;
}

/* ============================================================
 *  CORE FORMULAS — re-implemented with PascalCase schema
 * ============================================================ */
function statusForDate(don, dateIso) {
  if (!don || don.Trang_Thai_Hoan_Coc || don.hoan) return null;
  const lay = don.Ngay_Lay;
  const goi = don.Goi_Thue;
  if (!lay || !goi) return null;
  const layDate = parseD(lay);
  const traDate = ngayTraThuc(goi, lay);
  const d = parseD(dateIso);

  if (goi === '12h') {
    return (+d === +layDate) ? 'Dang_Thue_12h' : null;
  }
  // ngayTraThuc returns last rental day. Status checks:
  if (d < layDate || d > traDate) return null;
  if (+d === +layDate) return 'Chuan_Bi';
  if (+d === +traDate) return 'Tra_Ve';
  if (d < new Date(today().setHours(0,0,0,0))) return 'Qua_Han';
  return 'Dang_Thue';
}

function donTenVay(don) {
  if (!don || !don.dhvs || !Array.isArray(don.dhvs)) return [];
  return don.dhvs.map(x => {
    // Prefer already-resolved name (from Supabase booking sync)
    if (x.Ten_Vay) return x.Ten_Vay;
    // Fall back to local dress lookup
    const key = x.Ma_Vay || x.vay;
    const v = key ? vayById.get(key) : null;
    return v ? (v.Ten_Vay || v.ten) : '';
  }).filter(Boolean);
}

// Render full list of dress names (joined) for multi-dress orders
function renderTenVayList(tenVayArr) {
  if (!tenVayArr || !tenVayArr.length) return 'Chưa chọn váy';
  return tenVayArr.map(v => escapeHtml(v)).join(' + ');
}
function donTienThueVay(don) {
  if (!don) return 0;
  const g = don.Goi_Thue === '12h' ? 'Gia_Thue_12h' : don.Goi_Thue === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay';
  const arr = Array.isArray(don.dhvs) ? don.dhvs : [];
  return arr.reduce((s, x) => {
    const key = x.Ma_Vay || x.vay;
    const v = key ? vayById.get(key) : null;
    return s + (v ? Number(v[g] || 0) : 0);
  }, 0);
}
function donTienThuePK(don) {
  if (!don) return 0;
  const g = don.Goi_Thue === '12h' ? 'Gia_Thue_12h' : don.Goi_Thue === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay';
  const pkArr = Array.isArray(don.Ma_PK || don.pks) ? (don.Ma_PK || don.pks) : [];
  return pkArr.reduce((s, id) => {
    const key = typeof id === 'object' ? (id.Ma_PK || '') : id;
    const p = key ? pkById.get(key) : null;
    return s + (p ? Number(p[g] || 0) : 0);
  }, 0);
}
function donCocGoiY(don) {
  if (!don) return 0;
  const arr = Array.isArray(don.dhvs) ? don.dhvs : [];
  const tong = arr.reduce((s, x) => {
    const key = x.Ma_Vay || x.vay;
    const v = key ? vayById.get(key) : null;
    return s + (v ? Number(v.Gia_Vay_Goc || 0) : 0);
  }, 0);
  return don.Hinh_Thuc_Coc === 'Cọc 100%' ? tong : tong * 0.5;
}
function nextMaDon() {
  const max = db.don.reduce((m, d) => {
    const id = d.Ma_Don || d.id || '';
    const n = parseInt(id.replace(/^A/, ''), 10);
    return n > m ? n : m;
  }, 0);
  return 'A' + String(max + 1).padStart(5, '0');
}
const isHoanOrder = o => o.hoan || o.Trang_Thai_Hoan_Coc;
window.debugIsHoan = isHoanOrder;
function isVayBusy(ma, dateIso, goi) {
  return db.don.some(o => {
    if (isHoanOrder(o)) return false;
    const has = (Array.isArray(o.dhvs) ? o.dhvs : []).some(x => (x.vay || x.Ma_Vay) === ma);
    if (!has) return false;
    const lay = parseD(o.Ngay_Lay);
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    const dd = parseD(dateIso);
    if (o.Goi_Thue === '12h') return +dd === +lay;
    return dd >= lay && dd <= tra;
  });
}
function isPkBusy(ma, dateIso, goi) {
  return db.don.some(o => {
    if (isHoanOrder(o)) return false;
    if (!(o.Ma_PK || o.pks || []).includes(ma)) return false;
    const lay = parseD(o.Ngay_Lay);
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    const dd = parseD(dateIso);
    if (o.Goi_Thue === '12h') return +dd === +lay;
    return dd >= lay && dd <= tra;
  });
}

function isoToVN(iso) {
  if (!iso) return '';
  // Handle Date objects
  if (iso instanceof Date || (iso.getMonth && iso.getFullYear)) {
    const d = String(iso.getDate()).padStart(2, '0');
    const m = String(iso.getMonth() + 1).padStart(2, '0');
    const y = iso.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

/* ============================================================
 *  DOM HELPERS
 * ============================================================ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v != null) e.setAttribute(k, v);
  });
  children.flat().forEach(c => {
    if (c == null) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
};
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

/* ============================================================
 *  TOAST — simple notifications
 * ============================================================ */
const _toastDur = { success: 2000, warning: 4000, error: 5000, info: 3000 };
const _lastToastAt = {};
const _lastToastMsg = {};
function toast(msg, type = '') {
  const now = Date.now();
  const wrap = $('#toast-wrap');
  if (!wrap) return;
  // Stacking: same-type toast within 800ms — append to existing
  if (_lastToastAt[type] && now - _lastToastAt[type] < 800 && _lastToastMsg[type]) {
    const prev = wrap.querySelector('[data-tmsg="' + type + '"] .t-msg');
    if (prev) {
      prev.textContent = _lastToastMsg[type] + ' + ' + msg;
      _lastToastAt[type] = now;
      return;
    }
  }
  const dur = _toastDur[type] || 2500;
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.setAttribute('data-tmsg', type);
  t.innerHTML = '<span class="t-msg">' + escapeHtml(msg) + '</span>';
  wrap.appendChild(t);
  _lastToastAt[type] = now;
  _lastToastMsg[type] = msg;
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => {
      t.remove();
      if (_lastToastAt[type] === now) {
        delete _lastToastAt[type];
        delete _lastToastMsg[type];
      }
    }, 300);
  }, dur);
}

/* ============================================================
 *  PULL-TO-REFRESH — mobile gesture
 * ============================================================ */
let _ptrStartY = 0;
let _ptrActive = false;
let _ptrTriggered = false;
document.addEventListener('touchstart', e => {
  if (window.scrollY === 0 && e.touches[0]) {
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = true;
    _ptrTriggered = false;
  }
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!_ptrActive || window.scrollY > 0) return;
  const dy = e.touches[0].clientY - _ptrStartY;
  if (dy > 80 && !_ptrTriggered) {
    _ptrTriggered = true;
    _ptrActive = false;
    if (typeof forceResync === 'function') {
      forceResync();
      toast('Đang cập nhật dữ liệu...', 'info');
    }
  }
}, { passive: true });
document.addEventListener('touchend', () => { _ptrActive = false; }, { passive: true });

/* ============================================================
 *  MODAL helpers
 * ============================================================ */
let _modalScrollY = 0;
function openModal(id) {
  if (!$$('.modal.show').length) {
    _modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  }
  document.body.classList.add('modal-open-lock');
  if (_modalScrollY > 0) {
    document.body.style.top = `-${_modalScrollY}px`;
  }
  $('#' + id).classList.add('show');
  // Delegated [data-close] listeners for this modal
  $$('#' + id + ' [data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(id), { once: true });
  });
}
function closeModal(id) {
  $('#' + id).classList.remove('show');
  if (!$$('.modal.show').length) {
    document.body.classList.remove('modal-open-lock');
    document.body.style.top = '';
    if (_modalScrollY > 0) {
      window.scrollTo({ top: _modalScrollY, left: 0, behavior: 'instant' });
    }
    _modalScrollY = 0;
  }
}

// Custom confirm modal — thay thế native confirm()
// Usage:
//   showConfirmModal({
//     title: 'Xóa đơn?',
//     message: 'Hành động không thể hoàn tác',
//     confirmText: 'Xóa',
//     danger: true,
//     onConfirm: () => { ... }
//   });
function showConfirmModal({ title = 'Xác nhận', message = '', confirmText = 'Xác nhận', cancelText = 'Hủy', danger = false, onConfirm }) {
  const html = `
    <div class="sheet-head">
      <h2 style="font-family:var(--font-display);font-style:italic">${title}</h2>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="sheet-body" style="padding:24px;text-align:center">
      <p style="margin-bottom:20px;line-height:1.5">${message}</p>
      <div style="display:flex;gap:12px">
        <button class="btn ghost" style="flex:1" data-close>${cancelText}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" style="flex:1" id="cf-confirm-btn">${confirmText}</button>
      </div>
    </div>
  `;
  $('#cf-body').innerHTML = html;
  openModal('m-confirm');

  // Wire up: backdrop click + close button đã có (m-confirm modal)
  // Confirm button
  $('#cf-confirm-btn').onclick = () => {
    closeModal('m-confirm');
    if (typeof onConfirm === 'function') onConfirm();
  };
}
function closeAllModals() {
  // Untrack presence when closing any modal
  if (typeof window.untrackOrderEditingPresence === 'function') {
    window.untrackOrderEditingPresence();
  }

  $$('.modal').forEach(m => m.classList.remove('show'));
  document.body.classList.remove('modal-open-lock');
  document.body.style.top = '';
  if (_modalScrollY > 0) {
    window.scrollTo({ top: _modalScrollY, left: 0, behavior: 'instant' });
  }
  _modalScrollY = 0;
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) closeAllModals();
  if (e.target.dataset.close != null) closeAllModals();
});

/* ============================================================
 *  IMAGE — convert file to base64 (resize for storage)
 * ============================================================ */
async function fileToCompressedDataURL(file, maxSize = 600, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return resolve(null);
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
 *  ROUTING (bottom nav)
 * ============================================================ */
let curView = 'v-cal';
function go(view) {
  curView = view;
  $$('section.view').forEach(s => s.classList.toggle('active', s.id === view));
  $$('nav.bottom button[data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === view));
  $$('.header-tab').forEach(b => {
    const v = b.getAttribute('onclick')?.match(/go\('([^']+)'\)/)?.[1];
    b.classList.toggle('active', v === view);
  });
  const titleMap = { 'v-cal': 'Lịch thuê', 'v-orders': 'Đơn hàng', 'v-orders-table': 'Bảng đơn', 'v-kho': 'Kho váy', 'v-pk': 'Phụ kiện', 'v-avail': 'Check!', 'v-dashboard': 'Dashboard' };
  $('#title').textContent = titleMap[view] || '';
  $('#fab-add').style.display = (view === 'v-kho' || view === 'v-pk') ? 'flex' : 'none';
  if (view === 'v-cal') renderCal();
  else if (view === 'v-orders') renderOrders();
  else if (view === 'v-orders-table') renderOrdersTable();
  else if (view === 'v-raw') renderRawTable();
  else if (view === 'v-kho') renderKho();
  else if (view === 'v-pk') renderPk();
  else if (view === 'v-avail') { ensureAvailDefaultDate(); renderAvail(); }
  else if (view === 'v-dashboard') { ensureDashAuth(); }
}
window._origGo = go;

function ensureAvailDefaultDate() {
  // Auto-select "Hôm nay" on first entry to tab Check if no date picked yet
  if (!availState.date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    availState.date = today;
    availState.dateStr = isoOf(today);
    document.querySelectorAll('.quick-date-btn').forEach(x => x.classList.toggle('on', x.dataset.date === 'today'));
  }
}
$$('nav.bottom button[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* ============================================================
 *  CALENDAR — Month / Day view
 * ============================================================ */
let calMode = 'month';
let calAnchor = new Date();      // current month being shown (or day being shown)
$$('.cal-mode-tabs button').forEach(b => b.onclick = () => {
  $$('.cal-mode-tabs button').forEach(x => x.classList.toggle('on', x === b));
  calMode = b.dataset.mode;
  renderCal();
});
$('#cal-nav-mth').addEventListener('click', e => {
  const btn = e.target.closest('[data-nav]');
  if (!btn) return;
  if (calMode === 'month') {
    calAnchor = new Date(calAnchor.getFullYear(), calAnchor.getMonth() + (btn.dataset.nav === 'next' ? 1 : -1), 1);
  } else {
    calAnchor = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), calAnchor.getDate() + (btn.dataset.nav === 'next' ? 1 : -1));
  }
  renderCal();
});

function renderCal() {
  if (calMode === 'month') renderMonth();
  else renderDay();
}

function renderMonth() {
  const y = calAnchor.getFullYear();
  const m = calAnchor.getMonth();
  const today = new Date();
  $('#cal-month-label').textContent = `Tháng ${m + 1} / ${y}`;
  $('#pill').textContent = `T${m + 1}/${y}`;
  $('#cal-month').style.display = 'block';
  $('#cal-day').style.display = 'none';

  // Stats removed — each calendar day shows its own indicators
  $('#cal-stats').innerHTML = '';
  const wrap = $('#cal-month');

  let html = '<div class="calendar-wrap">';

  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  html += '<div class="cal">';
  ['T2','T3','T4','T5','T6','T7','CN'].forEach(d => {
    html += `<div class="d head">${d}</div>`;
  });

  for (let i = 0; i < startDow; i++) html += '<div class="d dim"></div>';

  // Build byDate index in O(N) once
  const byDate = new Map();
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  for (const o of (db.don || [])) {
    if (isHoanOrder(o)) continue;
    const layIso = o.Ngay_Lay || o.lay;
    if (!layIso) continue;
    const goi = o.Goi_Thue || o.goi;
    const tra = ngayTraThuc(goi, layIso);
    const traIso = tra ? isoOf(tra) : null;

    if (!byDate.has(layIso)) byDate.set(layIso, { lay: 0, tra: 0, thue: 0 });
    byDate.get(layIso).lay++;

    if (traIso && traIso !== layIso) {
      if (!byDate.has(traIso)) byDate.set(traIso, { lay: 0, tra: 0, thue: 0 });
      byDate.get(traIso).tra++;

      // Thue = between lay and tra (exclusive of both endpoints)
      if (traIso > layIso) {
        const [ly, lm, ld] = layIso.split('-').map(Number);
        const [ty, tm, td] = traIso.split('-').map(Number);
        const cur = new Date(ly, lm - 1, ld + 1);
        const end = new Date(ty, tm - 1, td);
        let safety = 400;
        while (cur < end && safety-- > 0) {
          const cIso = isoOf(cur);
          if (cIso.startsWith(monthPrefix)) {
            if (!byDate.has(cIso)) byDate.set(cIso, { lay: 0, tra: 0, thue: 0 });
            byDate.get(cIso).thue++;
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(y, m, d);
    const isToday = cellDate.toDateString() === today.toDateString();
    const cellDateStr = isoOf(cellDate);

    // O(1) lookup from pre-built byDate index
    const dayData = byDate.get(cellDateStr) || { lay: 0, tra: 0, thue: 0 };

    let indicatorsHtml = '';
    if (dayData.lay || dayData.tra || dayData.thue) {
      indicatorsHtml = '<div class="day-indicators">';
      if (dayData.lay) indicatorsHtml += `<span class="day-dot green">${dayData.lay}</span>`;
      if (dayData.tra) indicatorsHtml += `<span class="day-dot red">${dayData.tra}</span>`;
      if (dayData.thue) indicatorsHtml += `<span class="day-dot yellow">${dayData.thue}</span>`;
      indicatorsHtml += '</div>';
    }

    html += `<div class="d${isToday ? ' today' : ''}" onclick="selectDay('${y}', '${m}', '${d}')">
      <div class="day-num">${d}</div>
      ${indicatorsHtml}
    </div>`;
  }

  html += '</div></div>';
  wrap.innerHTML = html;
}

// Helper functions for calendar navigation
window.selectDay = function(y, m, d) {
  calAnchor = new Date(y, m, d);
  calMode = 'day';
  $$('.cal-mode-tabs button').forEach(x => x.classList.toggle('on', x.dataset.mode === 'day'));
  renderCal();
};

window.goToTodayLay = function(y, m) {
  const today = new Date();
  const y2 = today.getFullYear();
  const m2 = today.getMonth();
  if (parseInt(y) === y2 && parseInt(m) === m2) {
    // Build layIso set once for this month
    const monthPrefix = `${y2}-${String(m2 + 1).padStart(2, '0')}`;
    const laySet = new Set();
    for (const o of (db.don || [])) {
      if (o.hoan || o.Trang_Thai_Hoan_Coc) continue;
      const lay = o.Ngay_Lay || o.lay;
      if (lay && lay.startsWith(monthPrefix)) laySet.add(lay);
    }
    for (let d = 1; d <= new Date(y2, m2 + 1, 0).getDate(); d++) {
      const cellDate = new Date(y2, m2, d);
      const cellIso = isoOf(cellDate);
      if (laySet.has(cellIso)) {
        calAnchor = cellDate;
        break;
      }
    }
    calMode = 'day';
    $$('.cal-mode-tabs button').forEach(x => x.classList.toggle('on', x.dataset.mode === 'day'));
    renderCal();
  }
};

window.goToTodayTra = function(y, m) {
  const today = new Date();
  const y2 = today.getFullYear();
  const m2 = today.getMonth();
  if (parseInt(y) === y2 && parseInt(m) === m2) {
    calMode = 'day';
    $$('.cal-mode-tabs button').forEach(x => x.classList.toggle('on', x.dataset.mode === 'day'));
    renderCal();
  }
};

let dayViewSearch = '';
const setDayViewSearch = debounce(v => { dayViewSearch = v; renderDayFiltered(); }, 300);

function renderDay() {
  const d = calAnchor;
  $('#cal-month-label').textContent = `${['CN','T2','T3','T4','T5','T6','T7'][d.getDay()]} · ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  $('#pill').textContent = `${d.getDate()}/${d.getMonth() + 1}`;
  $('#cal-month').style.display = 'none';
  $('#cal-day').style.display = 'block';

  const c = $('#cal-day');
  let html = `
    <div class="day-view-search">
      <input type="text" id="day-search" placeholder="Tìm tên, SĐT, mã đơn..." value="${escapeHtml(dayViewSearch)}"
        oninput="setDayViewSearch(this.value);" />
    </div>
    <div id="day-view-content"></div>
  `;
  c.innerHTML = html;
  renderDayFiltered();
}

function renderDayFiltered() {
  const d = calAnchor;
  const dIso = isoOf(d);
  const wrap = document.getElementById('day-view-content');
  if (!wrap) return;

  let orders = db.don.filter(o => !o.hoan && !o.Trang_Thai_Hoan_Coc && statusForDate(o, dIso));

  // Apply search filter
  if (dayViewSearch) {
    const q = dayViewSearch.toLowerCase().trim();
    orders = orders.filter(o => {
      const id = (o.Ma_Don || o.id || '').toLowerCase();
      const ins = (o.Insta_Khach || o.insta || '').toLowerCase();
      const sdt = (o.SDT || o.sdt || '').toLowerCase();
      const vays = donTenVay(o).join(' ').toLowerCase();
      return id.includes(q) || ins.includes(q) || sdt.includes(q) || vays.includes(q);
    });
  }

  if (!orders.length) {
    wrap.innerHTML = `<div class="empty"><div class="icon">📭</div><div class="title">Ngày này chưa có đơn</div>${dayViewSearch ? '<div>Thử từ khóa khác</div>' : '<div>Vuốt qua ngày khác để xem</div>'}</div>`;
    return;
  }

  // Group orders by status
  const layVay = orders.filter(o => (o.Ngay_Lay || o.lay) === dIso);
  const traVay = orders.filter(o => {
    const goi = o.Goi_Thue || o.goi;
    const ngayTra = ngayTraThuc(goi, o.Ngay_Lay || o.lay);
    return ngayTra && isoOf(ngayTra) === dIso;
  });
  const dangThue = orders.filter(o => {
    const ngayLay = o.Ngay_Lay || o.lay;
    const goi = o.Goi_Thue || o.goi;
    const ngayTra = ngayTraThuc(goi, ngayLay);
    if (!ngayTra) return false;
    const ngayLayStr = (o.Ngay_Lay || o.lay);
    const ngayTraStr = isoOf(ngayTra);
    return ngayLayStr !== dIso && ngayTraStr !== dIso;
  });

  let html = '';

  // Lay Vay group
  if (layVay.length) {
    html += `
      <div class="day-section-header lay">
        <span class="section-dot"></span>
        <span class="section-title">Lấy váy</span>
        <span class="section-count">${layVay.length}</span>
      </div>
    `;
    layVay.forEach(o => {
      html += DayOrderCard(o, 'lay');
    });
  }

  // Tra Vay group
  if (traVay.length) {
    html += `
      <div class="day-section-header tra">
        <span class="section-dot"></span>
        <span class="section-title">Trả váy</span>
        <span class="section-count">${traVay.length}</span>
      </div>
    `;
    traVay.forEach(o => {
      html += DayOrderCard(o, 'tra');
    });
  }

  // Dang Thue group
  if (dangThue.length) {
    html += `
      <div class="day-section-header thue">
        <span class="section-dot"></span>
        <span class="section-title">Đang thuê</span>
        <span class="section-count">${dangThue.length}</span>
      </div>
    `;
    dangThue.forEach(o => {
      html += DayOrderCard(o, 'thue');
    });
  }

  wrap.innerHTML = html;
}

// Generate HTML for order card in day view - Detailed version
function DayOrderCard(o, group) {
  const id = o.Ma_Don || o.id || '';
  const tenVay = donTenVay(o);
  const tenVayPrimary = tenVay[0] || 'Chưa chọn váy';
  const tenVayList = renderTenVayList(tenVay);
  const goi = o.Goi_Thue || o.goi || '';
  const is12h = goi === '12h';
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayTra = ngayTraThuc(goi, ngayLay);
  const ngayLayDisplay = isoToVN(ngayLay);
  const ngayTraDisplay = ngayTra ? isoToVN(ngayTra) : '—';
  const type = o.Trang_Thai_Don || o.type || 'Chốt thuê';

  // Color based on group
  const color = group === 'lay' ? '#10b981' : group === 'tra' ? '#ef4444' : '#f59e0b';
  const bgColor = group === 'lay' ? '#d1fae5' : group === 'tra' ? '#fee2e2' : '#fef3c7';

  // Shortcuts for lay/tra groups
  const isLayOrTra = group === 'lay' || group === 'tra';
  const daChuanBi = !!o.Da_Chuan_Bi;
  const hasNote = !!(o.Ghi_Chu || o.ghichu);
  const noteText = o.Ghi_Chu || o.ghichu || '';

  // Build extra avatars for 2nd, 3rd, ... dresses (match OrderCardListCard pattern)
  let extraAvatarsHTML = '';
  if (tenVay.length > 1) {
    const dhvs = o.dhvs || o.dresses || [];
    const extras = dhvs.slice(1).map(item => {
      const v = vayById.get(item.vay || item.Ma_Vay);
      if (!v) return '';
      const imgSrc = v.Anh_Vay || v.anh || '';
      const letter = (v.Ten_Vay || v.ten || '?')[0].toUpperCase();
      if (imgSrc) {
        return `<div class="day-card-avatar day-card-avatar-sm" style="background: ${bgColor};"><img src="${escapeHtml(imgSrc)}" alt="" /></div>`;
      }
      return `<div class="day-card-avatar day-card-avatar-sm" style="background: ${bgColor};"><span>${letter}</span></div>`;
    }).join('');
    extraAvatarsHTML = `<div class="day-card-extras">${extras}</div>`;
  }

  return `
    <div class="day-order-card ${daChuanBi ? 'chuan-bi-done' : ''}" onclick="openOrderDetail('${id}')">
      <div class="day-card-left" style="background: ${bgColor}; border-left: 3px solid ${color};">
        <div class="day-card-avatar-col">
          <div class="day-card-avatar" style="background: ${bgColor};">
            <span>${(tenVayPrimary[0] || 'V').toUpperCase()}</span>
          </div>
          ${extraAvatarsHTML}
        </div>
      </div>
      <div class="day-card-content">
        <div class="day-card-row day-card-row-top">
          <span class="day-card-name">${tenVayList}</span>
          ${is12h ? '<span class="day-card-badge badge-12h">12h</span>' : `<span class="day-card-badge">${goi}</span>`}
        </div>
        <div class="day-card-row day-card-row-meta">
          <span class="day-type-badge day-type-${type.replace(/\s/g, '').toLowerCase()}" data-type-btn onclick="event.stopPropagation();openTypePickerById('${id}')">${type}</span>
          <span class="day-card-id">${id}</span>
          ${isLayOrTra && daChuanBi ? '<span class="chuan-bi-chip done">✓ Đã chuẩn bị</span>' : ''}
        </div>
        <div class="day-card-row day-card-row-dates">
          <span class="day-date-chip">${ngayLayDisplay}</span>
          <span class="day-date-sep">→</span>
          <span class="day-date-chip">${ngayTraDisplay}</span>
        </div>
        ${hasNote
          ? `<div class="day-card-note" onclick="event.stopPropagation();openQuickNote('${id}')" title="Click để sửa">📝 ${escapeHtml(noteText)}</div>`
          : `<div class="day-card-note day-card-note-empty" onclick="event.stopPropagation();openQuickNote('${id}')" title="Click để thêm ghi chú">+ Thêm ghi chú</div>`
        }
      </div>
      ${isLayOrTra ? `
      <div class="day-card-actions" onclick="event.stopPropagation()">
        <button class="day-chuan-bi-btn ${daChuanBi ? 'done' : ''}" onclick="toggleChuanBi('${id}')" title="${daChuanBi ? 'Bỏ đánh dấu đã chuẩn bị' : 'Đánh dấu đã chuẩn bị'}">
          ${daChuanBi ? '✓' : '○'}
        </button>
      </div>` : ''}
    </div>
  `;
}

/* ============================================================
 *  ORDER CARD — new format (importance-ordered)
 *  Order: Tên váy, Gói, Phụ kiện, Thời gian, SĐT, Loại đơn
 * ============================================================ */
const OrderCard = {
  render(o, refDate = new Date()) {
    const tenVay = donTenVay(o);
    const tenVayPrimary = tenVay[0] || 'Chưa chọn váy';
    const tenVayList = renderTenVayList(tenVay);
    const tenPK = (o.Ma_PK || o.pks || []).map(pk => {
      const p = pkById.get(pk);
      return p ? (p.Ten_PK || p.ten) : '?';
    }).filter(Boolean).join(', ') || '—';
    const ngayLay = o.Ngay_Lay || o.lay;
    const ngayTra = ngayTraThuc(o.Goi_Thue || o.goi, ngayLay);
    const gioLay = o.Gio_Lay || o.gio || '—';
    const sdt = o.SDT || o.sdt || '—';
    const goi = o.Goi_Thue || o.goi || '—';
    const type = o.Trang_Thai_Don || o.type || 'Chốt thuê';
    const custName = o.Insta_Khach || o.insta || '—';

    // Status color - xác định màu sắc theo trạng thái
    const status = statusForDate(o, isoOf(refDate));
    const is12h = goi === '12h';

    // Xác định màu status bar cho card
    let statusBarColor = '';
    let statusIcon = '';
    let statusText = '';
    if (status === 'Chuan_Bi' || (is12h && status === 'Dang_Thue_12h')) {
      statusBarColor = 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'; // Xanh lá - Lấy váy
      statusIcon = '📦';
      statusText = 'LẤY VÁY';
    } else if (status === 'Dang_Thue') {
      statusBarColor = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'; // Vàng cam - Đang thuê
      statusIcon = '👗';
      statusText = 'ĐANG THUÊ';
    } else if (status === 'Tra_Ve' || (is12h && status === 'Dang_Thue_12h')) {
      statusBarColor = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'; // Đỏ - Trả váy
      statusIcon = '🔄';
      statusText = 'TRẢ VÁY';
    } else if (status === 'Qua_Han') {
      statusBarColor = 'linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)'; // Xám - Quá hạn
      statusIcon = '⚠️';
      statusText = 'QUÁ HẠN';
    } else if (status === 'Sap_Toi') {
      statusBarColor = 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)'; // Xanh dương - Sắp tới
      statusIcon = '📅';
      statusText = 'SẮP TỚI';
    }

    const dimmed = (o.hoan || o.Trang_Thai_Hoan_Coc) ? 'opacity:0.55' : '';

    // Dress image
    const firstDressId = (o.dhvs || [])[0]?.vay;
    const firstDress = firstDressId && vayById.get(firstDressId);
    const dressImg = firstDress?.Anh_Vay || firstDress?.anh || '';

    const id = o.Ma_Don || o.id || '';
    const hasNote = !!(o.Ghi_Chu || o.ghichu);
    const noteText = o.Ghi_Chu || o.ghichu || '';

    const card = el('div', { class: 'order-card', style: dimmed });
    card.onclick = () => openOrderDetail(id);

    // HEAD: dress image + name + package badge + type
    const head = el('div', { class: 'order-card-head' });
    const imgWrap = el('div', { class: 'dress-img' });
    if (dressImg) imgWrap.appendChild(el('img', { src: dressImg, alt: '' }));
    else imgWrap.textContent = (tenVayPrimary[0] || 'V').toUpperCase();
    head.appendChild(imgWrap);
    const headText = el('div', { class: 'head-text' });
    headText.appendChild(el('div', { class: 'dress-name', text: tenVayList }));
    const headMeta = el('div', { class: 'head-meta' });
    const typeBadge = el('span', {
      class: 'type-pill-inline ' + typeClass(type),
      text: type,
    });
    typeBadge.onclick = (e) => {
      e.stopPropagation();
      openTypePicker(o);
    };
    headMeta.appendChild(typeBadge);
    headMeta.appendChild(el('span', { class: 'goi-badge', text: goi }));
    headText.appendChild(headMeta);
    head.appendChild(headText);
    card.appendChild(head);

    // BODY: ngày lấy → ngày trả + ghi chú
    const body = el('div', { class: 'order-card-body order-card-body-minimal' });
    body.appendChild(rowKV('Thời gian', `${isoToVN(ngayLay)} → ${isoToVN(ngayTra)}`, false));
    if (hasNote) {
      body.appendChild(el('div', { class: 'order-card-note', text: `📝 ${noteText}` }));
    }
    card.appendChild(body);

    // FOOT: mã đơn + nút ghi chú nhanh (không có nút tick ở tab Đơn)
    const foot = el('div', { class: 'order-card-foot order-card-foot-minimal' });

    const maSpan = el('span', { class: 'order-card-ma', text: id });
    foot.appendChild(maSpan);

    card.appendChild(foot);
    return card;
  }
};

function rowKV(lbl, val, truncate = false) {
  const r = el('div', { class: 'order-card-row' });
  r.appendChild(el('span', { class: 'lbl', text: lbl }));
  const v = el('span', { class: 'val' + (truncate ? ' truncate' : '') });
  v.textContent = val;
  r.appendChild(v);
  return r;
}

function typeClass(type) {
  if (type === 'Chờ xác nhận') return 'ChoXacNhan';
  if (type === 'Fitting xa') return 'FittingXa';
  if (type === 'Đặt ship') return 'DatShip';
  if (type === 'Fitting') return 'Fitting';
  return 'ChotThue';
}

window.openTypePickerById = (id) => {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (o) openTypePicker(o);
};
function openTypePicker(o) {
  const id = o.Ma_Don || o.id;
  const types = ['Chốt thuê', 'Fitting', 'Fitting xa', 'Đặt ship', 'Chờ xác nhận'];
  const choices = types.map(t => {
    const sel = (o.Trang_Thai_Don || o.type) === t;
    return `<div class="kv" style="cursor:pointer;padding:12px;background:${sel ? 'var(--green-soft)' : 'var(--surface)'};border-radius:8px;margin-bottom:6px" onclick="setOrderType('${id}','${t}')">
      <span class="lbl" style="font-weight:600">${t}</span>
      ${sel ? '<span class="val" style="color:var(--green-deep)">✓</span>' : ''}
    </div>`;
  }).join('');
  $('#cf-body').innerHTML = `
    <div class="sheet-head"><h2>Chọn loại đơn</h2><button class="sheet-close" data-close>×</button></div>
    <div class="sheet-body">${choices}</div>
  `;
  openModal('m-confirm');
}
window.setOrderType = async (id, type) => {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  o.Trang_Thai_Don = type;
  if (o.Trang_Thai_Don === 'Đặt ship' || o.Trang_Thai_Don === 'Fitting xa') {
    o.Hinh_Thuc_Nhan = o.Hinh_Thuc_Nhan || 'Đặt ship';
  }
  o._ts = Date.now();
  o._version = (o._version || 0) + 1;

  // Sync to Supabase BEFORE close modal (blocking)
  if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
    try {
      // Build payload with correct key names: Ma_PK → pks
      const payload = { ...o, pks: o.Ma_PK };
      if (o._dbId) {
        await window.SupabaseService.updateOrder(o._dbId, payload);
      } else {
        const existing = await window.SupabaseService.findOrderByMaDon(o.Ma_Don);
        if (existing) {
          o._dbId = existing._dbId;
          await window.SupabaseService.updateOrder(existing._dbId, payload);
        } else {
          const created = await window.SupabaseService.createOrder(payload);
          if (created?._dbId) o._dbId = created._dbId;
        }
      }
    } catch (err) {
      console.warn('Supabase sync failed:', err);
      markOrderPendingSync(o);
    }
  }

  save();
  // Re-render BEFORE closeModal — closeModal sets body.position=fixed which
  // resets window.scrollY, so capturing scrollY after closeModal gives 0
  refreshCurView();
  closeModal('m-confirm');
  toast('Đã đổi loại đơn → ' + type, 'success');
};

// Toggle "Đã chuẩn bị" for an order — used in calendar day view
window.toggleChuanBi = async (id) => {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  o.Da_Chuan_Bi = !o.Da_Chuan_Bi;
  o._ts = Date.now();
  o._version = (o._version || 0) + 1;
  save();
  syncOrderToSupabase(o);
  refreshCurView();
  if (o.Da_Chuan_Bi) toast('✓ Đã đánh dấu đã chuẩn bị', 'success');
};

// Quick note shortcut — prompt inline, save to Ghi_Chu
window.openQuickNote = (id) => {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  const current = o.Ghi_Chu || o.ghichu || '';
  $('#qn-body').innerHTML = `
    <div class="sheet-head"><h2>📝 Ghi chú — ${id}</h2><button class="sheet-close" data-close>×</button></div>
    <div class="sheet-body">
      <div class="qn-label">Nội dung ghi chú</div>
      <textarea id="qn-textarea" class="qn-textarea" placeholder="Nhập ghi chú...">${escapeHtml(current)}</textarea>
      <div class="qn-footer">
        <button class="btn secondary" data-close>Hủy</button>
        <button class="btn primary" onclick="saveQuickNote('${id}')">Lưu</button>
      </div>
    </div>
  `;
  openModal('m-quick-note');
  setTimeout(() => $('#qn-textarea')?.focus(), 100);
};

window.saveQuickNote = (id) => {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  const note = $('#qn-textarea')?.value || '';
  o.Ghi_Chu = note;
  o._ts = Date.now();
  o._version = (o._version || 0) + 1;
  save();
  syncOrderToSupabase(o);
  closeAllModals();
  refreshCurView();
  toast(note ? 'Đã lưu ghi chú' : 'Đã xóa ghi chú', 'success');
};

// === Expense CRUD ===
let _expenseModalOpen = false;
window.openExpenseModal = (e) => {
  // Prevent event bubbling from triggering parent click handlers
  if (e) { e.stopPropagation(); e.preventDefault(); }
  if (_expenseModalOpen) return;
  _expenseModalOpen = true;
  try {
    if (!db.chiPhi) db.chiPhi = [];
    const { month, year } = dashState;
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const monthExpenses = db.chiPhi.filter(e => {
      const d = parseD(e.date);
      return d && d.getMonth() + 1 === month && d.getFullYear() === year;
    });
    const total = monthExpenses.reduce((s, e) => s + Number(e.soTien || 0), 0);

    const listHtml = monthExpenses.length > 0
      ? monthExpenses.map(e => `
        <div class="exp-item">
          <div class="exp-item-left">
            <div class="exp-item-date">${e.date}</div>
            <div class="exp-item-content">${escapeHtml(e.noiDung || '')}</div>
          </div>
          <div class="exp-item-right">
            <div class="exp-item-amount">${fmtVND(Number(e.soTien))}</div>
            <button class="exp-del-btn" onclick="window.deleteExpense('${e.id}'); return false;">×</button>
          </div>
        </div>`).join('')
      : '<div class="exp-empty">Chưa có chi phí nào tháng này</div>';

    const expBody = document.getElementById('exp-body');
    if (!expBody) {
      console.error('exp-body element not found');
      return;
    }
    expBody.innerHTML = `
      <div class="sheet-head"><h2>💸 Chi phí thủ công</h2><button class="sheet-close" data-close>×</button></div>
      <div class="sheet-body">
        <div class="exp-total-bar">Tổng tháng: <strong>${fmtVND(total)}</strong></div>
        <div class="exp-list">${listHtml}</div>
        <div class="exp-form">
          <div class="exp-form-title">＋ Thêm chi phí mới</div>
          <div class="exp-row"><input type="date" id="exp-date" value="${todayStr}" class="exp-input" /></div>
          <div class="exp-row"><input type="text" id="exp-content" placeholder="Nội dung (VD: sửa váy, giặt, mua phụ kiện...)" class="exp-input" /></div>
          <div class="exp-row"><input type="number" id="exp-amount" placeholder="Số tiền (VNĐ)" class="exp-input" min="0" /></div>
          <div class="exp-actions">
            <button class="btn secondary" data-close>Hủy</button>
            <button class="btn primary" onclick="window.saveExpense(); return false;">Lưu</button>
          </div>
        </div>
      </div>
    `;
    openModal('m-expense');
    _expenseModalOpen = false;
  } catch(e) {
    console.error('openExpenseModal error:', e);
    _expenseModalOpen = false;
    toast('Không thể mở chi phí: ' + e.message, 'error');
  }
};

window.saveExpense = () => {
  try {
    if (!db.chiPhi) db.chiPhi = [];
    const date = document.getElementById('exp-date')?.value;
    const noiDung = document.getElementById('exp-content')?.value?.trim();
    const soTien = parseInt(document.getElementById('exp-amount')?.value || '0', 10);
    if (!date || !soTien) { toast('Nhập đầy đủ ngày và số tiền', 'error'); return; }
    db.chiPhi.push({ id: 'exp_' + Date.now(), date, soTien, noiDung, _ts: Date.now() });
    save();
    closeAllModals();
    // Invalidate dash cache
    const key = `dash_${dashState.month}_${dashState.year}`;
    if (typeof dashCache !== 'undefined') delete dashCache[key];
    if (dashState.dashTab !== 'chiphi') { renderDashboard(); }
    toast('Đã thêm chi phí', 'success');
  } catch(e) {
    console.error('saveExpense error:', e);
    toast('Lỗi khi lưu: ' + e.message, 'error');
  }
};

window.deleteExpense = (id) => {
  openConfirm(
    'Xóa chi phí này?',
    () => {
      try {
        if (!db.chiPhi) return;
        const idx = db.chiPhi.findIndex(e => e.id === id);
        if (idx !== -1) db.chiPhi.splice(idx, 1);
        save();
        const key = `dash_${dashState.month}_${dashState.year}`;
        if (typeof dashCache !== 'undefined') delete dashCache[key];
        openExpenseModal();
        toast('Đã xóa chi phí', 'success');
      } catch(e) {
        console.error('deleteExpense error:', e);
        toast('Lỗi khi xóa: ' + e.message, 'error');
      }
    }
  );
};

// Sync one order to Supabase (shared helper)
async function syncOrderToSupabase(o) {
  if (typeof window.SupabaseService === 'undefined' || !window.SupabaseService.isConfigured?.()) return;
  try {
    const payload = { ...o, pks: o.Ma_PK };
    if (o._dbId) {
      await window.SupabaseService.updateOrder(o._dbId, payload);
    } else {
      const existing = await window.SupabaseService.findOrderByMaDon(o.Ma_Don);
      if (existing) {
        o._dbId = existing._dbId;
        await window.SupabaseService.updateOrder(existing._dbId, payload);
      } else {
        const created = await window.SupabaseService.createOrder(payload);
        if (created?._dbId) o._dbId = created._dbId;
      }
    }
  } catch (err) {
    console.warn('Supabase sync failed:', err);
    markOrderPendingSync(o);
  }
}

/* ============================================================
 *  ORDERS VIEW
 * ============================================================ */
let curOrderDate = null;
let curOrderTypeFilter = 'type-all';
let curOrderSearch = '';
function renderOrders() {
  const list = $('#order-list');
  list.innerHTML = '';
  const today = new Date();
  const todayIso = isoOf(today);

  let arr = db.don.slice();
  // Deduplicate by Ma_Don/id — keep first occurrence
  const seen = new Set();
  arr = arr.filter(o => {
    const key = o.Ma_Don || o.id || '';
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Filter theo ngày lấy (Ngay_Lay) — null = hiện tất cả (trừ đã hoàn)
  if (curOrderDate) {
    arr = arr.filter(o => !isHoanOrder(o) && (o.Ngay_Lay || o.lay) === curOrderDate);
  } else {
    arr = arr.filter(o => !isHoanOrder(o));
  }

  // Lọc theo loại đơn
  if (curOrderTypeFilter !== 'type-all') {
    const typeMap = {
      'type-chot': 'Chốt thuê',
      'type-fitting': 'Fitting',
      'type-fittingxa': 'Fitting xa',
      'type-datship': 'Đặt ship'
    };
    const targetType = typeMap[curOrderTypeFilter];
    if (targetType) {
      arr = arr.filter(o => (o.Trang_Thai_Don || o.type) === targetType);
    }
  }

  // Search
  const q = curOrderSearch.toLowerCase().trim();
  if (q) {
    arr = arr.filter(o => {
      const id = o.Ma_Don || o.id || '';
      const ins = o.Insta_Khach || o.insta || '';
      const sdt = o.SDT || o.sdt || '';
      const vays = (o.dhvs || []).map(x => {
        const v = vayById.get(x.vay || x.Ma_Vay);
        return v ? (v.Ten_Vay || v.ten) : '';
      }).join(' ');
      return id.toLowerCase().includes(q) || ins.toLowerCase().includes(q) || sdt.includes(q) || vays.toLowerCase().includes(q);
    });
  }

  // Sort: active first, then Ngay_Lay ASC (nearest date first)
  arr.sort((a, b) => {
    const aHoan = isHoanOrder(a);
    const bHoan = isHoanOrder(b);
    if (aHoan !== bHoan) return aHoan ? 1 : -1;
    return (a.Ngay_Lay || a.lay || '').localeCompare(b.Ngay_Lay || b.lay || '');
  });

  if (!arr.length) {
    // Skeleton: first-load only — db.don empty AND không filter ngày
    if (!db.don || db.don.length === 0) {
      if (!curOrderDate) {
        showSkeleton(list, 8);
        return;
      }
    }
    const q = curOrderSearch.toLowerCase().trim();
    const msg = q
      ? 'Không tìm thấy đơn nào'
      : curOrderDate
        ? `Chưa có đơn lấy ngày ${isoToVN(curOrderDate)}`
        : 'Chưa có đơn nào';
    const cta = !q && !curOrderDate
      ? '<button class="btn primary" onclick="openNewOrder()">＋ Tạo đơn đầu tiên</button>'
      : '';
    list.innerHTML = `<div class="empty empty-cta"><div class="icon">📭</div><div class="title">${msg}</div>${cta}</div>`;
    return;
  }

  // Group orders by Ngay_Lay for display
  const ordersByDate = {};
  arr.forEach(o => {
    const dateKey = o.Ngay_Lay || o.lay || 'unknown';
    if (!ordersByDate[dateKey]) ordersByDate[dateKey] = [];
    ordersByDate[dateKey].push(o);
  });

  // Render with date separators
  Object.keys(ordersByDate).sort().forEach(dateKey => {
    const dateOrders = ordersByDate[dateKey];
    const dateDisplay = isoToVN(dateKey);
    const isToday = dateKey === todayIso;
    const isPast = dateKey < todayIso;

    // Date header
    let headerClass = 'order-date-header';
    if (isToday) headerClass += ' today';
    else if (isPast) headerClass += ' past';

    const header = document.createElement('div');
    header.className = headerClass;
    header.innerHTML = `
      <span class="date-label">${isToday ? 'Hôm nay' : dateDisplay}</span>
      <span class="date-count">${dateOrders.length} đơn</span>
    `;
    list.appendChild(header);

    // Orders for this date
    dateOrders.forEach((o, i) => {
      const card = OrderCardListCard(o, today);
      const div = document.createElement('div');
      div.className = 'stagger-item';
      div.style.animationDelay = `${Math.min(i, 20) * 30}ms`;
      div.innerHTML = card;
      list.appendChild(div);
    });
  });
}

// Order card for list view - detailed with dates
function OrderCardListCard(o, refDate = new Date()) {
  const id = o.Ma_Don || o.id || '';
  const tenVay = donTenVay(o);
  const tenVayPrimary = tenVay[0] || 'Chưa chọn váy';
  const tenVayList = renderTenVayList(tenVay);
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayLayDisplay = isoToVN(ngayLay);
  const goi = o.Goi_Thue || o.goi || '';
  const ngayTra = ngayTraThuc(goi, ngayLay);
  const ngayTraDisplay = ngayTra ? isoToVN(ngayTra) : '—';
  const is12h = goi === '12h';
  const status = statusForDate(o, isoOf(refDate));
  const type = o.Trang_Thai_Don || o.type || 'Chốt thuê';
  const hasNote = !!(o.Ghi_Chu || o.ghichu);
  const noteText = o.Ghi_Chu || o.ghichu || '';

  // Status color
  let statusColor = '#f59e0b';
  if (status === 'Chuan_Bi') statusColor = '#10b981';
  else if (status === 'Tra_Ve') statusColor = '#ef4444';
  else if (status === 'Qua_Han') statusColor = '#6b7280';
  else if (is12h && status === 'Dang_Thue_12h') statusColor = 'linear-gradient(135deg, #10b981, #ef4444)';

  // Build extra avatars (2nd, 3rd, ...) — same structure as calendar day view
  let extraAvatarsHTML = '';
  if (tenVay.length > 1) {
    const dhvs = o.dhvs || o.dresses || [];
    const extras = dhvs.slice(1).map(item => {
      const v = vayById.get(item.vay || item.Ma_Vay);
      if (!v) return '';
      const imgSrc = v.Anh_Vay || v.anh || '';
      const letter = (v.Ten_Vay || v.ten || '?')[0].toUpperCase();
      if (imgSrc) {
        return `<div class="day-card-avatar day-card-avatar-sm" style="background: ${statusColor};"><img src="${escapeHtml(imgSrc)}" alt="" /></div>`;
      }
      return `<div class="day-card-avatar day-card-avatar-sm" style="background: ${statusColor};"><span>${letter}</span></div>`;
    }).join('');
    extraAvatarsHTML = `<div class="day-card-extras">${extras}</div>`;
  }

  return `
    <div class="day-order-card" style="border-left-color: ${statusColor};" onclick="openOrderDetail('${id}')">
      <div class="day-card-left" style="background: ${statusColor}20;">
        <div class="day-card-avatar-col">
          <div class="day-card-avatar" style="background: ${statusColor}40;">
            <span>${(tenVayPrimary[0] || 'V').toUpperCase()}</span>
          </div>
          ${extraAvatarsHTML}
        </div>
      </div>
      <div class="day-card-content">
        <div class="day-card-row day-card-row-top">
          <span class="day-card-name">${tenVayList}</span>
          ${is12h ? '<span class="day-card-badge badge-12h">12h</span>' : `<span class="day-card-badge">${goi}</span>`}
        </div>
        <div class="day-card-row day-card-row-meta">
          <span class="day-type-badge day-type-${typeClass(type).toLowerCase()}" data-type-btn onclick="event.stopPropagation();openTypePickerById('${id}')">${type}</span>
          <span class="day-card-id">${id}</span>
        </div>
        <div class="day-card-row day-card-row-dates">
          <span class="day-date-chip">${ngayLayDisplay}</span>
          <span class="day-date-sep">→</span>
          <span class="day-date-chip">${ngayTraDisplay}</span>
        </div>
        ${hasNote
          ? `<div class="day-card-note" onclick="event.stopPropagation();openQuickNote('${id}')" title="Click để sửa">${escapeHtml(noteText)}</div>`
          : `<div class="day-card-note day-card-note-empty" onclick="event.stopPropagation();openQuickNote('${id}')" title="Click để thêm ghi chú">+ Thêm ghi chú</div>`
        }
      </div>
    </div>
  `;
}

$('#search').oninput = debounce(e => { curOrderSearch = e.target.value; renderOrders(); }, 300);
$$('#order-chips button').forEach(b => b.onclick = () => {
  $$('#order-chips button').forEach(x => x.classList.toggle('on', x === b));
  $('#order-date').value = '';
  if (b.dataset.f === 'all') {
    curOrderDate = null;
  } else {
    const offset = { today: 0, tomorrow: 1, yesterday: -1 }[b.dataset.f];
    const d = new Date();
    d.setDate(d.getDate() + offset);
    curOrderDate = isoOf(d);
    $('#order-date').value = curOrderDate;
  }
  renderOrders();
});

$('#order-date').onchange = (e) => {
  const v = e.target.value;
  if (v) {
    curOrderDate = v;
    $$('#order-chips button').forEach(x => x.classList.remove('on'));
  } else {
    curOrderDate = null;
    $$('#order-chips button')[0].classList.add('on');
  }
  renderOrders();
};

$$('#order-type-chips button').forEach(b => b.onclick = () => {
  $$('#order-type-chips button').forEach(x => x.classList.toggle('on', x === b));
  curOrderTypeFilter = b.dataset.f;
  renderOrders();
});

/* ============================================================
 *  ORDERS TABLE VIEW (Excel-like)
 * ============================================================ */
let curOrderTableDate = null;

function renderOrdersTable() {
  const search = ($('#search-orders-table') || {}).value?.toLowerCase().trim() || '';
  let arr = (db.don || []).slice();

  // Filter by date
  if (curOrderTableDate) {
    arr = arr.filter(o => o.Ngay_Lay === curOrderTableDate);
  }

  // Filter by search
  if (search) {
    arr = arr.filter(o =>
      (o.Ten_KH || o.ten_kh || '').toLowerCase().includes(search) ||
      (o.Ma_Don || o.ma_don || '').toLowerCase().includes(search) ||
      (o.SDT || o.sdt || '').includes(search)
    );
  }

  // Sort by date descending
  arr.sort((a, b) => {
    const dateA = a.Ngay_Lay || a.ngay_lay || '';
    const dateB = b.Ngay_Lay || b.ngay_lay || '';
    return dateB.localeCompare(dateA);
  });

  // Update count
  const countEl = $('#orders-table-count');
  if (countEl) countEl.textContent = `${arr.length} đơn`;

  // Build table
  const thead = $('#orders-table thead');
  const tbody = $('#orders-table tbody');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Ngày lấy</th>
    <th>Mã đơn</th>
    <th>Loại đơn</th>
    <th>Khách hàng</th>
    <th>SĐT</th>
    <th>Váy</th>
    <th>PK</th>
    <th>Gói thuê</th>
    <th>Giờ lấy</th>
    <th>Ngày trả</th>
    <th>Nhận đồ</th>
    <th>Địa chỉ</th>
    <th>Tiền váy</th>
    <th>Tiền PK</th>
    <th>Tổng tiền</th>
    <th>Đặt cọc</th>
    <th>Ghi chú</th>
    <th>Hoàn cọc</th>
  </tr>`;

  tbody.innerHTML = arr.map(o => {
    const tenVay = donTenVay(o).join(' + ') || '—';
    const pkKeys = (o.Ma_PK || o.pks || []);
    const tenPK = (Array.isArray(pkKeys) ? pkKeys : []).map(pk => {
      const p = pkById.get(pk);
      return p ? (p.Ten_PK || p.ten) : '';
    }).filter(Boolean).join(', ') || '—';
    const goi = o.Goi_Thue || o.goi || '';
    const lay = o.Ngay_Lay || o.lay || '';
    const ngayTra = ngayTraThuc(goi, lay);
    const ngayTraStr = ngayTra ? isoToVN(ngayTra) : '—';
    const tienVay = donTienThueVay(o);
    const tienPK = donTienThuePK(o);
    const tong = tienVay + tienPK;
    const coc = donCocGoiY(o);
    const ghichu = o.Ghi_Chu || o.ghichu || '';
    const hoan = isHoanOrder(o);

    return `<tr onclick="openOrderDetail('${o.Ma_Don || o.id}')">
      <td>${isoToVN(lay)}</td>
      <td><b>${o.Ma_Don || o.id || ''}</b></td>
      <td>${o.Trang_Thai_Don || o.type || '—'}</td>
      <td>${escapeHtml(o.Insta_Khach || o.insta || o.Ten_KH || o.ten_kh || '—')}</td>
      <td>${o.SDT || o.sdt || ''}</td>
      <td>${escapeHtml(tenVay)}</td>
      <td>${escapeHtml(tenPK)}</td>
      <td>${goi}</td>
      <td>${o.Gio_Lay || o.gio || ''}</td>
      <td>${ngayTraStr}</td>
      <td>${escapeHtml(o.Hinh_Thuc_Nhan || o.nhan || '')}</td>
      <td>${escapeHtml(o.Dia_Chi || o.dc || '')}</td>
      <td>${fmtVND(tienVay)}</td>
      <td>${fmtVND(tienPK)}</td>
      <td>${fmtVND(tong)}</td>
      <td>${fmtVND(coc)}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(ghichu)}">${escapeHtml(ghichu)}</td>
      <td>${hoan ? '<span style="color:var(--text-muted)">Đã hoàn</span>' : '—'}</td>
    </tr>`;
  }).join('');
}

// Search handler
$('#search-orders-table').oninput = renderOrdersTable;

// Date filter
$('#order-table-date').onchange = (e) => {
  const v = e.target.value;
  curOrderTableDate = v || null;
  renderOrdersTable();
};

// Table chips
$$('#orders-table-chips button').forEach(b => b.onclick = () => {
  $$('#orders-table-chips button').forEach(x => x.classList.toggle('on', x === b));
  const f = b.dataset.f;
  if (f === 'all') {
    curOrderTableDate = null;
    $('#order-table-date').value = '';
  } else if (f === 'today') {
    curOrderTableDate = isoOf(new Date());
    $('#order-table-date').value = curOrderTableDate;
  } else if (f === 'tomorrow') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    curOrderTableDate = isoOf(d);
    $('#order-table-date').value = curOrderTableDate;
  } else if (f === 'yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 1);
    curOrderTableDate = isoOf(d);
    $('#order-table-date').value = curOrderTableDate;
  }
  renderOrdersTable();
});

// Copy table to clipboard (tab-separated for Excel)
function copyOrdersTable() {
  const rows = [];
  rows.push(['Ngày lấy', 'Mã đơn', 'Loại đơn', 'Khách hàng', 'SĐT', 'Váy', 'PK', 'Gói thuê', 'Giờ lấy', 'Ngày trả', 'Nhận đồ', 'Địa chỉ', 'Tiền váy', 'Tiền PK', 'Tổng tiền', 'Đặt cọc', 'Ghi chú', 'Hoàn cọc']);

  const arr = (db.don || []).slice().sort((a, b) => (b.Ngay_Lay || b.ngay_lay || '').localeCompare(a.Ngay_Lay || a.ngay_lay || ''));

  arr.forEach(o => {
    const tenVay = donTenVay(o).join(' + ') || '';
    const pkKeys = (o.Ma_PK || o.pks || []);
    const tenPK = (Array.isArray(pkKeys) ? pkKeys : []).map(pk => {
      const p = pkById.get(pk);
      return p ? (p.Ten_PK || p.ten) : '';
    }).filter(Boolean).join(', ');
    const goi = o.Goi_Thue || o.goi || '';
    const lay = o.Ngay_Lay || o.lay || '';
    const ngayTra = ngayTraThuc(goi, lay);
    const ngayTraStr = ngayTra ? isoOf(ngayTra) : '';
    const tienVay = donTienThueVay(o);
    const tienPK = donTienThuePK(o);
    const tong = tienVay + tienPK;
    const coc = donCocGoiY(o);
    const ghichu = o.Ghi_Chu || o.ghichu || '';
    const hoan = isHoanOrder(o) ? 'Đã hoàn' : '';

    rows.push([
      isoToVN(lay),
      o.Ma_Don || o.id || '',
      o.Trang_Thai_Don || o.type || '',
      o.Insta_Khach || o.insta || o.Ten_KH || o.ten_kh || '',
      o.SDT || o.sdt || '',
      tenVay,
      tenPK,
      goi,
      o.Gio_Lay || o.gio || '',
      ngayTraStr,
      o.Hinh_Thuc_Nhan || o.nhan || '',
      o.Dia_Chi || o.dc || '',
      tienVay.toString(),
      tienPK.toString(),
      tong.toString(),
      coc.toString(),
      ghichu,
      hoan
    ]);
  });

  const text = rows.map(r => r.join('\t')).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    toast('Đã copy bảng vào clipboard!', 'success');
  }).catch(() => {
    toast('Lỗi copy', 'error');
  });
}

function renderRawTable() {
  const sel = $('#raw-month-select');
  const monthFilter = sel ? sel.value : '';

  let arr = (db.don || []).filter(isHoanOrder);

  // Filter by month
  if (monthFilter) {
    arr = arr.filter(o => {
      const d = o.Ngay_Lay || o.lay || '';
      return d.startsWith(monthFilter);
    });
  }

  // Sort by Ngay_Lay descending
  arr.sort((a, b) => {
    return (b.Ngay_Lay || b.lay || '').localeCompare(a.Ngay_Lay || a.lay || '');
  });

  // Update count
  const countEl = $('#raw-table-count');
  if (countEl) countEl.textContent = `${arr.length} đơn`;

  const thead = $('#raw-table thead');
  const tbody = $('#raw-table tbody');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Ngày lấy</th>
    <th>Mã đơn</th>
    <th>Loại đơn</th>
    <th>Khách hàng</th>
    <th>SĐT</th>
    <th>Váy</th>
    <th>PK</th>
    <th>Gói thuê</th>
    <th>Giờ lấy</th>
    <th>Ngày trả</th>
    <th>Nhận đồ</th>
    <th>Địa chỉ</th>
    <th>Tiền váy</th>
    <th>Tiền PK</th>
    <th>Tổng tiền</th>
    <th>Đặt cọc</th>
    <th>Ghi chú</th>
    <th>Hoàn cọc</th>
  </tr>`;

  tbody.innerHTML = arr.map(o => {
    const tenVay = donTenVay(o).join(' + ') || '—';
    const pkKeys = o.Ma_PK || o.pks || [];
    const tenPK = (Array.isArray(pkKeys) ? pkKeys : []).map(pk => {
      const p = pkById.get(pk);
      return p ? (p.Ten_PK || p.ten) : '';
    }).filter(Boolean).join(', ') || '—';
    const goi = o.Goi_Thue || o.goi || '';
    const lay = o.Ngay_Lay || o.lay || '';
    const ngayTra = ngayTraThuc(goi, lay);
    const ngayTraStr = ngayTra ? isoToVN(ngayTra) : '—';
    const tienVay = donTienThueVay(o);
    const tienPK = donTienThuePK(o);
    const tong = tienVay + tienPK;
    const coc = donCocGoiY(o);
    const ghichu = o.Ghi_Chu || o.ghichu || '';
    const hoan = isHoanOrder(o);
    const timeHoan = o.time_hoan ? isoToVN(o.time_hoan) + ' ' + o.time_hoan.slice(11, 16) : '';
    return `<tr onclick="openOrderDetail('${o.Ma_Don || o.id}')">
      <td>${isoToVN(lay)}</td>
      <td><b>${o.Ma_Don || o.id || ''}</b></td>
      <td>${o.Trang_Thai_Don || o.type || '—'}</td>
      <td>${escapeHtml(o.Insta_Khach || o.insta || o.Ten_KH || o.ten_kh || '—')}</td>
      <td>${o.SDT || o.sdt || ''}</td>
      <td>${escapeHtml(tenVay)}</td>
      <td>${escapeHtml(tenPK)}</td>
      <td>${escapeHtml(goi)}</td>
      <td>${o.Gio_Lay || o.gio || ''}</td>
      <td>${ngayTraStr}</td>
      <td>${escapeHtml(o.Hinh_Thuc_Nhan || o.nhan || '')}</td>
      <td>${escapeHtml(o.Dia_Chi || o.dc || '')}</td>
      <td>${fmtVND(tienVay)}</td>
      <td>${fmtVND(tienPK)}</td>
      <td>${fmtVND(tong)}</td>
      <td>${fmtVND(coc)}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(ghichu)}">${escapeHtml(ghichu)}</td>
      <td>${hoan ? `<span style="color:#d4af37;font-weight:600">${timeHoan || 'Đã hoàn'}</span>` : '—'}</td>
    </tr>`;
  }).join('');

  // Populate month select with available months
  if (sel) {
    const months = new Set();
    (db.don || []).forEach(o => {
      const d = o.Ngay_Lay || o.lay || '';
      if (d) months.add(d.slice(0, 7));
    });
    const current = sel.value;
    sel.innerHTML = '<option value="">Tất cả các tháng</option>' +
      Array.from(months).sort((a, b) => b.localeCompare(a))
        .map(m => `<option value="${m}">${m}</option>`).join('');
    sel.value = current;
    sel.onchange = renderRawTable;
  }
}

function showRawExportModal() {
  openModal('m-raw-export');
  const modalSel = $('#raw-export-month');
  const mainSel = $('#raw-month-select');
  if (modalSel && mainSel) modalSel.value = mainSel.value;
}

function exportRawToExcelFromModal() {
  const sel = $('#raw-export-month');
  const mainSel = $('#raw-month-select');
  if (sel && mainSel) mainSel.value = sel.value;
  renderRawTable();
  closeModal('m-raw-export');
  copyRawTableToClipboard();
}

function copyRawTableToClipboard() {
  const rows = [];
  const theadTr = $('#raw-table thead tr');
  if (theadTr) {
    rows.push(Array.from(theadTr.querySelectorAll('th')).map(th => th.textContent.trim()));
  }
  const tb = $('#raw-table tbody');
  if (tb) {
    tb.querySelectorAll('tr').forEach(tr => {
      rows.push(Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));
    });
  }
  const text = rows.map(r => r.join('\t')).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    toast('Đã copy bảng RAW vào clipboard!', 'success');
  }).catch(() => {
    toast('Lỗi copy', 'error');
  });
}

// Copy all data for AI analysis (structured text format for Claude)
function copyAllDataForAI() {
  const lines = [];
  lines.push('# AURA RENTAL - DỮ LIỆU TỔNG HỢP');
  lines.push(`# Ngày xuất: ${new Date().toLocaleString('vi-VN')}`);
  lines.push('');

  // Orders
  lines.push('## ĐƠN HÀNG');
  lines.push('| Ngày lấy | Mã đơn | Loại | Khách | SĐT | Váy | PK | Gói | Giờ | Ngày trả | Nhận | Địa chỉ | Tiền váy | Tiền PK | Tổng | Đặt cọc | Ghi chú | Hoàn cọc |');

  const arr = (db.don || []).slice().sort((a, b) => (b.Ngay_Lay || b.ngay_lay || '').localeCompare(a.Ngay_Lay || a.ngay_lay || ''));

  arr.forEach(o => {
    const tenVay = donTenVay(o).join(' + ') || '';
    const pkKeys = (o.Ma_PK || o.pks || []);
    const tenPK = (Array.isArray(pkKeys) ? pkKeys : []).map(pk => {
      const p = pkById.get(pk);
      return p ? (p.Ten_PK || p.ten) : '';
    }).filter(Boolean).join(', ');
    const goi = o.Goi_Thue || o.goi || '';
    const lay = o.Ngay_Lay || o.lay || '';
    const ngayTra = ngayTraThuc(goi, lay);
    const ngayTraStr = ngayTra ? isoOf(ngayTra) : '';
    const tienVay = donTienThueVay(o);
    const tienPK = donTienThuePK(o);
    const tong = tienVay + tienPK;
    const coc = donCocGoiY(o);
    const ghichu = o.Ghi_Chu || o.ghichu || '';
    const hoan = isHoanOrder(o) ? 'Đã hoàn' : '';

    lines.push(`| ${isoToVN(lay)} | ${o.Ma_Don || o.id || ''} | ${o.Trang_Thai_Don || o.type || ''} | ${o.Insta_Khach || o.insta || o.Ten_KH || o.ten_kh || ''} | ${o.SDT || o.sdt || ''} | ${tenVay} | ${tenPK} | ${goi} | ${o.Gio_Lay || o.gio || ''} | ${ngayTraStr} | ${o.Hinh_Thuc_Nhan || o.nhan || ''} | ${o.Dia_Chi || o.dc || ''} | ${fmtVND(tienVay)} | ${fmtVND(tienPK)} | ${fmtVND(tong)} | ${fmtVND(coc)} | ${ghichu} | ${hoan} |`);
  });

  lines.push('');
  lines.push(`**Tổng số đơn: ${arr.length}**`);

  // Summary stats
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = arr.filter(o => (o.Ngay_Lay || o.ngay_lay) === today);
  const totalRevenue = arr.reduce((sum, o) => sum + (o.Tong_Tien || o.tong || 0), 0);
  const totalDeposit = arr.reduce((sum, o) => sum + (o.Dat_Coc || o.coc || 0), 0);

  lines.push('');
  lines.push('## THỐNG KÊ');
  lines.push(`- Đơn hôm nay: ${todayOrders.length}`);
  lines.push(`- Tổng doanh thu: ${fmtVND(totalRevenue)}`);
  lines.push(`- Tổng đặt cọc: ${fmtVND(totalDeposit)}`);
  lines.push(`- Số váy: ${(db.vay || []).length}`);
  lines.push(`- Số phụ kiện: ${(db.pk || []).length}`);

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    toast('Đã copy toàn bộ dữ liệu cho Claude!', 'success');
  }).catch(() => {
    toast('Lỗi copy', 'error');
  });
}

// Export to Excel
function exportOrdersToExcel() {
  if (typeof XLSX === 'undefined') {
    toast('SheetJS chưa load, thử lại sau', 'warn');
    return;
  }

  const rows = [];
  rows.push(['Ngày lấy', 'Mã đơn', 'Tên KH', 'SĐT', 'Loại', 'Váy', 'Phụ kiện', 'Ngày trả', 'Tiền', 'Đặt cọc', 'Còn lại', 'Trạng thái', 'Ghi chú']);

  const arr = (db.don || []).slice().sort((a, b) => (b.Ngay_Lay || b.ngay_lay || '').localeCompare(a.Ngay_Lay || a.ngay_lay || ''));

  arr.forEach(o => {
    const dresses = (db.dhv || []).filter(d => (d.Ma_Don || d.ma_don) === (o.Ma_Don || o.ma_don));
    const dressNames = dresses.map(d => {
      const v = (db.vay || []).find(v => (v.Ma_Vay || v.ma_vay) === (d.Ma_Vay || d.ma_vay));
      return v?.Ten_Vay || v?.ten || d.Ma_Vay || d.ma_vay || '';
    }).filter(Boolean).join(', ');

    const accessories = (db.dhv || []).filter(d => (d.Ma_Don || d.ma_don) === (o.Ma_Don || o.ma_don) && d.Ma_PK);
    const accNames = accessories.map(d => {
      const p = (db.pk || []).find(p => (p.Ma_PK || p.ma_pk) === d.Ma_PK);
      return p?.Ten_PK || p?.ten || d.Ma_PK || '';
    }).filter(Boolean).join(', ');

    const total = o.Tong_Tien || o.tong || 0;
    const deposit = o.Dat_Coc || o.coc || 0;
    const remaining = total - deposit;

    rows.push([
      o.Ngay_Lay || o.ngay_lay || '',
      o.Ma_Don || o.ma_don || '',
      o.Ten_KH || o.ten_kh || '',
      o.SDT || o.sdt || '',
      o.Loai || o.loai || '',
      dressNames,
      accNames,
      o.Ngay_Tra || o.ngay_tra || '',
      total,
      deposit,
      remaining,
      o.Trang_Thai || o.trang_thai || '',
      o.Ghi_Chu || o.ghi_chu || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Đơn hàng');
  XLSX.writeFile(wb, `aura_don_hang_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast('Đã xuất Excel!', 'success');
}

/* ============================================================
 *  KHO VÁY (DRESSES) — gallery + CRUD
 * ============================================================ */
let curSizeFilter = '';
function renderKho() {
  const search = $('#search-kho').value.toLowerCase().trim();
  const today = new Date();
  let arr = db.vay.slice();
  if (curSizeFilter) arr = arr.filter(v => (v.Size || v.size) === curSizeFilter);
  if (search) arr = arr.filter(v => (v.Ten_Vay || v.ten || '').toLowerCase().includes(search));

  const sortVal = (document.getElementById('sort-kho') || {}).value || 'popular';
  arr.sort((a, b) => {
    if (sortVal === 'popular') return (b.So_Lan_Thue || b.sl || 0) - (a.So_Lan_Thue || a.sl || 0);
    if (sortVal === 'price-asc') return (a.Gia_Thue_1_Ngay || a.t1 || 0) - (b.Gia_Thue_1_Ngay || b.t1 || 0);
    if (sortVal === 'price-desc') return (b.Gia_Thue_1_Ngay || b.t1 || 0) - (a.Gia_Thue_1_Ngay || a.t1 || 0);
    if (sortVal === 'name') return (a.Ten_Vay || a.ten || '').localeCompare(b.Ten_Vay || b.ten || '');
    if (sortVal === 'goc-asc') return (a.Gia_Vay_Goc || a.goc || 0) - (b.Gia_Vay_Goc || b.goc || 0);
    if (sortVal === 'goc-desc') return (b.Gia_Vay_Goc || b.goc || 0) - (a.Gia_Vay_Goc || a.goc || 0);
    return 0;
  });

  const list = $('#kho-list');
  list.innerHTML = '';
  list.className = 'gallery';

  // Build busyVaySet once for today — dress is busy if any non-hoan order covers today
  const todayIso = isoOf(today);
  const todayD = parseD(todayIso);
  const busyVaySet = new Set();
  for (const o of (db.don || [])) {
    if (isHoanOrder(o)) continue;
    const layIso = o.Ngay_Lay || o.lay;
    if (!layIso) continue;
    const goi = o.Goi_Thue || o.goi;
    const tra = ngayTraThuc(goi, layIso);
    const traIso = tra ? isoOf(tra) : layIso;
    const layD = parseD(layIso);
    const traD = parseD(traIso);
    let busy = false;
    if (goi === '12h') busy = +todayD === +layD;
    else busy = todayD >= layD && todayD <= traD;
    if (!busy) continue;
    for (const dh of (o.dhvs || [])) {
      const id = dh.vay || dh.Ma_Vay;
      if (id) busyVaySet.add(id);
    }
  }

  const totalAll = (db.vay || []).length;
  const totalShown = arr.length;
  const totalBusy = arr.filter(v => busyVaySet.has(v.Ma_Vay || v.ma)).length;
  const countEl = $('#kho-count');
  if (countEl) {
    const filterTxt = (search || curSizeFilter) ? ` (lọc: ${totalShown})` : '';
    countEl.textContent = `👗 Tổng: ${totalAll} váy${filterTxt} · 📦 Đang thuê hôm nay: ${totalBusy}`;
  }

  if (!arr.length) {
    if (!db.vay || db.vay.length === 0) {
      list.className = '';
      showSkeleton(list, 6);
      return;
    }
    list.className = '';
    list.innerHTML = '<div class="empty empty-cta"><div class="icon">👗</div><div class="title">Kho trống</div><button class="btn primary" onclick="openEditItem(\'vay\', null)">＋ Thêm váy đầu tiên</button></div>';
    return;
  }

  arr.forEach((v, idx) => {
    const tenVay = v.Ten_Vay || v.ten || '';
    const size = v.Size || v.size || '';
    const goc = v.Gia_Vay_Goc || v.gia_vay_goc || v.goc || 0;
    const sl = v.So_Lan_Thue || v.sl || 0;
    const busy = busyVaySet.has(v.Ma_Vay || v.ma);
    const item = el('div', { class: 'gallery-item stagger-item' });
    if (v._dbId && typeof isRecentRemote === 'function' && isRecentRemote('vay', v._dbId)) {
      item.classList.add('is-new');
    }
    item.style.animationDelay = `${Math.min(idx, 20) * 30}ms`;
    const thumb = el('div', { class: 'gallery-thumb' });
    if (v.Anh_Vay || v.anh) thumb.appendChild(el('img', { src: v.Anh_Vay || v.anh, alt: '' }));
    else thumb.appendChild(el('div', { text: tenVay[0] || 'V' }));
    if (busy) thumb.appendChild(el('div', { class: 'gallery-busy', text: 'ĐANG THUÊ' }));
    item.appendChild(thumb);
    const info = el('div', { class: 'gallery-info' });
    info.appendChild(el('div', { class: 'gallery-name', text: tenVay || '—' }));
    info.appendChild(el('div', { class: 'gallery-sub', text: 'Size ' + size + ' · ' + sl + ' lượt' }));
    info.appendChild(el('div', { class: 'gallery-goc-price', html: fmtVND(goc) }));
    item.appendChild(info);
    item.onclick = () => showDressDetail(v);
    list.appendChild(item);
  });
}
$('#search-kho').oninput = debounce(() => { renderKho(); }, 300);
$$('#kho-chips button').forEach(b => b.onclick = () => {
  $$('#kho-chips button').forEach(x => x.classList.toggle('on', x === b));
  curSizeFilter = b.dataset.loai;
  renderKho();
});

/* ============================================================
 *  PHỤ KIỆN (ACCESSORIES) — gallery + CRUD
 * ============================================================ */
let curPkFilter = '';
function renderPk() {
  const search = $('#search-pk').value.toLowerCase().trim();
  const today = new Date();
  let arr = db.pk.slice();
  if (curPkFilter) arr = arr.filter(p => (p.Loai || p.loai) === curPkFilter);
  if (search) arr = arr.filter(p => (p.Ten_PK || p.ten || '').toLowerCase().includes(search));

  const sortVal = (document.getElementById('sort-pk') || {}).value || 'name';
  arr.sort((a, b) => {
    if (sortVal === 'name') return (a.Ten_PK || a.ten || '').localeCompare(b.Ten_PK || b.ten || '');
    if (sortVal === 'popular') return (b.So_Lan_Thue || b.sl || 0) - (a.So_Lan_Thue || a.sl || 0);
    if (sortVal === 'price-asc') return (a.Gia_Thue_1_Ngay || a.t1 || 0) - (b.Gia_Thue_1_Ngay || b.t1 || 0);
    if (sortVal === 'price-desc') return (b.Gia_Thue_1_Ngay || b.t1 || 0) - (a.Gia_Thue_1_Ngay || a.t1 || 0);
    if (sortVal === 'stock-asc') return (a.So_Luong_Tong || 0) - (b.So_Luong_Tong || 0);
    if (sortVal === 'stock-desc') return (b.So_Luong_Tong || 0) - (a.So_Luong_Tong || 0);
    return (a.Loai || a.loai || '').localeCompare(b.Loai || b.loai || '');
  });

  const list = $('#pk-list');
  list.innerHTML = '';
  list.className = 'gallery';

  // Build busyPKSet once for today
  const todayIso = isoOf(today);
  const todayD = parseD(todayIso);
  const busyPKSet = new Set();
  for (const o of (db.don || [])) {
    if (isHoanOrder(o)) continue;
    const layIso = o.Ngay_Lay || o.lay;
    if (!layIso) continue;
    const goi = o.Goi_Thue || o.goi;
    const tra = ngayTraThuc(goi, layIso);
    const traIso = tra ? isoOf(tra) : layIso;
    const layD = parseD(layIso);
    const traD = parseD(traIso);
    let busy = false;
    if (goi === '12h') busy = +todayD === +layD;
    else busy = todayD >= layD && todayD <= traD;
    if (!busy) continue;
    const pks = o.Ma_PK || o.pks || [];
    for (const pk of pks) {
      const id = typeof pk === 'object' ? (pk.Ma_PK || '') : pk;
      if (id) busyPKSet.add(id);
    }
  }

  const totalAll = (db.pk || []).length;
  const totalShown = arr.length;
  const totalBusy = arr.filter(p => busyPKSet.has(p.Ma_PK || p.ma)).length;
  const countEl = $('#pk-count');
  if (countEl) {
    const filterTxt = (search || curPkFilter) ? ` (lọc: ${totalShown})` : '';
    countEl.textContent = `💍 Tổng: ${totalAll} phụ kiện${filterTxt} · 📦 Đang thuê hôm nay: ${totalBusy}`;
  }

  if (!arr.length) {
    if (!db.pk || db.pk.length === 0) {
      list.className = '';
      showSkeleton(list, 6);
      return;
    }
    list.className = '';
    list.innerHTML = '<div class="empty empty-cta"><div class="icon">💍</div><div class="title">Kho trống</div><button class="btn primary" onclick="openEditItem(\'pk\', null)">＋ Thêm phụ kiện đầu tiên</button></div>';
    return;
  }

  arr.forEach((p, idx) => {
    const ten = p.Ten_PK || p.ten || '';
    const loai = p.Loai || p.loai || '';
    const sl = p.So_Luong_Tong || p.sl || 0;
    const busy = busyPKSet.has(p.Ma_PK || p.ma);
    const item = el('div', { class: 'gallery-item stagger-item' });
    if (p._dbId && typeof isRecentRemote === 'function' && isRecentRemote('pk', p._dbId)) {
      item.classList.add('is-new');
    }
    item.style.animationDelay = `${Math.min(idx, 20) * 30}ms`;
    const thumb = el('div', { class: 'gallery-thumb' });
    if (p.Anh_PK || p.anh) thumb.appendChild(el('img', { src: p.Anh_PK || p.anh, alt: '' }));
    else thumb.appendChild(el('div', { text: ten[0] || 'P' }));
    if (sl > 0) thumb.appendChild(el('div', { class: 'gallery-stock', text: 'x' + sl }));
    if (busy) thumb.appendChild(el('div', { class: 'gallery-busy', text: 'ĐANG THUÊ' }));
    item.appendChild(thumb);
    const info = el('div', { class: 'gallery-info' });
    info.appendChild(el('div', { class: 'gallery-name', text: ten || '—' }));
    info.appendChild(el('div', { class: 'gallery-sub', text: loai + ' · ' + (p.So_Lan_Thue || p.sl || 0) + ' lượt' }));
    const t1 = p.Gia_Thue_1_Ngay || p.t1 || 0;
    if (t1) info.appendChild(el('div', { class: 'gallery-goc-price', html: fmtVND(t1) }));
    item.appendChild(info);
    item.onclick = () => showPKDetail(p);
    list.appendChild(item);
  });
}
$('#search-pk').oninput = debounce(() => { renderPk(); }, 300);
$$('#pk-chips button').forEach(b => b.onclick = () => {
  $$('#pk-chips button').forEach(x => x.classList.toggle('on', x === b));
  curPkFilter = b.dataset.loai;
  renderPk();
});

/* ============================================================
 *  FAB — opens add modal based on current view
 * ============================================================ */
function openAddContext() {
  if (curView === 'v-kho') openEditItem('vay', null);
  else if (curView === 'v-pk') openEditItem('pk', null);
}

/* ============================================================
 *  DRESS DETAIL MODAL (read-only)
 * ============================================================ */
function showDressDetail(v) {
  const img = v.Anh_Vay ?
    `<img src="${v.Anh_Vay}" alt="${v.Ten_Vay}">` :
    `<div style="font-size:64px">${(v.Ten_Vay || 'V')[0]}</div>`;
  const gc = v.Ghi_Chu ? `<div class="item-detail-desc">${escHtml(v.Ghi_Chu)}</div>` : '';
  const ma = v.Ma_Vay || v.ma || '';
  $('#d-body').innerHTML = `
    <div class="item-detail-img">${img}</div>
    <div class="item-detail-info">
      <div class="item-detail-name">${escHtml(v.Ten_Vay || '—')}</div>
      <div class="item-detail-meta">
        <span class="item-detail-tag">Size ${v.Size || '—'}</span>
      </div>
      <div class="item-detail-prices">
        <div class="detail-price-row"><span class="detail-lbl">Giá gốc</span><span class="detail-val">${fmtVND(v.Gia_Vay_Goc)}</span></div>
        <div class="detail-price-row"><span class="detail-lbl">12h</span><span class="detail-val">${fmtVND(v.Gia_Thue_12h)}</span></div>
        <div class="detail-price-row"><span class="detail-lbl">1 ngày</span><span class="detail-val">${fmtVND(v.Gia_Thue_1_Ngay)}</span></div>
        <div class="detail-price-row"><span class="detail-lbl">3 ngày</span><span class="detail-val">${fmtVND(v.Gia_Thue_3_Ngay)}</span></div>
      </div>
      ${gc}
    </div>
    <div class="item-detail-actions">
      <button class="btn primary" onclick="closeModal('m-detail');openEditItem('vay','${ma}')">Sửa váy</button>
      <button class="btn secondary" onclick="closeModal('m-detail')">Đóng</button>
    </div>`;
  openModal('m-detail');
}

function showPKDetail(p) {
  const img = p.Anh_PK || p.anh ?
    `<img src="${p.Anh_PK || p.anh}" alt="${p.Ten_PK}">` :
    `<div style="font-size:64px">${(p.Ten_PK || 'P')[0]}</div>`;
  const gc = p.Ghi_Chu ? `<div class="item-detail-desc">${escHtml(p.Ghi_Chu)}</div>` : '';
  const ma = p.Ma_PK || p.ma || '';
  const sl = p.So_Luong_Tong || p.sl || 0;

  $('#d-body').innerHTML = `
    <div class="item-detail-img">${img}</div>
    <div class="item-detail-info">
      <div class="item-detail-name">${escHtml(p.Ten_PK || '—')}</div>
      <div class="item-detail-meta">
        <span class="item-detail-tag">${escHtml(p.Loai || '—')}</span>
        ${sl > 0 ? `<span class="item-detail-tag">Tồn: ${sl}</span>` : '<span class="item-detail-tag muted">Chưa nhập số lượng</span>'}
      </div>
      <div class="item-detail-prices">
        <div class="detail-price-row"><span class="detail-lbl">12h</span><span class="detail-val">${fmtVND(p.Gia_Thue_12h)}</span></div>
        <div class="detail-price-row"><span class="detail-lbl">1 ngày</span><span class="detail-val">${fmtVND(p.Gia_Thue_1_Ngay)}</span></div>
        <div class="detail-price-row"><span class="detail-lbl">3 ngày</span><span class="detail-val">${fmtVND(p.Gia_Thue_3_Ngay)}</span></div>
      </div>
      ${gc}
    </div>
    <div class="item-detail-actions">
      <button class="btn primary" onclick="closeModal('m-detail');openEditItem('pk','${ma}')">Sửa phụ kiện</button>
      <button class="btn secondary" onclick="closeModal('m-detail')">Đóng</button>
    </div>`;
  openModal('m-detail');
}

/* ============================================================
 *  ADD/EDIT ITEM MODAL (vay + pk)
 * ============================================================ */
function openEditItem(kind, id) {
  const isVay = kind === 'vay';
  const table = isVay ? 'vay' : 'pk';
  const existing = id ? db[table].find(x => (isVay ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) === id) : null;
  const v = existing || {};
  const title = existing ? (isVay ? 'Sửa váy' : 'Sửa phụ kiện') : (isVay ? 'Thêm váy mới' : 'Thêm phụ kiện');

  const sizeOptions = isVay ? ['S','M','L','XL','Free size'] : ['Giày','Túi','Dây chuyền','Khăn','Khác'];
  const isEdit = !!existing;

  const curImg = v.Anh_Vay || v.anh || v.Anh_PK || '';
  const initial = ((v.Ten_Vay || v.ten || (isVay ? 'Váy mới' : 'Phụ kiện'))[0] || 'V').toUpperCase();

  $('#ei-body').innerHTML = `
    <div class="sheet-head">
      <h2>${title}</h2>
      <button class="sheet-close" data-close>×</button>
    </div>
    <form id="ei-form" class="item-edit-form" onsubmit="event.preventDefault(); submitItem('${kind}', ${id ? `'${id}'` : 'null'})">
      <!-- Image -->
      <div class="item-edit-image">
        <label class="preview" id="img-upload-wrap" for="ei-img">
          ${curImg ? `<img src="${curImg}" id="ei-img-preview" />` : initial}
        </label>
        <input type="file" id="ei-img" accept="image/*" style="display:none" />
        <span class="upload-btn">📷 ${curImg ? 'Đổi ảnh' : 'Chọn ảnh'}</span>
      </div>

      <!-- Tên & Size -->
      <div class="item-edit-grid">
        <div class="item-edit-field full">
          <label>Tên ${isVay ? 'váy' : 'phụ kiện'} *</label>
          <input name="ten" required value="${escapeHtml(v.Ten_Vay || v.ten || '')}" placeholder="${isVay ? 'VD: Váy lụa hoa nhí' : 'VD: Túi Chanel đen'}" />
        </div>
        ${isVay
          ? `<div class="item-edit-field full">
               <label>Size *</label>
               <select name="size" required>
                 ${sizeOptions.map(s => `<option ${(v.Size || v.size) === s ? 'selected' : ''}>${s}</option>`).join('')}
               </select>
             </div>`
          : `<div class="item-edit-field">
               <label>Loại *</label>
               <select name="loai" required>
                 ${sizeOptions.map(s => `<option ${(v.Loai || v.loai) === s ? 'selected' : ''}>${s}</option>`).join('')}
               </select>
             </div>
             <div class="item-edit-field">
               <label>Số lượng</label>
               <input name="sl" type="number" min="1" value="${v.So_Luong_Tong || v.sl || 1}" />
             </div>`
        }
      </div>

      <!-- Giá -->
      ${isVay ? `
      <div class="item-edit-prices">
        <div class="price-card">
          <span class="price-label">Giá gốc</span>
          <input name="goc" type="number" min="0" step="1000" value="${v.Gia_Vay_Goc || v.goc || 0}" />
        </div>
        <div class="price-card">
          <span class="price-label">12h</span>
          <input name="t12" type="number" min="0" step="1000" value="${v.Gia_Thue_12h || v.t12 || 0}" />
        </div>
        <div class="price-card">
          <span class="price-label">1 ngày</span>
          <input name="t1" type="number" min="0" step="1000" value="${v.Gia_Thue_1_Ngay || v.t1 || 0}" />
        </div>
        <div class="price-card">
          <span class="price-label">3 ngày</span>
          <input name="t3" type="number" min="0" step="1000" value="${v.Gia_Thue_3_Ngay || v.t3 || 0}" />
        </div>
      </div>
      ` : `
      <div class="item-edit-prices">
        <div class="price-card">
          <span class="price-label">12h</span>
          <input name="t12" type="number" min="0" step="1000" value="${v.Gia_Thue_12h || v.t12 || 0}" />
        </div>
        <div class="price-card">
          <span class="price-label">1 ngày</span>
          <input name="t1" type="number" min="0" step="1000" value="${v.Gia_Thue_1_Ngay || v.t1 || 0}" />
        </div>
        <div class="price-card">
          <span class="price-label">3 ngày</span>
          <input name="t3" type="number" min="0" step="1000" value="${v.Gia_Thue_3_Ngay || v.t3 || 0}" />
        </div>
        <div class="price-card">
          <span class="price-label">Giá gốc</span>
          <input name="goc" type="number" min="0" step="1000" value="${v.Gia_Vay_Goc || v.goc || 0}" />
        </div>
      </div>
      `}

      <!-- Ghi chú -->
      <div class="item-edit-field full">
        <label>Ghi chú</label>
        <textarea name="gchu" placeholder="VD: Đã sửa chữa, váy mới về...">${escapeHtml(v.Ghi_Chu || v.gchu || '')}</textarea>
      </div>

      <!-- Actions -->
      <div class="item-edit-actions">
        ${isEdit ? `<button type="button" class="btn-delete" onclick="deleteItem('${kind}', '${id}')">Xóa</button>` : ''}
        <button type="button" class="btn-cancel" data-close>Hủy</button>
        <button type="submit" class="btn-save">${isEdit ? 'Lưu thay đổi' : 'Thêm'}</button>
      </div>
    </form>
  `;

  openModal('m-edit-item');

  // Image upload handler
  const uploadHandler = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await fileToCompressedDataURL(file);
    if (!dataUrl) return;
    const wrap = $('#img-upload-wrap');
    wrap.innerHTML = `<img src="${dataUrl}" id="ei-img-preview" />`;
  };
  $('#img-upload-wrap').onclick = () => $('#ei-img').click();
  $('#ei-img').onchange = uploadHandler;
}

window.submitItem = async function(kind, id) {
  const f = $('#ei-form');
  const fd = new FormData(f);
  const isVay = kind === 'vay';
  const table = isVay ? 'vay' : 'pk';
  const saveBtn = f.querySelector('button[type=submit]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add('loading'); }

  // Get image
  let imgData = null;
  const imgEl = $('#ei-img-preview');
  if (imgEl) imgData = imgEl.src;

  const data = {
    Ten_Vay: isVay ? fd.get('ten') : undefined,
    Ten_PK: !isVay ? fd.get('ten') : undefined,
    Size: isVay ? fd.get('size') : undefined,
    Loai: !isVay ? fd.get('loai') : undefined,
    So_Luong_Tong: !isVay ? Number(fd.get('sl') || 1) : undefined,
    Gia_Vay_Goc: isVay ? Number(fd.get('goc') || 0) : undefined,
    Gia_Thue_12h: Number(fd.get('t12') || 0),
    Gia_Thue_1_Ngay: Number(fd.get('t1') || 0),
    Gia_Thue_3_Ngay: Number(fd.get('t3') || 0),
    Ghi_Chu: fd.get('gchu') || '',
    Anh_Vay: isVay ? imgData : undefined,
    Anh_PK: !isVay ? imgData : undefined,
  };

  if (id) {
    const o = db[table].find(x => (isVay ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) === id);
    Object.assign(o, data);
    // Sync update to Supabase
    if (o._dbId && typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
      const updateFn = isVay ? window.SupabaseService.updateDress : window.SupabaseService.updateAccessory;
      updateFn(o._dbId, o).catch(err => console.warn('Supabase update failed:', err));
      toastSave('Đã cập nhật', true);
    } else {
      toastSave('Đã cập nhật', false);
    }
  } else {
    if (isVay) {
      const dress = { Ma_Vay: uid('V'), Ten_Vay: data.Ten_Vay, Size: data.Size, Gia_Vay_Goc: data.Gia_Vay_Goc, Gia_Thue_12h: data.Gia_Thue_12h, Gia_Thue_1_Ngay: data.Gia_Thue_1_Ngay, Gia_Thue_3_Ngay: data.Gia_Thue_3_Ngay, Anh_Vay: data.Anh_Vay || '', Ghi_Chu: data.Ghi_Chu, So_Lan_Thue: 0 };
      db.vay.push(dress);
      // Sync to Supabase
      if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
        toastSave('Đã thêm', true);
        window.SupabaseService.createDress(dress).then(created => {
          if (created?._dbId) {
            dress._dbId = created._dbId;
            dress.id = created._dbId;
            save();
          }
        }).catch(err => console.warn('Supabase createDress failed:', err));
      } else {
        toastSave('Đã thêm', false);
      }
    } else {
      const pk = { Ma_PK: uid('P'), Ten_PK: data.Ten_PK, Loai: data.Loai, So_Luong_Tong: data.So_Luong_Tong, Gia_Thue_12h: data.Gia_Thue_12h, Gia_Thue_1_Ngay: data.Gia_Thue_1_Ngay, Gia_Thue_3_Ngay: data.Gia_Thue_3_Ngay, Anh_PK: data.Anh_PK || '', Ghi_Chu: data.Ghi_Chu };
      db.pk.push(pk);
      // Sync to Supabase
      if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
        toastSave('Đã thêm', true);
        window.SupabaseService.createAccessory(pk).then(created => {
          if (created?._dbId) {
            pk._dbId = created._dbId;
            pk.id = created._dbId;
            save();
          }
        }).catch(err => console.warn('Supabase createAccessory failed:', err));
      } else {
        toastSave('Đã thêm', false);
      }
    }
  }
  save();
  closeModal('m-edit-item');
  if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('loading'); }
  if (curView === 'v-kho') renderKho();
  else if (curView === 'v-pk') renderPk();
};

window.deleteItem = function(kind, id) {
  const table = kind === 'vay' ? 'vay' : 'pk';
  const name = kind === 'vay' ? 'váy' : 'phụ kiện';
  const item = db[table].find(x => (kind === 'vay' ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) === id);
  // Check if item is in any active order
  const inUse = db.don.some(o => {
    if (o.hoan || o.Trang_Thai_Hoan_Coc) return false;
    if (kind === 'vay') return (o.dhvs || []).some(x => x.vay === id);
    return (o.Ma_PK || o.pks || []).includes(id);
  });
  let msg = `Xóa ${name} "${item.Ten_Vay || item.Ten_PK || item.ten}"?`;
  if (inUse) msg += '\n\n⚠️ Vẫn còn đơn đang dùng món này. Hành động này có thể làm hỏng dữ liệu đơn.';
  showConfirmModal({
    title: `Xóa ${name}?`,
    message: msg.replace(/\n/g, '<br>'),
    confirmText: 'Xóa',
    danger: true,
    onConfirm: () => {
      const delBtn = document.querySelector('#m-edit-item .btn-delete') || document.querySelector('#m-edit-item .btn-danger');
      if (delBtn) { delBtn.disabled = true; delBtn.classList.add('loading'); }
      // Track tombstone in persistent storage BEFORE removing — prevents resurrection after cache clear
      const dbId = item?._dbId;
      if (dbId) {
        const tableName = kind === 'vay' ? 'dresses' : 'accessories';
        markDeleted(tableName, dbId);
      }
      db[table] = db[table].filter(x => (kind === 'vay' ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) !== id);
      save();
      // Sync delete to Supabase
      if (item?._dbId && typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
        const deleteFn = kind === 'vay' ? window.SupabaseService.deleteDress : window.SupabaseService.deleteAccessory;
        const tableName = kind === 'vay' ? 'dresses' : 'accessories';
        deleteFn(item._dbId).then(() => {
          // Supabase confirmed — clear persistent tombstone so merge stops filtering it
          clearDeleted(tableName, item._dbId);
          if (typeof rebuildIndexes === 'function') rebuildIndexes();
          console.log('[Delete] Item Supabase confirmed for', dbId);
        }).catch(err => {
          console.warn('Supabase delete failed:', err);
          // Will retry on next polling cycle via retryPendingDeletes (TODO: extend for items)
        });
      }
      closeModal('m-edit-item');
      toast(`Đã xóa ${name}`, 'success');
      if (curView === 'v-kho') renderKho();
      else if (curView === 'v-pk') renderPk();
    }
  });
};

/* ============================================================
 *  AVAILABILITY (Check!) - Improved UX
 * ============================================================ */
let availState = {
  type: 'vay',  // 'vay' or 'pk'
  goi: '1 ngày',
  date: null,    // Date object
  dateStr: null, // ISO string
  showBusyOnly: true
};

function initAvail() {
  availState.date = new Date();
  availState.dateStr = isoOf(availState.date);
  renderCalMini();
  renderAvail();
  rebuildVaySuggestions();
}

function rebuildVaySuggestions() {
  const dl = document.getElementById('vay-suggest');
  if (!dl) return;
  const names = (db.vay || [])
    .map(v => v.Ten_Vay || v.ten)
    .filter(Boolean);
  // De-dupe + sort
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'vi'));
  dl.innerHTML = unique.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

function renderCalMini() {
  const cal = document.getElementById('cal-mini');
  if (!cal) return;

  const d = availState.date;
  const y = d.getFullYear();
  const m = d.getMonth();
  const today = new Date();
  today.setHours(0,0,0,0);

  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = `<div class="cal-mini-header">
    <button class="cal-mini-nav" onclick="navCalMini(-1)" aria-label="Tháng trước">‹</button>
    <span class="cal-mini-month">Tháng ${m+1}/${y}</span>
    <button class="cal-mini-nav" onclick="navCalMini(1)" aria-label="Tháng sau">›</button>
  </div>`;

  html += '<div class="cal-mini-grid">';
  ['T2','T3','T4','T5','T6','T7','CN'].forEach(day => {
    html += `<div class="cal-mini-head">${day}</div>`;
  });

  for (let i = 0; i < startDow; i++) html += '<div></div>';

  // Build busyDates set in O(N) — matches statusForDate semantics for "in rental window"
  const busyDates = new Set();
  for (const o of (db.don || [])) {
    if (isHoanOrder(o)) continue;
    const layIso = o.Ngay_Lay || o.lay;
    if (!layIso) continue;
    const goi = o.Goi_Thue || o.goi;
    const tra = ngayTraThuc(goi, layIso);
    const traIso = tra ? isoOf(tra) : layIso;
    // Mark every day in [lay, tra] as busy (inclusive both ends, mirrors statusForDate)
    if (goi === '12h') {
      busyDates.add(layIso);
    } else if (traIso >= layIso) {
      const [ly, lm, ld] = layIso.split('-').map(Number);
      const [ty, tm, td] = traIso.split('-').map(Number);
      const cur = new Date(ly, lm - 1, ld);
      const end = new Date(ty, tm - 1, td);
      let safety = 400;
      while (cur <= end && safety-- > 0) {
        busyDates.add(isoOf(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(y, m, day);
    const isToday = cellDate.toDateString() === today.toDateString();
    const isSelected = cellDate.toDateString() === d.toDateString();
    const hasOrders = busyDates.has(isoOf(cellDate));

    html += `<div class="cal-mini-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasOrders ? 'has-events' : ''}"
      onclick="selectCalMiniDate(${y}, ${m}, ${day})">${day}</div>`;
  }

  html += '</div>';
  html += `<div class="cal-mini-selected">Đang check: <b>${String(d.getDate()).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}</b></div>`;
  cal.innerHTML = html;
}

window.navCalMini = (delta) => {
  const nd = new Date(availState.date);
  nd.setMonth(nd.getMonth() + delta);
  if (nd < new Date(new Date().getFullYear() - 1, 0, 1)) return;
  if (nd > new Date(new Date().getFullYear() + 2, 11, 31)) return;
  availState.date = nd;
  availState.dateStr = isoOf(nd);
  renderCalMini();
  renderAvail();
};

window.selectCalMiniDate = (y, m, d) => {
  availState.date = new Date(y, m, d);
  availState.dateStr = isoOf(availState.date);
  const dateDisplay = document.getElementById('av-date-display');
  if (dateDisplay) dateDisplay.textContent = `${String(d).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}`;
  renderCalMini();
  renderAvail();
};

window.switchAvailType = (type) => {
  availState.type = type;
  document.querySelectorAll('.toggle-group .toggle-btn[data-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderAvail();
  rebuildVaySuggestions();
};

window.switchAvailShow = (what) => {
  availState.showBusyOnly = what === 'busy';
  document.querySelectorAll('.avail-show-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.show === what);
  });
  renderAvail();
};

// Search filter for check tab
window.filterCheckItems = function(search) {
  availState.searchTerm = search.toLowerCase().trim();
  renderAvail();
};

function countRentedPK(pkId, dateIso) {
  if (!db.don) return 0;
  const dd = parseD(dateIso);
  let count = 0;
  for (const o of db.don) {
    if (isHoanOrder(o)) continue;
    const layIso = o.Ngay_Lay || o.lay;
    if (!layIso) continue;
    const goi = o.Goi_Thue || o.goi;
    const tra = ngayTraThuc(goi, layIso);
    const traIso = tra ? isoOf(tra) : layIso;
    const layD = parseD(layIso);
    const traD = parseD(traIso);
    let isActive;
    if (goi === '12h') {
      isActive = +dd === +layD;
    } else {
      isActive = dd >= layD && dd <= traD;
    }
    if (!isActive) continue;
    const pks = o.Ma_PK || o.pks || [];
    const pkIds = pks.map(id => typeof id === 'object' ? id.Ma_PK : id).filter(Boolean);
    if (pkIds.includes(pkId)) count++;
  }
  return count;
}

function renderAvail() {
  const isVay = availState.type === 'vay';
  const arr = isVay ? db.vay : db.pk;
  const date = availState.dateStr;
  const goi = availState.goi;
  const searchTerm = availState.searchTerm || '';

  // Update date display
  const dateDisplay = document.getElementById('av-date-display');
  if (dateDisplay && availState.date) {
    const d = availState.date;
    dateDisplay.textContent = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
  }

  // Calculate availability with search filter
  // Build busyByVay / busyByPk once: id -> [{layDate, traDate, order}]
  const isVayType = isVay;
  const busyById = new Map();
  for (const o of (db.don || [])) {
    if (isHoanOrder(o)) continue;
    const layIso = o.Ngay_Lay || o.lay;
    if (!layIso) continue;
    const goi = o.Goi_Thue || o.goi;
    const tra = ngayTraThuc(goi, layIso);
    const traIso = tra ? isoOf(tra) : layIso;
    const layD = parseD(layIso);
    const traD = parseD(traIso);
    const ids = isVayType
      ? (o.dhvs || []).map(d => d.vay || d.Ma_Vay).filter(Boolean)
      : (o.Ma_PK || o.pks || []).map(id => typeof id === 'object' ? id.Ma_PK : id).filter(Boolean);
    for (const id of ids) {
      if (!busyById.has(id)) busyById.set(id, []);
      busyById.get(id).push({ layD, traD, goi, layIso, traIso, order: o });
    }
  }

  function checkBusy(id, checkIso) {
    const dd = parseD(checkIso);
    const ranges = busyById.get(id) || [];
    for (const r of ranges) {
      if (r.goi === '12h') {
        if (+dd === +r.layD) return r;
      } else if (dd >= r.layD && dd <= r.traD) {
        return r;
      }
    }
    return null;
  }

  const items = arr.map(x => {
    const id = x.Ma_Vay || x.Ma_PK || x.ma;
    const busyRange = id ? checkBusy(id, date) : null;
    const busy = !!busyRange;
    const ten = x.Ten_Vay || x.Ten_PK || x.ten;
    const size = x.Size || x.Loai || x.size || '';
    const anh = x.Anh_Vay || x.Anh_PK || x.anh || '';
    const t12 = x.Gia_Thue_12h || x.t12 || 0;
    const t1 = x.Gia_Thue_1_Ngay || x.t1 || 0;
    const t3 = x.Gia_Thue_3_Ngay || x.t3 || 0;
    const goc = x.Gia_Goc || x.goc || 0;
    const gia = t1 || t3;

    // Renter info from pre-built busy data
    let renterInfo = null;
    if (busyRange && busyRange.order) {
      const o = busyRange.order;
      renterInfo = {
        insta: o.Insta_Khach || o.insta || '?',
        sdt: o.SDT || o.sdt || '',
        ngayLay: o.Ngay_Lay || o.lay || '',
        ngayTra: isoToVN(ngayTraThuc(o.Goi_Thue || o.goi, o.Ngay_Lay || o.lay)),
        goi: o.Goi_Thue || o.goi || ''
      };
    }

    return { ...x, id, ten, size, anh, gia, t12, t1, t3, goc, busy, renterInfo };
  }).filter(x => {
    if (!searchTerm) return true;
    return x.ten.toLowerCase().includes(searchTerm);
  }).filter(x => {
    if (!availState.showBusyOnly) return true;
    return x.busy;
  });

  const freeCount = items.filter(x => !x.busy).length;
  const busyCount = items.filter(x => x.busy).length;

  // Summary
  const summary = document.getElementById('avail-summary');
  if (summary) {
    const isFiltered = availState.showBusyOnly;
    summary.innerHTML = `
      <div class="avail-summary-card ${isFiltered ? 'full' : (freeCount > 0 ? 'available' : 'full')}">
        <div class="avail-count">
          <span class="count-num">${isFiltered ? busyCount : items.length}</span>
          <span class="count-label">${isFiltered ? (isVay ? 'váy bận' : 'phụ kiện bận') : (isVay ? 'váy' : 'phụ kiện')}</span>
        </div>
        <div class="avail-date">${isoToVN(date)} · ${goi}</div>
      </div>
    `;
  }

  // List
  const list = document.getElementById('avail-list');
  if (list) {
    // Sort: when busy-only filter is on, just alphabetical; otherwise free first
    items.sort((a, b) => {
      if (!availState.showBusyOnly && a.busy !== b.busy) return a.busy ? 1 : -1;
      return a.ten.localeCompare(b.ten);
    });

    list.innerHTML = items.map(x => {
      const renterHtml = x.renterInfo ? `
        <div class="avail-item-renter">
          <span class="renter-name">👤 ${escapeHtml(x.renterInfo.insta)}${x.renterInfo.sdt ? ' · ' + escapeHtml(x.renterInfo.sdt) : ''}</span>
          <span class="renter-dates">📅 ${isoToVN(x.renterInfo.ngayLay)} → ${x.renterInfo.ngayTra} · ${escapeHtml(x.renterInfo.goi)}</span>
        </div>
      ` : '';

      const priceChips = [
        x.t12 ? `<div class="price-chip"><span class="pc-lbl">12h</span><span>${fmtVND(x.t12)}</span></div>` : '',
        x.t1 ? `<div class="price-chip"><span class="pc-lbl">1 ngày</span><span>${fmtVND(x.t1)}</span></div>` : '',
        x.t3 ? `<div class="price-chip"><span class="pc-lbl">3 ngày</span><span>${fmtVND(x.t3)}</span></div>` : '',
      ].filter(Boolean).join('');

      const gocRow = x.goc ? `<div class="avail-item-goc">💰 Giá gốc: <b>${fmtVND(x.goc)}</b></div>` : '';

      // Stock badge for PK
      let stockBadge = '';
      if (!isVay) {
        const total = x.So_Luong_Tong || 0;
        const rented = countRentedPK(x.id, date);
        const available = total - rented;
        if (total === 0) {
          stockBadge = `<div class="avail-item-stock neutral">⚪ Chưa nhập số lượng</div>`;
        } else if (available <= 0) {
          stockBadge = `<div class="avail-item-stock oos">🔴 Hết hàng (0/${total})</div>`;
        } else if (available < total) {
          stockBadge = `<div class="avail-item-stock low">🟡 Tồn: ${available}/${total}</div>`;
        } else {
          stockBadge = `<div class="avail-item-stock ok">🟢 Tồn: ${available}/${total}</div>`;
        }
      }

      return `
      <div class="avail-item ${x.busy ? 'busy' : 'free'}">
        <div class="avail-item-img">
          ${x.anh ? `<img src="${x.anh}" alt="" />` : `<span>${(x.ten || '?')[0]}</span>`}
        </div>
        <div class="avail-item-info">
          <div class="avail-item-name">${escapeHtml(x.ten)}</div>
          <div class="avail-item-meta">${escapeHtml(x.size || '—')}</div>
          ${priceChips ? `<div class="avail-item-prices">${priceChips}</div>` : ''}
          ${stockBadge}
          ${renterHtml}
          ${gocRow}
        </div>
        <div class="avail-item-status">
          ${x.busy
            ? '<span class="status-badge busy">BẬN</span>'
            : '<span class="status-badge free">TRỐNG</span>'}
        </div>
      </div>`;
    }).join('');
  }
}

// Hook into view change
const origGo = window.go;
window.go = function(view) {
  origGo(view);
  if (view === 'v-avail') initAvail();
};

/* ============================================================
 *  ORDER DETAIL MODAL — edit, refund, delete
 * ============================================================ */
function openOrderDetail(id) {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;

  const tenVay = donTenVay(o);
  const tenVayStr = tenVay.join(', ') || '—';
  const tenPK = ((o.Ma_PK || o.pks || []).filter ? (o.Ma_PK || o.pks || []) : []).map(pk => {
    const p = pkById.get(pk);
    return p ? (p.Ten_PK || p.ten) : '?';
  }).join(', ') || '—';
  const ngayLay = o.Ngay_Lay || o.lay;
  const ngayTra = ngayTraThuc(o.Goi_Thue || o.goi, ngayLay);
  const tienVay = donTienThueVay(o);
  const tienPK = donTienThuePK(o);
  const tong = tienVay + tienPK;
  const cocGoiY = donCocGoiY(o);
  const status = statusForDate(o, isoOf(new Date()));
  const dhvs = Array.isArray(o.dhvs) ? o.dhvs : [];
  const dressImgs = dhvs.map(x => {
    const v = vayById.get(x.vay || x.Ma_Vay);
    return v?.Anh_Vay || v?.anh || '';
  }).filter(Boolean);

  // Format dates properly
  const ngayLayDisplay = isoToVN(ngayLay);
  const ngayTraDisplay = isoToVN(ngayTra);
  const gioLay = o.Gio_Lay || o.gio || '';

  // Pick first dress for avatar
  const firstDressId = dhvs[0]?.vay;
  const firstDress = firstDressId && vayById.get(firstDressId);
  const dressImg = firstDress?.Anh_Vay || firstDress?.anh || '';
  const customerName = o.Insta_Khach || o.insta || 'Khách';

  // Avatar initials
  const initials = (customerName.replace('@','').trim()[0] || 'K').toUpperCase();

  $('#d-body').innerHTML = `
    <div class="sheet-head">
      <div>
        <h2>Chi tiết đơn</h2>
        <small>${o.Ma_Don || o.id}${isHoanOrder(o) ? ' · Đã hoàn' : ''}</small>
      </div>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="order-detail-body">
      <!-- HERO -->
      <div class="od-hero">
        <div class="od-avatar">
          ${dressImg ? `<img src="${dressImg}" alt="">` : initials}
        </div>
        <div class="od-hero-info">
          <div class="od-name">${escapeHtml(customerName)}</div>
          <div class="od-id-row">
            <span class="od-id">${o.Ma_Don || o.id}</span>
            <span class="od-type-pill">${o.Trang_Thai_Don || o.type || 'Chốt thuê'}</span>
          </div>
        </div>
      </div>

      <!-- THÔNG TIN KHÁCH -->
      <div class="od-section">
        <div class="od-section-title"><span class="ico">👤</span> Khách hàng</div>
        <div class="od-row">
          <span class="label">Instagram</span>
          <span class="value">${escapeHtml(o.Insta_Khach || o.insta || '—')}</span>
        </div>
        <div class="od-row">
          <span class="label">Số điện thoại</span>
          <span class="value">
            <a href="tel:${String(o.SDT || o.sdt || '').replace(/\s/g,'')}" class="call-btn" title="Gọi ngay">📲</a>
            <span style="margin-left:2px">${escapeHtml(String(o.SDT || o.sdt || '—'))}</span>
          </span>
        </div>
      </div>

      <!-- THÔNG TIN THUÊ -->
      <div class="od-section">
        <div class="od-section-title"><span class="ico">📅</span> Thời gian thuê</div>
        <div class="od-row">
          <span class="label">Ngày lấy</span>
          <span class="value">${ngayLayDisplay}${gioLay ? ` · ${gioLay}` : ''}</span>
        </div>
        <div class="od-row">
          <span class="label">Ngày trả</span>
          <span class="value">${ngayTraDisplay}</span>
        </div>
        <div class="od-row">
          <span class="label">Gói thuê</span>
          <span class="value">${o.Goi_Thue || o.goi || '—'}</span>
        </div>
        <div class="od-row">
          <span class="label">Nhận đồ</span>
          <span class="value">${o.Hinh_Thuc_Nhan || o.nhan || '—'}</span>
        </div>
        ${o.Dia_Chi || o.dc ? `<div class="od-row"><span class="label">Địa chỉ</span><span class="value">${escapeHtml(o.Dia_Chi || o.dc)}</span></div>` : ''}
      </div>

      <!-- VÁY & PHỤ KIỆN -->
      <div class="od-section">
        <div class="od-section-title"><span class="ico">👗</span> Váy & Phụ kiện</div>
        <div class="od-dress-list">
          ${tenVay.map((v, i) => {
            const vay = vayById.get(dhvs[i]?.vay || dhvs[i]?.Ma_Vay);
            const img = vay?.Anh_Vay || vay?.anh || '';
            const size = vay ? (vay.Size || vay.size || '') : '';
            const initial = (v[0] || 'V').toUpperCase();
            return `<div class="od-dress-item">
              <div class="od-dress-avatar">${img ? `<img src="${img}" alt="">` : initial}</div>
              <div class="od-dress-info">
                <div class="od-dress-name">${escapeHtml(v)}</div>
                ${size ? `<div class="od-dress-meta">Size ${size}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
          ${tenPK !== '—' ? `<div class="od-pk-item" style="background:var(--bg-muted);border:1px solid var(--border-light);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3);font-size:var(--text-sm);font-weight:600;color:var(--text-primary);">💍 ${escapeHtml(tenPK)}</div>` : ''}
        </div>
      </div>

      <!-- THANH TOÁN -->
      <div class="od-section">
        <div class="od-section-title"><span class="ico">💰</span> Thanh toán</div>
        <div class="od-row">
          <span class="label">Tiền thuê váy</span>
          <span class="value price">${fmtVND(tienVay)}</span>
        </div>
        ${tienPK > 0 ? `<div class="od-row"><span class="label">Tiền thuê PK</span><span class="value price">${fmtVND(tienPK)}</span></div>` : ''}
        <div class="od-row">
          <span class="label">Tổng thuê</span>
          <span class="value price">${fmtVND(tong)}</span>
        </div>
        <div class="od-row">
          <span class="label">Cọc (${o.Hinh_Thuc_Coc || o.coc || '—'})</span>
          <span class="value price" style="color:var(--success)">${fmtVND(cocGoiY)}</span>
        </div>
      </div>

      ${o.Ghi_Chu || o.ghichu ? `
      <div class="od-section">
        <div class="od-section-title"><span class="ico">📝</span> Ghi chú</div>
        <div style="font-size:var(--text-sm);color:var(--text-primary);line-height:1.6;white-space:pre-wrap">${escapeHtml(o.Ghi_Chu || o.ghichu)}</div>
      </div>
      ` : ''}

      <!-- ACTIONS -->
      <div class="od-actions">
        ${!isHoanOrder(o) ? `
          <button class="btn-secondary" onclick="openRefund('${id}')">💰 Hoàn cọc</button>
          <button class="btn-primary" onclick="openEditOrder('${id}')">✏️ Sửa</button>
          <button class="btn-danger" onclick="deleteOrder('${id}')">🗑</button>
        ` : `
          <button class="btn-primary" onclick="openEditOrder('${id}')">✏️ Sửa</button>
          <button class="btn-danger" onclick="deleteOrder('${id}')">🗑</button>
        `}
      </div>
    </div>
  `;
  openModal('m-detail');

  // Track presence: notify others we're editing this order
  const orderId = o.Ma_Don || o.id;
  if (typeof window.trackOrderEditingPresence === 'function') {
    window.trackOrderEditingPresence(orderId);
  }
}

function openEditOrder(id) {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  const ngayLay = o.Ngay_Lay || o.lay;
  const ngayTra = o.Ngay_Tra || o.tra || isoOf(ngayTraThuc(o.Goi_Thue || o.goi, ngayLay));

  // Build váy pills
  let vayPills = '';
  if (db.vay.length === 0) {
    vayPills = '<div class="eo-empty">Chưa có váy nào</div>';
  } else {
    db.vay.forEach(v => {
      const vid = v.Ma_Vay || v.ma;
      const sel = (o.dhvs || []).some(x => x.vay === vid);
      vayPills += `<div class="eo-pill ${sel ? 'selected' : ''}" data-vay="${vid}" onclick="toggleEoPill(this)">${escapeHtml(v.Ten_Vay || v.ten)}</div>`;
    });
  }

  // Build PK pills
  let pkPills = '';
  if (db.pk.length === 0) {
    pkPills = '<div class="eo-empty">Chưa có phụ kiện nào</div>';
  } else {
    db.pk.forEach(p => {
      const pid = p.Ma_PK || p.ma;
      const sel = (o.Ma_PK || o.pks || []).includes(pid);
      pkPills += `<div class="eo-pill ${sel ? 'selected' : ''}" data-pk="${pid}" onclick="toggleEoPill(this)">${escapeHtml(p.Ten_PK || p.ten)}</div>`;
    });
  }

  $('#eo-body').innerHTML = `
    <div class="sheet-head">
      <div>
        <h2>Sửa đơn</h2>
        <div class="sheet-subtitle">${o.Ma_Don || o.id}</div>
      </div>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="eo-modal-content">
      <form id="eo-form" onsubmit="event.preventDefault(); saveEditOrder('${id}')">


        <!-- Customer Info -->
        <div class="eo-section">
          <div class="eo-section-title">👤 Khách hàng</div>
          <div class="eo-field">
            <label class="eo-label">Instagram</label>
            <input name="insta" class="eo-input" value="${escapeHtml(o.Insta_Khach || o.insta || '')}" placeholder="@username" />
          </div>
          <div class="eo-field">
            <label class="eo-label">Số điện thoại</label>
            <input name="sdt" class="eo-input" value="${escapeHtml(o.SDT || o.sdt || '')}" placeholder="0912 345 678" />
          </div>
        </div>

        <!-- Order Type -->
        <div class="eo-section">
          <div class="eo-section-title">📋 Loại đơn</div>
          <div class="eo-type-pills">
            ${['Chốt thuê','Fitting','Fitting xa','Đặt ship'].map(t => `
              <div class="eo-type-pill ${(o.Trang_Thai_Don || o.type) === t ? 'selected' : ''}" data-type="${t}" onclick="selectEoType(this)">${t}</div>
            `).join('')}
          </div>
          <input type="hidden" name="type" value="${o.Trang_Thai_Don || o.type || 'Chốt thuê'}" />
        </div>

        <!-- Rental Info -->
        <div class="eo-section">
          <div class="eo-section-title">📅 Thời gian thuê</div>
          <div class="eo-row">
            <div class="eo-field eo-half">
              <label class="eo-label">Gói thuê</label>
              <select name="goi" class="eo-select" onchange="recalcTra()">
                ${['12h','1 ngày','3 ngày'].map(g => `<option value="${g}" ${(o.Goi_Thue || o.goi) === g ? 'selected' : ''}>${g}</option>`).join('')}
              </select>
            </div>
            <div class="eo-field eo-half">
              <label class="eo-label">Giờ lấy</label>
              <input name="gio" class="eo-input" type="time" value="${o.Gio_Lay || o.gio || '09:00'}" />
            </div>
          </div>
          <div class="eo-row">
            <div class="eo-field eo-half">
              <label class="eo-label">Ngày lấy</label>
              <input name="lay" class="eo-input" type="date" value="${ngayLay}" onchange="recalcTra()" />
            </div>
            <div class="eo-field eo-half">
              <label class="eo-label">Ngày trả</label>
              <input name="tra" class="eo-input" type="date" value="${ngayTra}" />
            </div>
          </div>
        </div>

        <!-- Delivery -->
        <div class="eo-section">
          <div class="eo-section-title">🚚 Nhận / Trả đồ</div>
          <div class="eo-row">
            <div class="eo-field eo-half">
              <label class="eo-label">Hình thức cọc</label>
              <select name="coc" class="eo-select">
                ${['Cọc 50% + CCCD','Cọc 100%'].map(c => `<option ${(o.Hinh_Thuc_Coc || o.coc) === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="eo-field eo-half">
              <label class="eo-label">Hình thức nhận</label>
              <select name="nhan" class="eo-select">
                ${['Không đặt ship','Đặt ship'].map(n => `<option ${(o.Hinh_Thuc_Nhan || o.nhan) === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="eo-field">
            <label class="eo-label">Địa chỉ</label>
            <input name="dc" class="eo-input" value="${escapeHtml(o.Dia_Chi || o.dc || '')}" placeholder="Q1, TP.HCM" />
          </div>
        </div>

        <!-- Dresses -->
        <div class="eo-section">
          <div class="eo-section-title">👗 Váy thuê</div>
          <input type="text" class="eo-search" id="eo-vay-search" placeholder="🔍 Tìm váy..." oninput="filterEoPills('eo-vays', this.value)" />
          <div id="eo-vays" class="eo-pills-container">${vayPills}</div>
        </div>

        <!-- Accessories -->
        <div class="eo-section">
          <div class="eo-section-title">💍 Phụ kiện</div>
          <input type="text" class="eo-search" id="eo-pk-search" placeholder="🔍 Tìm phụ kiện..." oninput="filterEoPills('eo-pks', this.value)" />
          <div id="eo-pks" class="eo-pills-container">${pkPills}</div>
        </div>

        <!-- Notes -->
        <div class="eo-section">
          <div class="eo-section-title">📝 Ghi chú</div>
          <div class="eo-field">
            <label class="eo-label">Sự kiện</label>
            <input name="sukien" class="eo-input" value="${escapeHtml(o.Su_Kien || '')}" placeholder="Đám cưới, sinh nhật..." />
          </div>
          <div class="eo-field">
            <label class="eo-label">Ghi chú</label>
            <textarea name="ghichu" class="eo-textarea" placeholder="Ghi chú thêm...">${escapeHtml(o.Ghi_Chu || o.ghichu || '')}</textarea>
          </div>
        </div>

      </form>
    </div>
    <div class="sheet-foot">
      <button type="button" class="btn ghost" data-close>Hủy</button>
      <button type="button" class="btn btn-primary" id="eo-save-btn">Lưu thay đổi</button>
    </div>
  `;

  // Setup pill toggle function
  window.toggleEoPill = function(el) {
    el.classList.toggle('selected');
  };

  // Setup type selection
  window.selectEoType = function(el) {
    document.querySelectorAll('.eo-type-pill').forEach(p => p.classList.remove('selected'));
    el.classList.add('selected');
    document.querySelector('#eo-form [name="type"]').value = el.dataset.type;
  };

  // Filter pills for vay/pk search
  window.filterEoPills = function(containerId, q) {
    q = (q || '').toLowerCase().trim();
    const container = document.getElementById(containerId);
    if (!container) return;
    const pills = container.querySelectorAll('.eo-pill');
    let visible = 0;
    pills.forEach(p => {
      const text = (p.textContent || '').toLowerCase();
      const match = !q || text.includes(q);
      p.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    let empty = container.parentElement.querySelector('.eo-pills-empty');
    if (visible === 0 && q) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'eo-empty eo-pills-empty';
        empty.textContent = 'Không tìm thấy';
        container.appendChild(empty);
      }
      empty.style.display = '';
    } else if (empty) {
      empty.style.display = 'none';
    }
  };

  closeModal('m-detail');
  openModal('m-edit-order');

  // Lắng nghe nút Lưu — gọi saveEditOrder với id được lưu trong data attribute
  const btn = document.getElementById('eo-save-btn');
  if (btn) {
    btn.onclick = () => saveEditOrder(id);
  }
  // Handle Enter key in form
  const form = document.getElementById('eo-form');
  if (form) {
    form.onsubmit = e => { e.preventDefault(); saveEditOrder(id); };
  }

  window.recalcTra = () => {
    const goi = frm('goi').value;
    const lay = frm('lay').value;
    if (!goi || !lay) return;
    frm('tra').value = isoOf(ngayTraThuc(goi, lay));
  };
  function frm(name) { return document.querySelector(`#eo-form [name="${name}"]`); }
}

window.saveEditOrder = async function(id) {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  const f = $('#eo-form');
  const fd = new FormData(f);
  o.Insta_Khach = fd.get('insta') || '';
  o.SDT = fd.get('sdt') || '';
  o.Trang_Thai_Don = fd.get('type') || 'Chốt thuê';
  o.Goi_Thue = fd.get('goi');
  o.Ngay_Lay = fd.get('lay');
  o.Gio_Lay = fd.get('gio');
  o.Ngay_Tra = fd.get('tra');
  o.Hinh_Thuc_Coc = fd.get('coc');
  o.Hinh_Thuc_Nhan = fd.get('nhan');
  o.Dia_Chi = fd.get('dc') || '';
  o.Su_Kien = fd.get('sukien') || '';
  o.Ghi_Chu = fd.get('ghichu') || '';
  o._ts = Date.now();
  o._version = (o._version || 0) + 1;
  // Dresses
  const vayIds = $$('#eo-vays .eo-pill.selected').map(p => p.dataset.vay);
  o.dhvs = vayIds.map(v => ({ vay: v }));
  // Accessories
  const pkIds = $$('#eo-pks .eo-pill.selected').map(p => p.dataset.pk);
  o.Ma_PK = pkIds;

  // HÀN VÀO SUPABASE TRƯỚC — bắt buộc chờ xong mới được đóng modal
  if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
    const btn = document.getElementById('eo-save-btn');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try {
      if (o._dbId) {
        // Has _dbId — update existing
        await window.SupabaseService.updateOrder(o._dbId, { ...o, dhvs: o.dhvs, pks: pkIds });
      } else {
        // No _dbId — find by ma_don, then create if not found
        const existing = await window.SupabaseService.findOrderByMaDon(o.Ma_Don);
        if (existing) {
          o._dbId = existing._dbId;
          await window.SupabaseService.updateOrder(existing._dbId, { ...o, dhvs: o.dhvs, pks: pkIds });
        } else {
          const created = await window.SupabaseService.createOrder({ ...o, dhvs: o.dhvs, pks: pkIds });
          if (created?._dbId) o._dbId = created._dbId;
        }
      }
    } catch (err) {
      console.warn('Supabase sync failed:', err);
      markOrderPendingSync(o);
      // Silent — retry trong polling/realtime. Chỉ show toast khi thực sự stuck.
    }
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }

  // Sau khi Supabase xong → lưu localStorage → đóng modal
  save();
  closeModal('m-edit-order');
  toastSave('Đã lưu đơn', false);
  refreshCurView();
};

window.deleteOrder = function(id) {
  showConfirmModal({
    title: 'Xóa đơn này?',
    message: 'Hành động không thể hoàn tác.',
    confirmText: 'Xóa',
    danger: true,
    onConfirm: () => {
      const order = db.don.find(x => (x.Ma_Don || x.id) === id);
      const dbId = order?._dbId;
      const delBtn = document.querySelector('#m-detail .btn-danger');
      if (delBtn) { delBtn.disabled = true; delBtn.classList.add('loading'); }
      // Track _dbId in BOTH in-memory and persistent tombstone
      // This ensures the order is filtered out even if Supabase delete fails
      if (dbId) {
        markDeleted('orders', dbId);
        // Also track in-memory for instant filtering
        if (!db._deletedOrderIds) db._deletedOrderIds = {};
        db._deletedOrderIds[dbId] = Date.now();
      }
      // Also track by Ma_Don for extra safety
      const maDon = order?.Ma_Don || order?.id;
      if (maDon) {
        if (!db._deletedOrderMaDon) db._deletedOrderMaDon = {};
        db._deletedOrderMaDon[maDon] = Date.now();
      }
      db.don = db.don.filter(x => (x.Ma_Don || x.id) !== id);
      db.dhv = (db.dhv || []).filter(x => (x.Ma_Don || x.id) !== id);
      save();
      // Sync deletion to Supabase
      if (dbId && typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
        window.SupabaseService.deleteOrder(dbId).then(() => {
          // Supabase confirmed — clear from persistent tombstone so merge stops filtering it
          clearDeleted('orders', dbId);
        }).catch(err => {
          console.warn('Supabase deleteOrder failed:', err);
        });
      }
      closeModal('m-detail');
      toast('Đã xóa đơn', 'success');
      refreshCurView();
      // Scroll to top AFTER refreshCurView's preserve-scroll completes (2 rAF ≈ 32ms)
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    }
  });
};

function refreshCurView() {
  // Preserve scroll position across re-render — otherwise list jumps to top after edit/save/delete
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  if (curView === 'v-cal') renderCal();
  else if (curView === 'v-orders') renderOrders();
  else if (curView === 'v-orders-table') renderOrdersTable();
  else if (curView === 'v-raw') renderRawTable();
  else if (curView === 'v-kho') renderKho();
  else if (curView === 'v-pk') renderPk();
  else if (curView === 'v-dashboard') renderDashboard();
  if (scrollY > 0) {
    // Restore after DOM paints — double rAF handles image/font reflow cases too
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
      });
    });
  }
}

/* ============================================================
 *  REFUND MODAL
 * ============================================================ */
function openRefund(id) {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o || isHoanOrder(o)) return;
  refundDon = o;
  const tienVay = donTienThueVay(o);
  const tienPK = donTienThuePK(o);
  const tong = tienVay + tienPK;
  const cocGoiY = donCocGoiY(o);

  const custName = o.Insta_Khach || o.insta || '—';
  const initials = (custName.replace('@','').trim()[0] || 'K').toUpperCase();
  $('#r-body').innerHTML = `
    <div class="sheet-head">
      <div>
        <h2>Hoàn cọc</h2>
        <div style="font-size:12px;color:#86868b;font-family:var(--font-mono);margin-top:2px">${o.Ma_Don || o.id}</div>
      </div>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="rf-modal-content">
      <div class="rf-customer-card">
        <div class="rf-customer-avatar">${initials}</div>
        <div class="rf-customer-info">
          <div class="rf-customer-name">${escapeHtml(custName)}</div>
          <div class="rf-customer-meta">
            <span>${escapeHtml(o.SDT || o.sdt || '')}</span>
          </div>
        </div>
      </div>

      <div class="rf-summary-card">
        <div class="rf-summary-title">Chi tiết thuê</div>
        <div class="rf-summary-row">
          <span class="lbl">Tiền thuê váy</span>
          <span class="val">${fmtVND(tienVay)}</span>
        </div>
        <div class="rf-summary-row">
          <span class="lbl">Tiền thuê phụ kiện</span>
          <span class="val">${fmtVND(tienPK)}</span>
        </div>
        <div class="rf-summary-row total">
          <span class="lbl">Tổng thuê</span>
          <span class="val">${fmtVND(tong)}</span>
        </div>
      </div>

      <div class="rf-field">
        <label class="rf-field-label">Tiền cọc khách đã đưa</label>
        <div class="rf-input-wrap">
          <input id="r-coc" class="rf-input" type="number" min="0" step="1000" value="${cocGoiY}" oninput="recalcHoan()" />
          <span class="rf-input-suffix">đ</span>
        </div>
      </div>

      <div class="rf-field">
        <label class="rf-field-label">Chi phí khác (ship / giặt /...)</label>
        <div class="rf-input-wrap">
          <input id="r-cp" class="rf-input" type="number" min="0" step="1000" value="0" oninput="recalcHoan()" />
          <span class="rf-input-suffix">đ</span>
        </div>
      </div>

      <div id="r-result" class="rf-result-card ok">
        <div class="rf-result-icon">✓</div>
        <div class="rf-result-content">
          <div class="rf-result-label">Hoàn lại khách</div>
        </div>
        <div class="rf-result-amount">0đ</div>
      </div>

      <div class="rf-field">
        <label class="rf-field-label">Ghi chú hoàn</label>
        <textarea id="r-ghichu" class="rf-textarea" placeholder="Lý do hoàn, ghi chú thêm..."></textarea>
      </div>
    </div>
    <div class="sheet-foot">
      <button class="btn ghost" data-close>Hủy</button>
      <button class="btn btn-primary" onclick="saveRefund()">Xác nhận hoàn cọc</button>
    </div>
  `;
  closeModal('m-detail');
  openModal('m-refund');
  window.recalcHoan = () => {
    const coc = +$('#r-coc').value || 0;
    const cp = +$('#r-cp').value || 0;
    const hoan = coc - tong - cp;
    const el = $('#r-result');
    if (hoan < 0) {
      el.className = 'rf-result-card warn';
      el.innerHTML = `
        <div class="rf-result-icon">⚠️</div>
        <div class="rf-result-content">
          <div class="rf-result-label">Hoàn cọc âm — kiểm tra lại</div>
        </div>
        <div class="rf-result-amount">${fmtVND(hoan)}</div>
      `;
    } else {
      el.className = 'rf-result-card ok';
      el.innerHTML = `
        <div class="rf-result-icon">✓</div>
        <div class="rf-result-content">
          <div class="rf-result-label">Hoàn lại khách</div>
        </div>
        <div class="rf-result-amount">${fmtVND(hoan)}</div>
      `;
    }
  };
  recalcHoan();
}

window.saveRefund = function() {
  if (!refundDon) return;
  const coc = +$('#r-coc').value || 0;
  const cp = +$('#r-cp').value || 0;
  const tong = donTienThueVay(refundDon) + donTienThuePK(refundDon);
  const hoan = coc - tong - cp;
  if (hoan < 0) {
    showConfirmModal({
      title: 'Hoàn cọc âm?',
      message: `Số tiền hoàn là <strong style="color:var(--danger)">${fmtVND(hoan)}</strong> (âm — khách nợ thêm). Tiếp tục?`,
      confirmText: 'Tiếp tục',
      danger: true,
      onConfirm: () => doSaveRefund(coc, cp, tong, hoan)
    });
    return;
  }
  doSaveRefund(coc, cp, tong, hoan);
};

function doSaveRefund(coc, cp, tong, hoan) {
  if (!refundDon) return;
  refundDon.hoan = true;
  refundDon.Trang_Thai_Hoan_Coc = true;
  // Dùng giờ VN (UTC+7)
  const vn = new Date();
  vn.setMinutes(vn.getMinutes() + 7 - vn.getTimezoneOffset());
  refundDon.time_hoan = vn.toISOString();
  refundDon.chiphi = cp;
  // Max _ts so Google Sheets merge always prefers this local version (protects hoan flags)
  refundDon._ts = Date.now() + 86400000;

  if (!db.tt) db.tt = [];
  db.tt.unshift({
    id: 'TT' + Date.now(),
    ngay: new Date().toISOString(),
    ma: refundDon.Ma_Don || refundDon.id,
    ten: refundDon.Insta_Khach || refundDon.insta,
    sdt: refundDon.SDT || refundDon.sdt,
    goi: refundDon.Goi_Thue || refundDon.goi,
    tienCoc: coc,
    chiphi: cp,
    tongThue: tong,
    hoan,
    ghichu: $('#r-ghichu')?.value || '',
  });
  save();
  // Sync refund to Supabase
  if (refundDon._dbId && typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
    window.SupabaseService.updateOrder(refundDon._dbId, refundDon).catch(err => console.warn('Supabase refund sync failed:', err));
  }
  // Sync refund payment record to Supabase
  const newPayment = db.tt && db.tt[0];
  if (newPayment && !newPayment._dbId && typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.()) {
    window.SupabaseService.createPayment(newPayment).then(created => {
      if (created?._dbId) {
        newPayment._dbId = created._dbId;
        newPayment.id = created._dbId;
        save();
      }
    }).catch(err => console.warn('Supabase createPayment failed:', err));
  }
  closeModal('m-refund');
  toast('Đã hoàn cọc', 'success');
  refreshCurView();

  // Sync refund record to Google Sheets immediately
  if (SYNC.WEB_APP_URL) syncRefundToSheets();

  // Show screenshot modal for sharing
  showRefundScreenshot(refundDon, coc, tong, cp, hoan);
};

function showRefundScreenshot(o, coc, tong, cp, hoan) {
  const id = o.Ma_Don || o.id || '';
  const ins = o.Insta_Khach || o.insta || '';
  const sdt = o.SDT || o.sdt || '';
  const goi = o.Goi_Thue || o.goi || '';
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayLayDisplay = isoToVN(ngayLay);
  const ngayTra = ngayTraThuc(goi, ngayLay);
  const ngayTraDisplay = ngayTra ? isoToVN(ngayTra) : '—';
  const ngayHoan = new Date().toLocaleString('vi-VN');
  const loaiCoc = o.Hinh_Thuc_Coc || o.coc || '';

  // Build detailed items with prices
  const g = goi === '12h' ? 'Gia_Thue_12h' : goi === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay';
  let itemsHtml = '';

  if (o.dhvs && o.dhvs.length > 0) {
    o.dhvs.forEach((dhv) => {
      const v = vayById.get(dhv.vay || dhv.Ma_Vay);
      if (v) {
        const ten = v.Ten_Vay || v.ten || '';
        const gia = v[g] || 0;
        itemsHtml += `<div class="r-item"><span class="r-item-name">${escapeHtml(ten)} <span class="r-item-size">(Size ${v.Size || v.size || '-'})</span></span><span class="r-item-price">${' '}${fmtVND(gia)}</span></div>`;
      }
    });
  }

  const pkIds = o.Ma_PK || o.pks || [];
  pkIds.forEach(pkId => {
    const p = pkById.get(pkId);
    if (p) {
      const ten = p.Ten_PK || p.ten || '';
      const gia = p[g] || 0;
      itemsHtml += `<div class="r-item"><span class="r-item-name">${escapeHtml(ten)} <span class="r-item-size">(PK)</span></span><span class="r-item-price">${fmtVND(gia)}</span></div>`;
    }
  });

  if (!itemsHtml) itemsHtml = '<div class="rss-empty">—</div>';

  const refundCardHTML = `
    <div class="refund-card" id="refund-screenshot">
      <!-- Header với logo Aura Rental -->
      <div class="rss-header">
        <div class="rss-logo">
          <span class="rss-logo-text">Aura Rental</span>
        </div>
        <div class="rss-divider"></div>
        <div class="rss-header-meta">
          <div class="rss-title">PHIẾU HOÀN CỌC</div>
          <div class="rss-code">${id}</div>
        </div>
      </div>

      <!-- Thông tin khách hàng -->
      <div class="rss-section">
        <div class="rss-section-title">Thông tin khách hàng</div>
        <div class="rss-row">
          <span class="rss-label">Khách</span>
          <span class="rss-value">${escapeHtml(ins || '—')}</span>
        </div>
        <div class="rss-row">
          <span class="rss-label">SĐT</span>
          <span class="rss-value">${escapeHtml(sdt || '—')}</span>
        </div>
        <div class="rss-row">
          <span class="rss-label">Thuê</span>
          <span class="rss-value">${escapeHtml(goi)} · ${ngayLayDisplay} → ${ngayTraDisplay}</span>
        </div>
        ${loaiCoc ? `<div class="rss-row"><span class="rss-label">Hình thức</span><span class="rss-value">${escapeHtml(loaiCoc)}</span></div>` : ''}
        <div class="rss-row">
          <span class="rss-label">Ngày hoàn</span>
          <span class="rss-value">${ngayHoan}</span>
        </div>
      </div>

      <!-- Sản phẩm thuê -->
      <div class="rss-section">
        <div class="rss-section-title">Sản phẩm thuê</div>
        <div class="rss-items">${itemsHtml}</div>
      </div>

      <!-- Chi tiết thanh toán -->
      <div class="rss-section rss-section-payment">
        <div class="rss-payment-row">
          <span class="rss-pay-label">Tiền cọc</span>
          <span class="rss-pay-value ${coc > 0 ? 'rss-green' : 'rss-muted'}">${fmtVND(coc)}</span>
        </div>
        <div class="rss-payment-row">
          <span class="rss-pay-label">Tiền thuê</span>
          <span class="rss-pay-value ${tong > 0 ? 'rss-red' : 'rss-muted'}">${tong > 0 ? '−' + fmtVND(tong) : '0đ'}</span>
        </div>
        ${cp > 0 ? `<div class="rss-payment-row"><span class="rss-pay-label">Phí khác</span><span class="rss-pay-value rss-red">−${fmtVND(cp)}</span></div>` : ''}
      </div>

      <!-- Tổng hoàn -->
      <div class="rss-total ${hoan >= 0 ? 'rss-total-pos' : 'rss-total-neg'}">
        <span class="rss-total-label">Số tiền hoàn lại</span>
        <span class="rss-total-amount">${fmtVND(hoan)}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="rss-actions">
      <button class="rss-btn rss-btn-ghost" onclick="closeRefundScreenshot()">Đóng</button>
      <button class="rss-btn rss-btn-copy" onclick="copyRefundImageDirect()">
        <span class="rss-btn-icon">📋</span> Copy ảnh
      </button>
    </div>
  `;

  $('#rss-body').innerHTML = refundCardHTML;
  openModal('m-refund-screenshot');
}

function closeRefundScreenshot() {
  closeModal('m-refund-screenshot');
}

function copyImageToClipboard(blob) {
  try {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
      toast('Đã copy ảnh vào clipboard!', 'success');
    }).catch(() => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'phieu-hoan-coc-aura.png';
      a.click();
      URL.revokeObjectURL(url);
      toast('Đã tải ảnh!', 'success');
    });
  } catch (e) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phieu-hoan-coc-aura.png';
    a.click();
    URL.revokeObjectURL(url);
    toast('Đã tải ảnh!', 'success');
  }
}

function shareRefundAsText() {
  const el = document.getElementById('refund-screenshot');
  if (!el) return;
  const maDon = el.querySelector('.receipt-id')?.textContent || '';
  const ngayHoan = el.querySelectorAll('.receipt-row')[1]?.querySelector('.receipt-value')?.textContent || '';
  const tenKhach = el.querySelectorAll('.receipt-row')[2]?.querySelector('.receipt-value')?.textContent || '';
  const sdtKhach = el.querySelectorAll('.receipt-row')[3]?.querySelector('.receipt-value')?.textContent || '';
  const tienCoc = el.querySelector('.rcpt-green')?.textContent || '';
  const tienThue = el.querySelectorAll('.rcpt-red')[0]?.textContent || '';
  const tienHoan = el.querySelector('.rcpt-total-amount')?.textContent || '';

  const text = 'AURA RENTAL - PHIẾU HOÀN CỌC\n\nMã đơn: ' + maDon + '\nNgày hoàn: ' + ngayHoan + '\n\nKhách hàng:\n' + tenKhach + ' | ' + sdtKhach + '\n\nThanh toán:\nTiền cọc: ' + tienCoc + '\nTiền thuê: ' + tienThue + '\nHoàn lại: ' + tienHoan;
  if (navigator.share) {
    navigator.share({ title: 'Phiếu hoàn cọc - Aura Rental', text: text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => { toast('Đã copy vào clipboard!', 'success'); }).catch(() => { toast('Copy thất bại', 'error'); });
  }
}

// Copy ảnh phiếu hoàn cọc — dùng html2canvas để render chính xác
function copyRefundImageDirect() {
  const el = document.getElementById('refund-screenshot');
  if (!el) return;

  const doCapture = () => {
    if (typeof html2canvas === 'undefined') {
      toast('Đang tải thư viện xử lý ảnh...', 'warn');
      loadHtml2Canvas(() => {
        if (typeof html2canvas === 'undefined') {
          toast('Không thể tải thư viện ảnh', 'error');
          return;
        }
        doCapture();
      });
      return;
    }

    // Scroll element into view and reset page scroll to eliminate capture offset
    el.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollTo(0, 0);

    // Get exact dimensions after scroll
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: width,
      height: height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      x: 0,
      y: 0
    }).then(canvas => {
      canvas.toBlob(blob => {
        if (blob) {
          copyImageToClipboard(blob);
        } else {
          toast('Không thể tạo ảnh', 'error');
        }
      }, 'image/png');
    }).catch((err) => {
      console.error('Capture error:', err);
      toast('Không thể copy ảnh', 'error');
    });
  };
  doCapture();
}

/* ============================================================
 *  NEW ORDER MODAL — full form (matches booking form UX)
 * ============================================================ */
function openNewOrder() {
  const today = new Date();
  const defaultLay = isoOf(today);

  // Build váy items HTML
  let vayItemsHtml = '';
  if (db.vay.length === 0) {
    vayItemsHtml = '<div class="form-new-empty">Chưa có váy. Bấm + ở tab Váy để thêm.</div>';
  } else {
    db.vay.forEach(v => {
      const id = v.Ma_Vay || v.ma;
      const ten = v.Ten_Vay || v.ten;
      const size = v.Size || v.size;
      const anh = v.Anh_Vay || v.anh || '';
      const imgHtml = anh ? '<img src="' + anh + '">' : '👗';
      const safeTen = escapeHtml(ten);
      vayItemsHtml += '<div class="form-new-chip" data-vay="' + id + '" data-ten="' + ten.toLowerCase() + '" onclick="window.toggleNewVay(\'' + id + '\', this)">' +
        '<input type="checkbox" name="vays" value="' + id + '">' +
        '<span class="form-new-chip-check"></span>' +
        '<div class="form-new-chip-img">' + imgHtml + '</div>' +
        '<div class="form-new-chip-name">' + safeTen + '</div>' +
        '<div class="form-new-chip-meta">Size ' + size + '</div>' +
        '</div>';
    });
  }

  // Build phụ kiện items HTML
  let pkItemsHtml = '';
  if (db.pk.length === 0) {
    pkItemsHtml = '<div class="form-new-empty">Chưa có phụ kiện.</div>';
  } else {
    db.pk.forEach(p => {
      const id = p.Ma_PK || p.ma;
      const ten = p.Ten_PK || p.ten || p.Ten || '';
      const tenLower = ten ? ten.toLowerCase() : '';
      const loai = p.Loai || p.loai || '';
      const anh = p.Anh_PK || p.anh || '';
      const imgHtml = anh ? '<img src="' + anh + '">' : '💍';
      const safeTen = escapeHtml(ten);
      const safeLoai = escapeHtml(loai);

      // Check stock: if So_Luong_Tong > 0 and available <= 0, disable chip
      const total = p.So_Luong_Tong || 0;
      const today = isoOf(new Date());
      const rented = countRentedPK(id, today);
      const available = total - rented;
      const outOfStock = total > 0 && available <= 0;
      const disabledAttr = outOfStock ? ' disabled="1"' : '';
      const chipClass = outOfStock ? 'form-new-chip oos' : 'form-new-chip';
      const oosNote = outOfStock ? ' <span style="color:#dc2626;font-size:10px">Hết hàng</span>' : '';

      pkItemsHtml += '<div class="' + chipClass + '" data-pk="' + id + '" data-ten="' + tenLower + '" onclick="if(!this.hasAttribute(\'disabled\')) window.toggleNewPK(\'' + id + '\', this)"' + disabledAttr + '>' +
        '<input type="checkbox" name="pks" value="' + id + '"' + disabledAttr + '>' +
        '<span class="form-new-chip-check"></span>' +
        '<div class="form-new-chip-img">' + imgHtml + '</div>' +
        '<div class="form-new-chip-name">' + safeTen + oosNote + '</div>' +
        '<div class="form-new-chip-meta">' + safeLoai + '</div>' +
        '</div>';
    });
  }

  // Build sự kiện options
  const sukienOptions = ['Tiệc cưới','Tiệc công ty','Prom','Sự kiện','Anniversary','Du lịch','Đi date','Tốt nghiệp','Đi chụp ảnh','Mục khác'].map(s =>
    '<label class="form-new-option" data-sukien="' + s + '">' +
    '<input type="radio" name="sukien" value="' + s + '">' +
    '<span class="form-new-radio"></span>' +
    '<span>' + s + '</span>' +
    '</label>'
  ).join('');

  const html = '<div class="sheet-head">' +
    '<div><h2 style="margin:0">➕ Đơn mới</h2><small class="muted">Tạo đơn thuê cho khách</small></div>' +
    '<button class="sheet-close" data-close>×</button>' +
    '</div>' +
    '<div class="sheet-body">' +
    '<form id="n-form" onsubmit="event.preventDefault(); saveNewOrder()">' +

    // SECTION 1: Thông tin khách
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">1</span>Thông tin khách</div>' +
    '<div class="form-group-new"><label>Instagram <span class="req">*</span></label>' +
    '<input name="insta" required placeholder="@username" /></div>' +
    '<div class="form-group-new"><label>SĐT <span class="req">*</span></label>' +
    '<input name="sdt" required type="tel" placeholder="0901234567" /></div>' +
    '<div class="form-group-new"><label>Loại đơn</label>' +
    '<div class="form-new-options">' +
    '<label class="form-new-option" data-type="Chốt thuê"><input type="radio" name="type" value="Chốt thuê" checked><span class="form-new-radio"></span><span>Chốt thuê</span></label>' +
    '<label class="form-new-option" data-type="Fitting"><input type="radio" name="type" value="Fitting"><span class="form-new-radio"></span><span>Fitting</span></label>' +
    '<label class="form-new-option" data-type="Fitting xa"><input type="radio" name="type" value="Fitting xa"><span class="form-new-radio"></span><span>Fitting xa</span></label>' +
    '<label class="form-new-option" data-type="Đặt ship"><input type="radio" name="type" value="Đặt ship"><span class="form-new-radio"></span><span>Đặt ship</span></label>' +
    '</div></div></div>' +

    // SECTION 2: Váy
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">2</span>Chọn váy <span class="req">*</span></div>' +
    '<div class="form-new-search-wrap"><input type="text" id="n-search-vay" placeholder="🔍 Tìm tên váy..." oninput="filterVayItems(this.value)" /></div>' +
    '<div class="form-new-items-grid" id="n-vays">' + vayItemsHtml + '</div></div>' +

    // SECTION 3: Phụ kiện
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">3</span>Phụ kiện <small style="font-weight:400;color:var(--muted)">(tùy chọn)</small></div>' +
    '<div class="form-new-search-wrap"><input type="text" id="n-search-pk" placeholder="🔍 Tìm phụ kiện..." oninput="filterPKItems(this.value)" /></div>' +
    '<div class="form-new-items-grid" id="n-pks">' + pkItemsHtml + '</div></div>' +

    // SECTION 4: Gói thuê
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">4</span>Gói thuê</div>' +
    '<div class="form-new-options">' +
    '<label class="form-new-option" data-goi="12h"><input type="radio" name="goi" value="12h"><span class="form-new-radio"></span><div><div>12h</div><small class="muted">Từ 9h sáng đến 9h tối (trong ngày)</small></div></label>' +
    '<label class="form-new-option selected" data-goi="1 ngày"><input type="radio" name="goi" value="1 ngày" checked><span class="form-new-radio"></span><div><div>1 ngày</div><small class="muted">1 ngày 1 đêm</small></div></label>' +
    '<label class="form-new-option" data-goi="3 ngày"><input type="radio" name="goi" value="3 ngày"><span class="form-new-radio"></span><div><div>3 ngày</div><small class="muted">3 ngày 2 đêm</small></div></label>' +
    '</div></div>' +

    // SECTION 5: Ngày & Giờ
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">5</span>Ngày & Giờ</div>' +
    '<div class="form-group-new"><label>Ngày lấy <span class="req">*</span></label>' +
    '<input name="lay" type="date" required value="' + defaultLay + '" /></div>' +
    '<div class="form-group-new"><label>Giờ lấy</label>' +
    '<input name="gio" type="time" value="09:00" /></div>' +
    '<div class="form-group-new"><label>Ngày trả (tự động)</label>' +
    '<input name="tra" type="date" id="n-tra" readonly /></div></div>' +

    // SECTION 6: Nhận hàng
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">6</span>Hình thức nhận</div>' +
    '<div class="form-new-options">' +
    '<label class="form-new-option selected" data-nhan="Không đặt ship"><input type="radio" name="nhan" value="Không đặt ship" checked><span class="form-new-radio"></span><span>Khách tự qua shop</span></label>' +
    '<label class="form-new-option" data-nhan="Đặt ship"><input type="radio" name="nhan" value="Đặt ship"><span class="form-new-radio"></span><span>Đặt ship tận nơi</span></label>' +
    '</div>' +
    '<div class="form-group-new form-new-address" id="n-address-field" style="display:none">' +
    '<label>Địa chỉ nhận <span class="req">*</span></label>' +
    '<textarea name="dc" placeholder="VD: 123 Nguyễn Trãi, Quận 1, TP.HCM"></textarea></div></div>' +

    // SECTION 7: Cọc
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">7</span>Hình thức cọc</div>' +
    '<div class="form-new-options">' +
    '<label class="form-new-option selected" data-coc="Cọc 50% + CCCD"><input type="radio" name="coc" value="Cọc 50% + CCCD" checked><span class="form-new-radio"></span><div><div>Cọc 50% + CCCD</div><small class="muted">Đặt cọc 50% + giữ CCCD</small></div></label>' +
    '<label class="form-new-option" data-coc="Cọc 100%"><input type="radio" name="coc" value="Cọc 100%"><span class="form-new-radio"></span><div><div>Cọc 100%</div><small class="muted">Đặt cọc toàn bộ</small></div></label>' +
    '</div></div>' +

    // SECTION 8: Sự kiện
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">8</span>Sự kiện <small style="font-weight:400;color:var(--muted)">(tùy chọn)</small></div>' +
    '<div class="form-new-options" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + sukienOptions + '</div></div>' +

    // SECTION 9: Ghi chú
    '<div class="form-new-section">' +
    '<div class="form-new-section-title"><span class="form-new-num">9</span>Ghi chú <small style="font-weight:400;color:var(--muted)">(tùy chọn)</small></div>' +
    '<textarea name="ghichu" placeholder="VD: Cần giao hàng trước 14h..."></textarea></div>' +

    // Submit buttons
    '<div class="form-new-submit">' +
    '<button type="button" class="btn-form-cancel" data-close>Hủy</button>' +
    '<button type="submit" class="btn-form-submit">✓ Lưu đơn</button></div>' +

    '</form></div>';

  $('#n-body').innerHTML = html;
  openModal('m-new');

  // Setup event listeners
  setupNewFormRadios();

  // Toggle address visibility
  document.querySelectorAll('#n-form [data-nhan]').forEach(el => {
    el.addEventListener('click', () => {
      const nhan = el.dataset.nhan;
      const addrField = document.getElementById('n-address-field');
      if (nhan === 'Đặt ship') {
        addrField.style.display = 'block';
      } else {
        addrField.style.display = 'none';
      }
    });
  });

  // Auto calculate return date
  setTimeout(recalcNewTra, 100);
}

function setupNewFormRadios() {
  const radioGroups = ['type', 'goi', 'nhan', 'coc', 'sukien'];
  radioGroups.forEach(group => {
    document.querySelectorAll('#n-form [data-' + group + ']').forEach(label => {
      label.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT') return;
        document.querySelectorAll('#n-form [data-' + group + ']').forEach(l => l.classList.remove('selected'));
        this.classList.add('selected');
        const radio = this.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        if (group === 'goi') recalcNewTra();
      });
    });
  });

  // Listen for goi and lay changes
  document.querySelectorAll('#n-form [name="goi"]').forEach(radio => {
    radio.addEventListener('change', recalcNewTra);
  });
  const layInput = document.querySelector('#n-form [name="lay"]');
  if (layInput) layInput.addEventListener('change', recalcNewTra);
}

window.toggleNewVay = function(id, el) {
  const input = el.querySelector('input');
  if (input.checked) {
    input.checked = false;
    el.classList.remove('selected');
  } else {
    input.checked = true;
    el.classList.add('selected');
  }
};

window.toggleNewPK = function(id, el) {
  const input = el.querySelector('input');
  if (input.checked) {
    input.checked = false;
    el.classList.remove('selected');
  } else {
    input.checked = true;
    el.classList.add('selected');
  }
};

window.filterVayItems = function(search) {
  const term = search.toLowerCase().trim();
  document.querySelectorAll('#n-vays .form-new-chip').forEach(item => {
    const ten = item.dataset.ten || '';
    item.style.display = (!term || ten.includes(term)) ? '' : 'none';
  });
};

window.filterPKItems = function(search) {
  const term = search.toLowerCase().trim();
  document.querySelectorAll('#n-pks .form-new-chip').forEach(item => {
    const ten = item.dataset.ten || '';
    item.style.display = (!term || ten.includes(term)) ? '' : 'none';
  });
};

window.saveNewOrder = async function() {
  const f = $('#n-form');
  const fd = new FormData(f);
  // Sửa lỗi: lấy váy từ checked inputs thay vì class .selected
  const vayIds = Array.from($$('#n-vays input[name="vays"]:checked')).map(el => el.value).filter(Boolean);
  const pkIds = Array.from($$('#n-pks input[name="pks"]:checked')).map(el => el.value).filter(Boolean);
  if (!vayIds.length) { toast('Chọn ít nhất 1 váy', 'error'); return; }
  if (!fd.get('insta')?.trim()) { toast('Nhập tên Instagram', 'error'); return; }
  if (!fd.get('sdt')?.trim()) { toast('Nhập SĐT', 'error'); return; }

  const id = nextMaDon();
  const order = {
    Ma_Don: id,
    Trang_Thai_Don: fd.get('type') || 'Chốt thuê',
    Insta_Khach: fd.get('insta').trim(),
    SDT: fd.get('sdt').trim(),
    Goi_Thue: fd.get('goi'),
    Ngay_Lay: fd.get('lay'),
    Gio_Lay: fd.get('gio') || '09:00',
    Ngay_Tra: $('#n-tra').value || fd.get('lay'),
    Hinh_Thuc_Coc: fd.get('coc'),
    Hinh_Thuc_Nhan: fd.get('nhan'),
    Dia_Chi: fd.get('dc') || '',
    Su_Kien: fd.get('sukien') || '',
    Ghi_Chu: fd.get('ghichu') || '',
    Ma_PK: pkIds,
    Chi_Phi_Khac: 0,
    Trang_Thai_Hoan_Coc: false,
    Ngay_Tao: new Date().toISOString(),
    dhvs: vayIds.map(v => ({ vay: v })),
    hoan: false,
    Trang_Thai_Hoan_Coc: false,
    _ts: Date.now(),
  };
  // Mark pending create FIRST — so realtime/polling won't lose this order before _dbId arrives
  if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.() && !order._fromBooking) {
    markPendingCreate(id);
  }
  db.don.unshift(order);
  // Increment So_Lan_Thue
  vayIds.forEach(v => {
    const dress = vayById.get(v);
    if (dress) (dress.So_Lan_Thue = (dress.So_Lan_Thue || 0) + 1);
  });

  // HÀN VÀO SUPABASE TRƯỚC — bắt buộc chờ xong mới đóng modal
  if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.isConfigured?.() && !order._fromBooking) {
    save();
    const saveBtn = f.querySelector('button[type=submit]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add('loading'); }
    try {
      const created = await window.SupabaseService.createOrder({
        ...order,
        dhvs: vayIds.map(v => ({ vay: v })),
        pks: pkIds
      });
      if (created?._dbId) {
        order._dbId = created._dbId;
        clearPendingCreate(id);
        save();
      }
    } catch (err) {
      console.warn('Supabase createOrder failed:', err);
      markOrderPendingSync(order);
      // Do NOT clearPendingCreate — polling/realtime will retry
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('loading'); }
    }
  } else {
    clearPendingCreate(id);
    save();
  }

  closeModal('m-new');
  const isPending = order._pendingSync === true;
  toastSave(`Đã tạo đơn ${id}`, isPending);
  if (curView !== 'v-orders') go('v-orders');
  else renderOrders();
};

/* ============================================================
 *  REFUND ORDERS LIST (Đơn đã hoàn cọc) - Full Screen
 * ============================================================ */
let curRefundSearch = '';

function openRefundOrders() {
  curRefundSearch = '';
  // Reload từ localStorage trước khi hiển thị — đảm bảo luôn thấy đơn vừa hoàn cọc
  const cached = localStorage.getItem('aura_v8');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.don) db.don = parsed.don;
      if (parsed.tt) db.tt = parsed.tt;
    } catch(e) {}
  }
  renderRefundOrdersFull();
  openModal('m-refund-orders');
}

function renderRefundOrdersFull() {
  const q = curRefundSearch.toLowerCase().trim();
  let arr = db.don.filter(o => isHoanOrder(o));

  if (q) {
    arr = arr.filter(o => {
      const id = (o.Ma_Don || o.id || '').toLowerCase();
      const ins = (o.Insta_Khach || o.insta || '').toLowerCase();
      const sdt = (o.SDT || o.sdt || '').toLowerCase();
      return id.includes(q) || ins.includes(q) || sdt.includes(q);
    });
  }

  // Sort by ngay hoan gần nhất
  arr.sort((a, b) => {
    const dateA = new Date(a.time_hoan || a.Ngay_Tao || 0);
    const dateB = new Date(b.time_hoan || b.Ngay_Tao || 0);
    return dateB - dateA;
  });

  const body = document.getElementById('ro-body');
  body.innerHTML = `
    <div class="refund-orders-header">
      <h2>💰 Đơn đã hoàn cọc</h2>
      <input type="text" class="refund-orders-search" id="ro-search"
        placeholder="Tìm tên, SĐT, mã đơn..." value="${escapeHtml(curRefundSearch)}"
        oninput="curRefundSearch = this.value; renderRefundOrdersFull();" />
      <div class="refund-orders-meta">${arr.length} đơn</div>
    </div>
    <div class="refund-orders-list" id="ro-list"></div>
  `;

  const list = document.getElementById('ro-list');
  if (!arr.length) {
    list.innerHTML = `
      <div class="refund-orders-empty">
        <div class="icon">📭</div>
        <div class="title">${q ? 'Không tìm thấy đơn nào' : 'Chưa có đơn hoàn cọc nào'}</div>
      </div>
    `;
    return;
  }

  const groups = new Map();
  arr.forEach(o => {
    const key = (o.time_hoan || o.Ngay_Tao || '').slice(0, 10) || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });

  const groupKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  const todayIso = isoOf(new Date());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = isoOf(yesterday);

  groupKeys.forEach(dateKey => {
    const items = groups.get(dateKey);
    const dateLabel = dateKey === todayIso ? 'Hôm nay'
      : dateKey === yesterdayIso ? 'Hôm qua'
      : isoToVN(dateKey);
    const weekday = ['CN','T2','T3','T4','T5','T6','T7'][new Date(dateKey).getDay()];

    const groupEl = document.createElement('div');
    groupEl.className = 'refund-date-group';
    groupEl.innerHTML = `
      <div class="refund-date-group-head">
        <span class="refund-date-label">📅 ${dateLabel} <span class="refund-date-weekday">(${weekday})</span></span>
        <span class="refund-date-count">${items.length} đơn</span>
      </div>
      <div class="refund-date-group-body"></div>
    `;
    const bodyEl = groupEl.querySelector('.refund-date-group-body');

    items.forEach(o => {
      const id = o.Ma_Don || o.id || '';
      const ins = o.Insta_Khach || o.insta || '—';
      const sdt = o.SDT || o.sdt || '—';
      const thoiGianHoan = o.time_hoan ? o.time_hoan.slice(11, 16) : '';

      const card = document.createElement('div');
      card.className = 'refund-order-card';
      card.onclick = () => {
        closeModal('m-refund-orders');
        openOrderDetail(id);
      };

      card.innerHTML = `
        <div class="refund-order-header">
          <span class="refund-order-id">${id}</span>
          ${thoiGianHoan ? `<span class="refund-order-time-tag">⏰ ${thoiGianHoan}</span>` : ''}
        </div>
        <div class="refund-order-customer">${escapeHtml(ins)}</div>
        <div class="refund-order-phone">📞 ${escapeHtml(sdt)}</div>
      `;
      bodyEl.appendChild(card);
    });

    list.appendChild(groupEl);
  });
}const Sync = {
  async ping() {
    if (!SYNC.WEB_APP_URL) return false;
    try {
      const res = await fetch(SYNC.WEB_APP_URL + '?action=ping');
      const data = await res.json();
      return data && data.ok;
    } catch (e) { return false; }
  },

  async pull() {
    if (!SYNC.WEB_APP_URL || !SYNC.online) return;
    const since = Number(localStorage.getItem(SYNC.LAST_PULL_TS) || 0);
    try {
      const url = SYNC.WEB_APP_URL + '?action=pull&since=' + since + '&_=' + Date.now();
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) { console.warn('Pull error:', data.error); return; }
      const applied = this.mergeRemote_(data);
      if (data.serverTs) localStorage.setItem(SYNC.LAST_PULL_TS, data.serverTs);
      if (applied) {
        save();
        const view = document.querySelector('section.view.active')?.id;
        if (view === 'v-cal') renderCal();
        else if (view === 'v-orders') renderOrders();
        else if (view === 'v-orders-table') renderOrdersTable();
        else if (view === 'v-raw') renderRawTable();
        else if (view === 'v-kho') renderKho();
        else if (view === 'v-pk') renderPk();
        else if (view === 'v-avail') renderAvail();
        showSyncIndicator('pulled');
      } else {
        showSyncIndicator('idle');
      }
    } catch (e) {
      console.warn('Pull failed:', e.message);
      showSyncIndicator('offline');
    }
  },

  mergeRemote_(data) {
    if (!data || !data.updates) return false;
    let changed = false;
    const ts = r => Number(r._ts || 0);

    const map = {
      'KHO_VAY': 'vay',
      'PHU_KIEN': 'pk',
      'DON_HANG': 'don',
      'DON_HANG_VAY': 'dhv',
      'THANH_TOAN': 'tt',
      'FORM': 'form',
    };

    Object.keys(map).forEach(table => {
      const localKey = map[table];
      if (!db[localKey]) db[localKey] = [];

      const updates = data.updates[table] || [];
      const deletes = (data.deleted && data.deleted[table]) || [];

      deletes.forEach(delId => {
        const i = db[localKey].findIndex(r => findId_(r) === delId);
        if (i >= 0) { db[localKey].splice(i, 1); changed = true; }
      });

      updates.forEach(remoteRow => {
        const id = findId_(remoteRow);
        if (!id) return;
        const localIdx = db[localKey].findIndex(r => findId_(r) === id);
        // PROTECT hoàn cọc orders — local hoan flags take precedence over remote non-hoan
        if (localKey === 'don') {
          const localRow = localIdx >= 0 ? db[localKey][localIdx] : null;
          if (localRow && (localRow.hoan || localRow.Trang_Thai_Hoan_Coc)) {
            const remoteHoan = remoteRow.hoan || remoteRow.Trang_Thai_Hoan_Coc;
            if (!remoteHoan) {
              // Local đã hoàn cọc, remote chưa → giữ local, bỏ qua merge
              return;
            }
          }
        }
        const remoteTs = ts(remoteRow);
        if (localIdx < 0) {
          const norm = Object.assign({}, remoteRow);
          if (!norm._ts) norm._ts = Date.now();
          db[localKey].push(norm);
          changed = true;
        } else {
          const localTs = ts(db[localKey][localIdx]);
          if (remoteTs > localTs) {
            const norm = Object.assign({}, remoteRow);
            if (!norm._ts) norm._ts = Date.now();
            db[localKey][localIdx] = norm;
            changed = true;
          }
        }
      });
    });

    return changed;
  },

  async push() {
    if (!SYNC.WEB_APP_URL || !SYNC.online || SYNC.pushing) return;
    SYNC.pushing = true;
    try {
      const stamp = Date.now();
      const payload = {
        tables: {
          'KHO_VAY':       (db.vay  || []).map(r => ({ ...r, _ts: r._ts || stamp })),
          'PHU_KIEN':      (db.pk   || []).map(r => ({ ...r, _ts: r._ts || stamp })),
          'DON_HANG':      (db.don  || []).map(r => ({ ...r, _ts: r._ts || stamp })),
          'DON_HANG_VAY':  (db.dhv  || []).map(r => ({ ...r, _ts: r._ts || stamp })),
          'THANH_TOAN':    (db.tt   || []).map(r => ({ ...r, _ts: r._ts || stamp })),
          'FORM':          (db.form || []).map(r => ({ ...r, _ts: r._ts || stamp })),
        },
        device: SYNC.DEVICE_ID,
      };
      const res = await fetch(SYNC.WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'push', records: payload }),
      });
      const data = await res.json();
      if (data.error) console.warn('Push error:', data.error);
      else { SYNC.pendingPush = []; showSyncIndicator('pushed'); }
    } catch (e) {
      console.warn('Push failed:', e.message);
      showSyncIndicator('offline');
    } finally {
      SYNC.pushing = false;
    }
  },

  flushQueue() { if (SYNC.online) this.push(); },

  start() {
    if (!SYNC.WEB_APP_URL) {
      console.log('ℹ️ Multi-device sync disabled — set SYNC.WEB_APP_URL in app.js to enable. See README_DEPLOY.md');
      showSyncIndicator('local');
      return;
    }
    console.log('🔄 Multi-device sync started. Device:', SYNC.DEVICE_ID);
    this.pull();
    setInterval(() => this.pull(), SYNC.POLL_MS);
    const origSave = save;
    window.save = function() {
      origSave();
      clearTimeout(window._syncTimer);
      window._syncTimer = setTimeout(() => Sync.push(), 800);
    };
  },
};

function syncRefundToSheets() {
  if (!refundDon) return;
  const o = refundDon;
  const coc = o.tien_coc || o.coc || 0;
  const cp = o.chiphi || 0;
  const tong = o.tong_thue || o.tong || 0;
  const thuctra = coc - cp;
  const goi = o.Goi_Thue || o.goi || '';
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayTra = ngayTraThuc(goi, ngayLay);

  // Build dress/accessory detail string
  let itemsDetail = '';
  if (o.dhvs && o.dhvs.length > 0) {
    itemsDetail = o.dhvs.map(dhv => {
      const v = vayById.get(dhv.vay || dhv.Ma_Vay);
      if (!v) return '';
      return `${v.Ten_Vay || v.ten || ''} (Size ${v.Size || v.size || '-'})`;
    }).filter(Boolean).join('; ');
  }
  const pkIds = o.Ma_PK || o.pks || [];
  if (pkIds.length > 0) {
    const pkNames = pkIds.map(pkId => {
      const p = pkById.get(pkId);
      return p ? (p.Ten_PK || p.ten || '') : '';
    }).filter(Boolean);
    if (pkNames.length) itemsDetail += (itemsDetail ? '; ' : '') + pkNames.join('; ');
  }

  const record = {
    Ma_Don: o.Ma_Don || o.id,
    Insta_Khach: o.Insta_Khach || o.insta || '',
    SDT: o.SDT || o.sdt || '',
    Ngay_Lay: ngayLay,
    Ngay_Tra: ngayTra || '',
    Goi_Thue: goi,
    Tien_Coc: coc,
    Tong_Thue: tong,
    Chi_Phi: cp,
    So_Thanh_Toan: thuctra,
    Hinh_Thuc_Coc: o.Hinh_Thuc_Coc || o.coc || '',
    Dia_Chi: o.Dia_Chi || o.diachi || '',
    Su_Kien: o.Su_Kien || o.sukien || '',
    Ghi_Chu: o.Ghi_Chu || o.ghichu || '',
    Ngay_Hoan: new Date().toISOString(),
    Items_Detail: itemsDetail,
    _ts: Date.now(),
  };

  fetch(SYNC.WEB_APP_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'pushRefund', record }),
  }).then(res => res.json()).then(data => {
    if (data.error) console.warn('pushRefund error:', data.error);
    else console.log('✅ Refund synced to Sheets');
  }).catch(err => console.warn('pushRefund failed:', err));
}

// Listen for storage changes from other tabs/windows (real-time sync)
window.addEventListener('storage', (e) => {
  if (e.key === STORE && e.newValue) {
    try {
      const remoteData = JSON.parse(e.newValue);
      // Merge remote data
      const localTs = Number(localStorage.getItem('_local_ts') || 0);
      // If remote has newer data, update local
      if (remoteData._ts && remoteData._ts > localTs) {
        // Don't auto-replace - just notify
        if (document.visibilityState === 'visible') {
          Sync.pull(); // Pull latest from server
        }
      }
    } catch (err) {
      console.warn('Storage sync error:', err);
    }
  }
});

// Also poll when tab becomes visible (real-time)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && SYNC.WEB_APP_URL) {
    Sync.pull();
  }
});

function findId_(row) {
  return String(
    row.Ma_Vay || row.Ma_PK || row.Ma_Don || row.Ma_DHV || row.Ma_TT ||
    row.ID || row.ma || row.id || ''
  );
}

function showSyncIndicator(state) {
  let el = document.getElementById('sync-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-indicator';
    el.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.1);transition:opacity 0.3s;opacity:0;pointer-events:none;font-family:-apple-system,sans-serif;';
    document.body.appendChild(el);
  }
  const states = {
    local:    { text: '💾 Local only',       bg: '#FEF3C7', fg: '#92400E' },
    idle:     { text: '🟢 Synced',           bg: '#D1FAE5', fg: '#065F46' },
    pulled:   { text: '🔄 Updated',          bg: '#DBEAFE', fg: '#1E40AF' },
    pushed:   { text: '⬆️ Saved',            bg: '#D1FAE5', fg: '#065F46' },
    offline:  { text: '⚠️ Offline',          bg: '#FEE2E2', fg: '#991B1B' },
  };
  const s = states[state] || states.idle;
  el.textContent = s.text;
  el.style.background = s.bg;
  el.style.color = s.fg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

// Disabled 2026-07-26 — Supabase is the only sync target
// setTimeout(() => Sync.start(), 1500);

/* ============================================================
 *  EXPORT TO GOOGLE SHEETS (Manual export)
 * ============================================================ */
function exportToSheets() {
  const options = [
    { label: '📦 Đơn hàng (DON_HANG)', action: 'exportOrders' },
    { label: '👗 Kho váy (KHO_VAY)', action: 'exportDresses' },
    { label: '💍 Phụ kiện (PHU_KIEN)', action: 'exportAccessories' },
    { label: '💰 Thanh toán (THANH_TOAN)', action: 'exportPayments' },
    { label: '📋 Tất cả (Copy tất cả)', action: 'exportAll' },
  ];

  const html = `
    <div class="sheet-head"><h2>📤 Xuất dữ liệu</h2><button class="sheet-close" data-close>×</button></div>
    <div class="sheet-body">
      <p class="muted" style="margin:0 0 16px;font-size:13px">Chọn loại dữ liệu để xuất. Dữ liệu sẽ được copy vào clipboard theo format Google Sheets (tab-separated).</p>
      ${options.map(o => `
        <button class="btn ${o.action === 'exportAll' ? 'primary' : 'ghost'}" style="width:100%;margin-bottom:8px;text-align:left" onclick="window['${o.action}']()">
          ${o.label}
        </button>
      `).join('')}
      <div class="divider"></div>
      <p class="muted" style="font-size:12px;margin:0">
        <b>Hướng dẫn:</b><br>
        1. Click dữ liệu muốn xuất<br>
        2. Mở Google Sheets → Paste (Ctrl+V)<br>
        3. Data sẽ tự tách thành cột
      </p>
    </div>
  `;
  $('#cf-body').innerHTML = html;
  openModal('m-confirm');
}

function toTSV(headers, rows) {
  const escape = v => String(v ?? '').replace(/"/g, '""');
  const headerLine = headers.map(h => `"${escape(h)}"`).join('\t');
  const dataLines = rows.map(row =>
    headers.map(h => `"${escape(row[h] ?? '')}"`).join('\t')
  );
  return [headerLine, ...dataLines].join('\n');
}

function exportOrders() {
  const headers = ['Ma_Don','Trang_Thai_Don','Insta_Khach','SDT','Goi_Thue','Ngay_Lay','Gio_Lay','Ngay_Tra','Hinh_Thuc_Coc','Hinh_Thuc_Nhan','Dia_Chi','Su_Kien','Ghi_Chu','Chi_Phi_Khac','Trang_Thai_Hoan_Coc','Ngay_Tao'];
  const rows = db.don.map(o => ({
    Ma_Don: o.Ma_Don || o.id,
    Trang_Thai_Don: o.Trang_Thai_Don || o.type || 'Chốt thuê',
    Insta_Khach: o.Insta_Khach || o.insta,
    SDT: o.SDT || o.sdt,
    Goi_Thue: o.Goi_Thue || o.goi,
    Ngay_Lay: o.Ngay_Lay || o.lay,
    Gio_Lay: o.Gio_Lay || o.gio,
    Ngay_Tra: o.Ngay_Tra || o.tra,
    Hinh_Thuc_Coc: o.Hinh_Thuc_Coc || o.coc,
    Hinh_Thuc_Nhan: o.Hinh_Thuc_Nhan || o.nhan,
    Dia_Chi: o.Dia_Chi || o.dc,
    Su_Kien: o.Su_Kien || '',
    Ghi_Chu: o.Ghi_Chu || o.ghichu,
    Chi_Phi_Khac: o.Chi_Phi_Khac || o.chiphi || 0,
    Trang_Thai_Hoan_Coc: o.hoan ? 'Đã hoàn' : 'Chưa hoàn',
    Ngay_Tao: o.Ngay_Tao || o.tao || '',
  }));
  copyToClipboard(toTSV(headers, rows), 'Đơn hàng');
}

function exportDresses() {
  const headers = ['Ma_Vay','Ten_Vay','Size','Gia_Vay_Goc','Gia_Thue_12h','Gia_Thue_1_Ngay','Gia_Thue_3_Ngay','Anh_Vay','Ghi_Chu','So_Lan_Thue'];
  const rows = db.vay.map(v => ({
    Ma_Vay: v.Ma_Vay || v.ma,
    Ten_Vay: v.Ten_Vay || v.ten,
    Size: v.Size || v.size,
    Gia_Vay_Goc: v.Gia_Vay_Goc || v.goc,
    Gia_Thue_12h: v.Gia_Thue_12h || v.t12,
    Gia_Thue_1_Ngay: v.Gia_Thue_1_Ngay || v.t1,
    Gia_Thue_3_Ngay: v.Gia_Thue_3_Ngay || v.t3,
    Anh_Vay: v.Anh_Vay || v.anh || '',
    Ghi_Chu: v.Ghi_Chu || v.gchu || '',
    So_Lan_Thue: v.So_Lan_Thue || v.sl || 0,
  }));
  copyToClipboard(toTSV(headers, rows), 'Kho váy');
}

function exportAccessories() {
  const headers = ['Ma_PK','Ten_PK','Loai','So_Luong_Tong','Gia_Thue_12h','Gia_Thue_1_Ngay','Gia_Thue_3_Ngay','Anh_PK','Ghi_Chu'];
  const rows = db.pk.map(p => ({
    Ma_PK: p.Ma_PK || p.ma,
    Ten_PK: p.Ten_PK || p.ten,
    Loai: p.Loai || p.loai,
    So_Luong_Tong: p.So_Luong_Tong || p.sl || 1,
    Gia_Thue_12h: p.Gia_Thue_12h || p.t12,
    Gia_Thue_1_Ngay: p.Gia_Thue_1_Ngay || p.t1,
    Gia_Thue_3_Ngay: p.Gia_Thue_3_Ngay || p.t3,
    Anh_PK: p.Anh_PK || p.anh || '',
    Ghi_Chu: p.Ghi_Chu || p.gchu || '',
  }));
  copyToClipboard(toTSV(headers, rows), 'Phụ kiện');
}

function exportPayments() {
  const headers = ['Ma_TT','Ngay_TT','Ma_Don','Tien_Coc','Chi_Phi_Khac','Ghi_Chu'];
  const rows = (db.tt || []).map(t => ({
    Ma_TT: t.Ma_TT || t.id,
    Ngay_TT: t.Ngay_TT || (t.ngay ? t.ngay.slice(0,10) : ''),
    Ma_Don: t.Ma_Don || t.ma,
    Tien_Coc: t.Tien_Coc || t.tienCoc || 0,
    Chi_Phi_Khac: t.Chi_Phi_Khac || t.chiphi || 0,
    Ghi_Chu: t.Ghi_Chu || t.ghichu || '',
  }));
  copyToClipboard(toTSV(headers, rows), 'Thanh toán');
}

function exportAll() {
  let all = '';
  ['=== ĐƠN HÀNG ===', '', ''].join('\n');
  all += '=== ĐƠN HÀNG ===\n';
  all += toTSV(['Ma_Don','Trang_Thai_Don','Insta_Khach','SDT','Goi_Thue','Ngay_Lay','Ngay_Tra','Hinh_Thuc_Coc','Trang_Thai_Hoan_Coc'],
    db.don.map(o => ({
      Ma_Don: o.Ma_Don || o.id,
      Trang_Thai_Don: o.Trang_Thai_Don || o.type || 'Chốt thuê',
      Insta_Khach: o.Insta_Khach || o.insta,
      SDT: o.SDT || o.sdt,
      Goi_Thue: o.Goi_Thue || o.goi,
      Ngay_Lay: o.Ngay_Lay || o.lay,
      Ngay_Tra: o.Ngay_Tra || o.tra,
      Hinh_Thuc_Coc: o.Hinh_Thuc_Coc || o.coc,
      Trang_Thai_Hoan_Coc: o.hoan ? 'Đã hoàn' : 'Chưa hoàn',
    }))) + '\n\n';

  all += '=== KHO VÁY ===\n';
  all += toTSV(['Ma_Vay','Ten_Vay','Size','Gia_Vay_Goc','Gia_Thue_1_Ngay'],
    db.vay.map(v => ({
      Ma_Vay: v.Ma_Vay || v.ma,
      Ten_Vay: v.Ten_Vay || v.ten,
      Size: v.Size || v.size,
      Gia_Vay_Goc: v.Gia_Vay_Goc || v.goc,
      Gia_Thue_1_Ngay: v.Gia_Thue_1_Ngay || v.t1,
    }))) + '\n\n';

  all += '=== PHỤ KIỆN ===\n';
  all += toTSV(['Ma_PK','Ten_PK','Loai','So_Luong_Tong','Gia_Thue_1_Ngay'],
    db.pk.map(p => ({
      Ma_PK: p.Ma_PK || p.ma,
      Ten_PK: p.Ten_PK || p.ten,
      Loai: p.Loai || p.loai,
      So_Luong_Tong: p.So_Luong_Tong || p.sl || 1,
      Gia_Thue_1_Ngay: p.Gia_Thue_1_Ngay || p.t1,
    })));

  copyToClipboard(all, 'Tất cả dữ liệu');
}

function copyToClipboard(text, name) {
  navigator.clipboard.writeText(text).then(() => {
    closeModal('m-confirm');
    toast(`Đã copy "${name}" vào clipboard!`, 'success');
  }).catch(() => {
    toast('Không thể copy. Thử cách khác.', 'error');
  });
}

// Make functions globally accessible
window.exportOrders = exportOrders;
window.exportDresses = exportDresses;
window.exportAccessories = exportAccessories;
window.exportPayments = exportPayments;
window.exportAll = exportAll;
window.copyToClipboard = copyToClipboard;

/* ============================================================
 *  REFUND LIST MODAL
 * ============================================================ */
window.openRefundList = function() {
  const refundedOrders = db.tt || [];
  const searchHtml = `
    <div class="sheet-head">
      <h2>💰 Đơn đã hoàn cọc</h2>
      <button class="sheet-close" data-close>×</button>
    </div>
    <div class="sheet-body">
      <input type="text" id="refund-search" placeholder="🔍 Tìm tên, SĐT, mã đơn..." oninput="filterRefundList(this.value)" style="margin-bottom: 12px" />
      <div id="refund-list"></div>
    </div>
  `;
  $('#cf-body').innerHTML = searchHtml;
  openModal('m-confirm');
  renderRefundList();
};

function renderRefundList(filter = '') {
  const list = document.getElementById('refund-list');
  if (!list) return;

  const refunds = (db.tt || []).filter(t => {
    if (!filter) return true;
    const term = filter.toLowerCase();
    return (t.ten || '').toLowerCase().includes(term) ||
           (t.sdt || '').includes(term) ||
           (t.ma || '').toLowerCase().includes(term);
  });

  if (refunds.length === 0) {
    const msg = filter
      ? `Không tìm thấy đơn hoàn cọc với từ khoá "${filter}"`
      : 'Chưa có đơn hoàn cọc nào';
    const hint = filter
      ? '<p style="text-align:center;color:var(--muted);font-size:13px;margin-top:8px">Thử từ khoá khác hoặc xoá ô tìm kiếm</p>'
      : '<p style="text-align:center;color:var(--muted);font-size:13px;margin-top:8px">Hoàn cọc đơn đầu tiên bằng cách mở đơn → "Hoàn cọc"</p>';
    list.innerHTML = `
      <div class="empty empty-cta">
        <div class="icon">💸</div>
        <div class="title">${msg}</div>
        ${hint}
      </div>`;
    return;
  }

  list.innerHTML = refunds.map(t => {
    const tongThue = t.tongThue || 0;
    const tienCoc = t.tienCoc || 0;
    const chiphi = t.chiphi || 0;
    const hoan = t.hoan || 0;

    return `
      <div class="refund-card">
        <div class="refund-header">
          <span class="refund-id">${t.ma || '—'}</span>
          <span class="refund-date">${isoToVN(t.ngay?.slice(0,10)) || '—'}</span>
        </div>
        <div class="refund-info">
          <div class="refund-row">
            <span class="refund-label">Khách:</span>
            <span class="refund-value">${escapeHtml(t.ten || '—')}</span>
          </div>
          <div class="refund-row">
            <span class="refund-label">SĐT:</span>
            <span class="refund-value">${escapeHtml(t.sdt || '—')}</span>
          </div>
          <div class="refund-row">
            <span class="refund-label">Tiền thuê:</span>
            <span class="refund-value">${fmtVND(tongThue)}</span>
          </div>
          <div class="refund-row">
            <span class="refund-label">Tiền cọc:</span>
            <span class="refund-value">${fmtVND(tienCoc)}</span>
          </div>
          <div class="refund-row">
            <span class="refund-label">Chi phí:</span>
            <span class="refund-value">${fmtVND(chiphi)}</span>
          </div>
        </div>
        <div class="refund-footer">
          <span class="refund-hoan ${hoan >= 0 ? 'positive' : 'negative'}">
            ${hoan >= 0 ? '+' : ''}${fmtVND(hoan)} hoàn lại
          </span>
        </div>
        ${t.ghichu ? `<div class="refund-note">📝 ${escapeHtml(t.ghichu)}</div>` : ''}
      </div>
    `;
  }).join('');
}

window.filterRefundList = function(term) {
  renderRefundList(term);
};

/* ============================================================
 *  BOOKING FORM (Customer-facing)
 * ============================================================ */
window.shareBookingForm = function() {
  // Generate shareable link
  const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  const formUrl = baseUrl + 'booking-form.html';

  const html = `
    <div class="sheet-head"><h2>🔗 Chia sẻ form đặt thuê</h2><button class="sheet-close" data-close>×</button></div>
    <div class="sheet-body">
      <p class="muted" style="margin:0 0 16px;font-size:13px">Gửi link này cho khách hàng để họ tự đặt lịch thuê váy.</p>

      <div style="background:var(--surface-2);padding:12px;border-radius:var(--r-md);margin-bottom:16px">
        <input type="text" value="${formUrl}" id="booking-link" readonly
               style="font-size:12px;background:transparent;border:none;width:100%;color:var(--txt-2)" />
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn ghost" style="flex:1" onclick="copyBookingLink()">📋 Copy Link</button>
        <button class="btn primary" style="flex:1" onclick="openBookingForm()">👁 Xem trước</button>
      </div>

      <div class="divider" style="margin:16px 0"></div>

      <p style="font-size:12px;color:var(--muted);margin:0">
        <b>Lưu ý:</b> Khách hàng có thể xem danh sách váy và chọn ngày thuê.
        Sau khi khách gửi, thông tin sẽ xuất hiện trong tab <b>Đơn mới</b> của bạn.
      </p>
    </div>
  `;
  $('#cf-body').innerHTML = html;
  openModal('m-confirm');
};

window.copyBookingLink = function() {
  const link = document.getElementById('booking-link').value;
  navigator.clipboard.writeText(link).then(() => {
    toast('Đã copy link!', 'success');
  });
};

window.openBookingForm = function() {
  const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  window.open(baseUrl + 'booking-form.html', '_blank');
};

/* ============================================================
 *  RECALCULATE RETURN DATE
 * ============================================================ */
window.recalcNewTra = function() {
  const goi = document.querySelector('#n-form [name="goi"]:checked')?.value || '1 ngày';
  const lay = document.querySelector('#n-form [name="lay"]')?.value;
  if (!lay) return;
  const traDate = ngayTraThuc(goi, lay);
  const traInput = document.getElementById('n-tra');
  if (traInput) {
    traInput.value = isoOf(traDate);
  }
};

/* ============================================================
 *  INITIALIZATION
 * ============================================================ */
// Initialize availability view when first opened
const origGo2 = window.go;
window.go = function(view) {
  origGo2(view);
  if (view === 'v-avail') {
    setTimeout(initAvail, 100);
  }
};

// Load html2canvas for refund receipt images
function loadHtml2Canvas(callback) {
  if (typeof html2canvas !== 'undefined') { callback(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  s.onload = callback;
  s.onerror = () => { console.warn('Failed to load html2canvas'); callback(false); };
  document.head.appendChild(s);
}

// ============================
// BULK IMPORT
// ============================

let _bulkParsedDresses = [];
let _bulkParsedAccessories = [];
let _bulkStep = 'upload'; // upload | preview | progress | done
let _bulkImportType = 'dresses'; // 'dresses' | 'accessories'

function openBulkImportModal() {
  _bulkParsedDresses = [];
  _bulkStep = 'upload';
  document.getElementById('bulk-import-overlay').style.display = 'flex';
  showBulkStep('upload');
  document.getElementById('bulk-btn-action').disabled = true;
  document.getElementById('bulk-btn-action').textContent = 'Chọn file trước';

  // Setup file input & drop zone
  const dropZone = document.getElementById('bulk-drop-zone');
  const fileInput = document.getElementById('bulk-file-input');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
  dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleBulkFile(f);
  };
  fileInput.onchange = () => {
    if (fileInput.files[0]) handleBulkFile(fileInput.files[0]);
  };
}

function closeBulkImportModal() {
  document.getElementById('bulk-import-overlay').style.display = 'none';
}

function showBulkStep(step) {
  _bulkStep = step;
  ['upload', 'preview', 'progress', 'done'].forEach(s => {
    const el = document.getElementById('bulk-step-' + s);
    if (el) el.style.display = s === step ? 'block' : 'none';
  });
}

function handleBulkFile(file) {
  if (typeof XLSX === 'undefined') {
    toast('Thư viện SheetJS chưa tải xong. Thử lại sau vài giây.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

      // Detect type: peek at first non-empty row
      let type = 'dresses';
      const VALID_DRESS_SIZES = ['S', 'M', 'L', 'XL', 'Free size'];
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const cells = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
        const cellStr = cells.join('|');
        if (cellStr.includes('tên váy') || cellStr.includes('ten_vay')) {
          type = 'dresses';
          break;
        }
        if (cellStr.includes('tên pk') || cellStr.includes('ten pk')) {
          type = 'accessories';
          break;
        }
        // Heuristic: if any cell is a valid dress size, treat as dresses
        if (cells.some(c => VALID_DRESS_SIZES.map(s => s.toLowerCase()).includes(c))) {
          type = 'dresses';
          break;
        }
        // If "Tên" column has a non-dress-size value in data rows, it's likely PK
        const tenIdx = cells.findIndex(c => c === 'tên' || c === 'ten' || c === 'name');
        if (tenIdx !== -1) {
          // Check a few data rows
          for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
            const dataCell = String(rows[j]?.[tenIdx] || '').trim();
            if (dataCell && !VALID_DRESS_SIZES.map(s => s.toLowerCase()).includes(dataCell.toLowerCase())) {
              // Data cell is not a dress size, might be PK
              type = 'accessories';
              break;
            }
          }
        }
        if (type === 'accessories') break;
      }

      _bulkImportType = type;

      if (type === 'accessories') {
        const accessories = parseExcelAccessories(wb);
        if (accessories.length === 0) {
          toast('Không tìm thấy dữ liệu phụ kiện trong file. Kiểm tra lại format cột.', 'error');
          return;
        }
        _bulkParsedAccessories = accessories;
        previewBulkAccessories(accessories);
        showBulkStep('preview');
        const btn = document.getElementById('bulk-btn-action');
        btn.disabled = false;
        btn.textContent = `Nhập ${accessories.length} phụ kiện`;
      } else {
        const dresses = parseExcelDresses(wb);
        if (dresses.length === 0) {
          toast('Không tìm thấy dữ liệu váy trong file. Kiểm tra lại format cột.', 'error');
          return;
        }
        _bulkParsedDresses = dresses;
        previewBulkDresses(dresses);
        showBulkStep('preview');
        const btn = document.getElementById('bulk-btn-action');
        btn.disabled = false;
        btn.textContent = `Nhập ${dresses.length} váy`;
      }
    } catch (err) {
      console.error('Excel parse error:', err);
      toast('Lỗi đọc file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _findHeaderRow(rows) {
  // Tìm row đầu tiên chứa "Tên váy" hoặc "Tên" — coi đó là header row
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
    if (cells.some(c => c.includes('tên váy') || c === 'ten_vay' || c === 'tên')) {
      return i;
    }
  }
  return 0;
}

function parseExcelDresses(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  if (rows.length < 2) return [];

  // Auto-detect header row (skip blank/info rows)
  const headerIdx = _findHeaderRow(rows);
  const headers = (rows[headerIdx] || []).map(h => String(h).trim().toLowerCase());

  // Find column indices with fuzzy matching
  const ci = {
    ten: _findCol(headers, ['tên váy', 'ten_vay', 'tên', 'ten', 'name']),
    size: _findCol(headers, ['size', 'kích cỡ', 'số đo']),
    goc: _findCol(headers, ['giá gốc', 'gia_goc', 'gia goc', 'goc', 'giá']),
    t12: _findCol(headers, ['12h', '12 giờ', 'thue 12h', 'gia_12h', 't12', 'giá 12h']),
    t1: _findCol(headers, ['1 ngày', '1ngay', 't1', 'gia_1_ngay', '1day', 'giá 1 ngày', 'thue 1 ngay']),
    t3: _findCol(headers, ['3 ngày', '3ngay', 't3', 'gia_3_ngay', '3day', 'giá 3 ngày', 'thue 3 ngay']),
    gc: _findCol(headers, ['ghi chú', 'ghichu', 'notes']),
  };

  if (ci.ten === -1) {
    throw new Error('Không tìm thấy cột "Tên váy" trong file. Kiểm tra lại header.');
  }
  if (ci.size === -1) {
    throw new Error('Không tìm thấy cột "Size" trong file. Kiểm tra lại header.');
  }

  const VALID_SIZES = ['S', 'M', 'L', 'XL', 'Free size'];
  const dresses = [];
  const errors = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const ten = String(row[ci.ten] || '').trim();
    if (!ten) continue; // skip empty rows

    const rawSize = String(row[ci.size] || '').trim();
    const size = _normalizeSize(rawSize, VALID_SIZES);
    const goc = ci.goc !== -1 ? _parseNum(row[ci.goc]) : 0;
    const t12 = ci.t12 !== -1 ? _parseNum(row[ci.t12]) : 0;
    const t1 = ci.t1 !== -1 ? _parseNum(row[ci.t1]) : 0;
    const t3 = ci.t3 !== -1 ? _parseNum(row[ci.t3]) : 0;
    const gc = ci.gc !== -1 ? String(row[ci.gc] || '').trim() : '';

    if (!size) errors.push(`Dòng ${i + 1}: Size "${rawSize}" không hợp lệ (cần: S/M/L/XL/Free size)`);

    dresses.push({
      Ma_Vay: uid('V'),
      Ten_Vay: ten,
      Size: size || 'Free size',
      Gia_Vay_Goc: goc || 0,
      Gia_Thue_12h: t12 || 0,
      Gia_Thue_1_Ngay: t1 || 0,
      Gia_Thue_3_Ngay: t3 || 0,
      Ghi_Chu: gc,
      Anh_Vay: '',
      So_Lan_Thue: 0,
      _ts: Date.now(),
      _row: i + 1,
      _sizeErr: !size,
    });
  }

  if (errors.length) {
    console.warn(`Size errors (${errors.length}):`, errors);
  }

  return dresses;
}

function parseExcelAccessories(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  if (rows.length < 2) return [];

  // Auto-detect header row — look for "tên pk" or "ten pk"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
    if (cells.some(c => c.includes('tên pk') || c.includes('ten pk') || c === 'tên' || c === 'ten')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Fallback: use first row as header
    headerIdx = 0;
  }

  const headers = (rows[headerIdx] || []).map(h => String(h).trim().toLowerCase());

  const ci = {
    ten: _findCol(headers, ['tên pk', 'ten pk', 'tên', 'ten', 'name']),
    size: _findCol(headers, ['size', 'kích cỡ', 'loại', 'loai']),
    t12: _findCol(headers, ['12h', '12 giờ', 'thue 12h', 'gia_12h', 't12', 'giá 12h']),
    t1: _findCol(headers, ['1 ngày', '1ngay', 't1', 'gia_1_ngay', '1day', 'giá 1 ngày', 'thue 1 ngày']),
    t3: _findCol(headers, ['3 ngày', '3ngay', 't3', 'gia_3_ngay', '3day', 'giá 3 ngày', 'thue 3 ngày']),
  };

  if (ci.ten === -1) {
    throw new Error('Không tìm thấy cột "Tên PK" trong file. Kiểm tra lại header.');
  }

  const accessories = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const ten = String(row[ci.ten] || '').trim();
    if (!ten) continue; // skip empty rows

    const loai = ci.size !== -1 ? String(row[ci.size] || '').trim() : '';
    const t12 = ci.t12 !== -1 ? _parseNum(row[ci.t12]) : 0;
    const t1 = ci.t1 !== -1 ? _parseNum(row[ci.t1]) : 0;
    const t3 = ci.t3 !== -1 ? _parseNum(row[ci.t3]) : 0;

    accessories.push({
      Ma_PK: uid('P'),
      Ten_PK: ten,
      Loai: loai,
      So_Luong_Tong: 0, // user nhập sau trên web
      Gia_Thue_12h: t12 || 0,
      Gia_Thue_1_Ngay: t1 || 0,
      Gia_Thue_3_Ngay: t3 || 0,
      Anh_PK: '',
      Ghi_Chu: '',
      So_Lan_Thue: 0,
      _ts: Date.now(),
      _row: i + 1,
    });
  }

  return accessories;
}

function previewBulkAccessories(accessories) {
  const info = document.getElementById('bulk-preview-info');
  const table = document.getElementById('bulk-preview-table');
  const errorsEl = document.getElementById('bulk-errors');

  info.textContent = `Tìm thấy ${accessories.length} phụ kiện`;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = `<tr>
    <th>#</th><th>Tên PK</th><th>Size</th>
    <th>12h</th><th>1 ngày</th><th>3 ngày</th>
  </tr>`;

  tbody.innerHTML = accessories.map((a, i) => `
    <tr class="ok">
      <td>${i + 1}</td>
      <td title="${escHtml(a.Ten_PK)}">${escHtml(a.Ten_PK)}</td>
      <td>${escHtml(a.Loai || '—')}</td>
      <td>${fmt(a.Gia_Thue_12h)}</td>
      <td>${fmt(a.Gia_Thue_1_Ngay)}</td>
      <td>${fmt(a.Gia_Thue_3_Ngay)}</td>
    </tr>`).join('');

  errorsEl.style.display = 'none';
}


function _findCol(headers, aliases) {
  const normalizedHeaders = headers.map(h => _normalizeHeader(h));
  const normalizedAliases = aliases.map(a => _normalizeHeader(a));

  // Exact match (normalized)
  for (const alias of normalizedAliases) {
    const idx = normalizedHeaders.indexOf(alias);
    if (idx !== -1) return idx;
  }
  // Partial match (substring)
  for (let i = 0; i < normalizedHeaders.length; i++) {
    for (const alias of normalizedAliases) {
      if (normalizedHeaders[i].includes(alias)) return i;
    }
  }
  return -1;
}

function _normalizeHeader(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function _normalizeSize(raw, VALID_SIZES) {
  const s = String(raw).trim();
  for (const v of VALID_SIZES) {
    if (s.toLowerCase() === v.toLowerCase()) return v;
  }
  // Fuzzy aliases
  if (/^fs|free|freesize/i.test(s)) return 'Free size';
  // Normalize common shorthand variants
  const aliases = { 'f': 'Free size', 'xs': 'S', 'xxl': 'L', 'xxxl': 'XL' };
  const lower = s.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  if (VALID_SIZES.includes(s)) return s;
  return null;
}

function _parseNum(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return Math.round(val);
  const s = String(val).replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : 0;
}

function previewBulkDresses(dresses) {
  const info = document.getElementById('bulk-preview-info');
  const table = document.getElementById('bulk-preview-table');
  const errorsEl = document.getElementById('bulk-errors');

  const errors = dresses.filter(d => d._sizeErr);
  info.textContent = `Tìm thấy ${dresses.length} váy${errors.length ? ` (${errors.length} có lỗi size)` : ''}`;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = `<tr>
    <th>#</th><th>Tên váy</th><th>Size</th>
    <th>Giá gốc</th><th>12h</th><th>1 ngày</th><th>3 ngày</th>
    <th>Ghi chú</th>
  </tr>`;

  tbody.innerHTML = dresses.map((d, i) => `
    <tr class="${d._sizeErr ? 'error' : 'ok'}">
      <td>${i + 1}</td>
      <td title="${escHtml(d.Ten_Vay)}">${escHtml(d.Ten_Vay)}</td>
      <td>${escHtml(d.Size)}</td>
      <td>${fmt(d.Gia_Vay_Goc)}</td>
      <td>${fmt(d.Gia_Thue_12h)}</td>
      <td>${fmt(d.Gia_Thue_1_Ngay)}</td>
      <td>${fmt(d.Gia_Thue_3_Ngay)}</td>
      <td title="${escHtml(d.Ghi_Chu)}">${escHtml(d.Ghi_Chu || '')}</td>
    </tr>`).join('');

  if (errors.length) {
    errorsEl.style.display = 'block';
    errorsEl.innerHTML = errors.slice(0, 5).map(e => `• ${e._row}: Size "${e.Size}" → đặt thành M`).join('<br>');
    if (errors.length > 5) errorsEl.innerHTML += `<br>...và ${errors.length - 5} lỗi khác`;
  } else {
    errorsEl.style.display = 'none';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  return n ? n.toLocaleString('vi-VN') : '0';
}

function bulkImportNextStep() {
  if (_bulkStep === 'upload') {
    document.getElementById('bulk-file-input').click();
    return;
  }
  if (_bulkStep === 'preview') {
    if (_bulkImportType === 'accessories') {
      submitBulkAccessories();
    } else {
      submitBulkDresses();
    }
    return;
  }
}

async function submitBulkDresses() {
  const dresses = _bulkParsedDresses;
  if (!dresses.length) return;

  showBulkStep('progress');
  const btn = document.getElementById('bulk-btn-action');
  btn.disabled = true;

  const total = dresses.length;
  let imported = 0;
  let synced = 0;
  const progressFill = document.getElementById('bulk-progress-fill');
  const progressCount = document.getElementById('bulk-progress-count');
  const progressText = document.getElementById('bulk-progress-text');

  progressText.textContent = `Đang nhập vào localStorage...`;

  // Save to localStorage — upsert by Ma_Vay (replace existing, append new)
  if (!db.vay) db.vay = [];
  const existingMap = {};
  db.vay.forEach((d, i) => { if (d.Ma_Vay) existingMap[d.Ma_Vay] = i; });
  dresses.forEach(d => {
    const { _row, _sizeErr, ...dressData } = d; // strip temp fields
    const existingIdx = existingMap[dressData.Ma_Vay];
    if (existingIdx !== undefined) {
      db.vay[existingIdx] = dressData;
    } else {
      db.vay.push(dressData);
    }
  });
  save();
  imported = total;
  progressFill.style.width = '50%';
  progressCount.textContent = `${imported}/${total} đã lưu localStorage`;

  // Sync to Supabase
  if (window.SupabaseService && window.SupabaseService.isConfigured()) {
    const clean = dresses.map(({ _row, _sizeErr, ...d }) => d);
    const result = await window.SupabaseService.createDressBatch(clean);
    synced = result ? clean.length : 0;

    // Update _dbId on local records — match by Ma_Vay to handle upsert order correctly
    if (result && result.ids) {
      result.ids.forEach((id, i) => {
        const ma = result.ma_vays[i];
        const localDress = db.vay.find(d => d.Ma_Vay === ma);
        if (localDress) localDress._dbId = id;
      });
      save();
    }
  }

  progressFill.style.width = '100%';
  progressCount.textContent = `${synced}/${total} đã sync Supabase`;

  setTimeout(() => {
    showBulkStep('done');
    btn.disabled = false;
    btn.textContent = 'Đóng';
    btn.onclick = closeBulkImportModal;
    document.getElementById('bulk-done-text').innerHTML =
      `✅ Đã nhập <b>${imported} váy</b>!<br>` +
      (synced ? `🔄 Đã sync <b>${synced}</b> váy lên Supabase.<br>` : '') +
      `Kho váy sẽ được cập nhật tự động.`;

    // Refresh Kho Váy if visible
    if (curView === 'v-kho') renderKho();
  }, 300);
}

// ============================
// END BULK IMPORT
// ============================

async function submitBulkAccessories() {
  const accessories = _bulkParsedAccessories;
  if (!accessories?.length) return;

  showBulkStep('progress');
  const btn = document.getElementById('bulk-btn-action');
  btn.disabled = true;

  const total = accessories.length;
  let imported = 0;
  let synced = 0;
  const progressFill = document.getElementById('bulk-progress-fill');
  const progressCount = document.getElementById('bulk-progress-count');
  const progressText = document.getElementById('bulk-progress-text');

  progressText.textContent = `Đang nhập vào localStorage...`;

  // Save to localStorage — upsert by Ma_PK
  if (!db.pk) db.pk = [];
  const existingMap = {};
  db.pk.forEach((p, i) => { if (p.Ma_PK) existingMap[p.Ma_PK] = i; });
  accessories.forEach(p => {
    const { _row, ...accData } = p;
    const existingIdx = existingMap[accData.Ma_PK];
    if (existingIdx !== undefined) {
      db.pk[existingIdx] = accData;
    } else {
      db.pk.push(accData);
    }
  });
  save();
  imported = total;
  progressFill.style.width = '50%';
  progressCount.textContent = `${imported}/${total} đã lưu localStorage`;

  // Sync to Supabase
  if (window.SupabaseService && window.SupabaseService.isConfigured()) {
    const clean = accessories.map(({ _row, ...p }) => p);
    const result = await window.SupabaseService.createAccessoryBatch(clean);
    synced = result ? clean.length : 0;

    if (result && result.ids) {
      result.ids.forEach((id, i) => {
        const ma = result.ma_pks[i];
        const localAcc = db.pk.find(p => p.Ma_PK === ma);
        if (localAcc) localAcc._dbId = id;
      });
      save();
    }
  }

  progressFill.style.width = '100%';
  progressCount.textContent = `${synced}/${total} đã sync Supabase`;

  setTimeout(() => {
    showBulkStep('done');
    btn.disabled = false;
    btn.textContent = 'Đóng';
    btn.onclick = closeBulkImportModal;
    document.getElementById('bulk-done-text').innerHTML =
      `✅ Đã nhập <b>${imported} phụ kiện</b>!<br>` +
      (synced ? `🔄 Đã sync <b>${synced}</b> phụ kiện lên Supabase.<br>` : '') +
      `Kho phụ kiện sẽ được cập nhật tự động.`;
    if (curView === 'v-pk') renderPk();
  }, 300);
}

// Khởi tạo app — gọi view mặc định
go('v-cal');

// Skew protection: lắng nghe SW update notification
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATE_AVAILABLE') {
      showUpdateBanner();
    }
  });
}

function showUpdateBanner() {
  const existing = document.getElementById('sw-update-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#d4af37;color:#1a1d2e;padding:10px 16px;font-size:13px;font-weight:600;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px';
  banner.innerHTML = '🔄 Có bản cập nhật mới — bấm để tải lại <span style="margin-left:6px;font-size:11px;opacity:0.7">⏎</span>';
  banner.onclick = () => location.reload(true);
  document.body.appendChild(banner);
}

/* ============================================================
 *  DASHBOARD
 * ============================================================ */
const DASHBOARD_PASSWORD = 'aura2026';
var dashState = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  topTab: 'rented',
  revenueMode: 'day',
  dateFilter: 'thismonth' // 'today' | '7days' | 'thismonth'
};

// Cache dashboard data per month/year key
var dashCache = {};
var dashAllTimeCache = null; // dress/customer analytics computed once for all months

function ensureDashAuth() {
  // Always require auth on Dashboard entry - clear any previous auth
  sessionStorage.removeItem('dashAuth');
  showDashLockModal();
}

function authedDashRender() {
  if (db && db.don && db.don.length > 0) {
    dashAllTimeCache = null; // invalidate all-time cache on fresh auth
    renderDashboard();
  } else {
    var waitCount = 0;
    var waitInterval = setInterval(function() {
      waitCount++;
      if (db && db.don && db.don.length > 0) {
        clearInterval(waitInterval);
        dashAllTimeCache = null;
        renderDashboard();
      } else if (waitCount > 50) {
        clearInterval(waitInterval);
      }
    }, 200);
  }
}

function showDashLockModal() {
  // Hide dashboard section while locked
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const m = $('#m-dash-lock');
  if (m) {
    m.style.display = 'flex';
    m.classList.add('show');
  }
  const inp = $('#dash-lock-pwd');
  if (inp) { inp.value = ''; inp.focus(); }
  const err = $('#dash-lock-error');
  if (err) err.style.display = 'none';
  inp && inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkDashPwd(); });
}

function checkDashPwd() {
  const inp = $('#dash-lock-pwd');
  if (!inp) return;
  if (inp.value === DASHBOARD_PASSWORD) {
    sessionStorage.setItem('dashAuth', 'ok');
    const m = $('#m-dash-lock');
    if (m) { m.style.display = 'none'; m.classList.remove('show'); }
    // Hide other views, show dashboard directly
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    const dash = $('#v-dashboard');
    if (dash) {
      dash.style.display = '';
      dash.classList.add('active');
    }
    const dashBtn = document.querySelector('[data-go="v-dashboard"]');
    if (dashBtn) dashBtn.classList.add('active');
    if (typeof authedDashRender === 'function') authedDashRender();
  } else {
    const err = $('#dash-lock-error');
    if (err) err.style.display = 'block';
    inp.value = '';
    inp.focus();
  }
}

function cancelDashLock() {
  const m = $('#m-dash-lock');
  if (m) { m.style.display = 'none'; m.classList.remove('show'); }
  (window._origGo || go)('v-cal');
}

function calculateAllTimeAnalytics() {
  // Chạy 1 lần cho dress + customer analytics (không thay đổi theo tháng)
  if (dashAllTimeCache) return dashAllTimeCache;
  const orders = db.don || [];
  const vayList = db.vay || [];

  // === Dress analytics (all time) ===
  const dressCount = {}, dressRevenue = {}, dressLastRent = {};
  orders.forEach(o => {
    if (isHoanOrder(o)) return;
    const rev = donTienThueVay(o);
    const layIso = o.Ngay_Lay;
    (o.dhvs || []).forEach(x => {
      const key = x.Ma_Vay || x.vay;
      if (!key) return;
      dressCount[key] = (dressCount[key] || 0) + 1;
      dressRevenue[key] = (dressRevenue[key] || 0) + Math.round(rev / Math.max((o.dhvs || []).length, 1));
      if (!dressLastRent[key] || layIso > dressLastRent[key]) dressLastRent[key] = layIso;
    });
  });
  const everRented = new Set(Object.keys(dressCount));
  const dressData = Object.entries(dressCount).map(([k, cnt]) => {
    const v = vayById.get(k);
    const giaGoc = v ? Number(v.Gia_Vay_Goc || 0) : 0;
    const revenue = dressRevenue[k] || 0;
    const roi = giaGoc > 0 ? Math.round((revenue - giaGoc) / giaGoc * 100) : 0;
    return { ten: v ? v.Ten_Vay : k, key: k, count: cnt, revenue, giaGoc, roi, lastRent: dressLastRent[k] || '' };
  });
  dressData.sort((a, b) => b.count - a.count);

  const neverRented = vayList.filter(v => {
    const k = v.Ma_Vay || v.id;
    return k && !everRented.has(k);
  }).slice(0, 20).map(v => ({ ten: v.Ten_Vay || v.Ten, key: v.Ma_Vay || v.id }));

  // === Customer analytics (all time) ===
  const customerData = {};
  orders.forEach(o => {
    if (isHoanOrder(o)) return;
    const key = o.Insta_Khach || o.insta || o.SDT || o.sdt || 'Khách lẻ';
    if (!customerData[key]) {
      const d = parseD(o.Ngay_Lay);
      customerData[key] = {
        name: key, sdt: o.SDT || o.sdt || '',
        count: 0, revenue: 0, type: new Set(),
        firstMonth: d ? d.getMonth() + d.getFullYear() * 12 : 9999,
        lastMonth: d ? d.getMonth() + d.getFullYear() * 12 : 0
      };
    }
    customerData[key].count++;
    customerData[key].revenue += donTienThueVay(o) + donTienThuePK(o);
    customerData[key].type.add(o.Goi_Thue || 'Chốt thuê');
    const d = parseD(o.Ngay_Lay);
    if (d) {
      const cm = d.getMonth() + d.getFullYear() * 12;
      if (cm < customerData[key].firstMonth) customerData[key].firstMonth = cm;
      if (cm > customerData[key].lastMonth) customerData[key].lastMonth = cm;
    }
  });

  const allCustomers = Object.values(customerData);
  const topCustomers = allCustomers
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15)
    .map(c => ({ ...c, typeArr: [...c.type] }));

  dashAllTimeCache = { dressData, neverRented, allCustomers, topCustomers };
  return dashAllTimeCache;
}

function calculateDashboardData(month, year) {
  const cacheKey = `${year}-${month}`;
  if (dashCache[cacheKey]) return dashCache[cacheKey];

  const orders = (db.don || []);
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const daysInMonth = end.getDate();
  const elapsedDays = Math.min(today.getDate(), daysInMonth);

  // Filter orders in this month (by Ngay_Lay) — CHỈ tính orders đã hoàn cọc
  const monthOrders = orders.filter(o => {
    if (!isHoanOrder(o)) return false; // BẮT BUỘC phải hoàn cọc mới tính
    const d = parseD(o.Ngay_Lay);
    if (!d) return false;
    return d >= start && d <= end;
  });

  // === KPI: Revenue & Orders ===
  // Revenue = (tiền thuê váy + tiền thuê PK) - chiphi (chỉ orders đã hoàn cọc)
  let totalRevenue = 0, totalDeposit = 0;
  monthOrders.forEach(o => {
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const expenses = Number(o.chiphi || 0);
    totalRevenue += (gross - expenses);
    totalDeposit += donCocGoiY(o);
  });
  const totalOrders = monthOrders.length;
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const revPerDay = elapsedDays > 0 ? Math.round(totalRevenue / elapsedDays) : 0;

  // === Revenue by Order Type ===
  const byType = { 'Chốt thuê': [], 'Fitting': [], 'Fitting xa': [], 'Đặt ship': [] };
  monthOrders.forEach(o => {
    const t = o.Goi_Thue || o.Loai_Don || 'Chốt thuê';
    const key = t === '12h' || t === '1 ngày' ? 'Chốt thuê'
      : t === 'Fitting xa' ? 'Fitting xa'
      : t === 'Đặt ship' ? 'Đặt ship'
      : t.includes('Fitting') ? 'Fitting' : 'Chốt thuê';
    if (byType[key]) byType[key].push(o);
  });
  const typeStats = Object.entries(byType).filter(([, arr]) => arr.length > 0).map(([type, arr]) => {
    const rev = arr.reduce((s, o) => {
      const gross = donTienThueVay(o) + donTienThuePK(o);
      const expenses = Number(o.chiphi || 0);
      return s + (gross - expenses);
    }, 0);
    return { type, count: arr.length, revenue: rev, pct: totalRevenue > 0 ? Math.round(rev / totalRevenue * 100) : 0, aov: arr.length > 0 ? Math.round(rev / arr.length) : 0 };
  });

  // === Prev month comparison ===
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const prevStart = new Date(prevY, prevM - 1, 1);
  const prevEnd = new Date(prevY, prevM, 0);
  const prevOrders = orders.filter(o => {
    if (!isHoanOrder(o)) return false; // CHỈ tính orders đã hoàn cọc
    const d = parseD(o.Ngay_Lay);
    if (!d) return false;
    return d >= prevStart && d <= prevEnd;
  });
  let prevRevenue = prevOrders.reduce((s, o) => {
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const expenses = Number(o.chiphi || 0);
    return s + (gross - expenses);
  }, 0);
  const revenueChange = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0;
  const ordersChange = prevOrders.length > 0 ? Math.round(((totalOrders - prevOrders.length) / prevOrders.length) * 100) : 0;

  // === Last 2 months for comparison chart ===
  const last2M = month === 1 ? 12 : month - 1;
  const last2Y = month === 1 ? year - 1 : year;
  const last2Start = new Date(last2Y, last2M - 1, 1);
  const last2End = new Date(last2Y, last2M, 0);
  const last2Orders = orders.filter(o => {
    if (!isHoanOrder(o)) return false; // CHỈ tính orders đã hoàn cọc
    const d = parseD(o.Ngay_Lay);
    if (!d) return false;
    return d >= last2Start && d <= last2End;
  });
  const last2Revenue = last2Orders.reduce((s, o) => {
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const expenses = Number(o.chiphi || 0);
    return s + (gross - expenses);
  }, 0);
  const monthlyComparison = [
    { label: `T${last2M}/${last2Y}`, revenue: last2Revenue, orders: last2Orders.length },
    { label: `T${prevM}/${prevY}`, revenue: prevRevenue, orders: prevOrders.length },
    { label: `T${month}/${year}`, revenue: totalRevenue, orders: totalOrders },
  ];

  // === Active rentals (ongoing) ===
  const activeRentals = orders.filter(o => {
    if (isHoanOrder(o)) return false;
    const lay = parseD(o.Ngay_Lay);
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!lay || !tra) return false;
    return lay <= today && tra >= today;
  }).length;

  // === Today's pickups & returns ===
  const todayIso = today.toISOString().slice(0, 10);
  const pickupsToday = monthOrders.filter(o => o.Ngay_Lay === todayIso).length;
  const returnsToday = monthOrders.filter(o => {
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    return tra && tra.toISOString().slice(0, 10) === todayIso;
  }).length;

  // === Daily revenue (use Map for speed) — net revenue (gross - chiphi), ngày ghi nhận = Ngay_Lay
  const dayRevMap = {};
  const dayCountMap = {};
  monthOrders.forEach(o => {
    const iso = o.Ngay_Lay;
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const expenses = Number(o.chiphi || 0);
    dayRevMap[iso] = (dayRevMap[iso] || 0) + (gross - expenses);
    dayCountMap[iso] = (dayCountMap[iso] || 0) + 1;
  });
  const dailyRevenue = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = new Date(year, month - 1, d).toISOString().slice(0, 10);
    dailyRevenue.push({ date: iso, day: d, revenue: dayRevMap[iso] || 0, count: dayCountMap[iso] || 0 });
  }

  // === Weekly revenue ===
  const weeklyRevenue = [];
  for (let w = 0; w < 5; w++) {
    const wStart = new Date(year, month - 1, w * 7 + 1);
    const wEnd = new Date(year, month - 1, Math.min((w + 1) * 7, daysInMonth));
    const wOrders = monthOrders.filter(o => {
      const d = parseD(o.Ngay_Lay);
      return d && d >= wStart && d <= wEnd;
    });
    const wRev = wOrders.reduce((s, o) => {
      const gross = donTienThueVay(o) + donTienThuePK(o);
      const expenses = Number(o.chiphi || 0);
      return s + (gross - expenses);
    }, 0);
    weeklyRevenue.push({ label: `T${w + 1}`, revenue: wRev, orders: wOrders.length });
  }

  // === Revenue heatmap data ===
  const heatmap = [];
  for (let w = 0; w < 5; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const dayNum = w * 7 + dow + 1;
      if (dayNum > daysInMonth) {
        heatmap.push({ day: null, revenue: 0, count: 0 });
      } else {
        const iso = new Date(year, month - 1, dayNum).toISOString().slice(0, 10);
        heatmap.push({ day: dayNum, revenue: dayRevMap[iso] || 0, count: dayCountMap[iso] || 0, dow });
      }
    }
  }

  // === Dress analytics (month-specific) ===
  const vayList = db.vay || [];
  const totalDresses = vayList.length;
  const monthDressCount = {}, monthDressRev = {}, monthDressLast = {};
  monthOrders.forEach(o => {
    const rev = donTienThueVay(o);
    const layIso = o.Ngay_Lay;
    (o.dhvs || []).forEach(x => {
      const key = x.Ma_Vay || x.vay;
      if (!key) return;
      monthDressCount[key] = (monthDressCount[key] || 0) + 1;
      monthDressRev[key] = (monthDressRev[key] || 0) + Math.round(rev / Math.max((o.dhvs || []).length, 1));
      if (!monthDressLast[key] || layIso > monthDressLast[key]) monthDressLast[key] = layIso;
    });
  });
  const monthDressData = Object.entries(monthDressCount).map(([k, cnt]) => {
    const v = vayById.get(k);
    return { ten: v ? v.Ten_Vay : k, key: k, count: cnt, revenue: monthDressRev[k] || 0, lastRent: monthDressLast[k] || '' };
  });
  monthDressData.sort((a, b) => b.count - a.count);
  const topDresses = monthDressData.slice(0, 20);
  const bottomDresses = [...monthDressData].sort((a, b) => a.count - b.count).slice(0, 20);
  const topRevenueDresses = [...monthDressData].sort((a, b) => b.revenue - a.revenue).slice(0, 20);

  // === DUR: Fast computation using busy date index ===
  // Build a set of (dressKey, dateIso) pairs that are busy this month
  const busySet = new Set();
  orders.forEach(o => {
    if (isHoanOrder(o)) return;
    const lay = parseD(o.Ngay_Lay);
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!lay || !tra) return;
    const d = new Date(lay);
    while (d <= tra) {
      (o.dhvs || []).forEach(x => {
        const key = x.Ma_Vay || x.vay;
        if (key) busySet.add(key + '|' + d.toISOString().slice(0, 10));
      });
      d.setDate(d.getDate() + 1);
    }
  });
  let totalBusyDays = 0;
  vayList.forEach(v => {
    const key = v.Ma_Vay || v.id;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = new Date(year, month - 1, day).toISOString().slice(0, 10);
      if (busySet.has(key + '|' + iso)) totalBusyDays++;
    }
  });
  const dur = totalDresses > 0 ? Math.round((totalBusyDays / (totalDresses * daysInMonth)) * 100) : 0;
  const activeDresses = monthDressData.length;
  const inactiveDresses = totalDresses - activeDresses;

  // Dress age analysis
  const dressAge = { new: 0, stable: 0, old: 0, veryOld: 0 };
  vayList.forEach(v => {
    const created = parseD(v.Ngay_Tao || v.created_at || v.Ngay_Them);
    if (!created) { dressAge.stable++; return; }
    const months = (end - created) / (30 * 24 * 3600 * 1000);
    if (months < 3) dressAge.new++;
    else if (months < 6) dressAge.stable++;
    else if (months < 12) dressAge.old++;
    else dressAge.veryOld++;
  });

  // === Customer analytics (month-specific: new vs returning) ===
  const curMonth = month + year * 12;
  const at = calculateAllTimeAnalytics();
  const newCustomers = at.allCustomers.filter(c => c.firstMonth === curMonth).length;
  const returningCustomers = at.allCustomers.filter(c => c.firstMonth < curMonth).length;
  const repeatRate = (newCustomers + returningCustomers) > 0 ? Math.round(returningCustomers / (newCustomers + returningCustomers) * 100) : 0;
  const top10Rev = at.topCustomers.slice(0, 10).reduce((s, c) => s + c.revenue, 0);
  const top10RevShare = totalRevenue > 0 ? Math.round(top10Rev / totalRevenue * 100) : 0;
  const custByType = {
    'Chốt thuê': at.allCustomers.filter(c => c.type.has('12h') || c.type.has('1 ngày') || c.type.has('Chốt thuê')).length,
    'Fitting': at.allCustomers.filter(c => c.type.has('Fitting') || c.type.has('Fitting xa')).length,
    'Đặt ship': at.allCustomers.filter(c => c.type.has('Đặt ship')).length,
  };

  // === Costs & P&L ===
  let totalShip = 0, totalOther = 0;
  monthOrders.forEach(o => {
    totalShip += Number(o.Ship || o.chiPhiShip || 0);
    totalOther += Number(o.Chi_Phi_Khac || o.chiphi || 0);
  });
  // Manual costs (sửa váy, sửa khóa, etc.)
  const manualCosts = (db.chiPhi || []).filter(e => {
    const d = parseD(e.date);
    return d && d.getMonth() + 1 === month && d.getFullYear() === year;
  });
  const totalManualCost = manualCosts.reduce((s, e) => s + Number(e.soTien || 0), 0);
  const totalOtherCost = totalShip + totalOther + totalManualCost;
  const netProfit = totalRevenue - totalOtherCost;
  const grossMargin = totalRevenue > 0 ? Math.round(netProfit / totalRevenue * 100) : 0;

  // === Forecast ===
  const nextMonthStart = new Date(year, month, 1);
  const nextMonthEnd = new Date(year, month + 1, 0);
  const nextWeekStart = new Date(today); nextWeekStart.setDate(today.getDate() + 1);
  const nextWeekEnd = new Date(today); nextWeekEnd.setDate(today.getDate() + 7);
  const nextMonthOrders_count = orders.filter(o => {
    if (isHoanOrder(o)) return false;
    const d = parseD(o.Ngay_Lay);
    return d && d >= nextMonthStart && d <= nextMonthEnd;
  }).length;
  const nextWeekOrders_count = orders.filter(o => {
    if (isHoanOrder(o)) return false;
    const d = parseD(o.Ngay_Lay);
    return d && d >= nextWeekStart && d <= nextWeekEnd;
  }).length;

  // Busiest upcoming day
  const upcomingDays = {};
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const cnt = orders.filter(o => {
      if (isHoanOrder(o)) return false;
      return o.Ngay_Lay === iso;
    }).length;
    if (cnt > 0) upcomingDays[iso] = cnt;
  }
  const busyUpcoming = Object.entries(upcomingDays).filter(([, c]) => c > 5).slice(0, 5);

  // === Overdue ===
  const overdue = orders.filter(o => {
    if (isHoanOrder(o)) return false;
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!tra || tra >= today) return false;
    return tra < today;
  });

  // === Trend ===
  let trend = 'stable';
  if (revenueChange > 5) trend = 'up';
  else if (revenueChange < -5) trend = 'down';

  // === Power BI Ratios ===
  const uniqueCustomers = new Set(monthOrders.map(o => o.Insta_Khach || o.insta || o.SDT || o.sdt || '')).size;
  const totalRentals = monthOrders.reduce((s, o) => s + (o.dhvs || []).length, 0);

  // Pending refunds (đơn đã trả nhưng chưa hoàn)
  const pendingRefunds = orders.filter(o => {
    if (!isHoanOrder(o)) return false;
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    return tra && tra < today && !o.Trang_Thai_Hoan_Coc;
  }).reduce((s, o) => s + (o.Hinh_Thuc_Coc === 'Cọc 100%' ? donCocGoiY(o) : donCocGoiY(o) / 2), 0);

  // Average rental days
  const totalRentalDays = monthOrders.reduce((s, o) => {
    const lay = parseD(o.Ngay_Lay);
    const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!lay || !tra) return s;
    return s + Math.round((tra - lay) / (24 * 3600 * 1000)) + 1;
  }, 0);
  const avgRentalDays = totalOrders > 0 ? Math.round(totalRentalDays / totalOrders) : 0;

  // Top dress revenue share
  const topDressRevShare = at.dressData && at.dressData.length > 0 && totalRevenue > 0
    ? Math.round((at.dressData[0].revenue || 0) / totalRevenue * 100) : 0;

  // Top 3 dresses concentration risk
  const top3Rev = at.dressData ? at.dressData.slice(0, 3).reduce((s, d) => s + (d.revenue || 0), 0) : 0;
  const dressConcentrationRisk = totalRevenue > 0 ? Math.round(top3Rev / totalRevenue * 100) : 0;

  // Total fitting orders
  const totalFittingOrders = monthOrders.filter(o => o.Trang_Thai_Don === 'Fitting' || o.Trang_Thai_Don === 'Fitting xa').length;

  // Fitting-to-close rate
  const fittedOrders = monthOrders.filter(o => {
    if (o.Trang_Thai_Don !== 'Chốt thuê') return false;
    // Tìm đơn Fitting trước đó cùng khách
    const key = o.Insta_Khach || o.insta || o.SDT || o.sdt;
    if (!key) return false;
    const lay = parseD(o.Ngay_Lay);
    if (!lay) return false;
    const prev = orders.find(x => {
      if (x === o) return false;
      const kx = x.Insta_Khach || x.insta || x.SDT || x.sdt;
      if (kx !== key) return false;
      const dx = parseD(x.Ngay_Lay);
      return dx && dx < lay && (x.Trang_Thai_Don === 'Fitting' || x.Trang_Thai_Don === 'Fitting xa');
    });
    return !!prev;
  }).length;
  const fittingToCloseRate = totalFittingOrders > 0 ? Math.round(fittedOrders / totalFittingOrders * 100) : 0;

  // Cash flow metrics
  const avgDepositPerOrder = totalOrders > 0 ? Math.round(totalDeposit / totalOrders) : 0;
  const daysOfCashBuffer = revPerDay > 0 ? Math.round((totalDeposit - pendingRefunds) / revPerDay) : 0;

  // Break-even revenue
  const breakEvenRevenue = grossMargin > 0 ? Math.round(totalOtherCost / (grossMargin / 100)) : 0;

  // CAC (Customer Acquisition Cost) - ship cost / new customers
  const cac = newCustomers > 0 ? Math.round(totalShip / newCustomers) : 0;

  // Avg orders per customer
  const avgOrdersPerCustomer = uniqueCustomers > 0 ? Math.round(totalOrders / uniqueCustomers * 10) / 10 : 0;

  // Dress turnover rate (rentals / dresses)
  const dressTurnoverRate = totalDresses > 0 ? Math.round(totalRentals / totalDresses * 10) / 10 : 0;

  // Peak day revenue
  const peakDayRevenue = Object.values(dailyRevenue).length > 0
    ? Math.max(...Object.values(dailyRevenue)) : 0;

  // Overdue rate
  const overdueRate = totalOrders > 0 ? Math.round(overdue.length / totalOrders * 100) : 0;

  // YoY growth
  const yoyOrders = orders.filter(o => {
    if (isHoanOrder(o)) return false;
    const d = parseD(o.Ngay_Lay);
    if (!d) return false;
    return d.getMonth() + 1 === month && d.getFullYear() === year - 1;
  });
  const yoyRevenue = yoyOrders.reduce((s, o) => {
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const expenses = Number(o.chiphi || 0);
    return s + (gross - expenses);
  }, 0);
  const yoyGrowth = yoyRevenue > 0 ? Math.round((totalRevenue - yoyRevenue) / yoyRevenue * 100) : 0;

  const result = {
    totalOrders, totalRevenue, totalDeposit, activeRentals,
    aov, revenueChange, ordersChange,
    avgBusy: dur, totalDresses, activeDresses, inactiveDresses,
    pickupsToday, returnsToday,
    dailyRevenue, weeklyRevenue, heatmap,
    monthlyComparison, typeStats,
    prevRevenue, prevOrders: prevOrders.length,
    topDresses, bottomDresses, topRevenueDresses, neverRented: at.neverRented, dressAge,
    topCustomers: at.topCustomers, newCustomers, returningCustomers, repeatRate, top10RevShare, custByType,
    totalShip, totalOther, totalManualCost, totalOtherCost, netProfit, grossMargin,
    nextMonthOrders_count, nextWeekOrders_count, busyUpcoming,
    trend, overdue,
    month, year, daysInMonth, elapsedDays,
    // Power BI ratios
    uniqueCustomers, totalRentals, pendingRefunds, avgRentalDays, fittingToCloseRate,
    totalFittingOrders, fittedOrders,
    topDressRevShare, dressConcentrationRisk,
    avgDepositPerOrder, revPerDay, daysOfCashBuffer, breakEvenRevenue,
    cac, avgOrdersPerCustomer, dressTurnoverRate, peakDayRevenue, overdueRate, yoyGrowth,
  };

  dashCache[cacheKey] = result;
  return result;
}

function renderDashboard() {
  const { month, year } = dashState;
  const s = $('#v-dashboard');

  // Default to tongquan tab
  if (!dashState.dashTab) dashState.dashTab = 'tongquan';

  const tabMeta = {
    tongquan:   { icon: '📊', label: 'Tổng quan' },
    khovaypk:   { icon: '👗', label: 'Kho váy & PK' },
    soquy:      { icon: '💰', label: 'Sổ quỹ' },
    baocao:     { icon: '📋', label: 'Báo cáo' },
    phantich:   { icon: '🔍', label: 'Phân tích' },
  };

  s.innerHTML = `
<div class="dash-header">
  <div class="dash-nav">
    <button class="dash-nav-btn" onclick="dashChangePeriod(-1)">‹</button>
    <span class="dash-month-label">Tháng ${month}/${year}</span>
    <button class="dash-nav-btn" onclick="dashChangePeriod(1)">›</button>
  </div>
  <div class="dash-header-right">
    <span class="dash-refresh-info" id="dash-refresh-info"></span>
    <button class="dash-export-btn" onclick="exportDashboardCSV()">📥 Export</button>
  </div>
</div>

<div class="dash-tabs">
  ${Object.entries(tabMeta).map(([key, m]) =>
    `<button class="dash-tab ${dashState.dashTab===key?'active':''}" onclick="setDashTab('${key}')">${m.icon} ${m.label}</button>`
  ).join('')}
</div>

<div class="dash-content" id="dash-content">
  <div class="dash-loading">
    <div class="dash-spinner"></div>
    <p>Đang tải dữ liệu...</p>
  </div>
</div>`;

  // Wrapper for expense modal button — stops propagation to avoid parent click handler conflicts
  window.openExpenseBtn = (e) => { if (e) { e.stopPropagation(); e.preventDefault(); } window.openExpenseModal(e); };

  // Use setTimeout(0) to defer calculation until after DOM paint, then render
  setTimeout(function() {
    try {
      const d = calculateDashboardData(month, year);
      renderDashTab(d);
    } catch(e) {
      console.error('Dashboard error:', e);
      const content = $('#dash-content');
      if (content) content.innerHTML = '<div class="dash-loading"><p style="color:var(--red);padding:20px">Lỗi tải Dashboard. Thử tải lại trang.</p></div>';
    }
  }, 0);
}

function setDashTab(tab) {
  dashState.dashTab = tab;
  const { month, year } = dashState;
  const content = $('#dash-content');
  if (content) {
    content.innerHTML = `<div class="dash-loading"><div class="dash-spinner"></div><p>Đang tải...</p></div>`;
    setTimeout(function() {
      try {
        const d = calculateDashboardData(month, year);
        renderDashTab(d);
      } catch(e) {
        console.error('Dashboard tab error:', e);
        content.innerHTML = '<div class="dash-loading"><p style="color:var(--red);padding:20px">Lỗi tải dữ liệu Dashboard.</p></div>';
      }
    }, 0);
  }
}

function renderDashTab(d) {
  const content = $('#dash-content');
  if (!content) return;

  const tab = dashState.dashTab;
  if (tab === 'tongquan') content.innerHTML = renderDashTongQuan(d);
  else if (tab === 'khovaypk') content.innerHTML = renderDashKhoVayPK(d);
  else if (tab === 'soquy') content.innerHTML = renderDashSoQuy(d);
  else if (tab === 'baocao') content.innerHTML = renderDashBaoCao(d);
  else if (tab === 'phantich') content.innerHTML = renderDashPhanTich(d);

  requestAnimationFrame(() => {
    if (tab === 'tongquan') { renderDashBarChart(); }
    if (tab === 'khovaypk') { renderDashKhoVayDonut(); }
    if (tab === 'soquy') { renderDashSoQuyChart(); }
    if (tab === 'baocao') { renderDashBaoCaoChart(); }
  });
}

function changeClass(str, cls, val) {
  return val ? str + ' ' + cls : str;
}

// ============================================================
// DASHBOARD — 5 NEW SUB-TABS
// ============================================================

// --- Revenue filter helper ---
function dashRevenueFilter(mode, month, year) {
  const orders = (db.don || []).filter(o => isHoanOrder(o));
  const today = new Date(); today.setHours(0,0,0,0);
  let start, end, label;

  if (mode === 'today') {
    start = end = new Date(today); label = 'Hôm nay';
  } else if (mode === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    start = end = new Date(y); label = 'Hôm qua';
  } else if (mode === '7days') {
    start = new Date(today); start.setDate(start.getDate() - 6);
    end = new Date(today); label = '7 ngày';
  } else {
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0); label = `T${month}/${year}`;
  }

  const filtered = orders.filter(o => {
    const d = parseD(o.Ngay_Lay);
    if (!d) return false;
    return d >= start && d <= end;
  });

  let revenue = 0, count = 0;
  filtered.forEach(o => {
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const expenses = Number(o.chiphi || 0);
    revenue += (gross - expenses);
    count++;
  });
  return { revenue, count, label };
}

// --- Top dresses by filter ---
function dashTopDresses(mode, month, year) {
  const orders = (db.don || []).filter(o => isHoanOrder(o));
  const today = new Date(); today.setHours(0,0,0,0);
  let start, end;

  if (mode === 'today') {
    start = end = new Date(today);
  } else if (mode === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    start = end = new Date(y);
  } else if (mode === '7days') {
    start = new Date(today); start.setDate(start.getDate() - 6);
    end = new Date(today);
  } else {
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0);
  }

  const filtered = orders.filter(o => {
    const d = parseD(o.Ngay_Lay);
    if (!d) return false;
    return d >= start && d <= end;
  });

  const counts = {};
  filtered.forEach(o => {
    const dhvs = Array.isArray(o.dhvs) ? o.dhvs : [];
    dhvs.forEach(x => {
      const key = x.Ma_Vay || x.vay;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
  });

  const vayList = db.vay || [];
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, cnt]) => {
      const v = vayById.get(key);
      return { ten: v ? v.Ten_Vay : key, key, count: cnt };
    });
}

// --- TODAY vs YESTERDAY vs SAME DAY LAST MONTH ---
function dashTodayStats(month, year) {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const sameDayLastMonth = new Date(today); sameDayLastMonth.setMonth(sameDayLastMonth.getMonth() - 1);

  const calc = (date) => {
    const iso = date.toISOString().slice(0, 10);
    const orders = (db.don || []).filter(o => isHoanOrder(o) && o.Ngay_Lay === iso);
    const rev = orders.reduce((s, o) => {
      const gross = donTienThueVay(o) + donTienThuePK(o);
      const expenses = Number(o.chiphi || 0);
      return s + (gross - expenses);
    }, 0);
    return { rev, count: orders.length };
  };

  const todayD = calc(today);
  const yesterdayD = calc(yesterday);
  const sameDayLastMonthD = calc(sameDayLastMonth);

  const pctVsYesterday = yesterdayD.rev > 0 ? Math.round((todayD.rev - yesterdayD.rev) / yesterdayD.rev * 100) : 0;
  const pctVsLastMonth = sameDayLastMonthD.rev > 0 ? Math.round((todayD.rev - sameDayLastMonthD.rev) / sameDayLastMonthD.rev * 100) : 0;

  return { today: todayD, yesterday: yesterdayD, sameDayLastMonth: sameDayLastMonthD, pctVsYesterday, pctVsLastMonth };
}

// ============================================================
// TAB 1: TỔNG QUAN
// ============================================================
function renderDashTongQuan(d) {
  // Sub-tab state
  const subTab = dashState.subTab || 'banhang';
  const revMode = dashState.revMode || '7days';
  const topMode = dashState.topMode || '7days';
  const { month, year } = dashState;

  // Stats for today
  const todayStats = dashTodayStats(month, year);
  const rev7 = dashRevenueFilter('7days', month, year);
  const revThisMonth = dashRevenueFilter('thismonth', month, year);
  const topD7 = dashTopDresses('7days', month, year);
  const topDMonth = dashTopDresses('thismonth', month, year);

  // Filter top dresses by subTab
  const topDresses = subTab === 'doanhthu' ? topD7 : topDMonth;

  return `
${renderDashDateFilter()}

<!-- SUB-TABS -->
<div class="dash-sub-tabs">
  <button class="dash-sub-tab ${subTab==='banhang'?'active':''}" onclick="setDashSubTab('banhang')">📈 Kết quả BH</button>
  <button class="dash-sub-tab ${subTab==='doanhthu'?'active':''}" onclick="setDashSubTab('doanhthu')">💰 Doanh thu thuần</button>
  <button class="dash-sub-tab ${subTab==='topvay'?'active':''}" onclick="setDashSubTab('topvay')">🏆 Top 20 váy</button>
</div>

${subTab === 'banhang' ? `
<!-- 1a: Kết quả bán hàng -->
<div class="dash-section">
  <div class="dash-section-title">Kết quả bán hàng</div>
  <div class="dash-today-stats">
    <div class="dash-today-card main">
      <div class="dash-today-rev">${fmtVND(todayStats.today.rev)}</div>
      <div class="dash-today-label">Doanh thu hôm nay</div>
      <div class="dash-today-count">${todayStats.today.count} đơn</div>
    </div>
    <div class="dash-today-compare">
      <div class="dash-compare-row">
        <span class="dash-compare-label">vs Hôm qua</span>
        <span class="dash-compare-val ${todayStats.pctVsYesterday>=0?'pos':'neg'}">${todayStats.pctVsYesterday>=0?'▲':'▼'} ${Math.abs(todayStats.pctVsYesterday)}%</span>
        <span class="dash-compare-amount muted">${fmtVND(todayStats.yesterday.rev)}</span>
      </div>
      <div class="dash-compare-row">
        <span class="dash-compare-label">vs Cùng kỳ tháng trước</span>
        <span class="dash-compare-val ${todayStats.pctVsLastMonth>=0?'pos':'neg'}">${todayStats.pctVsLastMonth>=0?'▲':'▼'} ${Math.abs(todayStats.pctVsLastMonth)}%</span>
        <span class="dash-compare-amount muted">${fmtVND(todayStats.sameDayLastMonth.rev)}</span>
      </div>
    </div>
  </div>
</div>
` : ''}

${subTab === 'doanhthu' ? `
<!-- 1b: Doanh thu thuần -->
<div class="dash-section">
  <div class="dash-rev-filter-row">
    <div class="dash-chart-tabs">
      <button class="dash-chart-tab ${revMode==='today'?'active':''}" onclick="setDashRevMode('today')">Hôm nay</button>
      <button class="dash-chart-tab ${revMode==='yesterday'?'active':''}" onclick="setDashRevMode('yesterday')">Hôm qua</button>
      <button class="dash-chart-tab ${revMode==='7days'?'active':''}" onclick="setDashRevMode('7days')">7 ngày</button>
      <button class="dash-chart-tab ${revMode==='thismonth'?'active':''}" onclick="setDashRevMode('thismonth')">Tháng này</button>
    </div>
  </div>
  ${(() => {
    const filterRev = dashRevenueFilter(revMode, month, year);
    const aov = filterRev.count > 0 ? Math.round(filterRev.revenue / filterRev.count) : 0;
    return `
  <div class="dash-rev-summary">
    <div class="dash-rev-big accent">${fmtVND(filterRev.rev)}</div>
    <div class="dash-rev-meta muted">${filterRev.label} · ${filterRev.count} đơn · AOV ${fmtVND(aov)}</div>
  </div>
  <div class="dash-chart-wrap" id="dash-rev-chart-wrap" style="height:200px">
    <canvas id="dash-rev-chart"></canvas>
    <div class="dash-chart-tooltip" id="dash-rev-tooltip"></div>
  </div>`;
  })()}
</div>
` : ''}

${subTab === 'topvay' ? `
<!-- 1c: Top 20 váy bán chạy -->
<div class="dash-section">
  <div class="dash-rev-filter-row">
    <div class="dash-chart-tabs">
      <button class="dash-chart-tab ${topMode==='7days'?'active':''}" onclick="setDashTopMode('7days')">7 ngày</button>
      <button class="dash-chart-tab ${topMode==='thismonth'?'active':''}" onclick="setDashTopMode('thismonth')">Tháng này</button>
    </div>
  </div>
  <div class="dash-top20-wrap" id="dash-top20-wrap">
    ${topDresses.length === 0 ? `
    <div class="dash-empty-state">
      <div class="dash-empty-icon">👗</div>
      <div class="dash-empty-title">Chưa có đơn thuê nào</div>
      <div class="dash-empty-desc">Tạo đơn mới để xem top váy bán chạy ${topMode==='7days'?'7 ngày qua':'tháng này'}</div>
      <button class="dash-empty-btn" onclick="openNewOrder()">+ Tạo đơn mới</button>
    </div>` : topDresses.map((v, i) => `
    <div class="dash-top20-row" onclick="openOrderByDress('${v.key}')">
      <span class="dash-rank">${i+1}</span>
      <span class="dash-top20-name">${v.ten}</span>
      <span class="dash-top20-count">${v.count} lần</span>
    </div>`).join('')}
  </div>
</div>
` : ''}

<!-- Shared: Monthly summary strip -->
<div class="dash-section" style="margin-top:0">
  <div class="dash-section-title" style="font-size:12px;color:var(--text-muted)">Tháng ${month}/${year}: ${fmtVND(d.totalRevenue)} · ${d.totalOrders} đơn · ${d.revenueChange>=0?'▲':'▼'} ${Math.abs(d.revenueChange)}% vs tháng trước</div>
</div>
`;
}

function setDashSubTab(tab) { dashState.subTab = tab; renderDashboard(); }
function setDashRevMode(mode) { dashState.revMode = mode; renderDashboard(); }
function setDashTopMode(mode) { dashState.topMode = mode; renderDashboard(); }

// === Date Filter System ===
function setDashDateFilter(filter) {
  dashState.dateFilter = filter;
  renderDashboard();
}

function dashChangePeriod(dir) {
  const { month, year } = dashState;
  if (dir === 1 && month === 12) {
    dashState.month = 1;
    dashState.year++;
  } else if (dir === -1 && month === 1) {
    dashState.month = 12;
    dashState.year--;
  } else {
    dashState.month += dir;
  }
  renderDashboard();
}

function renderDashDateFilter() {
  const df = dashState.dateFilter || 'thismonth';
  const { month, year } = dashState;
  const today_d = new Date();
  const label = df === 'today' ? `Hôm nay · ${today_d.getDate()}/${today_d.getMonth()+1}` :
                df === '7days' ? '7 ngày gần nhất' :
                `Tháng ${month}/${year}`;
  return `
  <div class="dash-date-filter-bar">
    <div class="dash-date-filter-tabs">
      <button class="dash-date-filter-btn ${df==='today'?'active':''}" onclick="setDashDateFilter('today')">Ngày</button>
      <button class="dash-date-filter-btn ${df==='7days'?'active':''}" onclick="setDashDateFilter('7days')">Tuần</button>
      <button class="dash-date-filter-btn ${df==='thismonth'?'active':''}" onclick="setDashDateFilter('thismonth')">Tháng</button>
    </div>
    <div class="dash-date-nav">
      <button onclick="dashChangePeriod(-1)" style="background:none;border:none;cursor:pointer;font-size:18px;font-weight:600;padding:4px 8px;color:var(--text-secondary)">‹</button>
      <span class="dash-date-label">${label}</span>
      <button onclick="dashChangePeriod(1)" style="background:none;border:none;cursor:pointer;font-size:18px;font-weight:600;padding:4px 8px;color:var(--text-secondary)">›</button>
    </div>
  </div>`;
}

function getDateFilterRange() {
  const df = dashState.dateFilter || 'thismonth';
  const { month, year } = dashState;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayIso = isoOf(now);

  if (df === 'today') {
    return { from: todayIso, to: todayIso };
  } else if (df === '7days') {
    const from = addD(todayIso, -6);
    return { from, to: todayIso };
  } else {
    // thismonth - get first and last day of month
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    return { from: isoOf(firstDay), to: isoOf(lastDay) };
  }
}

function openOrderByDress(key) {
  go('v-orders');
  const searchInput = document.getElementById('search');
  if (searchInput) { searchInput.value = key; searchInput.dispatchEvent(new Event('input')); }
}

// ============================================================
// TAB 3: SỔ QUỸ
// ============================================================

// Chi phí data management
function getChiPhiEntries() { return db.chiPhi || []; }
function getThuKhacEntries() { return db.thuKhac || []; }

function saveThuKhacEntry(entry) {
  const entries = getThuKhacEntries();
  entries.push(entry);
  db.thuKhac = entries;
  saveDB();
}

function saveChiPhiEntry(entry) {
  const entries = getChiPhiEntries();
  entries.push(entry);
  db.chiPhi = entries;
  saveDB();
}

function deleteChiPhiEntry(id) {
  const entries = getChiPhiEntries().filter(e => e.id !== id);
  db.chiPhi = entries;
  saveDB();
}

function deleteThuKhacEntry(id) {
  const entries = getThuKhacEntries().filter(e => e.id !== id);
  db.thuKhac = entries;
  saveDB();
}

function openAddThuKhacModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal('m-expense');
  setTimeout(() => {
    const body = document.getElementById('exp-body');
    if (body) {
      body.innerHTML = `
        <div class="sheet-header">
          <div class="sheet-title">💰 Thêm thu khác</div>
          <button class="icon-btn" onclick="closeModal('m-expense')">✕</button>
        </div>
        <div class="sheet-body" style="padding:16px;display:flex;flex-direction:column;gap:12px">
          <div>
            <label class="field-label">Mô tả</label>
            <input type="text" id="exp-mo-ta" class="field-input" placeholder="VD: Bán phụ kiện cũ" />
          </div>
          <div>
            <label class="field-label">Số tiền (đ)</label>
            <input type="number" id="exp-so-tien" class="field-input" placeholder="VD: 500000" min="0" />
          </div>
          <div>
            <label class="field-label">Ngày</label>
            <input type="date" id="exp-ngay" class="field-input" value="${today}" />
          </div>
          <button class="btn primary" onclick="doSaveThuKhac()" style="margin-top:8px">Lưu</button>
        </div>`;
    }
  }, 50);
}

function doSaveThuKhac() {
  const moTa = document.getElementById('exp-mo-ta')?.value.trim();
  const soTien = parseInt(document.getElementById('exp-so-tien')?.value) || 0;
  const ngay = document.getElementById('exp-ngay')?.value || new Date().toISOString().slice(0, 10);
  if (!moTa || soTien <= 0) { showToast('Nhập đầy đủ thông tin', 'warn'); return; }
  saveThuKhacEntry({ id: 'tk_' + Date.now(), moTa, soTien, ngay, date: ngay });
  closeModal('m-expense');
  showToast('Đã lưu thu khác');
  renderDashboard();
}

function openAddChiPhiModal() {
  const today = new Date().toISOString().slice(0, 10);
  const loaiOptions = [
    'Mua váy mới', 'Trả lương NV', 'Chi phí vận chuyển',
    'Chi phí giặt ủi', 'Chi phí khác'
  ];
  openModal('m-expense');
  setTimeout(() => {
    const body = document.getElementById('exp-body');
    if (body) {
      body.innerHTML = `
        <div class="sheet-header">
          <div class="sheet-title">💸 Thêm chi phí</div>
          <button class="icon-btn" onclick="closeModal('m-expense')">✕</button>
        </div>
        <div class="sheet-body" style="padding:16px;display:flex;flex-direction:column;gap:12px">
          <div>
            <label class="field-label">Loại chi phí</label>
            <select id="exp-loai" class="field-input">
              ${loaiOptions.map(l => `<option value="${l}">${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="field-label">Mô tả</label>
            <input type="text" id="exp-mo-ta" class="field-input" placeholder="VD: Mua váy abc" />
          </div>
          <div>
            <label class="field-label">Số tiền (đ)</label>
            <input type="number" id="exp-so-tien" class="field-input" placeholder="VD: 200000" min="0" />
          </div>
          <div>
            <label class="field-label">Ngày</label>
            <input type="date" id="exp-ngay" class="field-input" value="${today}" />
          </div>
          <button class="btn primary" onclick="doSaveChiPhi()" style="margin-top:8px">Lưu</button>
        </div>`;
    }
  }, 50);
}

function doSaveChiPhi() {
  const loai = document.getElementById('exp-loai')?.value;
  const moTa = document.getElementById('exp-mo-ta')?.value.trim();
  const soTien = parseInt(document.getElementById('exp-so-tien')?.value) || 0;
  const ngay = document.getElementById('exp-ngay')?.value || new Date().toISOString().slice(0, 10);
  if (!loai || !moTa || soTien <= 0) { showToast('Nhập đầy đủ thông tin', 'warn'); return; }
  saveChiPhiEntry({ id: 'cp_' + Date.now(), loai, moTa, soTien, ngay, date: ngay });
  closeModal('m-expense');
  showToast('Đã lưu chi phí');
  renderDashboard();
}

function renderDashSoQuy(d) {
  const df = dashState.dateFilter || 'thismonth';
  const { month, year } = dashState;
  const { from: dateFrom, to: dateTo } = getDateFilterRange();
  const dateFromObj = parseD(dateFrom);
  const dateToObj = parseD(dateTo);

  // Revenue from orders (hoan)
  const orders = (db.don || []).filter(o => isHoanOrder(o));
  const monthOrders = orders.filter(o => {
    const lay = parseD(o.Ngay_Lay); if (!lay) return false;
    return lay >= dateFromObj && lay <= dateToObj;
  });
  const totalRevenue = monthOrders.reduce((s, o) => {
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const exp = Number(o.chiphi || 0);
    return s + (gross - exp);
  }, 0);

  // Thu khác
  const thuKhac = getThuKhacEntries().filter(e => {
    const d2 = parseD(e.date); if (!d2) return false;
    return d2 >= dateFromObj && d2 <= dateToObj;
  });
  const totalThuKhac = thuKhac.reduce((s, e) => s + Number(e.soTien || 0), 0);

  // Chi phí
  const chiPhi = getChiPhiEntries().filter(e => {
    const d2 = parseD(e.date); if (!d2) return false;
    return d2 >= dateFromObj && d2 <= dateToObj;
  });
  const totalChiPhi = chiPhi.reduce((s, e) => s + Number(e.soTien || 0), 0);

  const tongThu = totalRevenue + totalThuKhac;
  const canBang = tongThu - totalChiPhi;

  // Group chi phi by loai
  const chiByLoai = {};
  chiPhi.forEach(e => { chiByLoai[e.loai] = (chiByLoai[e.loai] || 0) + Number(e.soTien || 0); });

  // Group by date for chart
  const thuByDate = {};
  monthOrders.forEach(o => {
    const iso = o.Ngay_Lay;
    const gross = donTienThueVay(o) + donTienThuePK(o);
    const exp = Number(o.chiphi || 0);
    thuByDate[iso] = (thuByDate[iso] || 0) + (gross - exp);
  });
  thuKhac.forEach(e => {
    const iso = e.date;
    thuByDate[iso] = (thuByDate[iso] || 0) + Number(e.soTien || 0);
  });

  const chiByDate = {};
  chiPhi.forEach(e => {
    const iso = e.date;
    chiByDate[iso] = (chiByDate[iso] || 0) + Number(e.soTien || 0);
  });

  return `
${renderDashDateFilter()}

<!-- Summary Cards -->
<div class="dash-summary-cards">
  <div class="dash-summary-card income">
    <div class="dash-summary-icon">💰</div>
    <div class="dash-summary-val">${fmtVND(tongThu)}</div>
    <div class="dash-summary-label">Tổng thu</div>
  </div>
  <div class="dash-summary-card expense">
    <div class="dash-summary-icon">💸</div>
    <div class="dash-summary-val">${fmtVND(totalChiPhi)}</div>
    <div class="dash-summary-label">Tổng chi</div>
  </div>
  <div class="dash-summary-card balance">
    <div class="dash-summary-icon">📊</div>
    <div class="dash-summary-val">${fmtVND(canBang)}</div>
    <div class="dash-summary-label">Cân bằng</div>
  </div>
</div>

<!-- Income vs Expense Chart -->
<div class="dash-section">
  <div class="dash-section-title">Thu vs Chi theo ngày</div>
  <div class="dash-chart-wrap" style="height:200px;background:var(--bg-card);border-radius:12px;padding:8px;box-shadow:var(--glass-shadow)">
    <canvas id="dash-soquy-chart"></canvas>
  </div>
</div>

<!-- Quick Actions -->
<div class="dash-section" style="display:flex;gap:8px">
  <button class="btn primary" onclick="openAddThuKhacModal()" style="flex:1">💰 Thêm thu khác</button>
  <button class="btn secondary" onclick="openAddChiPhiModal()" style="flex:1">💸 Thêm chi phí</button>
</div>

<!-- Chi phí breakdown -->
${chiPhi.length > 0 ? `
<div class="dash-section">
  <div class="dash-section-title">Chi phí</div>
  <div class="dash-expense-list">
    ${Object.entries(chiByLoai).map(([loai, amount]) => `
    <div class="dash-expense-row">
      <div class="dash-expense-loai">${loai}</div>
      <div class="dash-expense-amount">${fmtVND(amount)}</div>
    </div>`).join('')}
  </div>
  <div class="dash-expense-entries">
    ${chiPhi.map(e => `
    <div class="dash-expense-entry" onclick="if(confirm('Xóa khoản chi này?')){deleteChiPhiEntry('${e.id}');renderDashboard();}">
      <span class="dash-expense-date">${e.date}</span>
      <span class="dash-expense-loai-small">${e.loai}</span>
      <span class="dash-expense-note">${e.moTa}</span>
      <span class="dash-expense-amount-small">-${fmtVND(e.soTien)}</span>
      <span class="dash-expense-del">🗑️</span>
    </div>`).join('')}
  </div>
</div>
` : '<div class="dash-section"><p class="muted" style="text-align:center;padding:16px">Chưa có chi phí</p></div>'}

<!-- Thu khác -->
${thuKhac.length > 0 ? `
<div class="dash-section">
  <div class="dash-section-title">Thu khác</div>
  <div class="dash-expense-entries">
    ${thuKhac.map(e => `
    <div class="dash-expense-entry" style="border-left:3px solid var(--green)" onclick="if(confirm('Xóa khoản thu này?')){deleteThuKhacEntry('${e.id}');renderDashboard();}">
      <span class="dash-expense-date">${e.date}</span>
      <span class="dash-expense-note">${e.moTa}</span>
      <span class="dash-expense-amount-small" style="color:var(--green)">+${fmtVND(e.soTien)}</span>
      <span class="dash-expense-del">🗑️</span>
    </div>`).join('')}
  </div>
</div>
` : ''}
`;
}

// ============================================================
// SỔ QUỸ CHART
// ============================================================
function renderDashSoQuyChart() {
  const canvas = document.getElementById('dash-soquy-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = rect.width || 320;
  const H = rect.height || 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const df = dashState.dateFilter || 'thismonth';
  const { from: dateFrom, to: dateTo } = getDateFilterRange();

  // Build date labels
  const labels = [];
  const incomeData = [];
  const expenseData = [];
  let cursor = parseD(dateFrom);
  const end = parseD(dateTo);
  const maxDays = 31;
  let days = 0;
  while (cursor <= end && days < maxDays) {
    const iso = isoOf(cursor);
    labels.push(cursor.getDate() + '/' + (cursor.getMonth() + 1));
    // Income for this day
    const orders = (db.don || []).filter(o => isHoanOrder(o) && o.Ngay_Lay === iso);
    let income = 0;
    orders.forEach(o => {
      income += donTienThueVay(o) + donTienThuePK(o) - Number(o.chiphi || 0);
    });
    const thuKhac = getThuKhacEntries().filter(e => e.date === iso);
    income += thuKhac.reduce((s, e) => s + Number(e.soTien || 0), 0);
    incomeData.push(income);
    // Expense for this day
    const chiPhi = getChiPhiEntries().filter(e => e.date === iso);
    expenseData.push(chiPhi.reduce((s, e) => s + Number(e.soTien || 0), 0));
    cursor = addD(cursor, 1);
    days++;
  }

  if (labels.length === 0) {
    ctx.clearRect(0, 0, W, H);
    return;
  }

  const maxVal = Math.max(...incomeData.map(Math.abs), ...expenseData.map(Math.abs), 1);
  const padL = 50, padR = 10, padT = 20, padB = 30;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const stepX = cW / Math.max(labels.length - 1, 1);
  const yScale = (v) => padT + cH - (v / maxVal) * cH;

  // Grid lines
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (cH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    // Y labels
    const val = Math.round(maxVal * (1 - i / 4));
    ctx.fillStyle = '#AEAEB2';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'right';
    ctx.fillText(fmtVND(val), padL - 4, y + 3);
  }
  // X labels
  const skip = Math.max(1, Math.floor(labels.length / 7));
  labels.forEach((l, i) => {
    if (i % skip !== 0 && i !== labels.length - 1) return;
    const x = padL + i * stepX;
    ctx.fillStyle = '#AEAEB2';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(l, x, H - 8);
  });

  // Draw income area
  const drawAreaLine = (data, color) => {
    const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
    grad.addColorStop(0, color.replace('1)', '0.3)').replace('rgb', 'rgba'));
    grad.addColorStop(1, color.replace('1)', '0)').replace('rgb', 'rgba'));
    ctx.beginPath();
    ctx.moveTo(padL, padT + cH);
    data.forEach((v, i) => {
      const x = padL + i * stepX;
      const y = yScale(v);
      if (i === 0) ctx.lineTo(x, y);
      else {
        const prevX = padL + (i - 1) * stepX;
        const prevY = yScale(data[i - 1]);
        const cpx = (prevX + x) / 2;
        ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
      }
    });
    ctx.lineTo(padL + (data.length - 1) * stepX, padT + cH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // Line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = padL + i * stepX;
      const y = yScale(v);
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = padL + (i - 1) * stepX;
        const prevY = yScale(data[i - 1]);
        const cpx = (prevX + x) / 2;
        ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
      }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  drawAreaLine(incomeData, 'rgb(52, 199, 89)');  // green
  drawAreaLine(expenseData, 'rgb(255, 59, 48)'); // red

  // Legend
  ctx.font = '11px Plus Jakarta Sans';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#34C759';
  ctx.fillRect(padL, H - 22, 10, 3);
  ctx.fillStyle = '#636366';
  ctx.fillText('Thu', padL + 14, H - 18);
  ctx.fillStyle = '#FF3B30';
  ctx.fillRect(padL + 50, H - 22, 10, 3);
  ctx.fillStyle = '#636366';
  ctx.fillText('Chi', padL + 64, H - 18);
}

// ============================================================
// TAB 4: BÁO CÁO
// ============================================================
function renderDashBaoCao(d) {
  const subTab = dashState.baocaoSubTab || 'tonghop';
  const df = dashState.dateFilter || 'thismonth';
  const { month, year } = dashState;
  const today = new Date(); today.setHours(0,0,0,0);
  const { from: dateFrom, to: dateTo } = getDateFilterRange();
  const monthStart = parseD(dateFrom);
  const monthEnd = parseD(dateTo);

  // Calculate daily data for charts
  const orders = (db.don || []).filter(o => isHoanOrder(o));
  const dayData = {};
  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const iso = new Date(year, month - 1, day).toISOString().slice(0, 10);
    dayData[iso] = { revenue: 0, count: 0, chi: 0 };
  }

  orders.filter(o => {
    const lay = parseD(o.Ngay_Lay); if (!lay) return false;
    return lay >= monthStart && lay <= monthEnd;
  }).forEach(o => {
    const iso = o.Ngay_Lay;
    if (dayData[iso]) {
      const gross = donTienThueVay(o) + donTienThuePK(o);
      const exp = Number(o.chiphi || 0);
      dayData[iso].revenue += (gross - exp);
      dayData[iso].count++;
    }
  });

  const chiPhi = getChiPhiEntries().filter(e => {
    const d2 = parseD(e.date); if (!d2) return false;
    return d2 >= monthStart && d2 <= monthEnd;
  });
  chiPhi.forEach(e => {
    const iso = e.date;
    if (dayData[iso]) dayData[iso].chi += Number(e.soTien || 0);
  });

  const tongThu = Object.values(dayData).reduce((s, dd) => s + dd.revenue, 0);
  const tongChi = chiPhi.reduce((s, e) => s + Number(e.soTien || 0), 0);
  const tongDon = Object.values(dayData).reduce((s, dd) => s + dd.count, 0);
  const canBang = tongThu - tongChi;

  // Days elapsed in range
  const daysElapsed = Math.max(1, Math.round((monthEnd - monthStart) / (1000 * 60 * 60 * 24)) + 1);
  const avgRev = daysElapsed > 0 ? Math.round(tongThu / daysElapsed) : 0;
  const avgChi = daysElapsed > 0 ? Math.round(tongChi / daysElapsed) : 0;

  return `
<!-- SUB-TABS -->
<div class="dash-sub-tabs">
  <button class="dash-sub-tab ${subTab==='tonghop'?'active':''}" onclick="setDashBaocaoSubTab('tonghop')">📋 Cuối ngày</button>
  <button class="dash-sub-tab ${subTab==='banhang'?'active':''}" onclick="setDashBaocaoSubTab('banhang')">📈 Bán hàng</button>
  <button class="dash-sub-tab ${subTab==='taichinh'?'active':''}" onclick="setDashBaocaoSubTab('taichinh')">💰 Tài chính</button>
</div>

${subTab === 'tonghop' ? `
<!-- 4a: Báo cáo cuối ngày tổng hợp -->
<div class="dash-section">
  <div class="dash-section-title">Tổng kết thu chi</div>
  <div class="dash-pnl-hero" style="margin-bottom:16px">
    <div class="dash-pnl-col">
      <div class="dash-pnl-label">Tổng thu</div>
      <div class="dash-pnl-val accent">${fmtVND(tongThu)}</div>
    </div>
    <div class="dash-pnl-sep"></div>
    <div class="dash-pnl-col">
      <div class="dash-pnl-label">Tổng chi</div>
      <div class="dash-pnl-val">${fmtVND(tongChi)}</div>
    </div>
    <div class="dash-pnl-sep"></div>
    <div class="dash-pnl-col">
      <div class="dash-pnl-label">Cân bằng</div>
      <div class="dash-pnl-val" style="color:${canBang>=0?'var(--green)':'var(--red)'}">${fmtVND(canBang)}</div>
    </div>
  </div>
  <div class="dash-metric-row" style="grid-template-columns:repeat(3,1fr)">
    <div class="dash-metric-card">
      <div class="dash-metric-val">${tongDon}</div>
      <div class="dash-metric-label">Tổng đơn hoàn cọc</div>
      <div class="dash-metric-sub">Tháng ${month}</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-val">${fmtVND(tongDon > 0 ? Math.round(tongThu / tongDon) : 0)}</div>
      <div class="dash-metric-label">AOV</div>
      <div class="dash-metric-sub">Trung bình/đơn</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-val">${fmtVND(avgRev)}</div>
      <div class="dash-metric-label">TB/ngày</div>
      <div class="dash-metric-sub">${daysElapsed} ngày đã qua</div>
    </div>
  </div>
</div>

<!-- Chi tiết chi phí -->
<div class="dash-section">
  <div class="dash-section-title">Chi phí chi tiết</div>
  ${chiPhi.length === 0 ? '<p class="muted" style="text-align:center;padding:16px">Chưa có chi phí</p>' : `
  <div class="dash-table-card">
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead><tr><th>Ngày</th><th>Loại</th><th>Mô tả</th><th>Số tiền</th></tr></thead>
        <tbody>
          ${chiPhi.map(e => `<tr>
            <td>${e.date}</td>
            <td>${e.loai}</td>
            <td>${e.moTa}</td>
            <td class="dash-money">${fmtVND(e.soTien)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`}
</div>
` : ''}

${subTab === 'banhang' ? `
<!-- 4b: Báo cáo bán hàng -->
<div class="dash-section">
  <div class="dash-section-title">Doanh thu & Chi phí theo ngày — Tháng ${month}/${year}</div>
  <div class="dash-chart-wrap" style="height:220px">
    <canvas id="dash-rev-chart"></canvas>
    <div class="dash-chart-tooltip" id="dash-rev-tooltip"></div>
  </div>
  <div class="dash-metric-row" style="grid-template-columns:repeat(4,1fr);margin-top:8px">
    <div class="dash-metric-card">
      <div class="dash-metric-val accent">${fmtVND(tongThu)}</div>
      <div class="dash-metric-label">Doanh thu</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-val">${fmtVND(tongChi)}</div>
      <div class="dash-metric-label">Chi phí</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-val" style="color:${canBang>=0?'var(--green)':'var(--red)'}">${fmtVND(canBang)}</div>
      <div class="dash-metric-label">Lợi nhuận</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-val">${tongDon}</div>
      <div class="dash-metric-label">Đơn</div>
    </div>
  </div>
</div>
` : ''}

${subTab === 'taichinh' ? `
<!-- 4c: Báo cáo tài chính -->
<div class="dash-section">
  <div class="dash-section-title">P&L Summary — Tháng ${month}/${year}</div>
  <div class="dash-pnl-hero" style="margin-bottom:16px">
    <div class="dash-pnl-col">
      <div class="dash-pnl-label">Tổng thu</div>
      <div class="dash-pnl-val accent">${fmtVND(tongThu)}</div>
    </div>
    <div class="dash-pnl-sep"></div>
    <div class="dash-pnl-col">
      <div class="dash-pnl-label">Tổng chi</div>
      <div class="dash-pnl-val">${fmtVND(tongChi)}</div>
    </div>
    <div class="dash-pnl-sep"></div>
    <div class="dash-pnl-col">
      <div class="dash-pnl-label">Profit</div>
      <div class="dash-pnl-val" style="color:${canBang>=0?'var(--green)':'var(--red)'}">${fmtVND(canBang)}</div>
      <div class="dash-pnl-sub">${tongThu > 0 ? Math.round(canBang/tongThu*100) : 0}% margin</div>
    </div>
  </div>

  ${chiPhi.length > 0 ? `
  <div class="dash-section-title" style="font-size:12px;margin-bottom:8px">Chi phí theo loại</div>
  <div class="dash-pnl-bar-wrap">
    ${Object.entries(
      chiPhi.reduce((acc, e) => { acc[e.loai] = (acc[e.loai] || 0) + Number(e.soTien || 0); return acc; }, {})
    ).map(([loai, amount]) => {
      const pct = tongChi > 0 ? Math.round(amount / tongChi * 100) : 0;
      return `<div class="dash-pnl-bar-row">
        <span class="dash-pnl-bar-label">${loai}</span>
        <div class="dash-pnl-bar-track"><div class="dash-pnl-bar-fill ship" style="width:${pct}%"></div></div>
        <span class="dash-pnl-bar-val">${fmtVND(amount)} (${pct}%)</span>
      </div>`;
    }).join('')}
  </div>
  ` : ''}
</div>
` : ''}
`;
}

function setDashBaocaoSubTab(tab) { dashState.baocaoSubTab = tab; renderDashboard(); }

// ============================================================
// TAB 2: KHO VÁY & PK
// ============================================================
function renderDashKhoVayPK(d) {
  const subTab = dashState.khoSubTab || 'overview';
  const { month, year } = dashState;
  const { from: dateFrom, to: dateTo } = getDateFilterRange();
  const dateFromObj = parseD(dateFrom);
  const dateToObj = parseD(dateTo);
  const orders = (db.don || []).filter(o => isHoanOrder(o));

  // Calculate BCG data for dresses - use date filter range
  const thisStart = dateFromObj;
  const thisEnd = dateToObj;
  // Previous period (same length before)
  const prevEnd = addD(thisStart, -1);
  const prevLen = Math.round((thisEnd - thisStart) / (1000 * 60 * 60 * 24));
  const prevStart = addD(prevEnd, -prevLen);

  const countDress = (start, end) => {
    const counts = {};
    orders.filter(o => {
      const lay = parseD(o.Ngay_Lay); return lay && lay >= start && lay <= end;
    }).forEach(o => {
      (Array.isArray(o.dhvs) ? o.dhvs : []).forEach(x => {
        const k = x.Ma_Vay || x.vay; if (k) counts[k] = (counts[k] || 0) + 1;
      });
    });
    return counts;
  };

  const thisCounts = countDress(thisStart, thisEnd);
  const prevCounts = countDress(prevStart, prevEnd);
  const totalThisMonth = Object.values(thisCounts).reduce((s, v) => s + v, 0);

  const vayList = db.vay || [];
  const pkList = db.pk || [];
  const busyToday = new Set();
  const today = new Date(); today.setHours(0,0,0,0);
  (db.don || []).filter(o => {
    if (isHoanOrder(o)) return false;
    const lay = parseD(o.Ngay_Lay); const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!lay || !tra) return false;
    return lay <= today && tra >= today;
  }).forEach(o => {
    (Array.isArray(o.dhvs) ? o.dhvs : []).forEach(x => {
      const k = x.Ma_Vay || x.vay; if (k) busyToday.add(k);
    });
  });

  const totalVay = vayList.length;
  const busyVay = busyToday.size;
  const totalPk = pkList.length;
  const busyPk = new Set();
  (db.don || []).filter(o => {
    if (isHoanOrder(o)) return false;
    const lay = parseD(o.Ngay_Lay); const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!lay || !tra) return false;
    return lay <= today && tra >= today;
  }).forEach(o => {
    (Array.isArray(o.dhvs) ? o.dhvs : []).forEach(x => {
      const k = x.Ma_PK || x.pk; if (k) busyPk.add(k);
    });
  });

  // BCG for dresses
  const maxCount = Math.max(...Object.values(thisCounts), 1);
  const topVays = Object.entries(thisCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, cnt]) => {
      const v = vayById.get(key);
      const prevCnt = prevCounts[key] || 0;
      const growth = prevCnt > 0 ? cnt / prevCnt : cnt > 0 ? 2 : 0.5;
      const share = totalThisMonth > 0 ? cnt / totalThisMonth : 0;
      const medianShare = 0.05;
      let bcg = '';
      let bcgLabel = '';
      let bcgColor = '';
      if (growth >= 1 && share >= medianShare) { bcg = '⭐'; bcgLabel = 'Star'; bcgColor = 'var(--green)'; }
      else if (growth < 1 && share >= medianShare) { bcg = '💰'; bcgLabel = 'Cash Cow'; bcgColor = 'var(--accent)'; }
      else if (growth >= 1 && share < medianShare) { bcg = '❓'; bcgLabel = 'Question'; bcgColor = 'var(--amber)'; }
      else { bcg = '🐕'; bcgLabel = 'Dog'; bcgColor = 'var(--text-muted)'; }
      return { ten: v ? v.Ten_Vay : key, key, count: cnt, share, growth, bcg, bcgLabel, bcgColor };
    });

  // BCG for PK (simplified - count by pk in orders)
  const pkCounts = {};
  orders.forEach(o => {
    const lay = parseD(o.Ngay_Lay); if (!lay || lay < thisStart || lay > thisEnd) return;
    (Array.isArray(o.phukiens) ? o.phukiens : []).forEach(x => {
      const k = x.Ma_PK || x.pk; if (k) pkCounts[k] = (pkCounts[k] || 0) + 1;
    });
  });
  const totalPkMonth = Object.values(pkCounts).reduce((s, v) => s + v, 0);
  const topPKs = Object.entries(pkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, cnt]) => {
      const p = pkById.get(key);
      const share = totalPkMonth > 0 ? cnt / totalPkMonth : 0;
      return { ten: p ? p.Ten_PK : key, key, count: cnt, share };
    });

  return `
${renderDashDateFilter()}

<!-- SUB-TABS -->
<div class="dash-sub-tabs">
  <button class="dash-sub-tab ${subTab==='overview'?'active':''}" onclick="setDashKhoSubTab('overview')">📊 Tổng quan</button>
  <button class="dash-sub-tab ${subTab==='topvay'?'active':''}" onclick="setDashKhoSubTab('topvay')">👗 Top 20 váy</button>
  <button class="dash-sub-tab ${subTab==='toppk'?'active':''}" onclick="setDashKhoSubTab('toppk')">💍 Top 20 PK</button>
</div>

${subTab === 'overview' ? `
<!-- 2a: Overview -->
<div class="dash-section">
  <div class="dash-inv-hero">
    <div class="dash-inv-card">
      <div class="dash-inv-big">${totalVay}</div>
      <div class="dash-inv-label">Tổng váy</div>
      <div class="dash-inv-sub">${busyVay} đang thuê · ${totalVay - busyVay} trống</div>
    </div>
    <div class="dash-inv-divider"></div>
    <div class="dash-inv-card">
      <div class="dash-inv-big">${totalPk}</div>
      <div class="dash-inv-label">Tổng phụ kiện</div>
      <div class="dash-inv-sub">${busyPk.size} đang thuê · ${totalPk - busyPk.size} trống</div>
    </div>
  </div>
  <div class="dash-chart-wrap" style="height:160px;margin-top:16px">
    <canvas id="dash-inv-chart"></canvas>
  </div>
</div>
` : ''}

${subTab === 'topvay' ? `
<!-- 2b: Top 20 váy + BCG -->
<div class="dash-section">
  <div class="dash-section-title">Top 20 váy — Tháng ${month}/${year}</div>
  <div class="dash-table-card">
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead><tr><th>#</th><th>Tên váy</th><th>Lần thuê</th><th>Share</th><th>Growth</th><th>BCG</th></tr></thead>
        <tbody>
          ${topVays.length === 0 ? `
          <tr><td colspan="6">
            <div class="dash-empty-state">
              <div class="dash-empty-icon">📊</div>
              <div class="dash-empty-title">Chưa có dữ liệu thuê tháng này</div>
              <div class="dash-empty-desc">Top váy sẽ hiển thị khi có đơn thuê trong tháng ${month}/${year}</div>
              <button class="dash-empty-btn" onclick="openNewOrder()">+ Tạo đơn mới</button>
            </div>
          </td></tr>` : topVays.map((v, i) => `
          <tr>
            <td class="dash-rank">${i+1}</td>
            <td class="dash-vay-name">${v.ten}</td>
            <td><span class="dash-count-badge">${v.count}</span></td>
            <td class="muted">${Math.round(v.share * 100)}%</td>
            <td class="${v.growth >= 1 ? 'pos' : 'neg'}">${v.growth >= 1 ? '▲' : '▼'} ${Math.round(Math.abs(v.growth - 1) * 100)}%</td>
            <td><span class="dash-bcg-badge" style="background:${v.bcgColor}20;color:${v.bcgColor}">${v.bcg} ${v.bcgLabel}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="dash-bcg-legend">
      <span><span style="color:var(--green)">⭐</span> Star</span>
      <span><span style="color:var(--accent)">💰</span> Cash Cow</span>
      <span><span style="color:var(--amber)">❓</span> Question</span>
      <span style="color:var(--text-muted)">🐕 Dog</span>
    </div>
  </div>
</div>
` : ''}

${subTab === 'toppk' ? `
<!-- 2c: Top 20 PK -->
<div class="dash-section">
  <div class="dash-section-title">Top 20 phụ kiện — Tháng ${month}/${year}</div>
  <div class="dash-table-card">
    <div class="dash-table-wrap">
      <table class="dash-table">
        <thead><tr><th>#</th><th>Tên phụ kiện</th><th>Lần thuê</th><th>Share</th></tr></thead>
        <tbody>
          ${topPKs.length === 0 ? `
          <tr><td colspan="4">
            <div class="dash-empty-state">
              <div class="dash-empty-icon">💍</div>
              <div class="dash-empty-title">Chưa có dữ liệu</div>
              <div class="dash-empty-desc">Top phụ kiện sẽ hiển thị khi có đơn thuê trong tháng ${month}/${year}</div>
            </div>
          </td></tr>` : topPKs.map((p, i) => `
          <tr>
            <td class="dash-rank">${i+1}</td>
            <td>${p.ten}</td>
            <td><span class="dash-count-badge">${p.count}</span></td>
            <td class="muted">${Math.round(p.share * 100)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>
` : ''}
`;
}

function setDashKhoSubTab(tab) { dashState.khoSubTab = tab; renderDashboard(); }

// --- Calculate daily revenue for a month ---
function calculateDashboardRevenue(month, year) {
  const orders = (db.don || []).filter(o => isHoanOrder(o));
  const daily = {};
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const key = date.toISOString().slice(0, 10);
    daily[key] = 0;
  }

  orders.forEach(o => {
    const d = parseD(o.Ngay_Lay);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    if (daily.hasOwnProperty(key)) {
      const gross = donTienThueVay(o) + donTienThuePK(o);
      const expenses = Number(o.chiphi || 0);
      daily[key] += (gross - expenses);
    }
  });

  return { daily };
}

function renderDashBarChart() {
  const canvas = $('#dash-rev-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { month, year } = dashState;
  const revData = calculateDashboardRevenue(month, year);

  // Build area data for last 14 days
  const days = 14;
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, 1);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.getDate());
    values.push(revData.daily[key] || 0);
  }

  const W = canvas.offsetWidth * 2;
  const H = 180 * 2;
  canvas.width = W; canvas.height = H;
  ctx.scale(2, 2);
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  const padL = 10, padR = 10, padT = 16, padB = 28;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxV = Math.max(...values, 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= 3; i++) {
    const y = padT + (chartH * i / 3);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // X labels
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < labels.length; i += 2) {
    ctx.fillText(labels[i], padL + (chartW * i / (labels.length - 1)), h - 6);
  }

  if (values.every(v => v === 0)) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '13px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Không có dữ liệu', w / 2, h / 2);
    return;
  }

  // Area path
  const pts = values.map((v, i) => ({
    x: padL + (chartW * i / (values.length - 1)),
    y: padT + chartH - (v / maxV) * chartH
  }));

  // Smooth bezier curve
  function smoothPath(pts) {
    let p = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cpX = (pts[i].x + pts[i + 1].x) / 2;
      p += ` Q ${pts[i].x},${pts[i].y} ${cpX},${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    p += ` L ${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
    p += ` L ${pts[pts.length - 1].x},${padT + chartH}`;
    p += ` L ${pts[0].x},${padT + chartH} Z`;
    return p;
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(102,126,234,0.35)');
  grad.addColorStop(1, 'rgba(102,126,234,0.02)');

  ctx.beginPath();
  ctx.fillStyle = grad;
  const path = new Path2D(smoothPath(pts));
  ctx.fill(path);

  // Line stroke
  ctx.beginPath();
  ctx.strokeStyle = '#667eea';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  let lineP = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cpX = (pts[i].x + pts[i + 1].x) / 2;
    lineP += ` Q ${pts[i].x},${pts[i].y} ${cpX},${(pts[i].y + pts[i + 1].y) / 2}`;
  }
  lineP += ` L ${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  ctx.stroke(new Path2D(lineP));

  // Dots
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#667eea';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function renderDashKhoVayDonut() {
  const canvas = $('#dash-inv-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { month, year } = dashState;
  const vayList = db.vay || [];
  const pkList = db.pk || [];
  const today = new Date(); today.setHours(0,0,0,0);

  const busyV = new Set(), busyP = new Set();
  (db.don || []).filter(o => {
    if (isHoanOrder(o)) return false;
    const lay = parseD(o.Ngay_Lay); const tra = ngayTraThuc(o.Goi_Thue, o.Ngay_Lay);
    if (!lay || !tra) return false;
    return lay <= today && tra >= today;
  }).forEach(o => {
    (Array.isArray(o.dhvs) ? o.dhvs : []).forEach(x => {
      const k = x.Ma_Vay || x.vay; if (k) busyV.add(k);
    });
    (Array.isArray(o.phukiens) ? o.phukiens : []).forEach(x => {
      const k = x.Ma_PK || x.pk; if (k) busyP.add(k);
    });
  });

  const data = [
    { label: 'Váy bận', val: busyV.size, color: '#d4af37' },
    { label: 'Váy trống', val: Math.max(0, vayList.length - busyV.size), color: '#e5e7eb' },
    { label: 'PK bận', val: busyP.size, color: '#3b82f6' },
    { label: 'PK trống', val: Math.max(0, pkList.length - busyP.size), color: '#f3f4f6' },
  ];

  const W = canvas.offsetWidth * 2;
  const H = 140 * 2;
  canvas.width = W; canvas.height = H;
  ctx.scale(2, 2);
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  const cx = w * 0.3, cy = h / 2, r = Math.min(h / 2 - 8, 50);

  let startAngle = -Math.PI / 2;
  const total = data.reduce((s, d) => s + d.val, 0) || 1;
  data.forEach(d => {
    const slice = (d.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();
    startAngle += slice;
  });

  // Legend on right
  ctx.font = '10px Plus Jakarta Sans, sans-serif';
  let legendY = 10;
  data.forEach(d => {
    ctx.fillStyle = d.color;
    ctx.fillRect(w * 0.62, legendY, 10, 10);
    ctx.fillStyle = '#374151';
    ctx.fillText(d.label + ': ' + d.val, w * 0.62 + 14, legendY + 9);
    legendY += 18;
  });
}

// ============================================================
// BÁO CÁO CHART — Grouped Bar Chart
// ============================================================
function renderDashBaoCaoChart() {
  const canvas = document.getElementById('dash-rev-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = rect.width || 320;
  const H = rect.height || 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const df = dashState.dateFilter || 'thismonth';
  const { from: dateFrom, to: dateTo } = getDateFilterRange();
  const monthStart = parseD(dateFrom);
  const monthEnd = parseD(dateTo);

  // Build day labels based on filter
  const labels = [];
  const revenueData = [];
  const expenseData = [];
  let cursor = parseD(dateFrom);
  const maxDays = 31;
  let days = 0;
  while (cursor <= monthEnd && days < maxDays) {
    const iso = isoOf(cursor);
    labels.push(cursor.getDate() + '/' + (cursor.getMonth() + 1));
    // Revenue
    const orders = (db.don || []).filter(o => isHoanOrder(o) && o.Ngay_Lay === iso);
    let rev = 0;
    orders.forEach(o => {
      rev += donTienThueVay(o) + donTienThuePK(o) - Number(o.chiphi || 0);
    });
    revenueData.push(rev);
    // Expense
    const chiPhi = getChiPhiEntries().filter(e => e.date === iso);
    expenseData.push(chiPhi.reduce((s, e) => s + Number(e.soTien || 0), 0));
    cursor = addD(cursor, 1);
    days++;
  }

  if (labels.length === 0) {
    ctx.clearRect(0, 0, W, H);
    return;
  }

  const maxVal = Math.max(...revenueData, ...expenseData, 1);
  const padL = 50, padR = 10, padT = 20, padB = 30;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const groupW = cW / Math.max(labels.length, 1);
  const barW = Math.min(12, groupW * 0.35);
  const yScale = (v) => padT + cH - (v / maxVal) * cH;

  // Grid
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (cH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    const val = Math.round(maxVal * (1 - i / 4));
    ctx.fillStyle = '#AEAEB2';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'right';
    ctx.fillText(fmtVND(val), padL - 4, y + 3);
  }

  // Bars
  labels.forEach((l, i) => {
    const x = padL + i * groupW + groupW * 0.2;
    const revH = (revenueData[i] / maxVal) * cH;
    const chiH = (expenseData[i] / maxVal) * cH;
    // Revenue bar (green)
    ctx.fillStyle = 'rgba(52,199,89,0.8)';
    ctx.beginPath();
    ctx.roundRect(x, yScale(revenueData[i]), barW, revH, [4, 4, 0, 0]);
    ctx.fill();
    // Expense bar (red)
    ctx.fillStyle = 'rgba(255,59,48,0.8)';
    ctx.beginPath();
    ctx.roundRect(x + barW + 2, yScale(expenseData[i]), barW, chiH, [4, 4, 0, 0]);
    ctx.fill();
  });

  // X labels
  const skip = Math.max(1, Math.floor(labels.length / 7));
  labels.forEach((l, i) => {
    if (i % skip !== 0 && i !== labels.length - 1) return;
    const x = padL + i * groupW + groupW * 0.5;
    ctx.fillStyle = '#AEAEB2';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(l, x, H - 8);
  });

  // Legend
  ctx.font = '11px Plus Jakarta Sans';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#34C759';
  ctx.fillRect(padL, H - 22, 10, 10);
  ctx.fillStyle = '#636366';
  ctx.fillText('Thu', padL + 14, H - 14);
  ctx.fillStyle = '#FF3B30';
  ctx.fillRect(padL + 50, H - 22, 10, 10);
  ctx.fillStyle = '#636366';
  ctx.fillText('Chi', padL + 64, H - 14);
}

function renderDashPhanTich(d) {
  const gmColor = d.grossMargin >= 30 ? 'var(--green)' : d.grossMargin >= 15 ? 'var(--amber)' : 'var(--red)';
  const occColor = d.avgBusy >= 60 ? 'var(--green)' : d.avgBusy >= 40 ? 'var(--amber)' : 'var(--red)';
  const repColor = d.repeatRate >= 40 ? 'var(--green)' : d.repeatRate >= 25 ? 'var(--amber)' : 'var(--red)';
  const fitColor = d.fittingToCloseRate >= 40 ? 'var(--green)' : d.fittingToCloseRate >= 20 ? 'var(--amber)' : 'var(--red)';
  const ovColor = d.overdueRate <= 5 ? 'var(--green)' : d.overdueRate <= 15 ? 'var(--amber)' : 'var(--red)';
  const recommendations = [];
  if (d.revenueChange >= 10) recommendations.push({ icon: '📈', color: 'var(--green)', text: `Doanh thu tăng ${d.revenueChange}% so với tháng trước — tiếp tục duy trì đà tăng.` });
  else if (d.revenueChange < -10) recommendations.push({ icon: '📉', color: 'var(--red)', text: `Doanh thu giảm ${Math.abs(d.revenueChange)}% so với tháng trước — cần xem xét nguyên nhân và có giải pháp.` });
  if (d.overdueRate > 10) recommendations.push({ icon: '⚠️', color: 'var(--red)', text: `Tỷ lệ quá hạn cao (${d.overdueRate}%) — cần cải thiện quy trình thu hồi và nhắc nhở khách.` });
  else if (d.overdueRate > 5) recommendations.push({ icon: '🔔', color: 'var(--amber)', text: `Tỷ lệ quá hạn ${d.overdueRate}% — theo dõi sát và nhắc nhở khách trả đúng hạn.` });
  if (d.avgBusy < 40) recommendations.push({ icon: '👗', color: 'var(--amber)', text: `Tỷ lệ lấp đầy thấp (${d.avgBusy}%) — nhiều váy chưa được khai thác, xem xét giảm giá hoặc marketing.` });
  if (d.dressConcentrationRisk > 50) recommendations.push({ icon: '⚠️', color: 'var(--red)', text: `Top 3 váy chiếm ${d.dressConcentrationRisk}% doanh thu — rủi ro tập trung cao, cần đa dạng hoá.` });
  else if (d.dressConcentrationRisk > 35) recommendations.push({ icon: '💡', color: 'var(--amber)', text: `Top 3 váy chiếm ${d.dressConcentrationRisk}% doanh thu — giám sát và phát triển thêm các mẫu tiềm năng.` });
  if (d.fittingToCloseRate < 20 && d.totalFittingOrders > 0) recommendations.push({ icon: '🎯', color: 'var(--amber)', text: `Tỷ lệ Fitting → Chốt thấp (${d.fittingToCloseRate}%) — cải thiện trải nghiệm fitting và chốt đơn.` });
  if (d.grossMargin < 15) recommendations.push({ icon: '💸', color: 'var(--red)', text: `Gross margin thấp (${d.grossMargin}%) — cần giảm chi phí hoặc tăng giá thuê.` });
  else if (d.grossMargin >= 30) recommendations.push({ icon: '✅', color: 'var(--green)', text: `Gross margin tốt (${d.grossMargin}%) — kinh doanh có lợi nhuận tốt.` });
  if (d.repeatRate < 20 && d.totalOrders > 5) recommendations.push({ icon: '🔄', color: 'var(--amber)', text: `Khách quay lại thấp (${d.repeatRate}%) — tạo chương trình khách hàng thân thiết.` });
  if (d.neverRented && d.neverRented.length > 0) recommendations.push({ icon: '👗', color: 'var(--amber)', text: `${d.neverRented.length} váy chưa từng được thuê — cân nhắc giảm giá hoặc refresh mẫu mã.` });
  if (recommendations.length === 0) recommendations.push({ icon: '✅', color: 'var(--green)', text: 'Mọi chỉ số đều ở mức tốt — tiếp tục duy trì!' });
  return `
${renderDashDateFilter()}

<div class="dash-section">
  <div class="dash-section-title">📏 Chỉ số quan trọng</div>
  <div class="dash-metric-row" style="grid-template-columns:repeat(4,1fr)">
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">💰</span></div>
      <div class="dash-metric-val" style="color:${gmColor}">${d.grossMargin}%</div>
      <div class="dash-metric-label">Gross Margin</div>
      <div class="dash-metric-sub" style="color:${gmColor}">${d.grossMargin >= 30 ? 'Xuất sắc' : d.grossMargin >= 15 ? 'Khá tốt' : '⚠️ Cần cải thiện'}</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">📊</span></div>
      <div class="dash-metric-val" style="color:${occColor}">${d.avgBusy}%</div>
      <div class="dash-metric-label">Tỷ lệ lấp đầy</div>
      <div class="dash-metric-sub" style="color:${occColor}">${d.avgBusy >= 60 ? 'Tốt' : d.avgBusy >= 40 ? 'TB' : '⚠️ Thấp'}</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">🔄</span></div>
      <div class="dash-metric-val" style="color:${repColor}">${d.repeatRate}%</div>
      <div class="dash-metric-label">Khách quay lại</div>
      <div class="dash-metric-sub" style="color:${repColor}">${d.repeatRate >= 40 ? 'Tuyệt vời' : d.repeatRate >= 25 ? 'Khá tốt' : '⚠️ Thấp'}</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">⚠️</span></div>
      <div class="dash-metric-val" style="color:${ovColor}">${d.overdueRate}%</div>
      <div class="dash-metric-label">Tỷ lệ quá hạn</div>
      <div class="dash-metric-sub" style="color:${ovColor}">${d.overdueRate <= 5 ? 'Tốt' : d.overdueRate <= 15 ? 'Cần theo dõi' : '⚠️ Nghiêm trọng'}</div>
    </div>
  </div>
</div>
<div class="dash-section">
  <div class="dash-section-title">💰 Sức khoẻ doanh thu</div>
  <div class="dash-metric-row" style="grid-template-columns:repeat(3,1fr)">
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">📈</span><span class="dash-metric-change ${d.revenueChange>=0?'pos':'neg'}">${d.revenueChange>=0?'▲':'▼'} ${Math.abs(d.revenueChange)}%</span></div>
      <div class="dash-metric-val">${fmtVND(d.totalRevenue)}</div>
      <div class="dash-metric-label">Doanh thu tháng</div>
      <div class="dash-metric-sub">vs tháng trước</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">🏆</span></div>
      <div class="dash-metric-val">${fmtVND(d.aov)}</div>
      <div class="dash-metric-label">AOV / đơn</div>
      <div class="dash-metric-sub">Giá trị trung bình</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">💎</span></div>
      <div class="dash-metric-val">${fmtVND(d.breakEvenRevenue)}</div>
      <div class="dash-metric-label">Break-even</div>
      <div class="dash-metric-sub">Doanh thu cần hòa vốn</div>
    </div>
  </div>
</div>
<div class="dash-section">
  <div class="dash-section-title">⚙️ Hiệu quả vận hành</div>
  <div class="dash-metric-row" style="grid-template-columns:repeat(4,1fr)">
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">📊</span></div>
      <div class="dash-metric-val" style="color:${occColor}">${d.avgBusy}%</div>
      <div class="dash-metric-label">Tỷ lệ lấp đầy</div>
      <div class="dash-metric-sub">${d.activeDresses}/${d.totalDresses} váy hoạt động</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">🎯</span></div>
      <div class="dash-metric-val" style="color:${fitColor}">${d.fittingToCloseRate}%</div>
      <div class="dash-metric-label">Fitting → Chốt</div>
      <div class="dash-metric-sub">${d.fittedOrders}/${d.totalFittingOrders} fitting</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">⏱️</span></div>
      <div class="dash-metric-val">${d.avgRentalDays}</div>
      <div class="dash-metric-label">Ngày thuê TB</div>
      <div class="dash-metric-sub">Trung bình mỗi đơn</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">💧</span></div>
      <div class="dash-metric-val">${d.daysOfCashBuffer}</div>
      <div class="dash-metric-label">Cash buffer</div>
      <div class="dash-metric-sub">Ngày tiền mặt dự trữ</div>
    </div>
  </div>
</div>
<div class="dash-section">
  <div class="dash-section-title">👤 Khách hàng</div>
  <div class="dash-metric-row" style="grid-template-columns:repeat(4,1fr)">
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">🔄</span></div>
      <div class="dash-metric-val" style="color:${repColor}">${d.repeatRate}%</div>
      <div class="dash-metric-label">Khách quay lại</div>
      <div class="dash-metric-sub">${d.newCustomers} mới · ${d.returningCustomers} cũ</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">💵</span></div>
      <div class="dash-metric-val">${fmtVND(Math.round(d.avgOrdersPerCustomer * d.aov))}</div>
      <div class="dash-metric-label">LTV proxy</div>
      <div class="dash-metric-sub">${d.avgOrdersPerCustomer} đơn × AOV</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">🚚</span></div>
      <div class="dash-metric-val">${fmtVND(d.cac)}</div>
      <div class="dash-metric-label">CAC</div>
      <div class="dash-metric-sub">Chi phí/khách mới</div>
    </div>
    <div class="dash-metric-card">
      <div class="dash-metric-header"><span class="dash-metric-icon">📦</span></div>
      <div class="dash-metric-val">${d.avgOrdersPerCustomer}</div>
      <div class="dash-metric-label">Đơn/khách</div>
      <div class="dash-metric-sub">Trung bình</div>
    </div>
  </div>
</div>
<div class="dash-section">
  <div class="dash-section-title">💡 Khuyến nghị cho Phương</div>
  <div class="dash-recs">
    ${recommendations.map(r => `<div class="dash-rec-item" style="border-left:3px solid ${r.color}"><span style="margin-right:8px">${r.icon}</span><span style="color:${r.color}">${r.text}</span></div>`).join('')}
  </div>
</div>
<div class="dash-section">
  <div class="dash-section-title">🏥 Chẩn đoán sức khoẻ</div>
  <div class="dash-diagnosis-grid">
    ${d.grossMargin >= 30 ? '✅' : '⚠️'} <b>Gross Margin ${d.grossMargin}%</b> — ${d.grossMargin >= 35 ? 'Xuất sắc' : d.grossMargin >= 20 ? 'Khá tốt, cần cải thiện chi phí' : 'Cần giảm chi phí gấp'}<br>
    ${d.avgBusy >= 50 ? '✅' : '⚠️'} <b>Tỷ lệ lấp đầy ${d.avgBusy}%</b> — ${d.avgBusy >= 60 ? 'Tốt' : d.avgBusy >= 40 ? 'Cần tăng lượt thuê' : 'Nhiều váy chưa được khai thác'}<br>
    ${d.repeatRate >= 30 ? '✅' : '⚠️'} <b>Khách quay lại ${d.repeatRate}%</b> — ${d.repeatRate >= 40 ? 'Tuyệt vời' : d.repeatRate >= 25 ? 'Khá tốt' : 'Cần cải thiện chất lượng dịch vụ'}<br>
    ${d.fittingToCloseRate >= 30 ? '✅' : '⚠️'} <b>Fitting → Chốt ${d.fittingToCloseRate}%</b> — ${d.fittingToCloseRate >= 40 ? 'Tốt, fitting hiệu quả' : d.fittingToCloseRate >= 20 ? 'Cần cải thiện chốt đơn' : 'Fitting chưa hiệu quả'}<br>
    ${d.dressConcentrationRisk <= 40 ? '✅' : '⚠️'} <b>Tập trung Top 3 váy ${d.dressConcentrationRisk}%</b> — ${d.dressConcentrationRisk <= 30 ? 'Rủi ro thấp' : d.dressConcentrationRisk <= 50 ? 'Chấp nhận được' : 'Rủi ro cao — cần đa dạng hoá'}<br>
    ${d.overdueRate <= 10 ? '✅' : '⚠️'} <b>Quá hạn ${d.overdueRate}%</b> — ${d.overdueRate <= 5 ? 'Kiểm soát tốt' : d.overdueRate <= 15 ? 'Cần theo dõi' : 'Nghiêm trọng — cần xử lý ngay'}<br>
    ${d.revenueChange >= 0 ? '✅' : '⚠️'} <b>Doanh thu tháng này</b> — ${d.revenueChange >= 10 ? 'Tăng trưởng tốt' : d.revenueChange >= 0 ? 'Ổn định' : `Giảm ${Math.abs(d.revenueChange)}%`}
  </div>
</div>`;
}


function exportDashboardCSV() {
  const { month, year } = dashState;
  const d = calculateDashboardData(month, year);
  let csv = '﻿'; // BOM for UTF-8
  csv += 'DASHBOARD - Tháng ' + month + '/' + year + '\n\n';

  // KPI
  csv += '=== KPI ===\n';
  csv += 'Tổng đơn,' + d.totalOrders + '\n';
  csv += 'Doanh thu,' + d.totalRevenue + '\n';
  csv += 'Đặt cọc,' + d.totalDeposit + '\n';
  csv += 'Đang thuê,' + d.activeRentals + '\n\n';

  // Daily revenue
  csv += '=== Doanh thu theo ngày ===\n';
  csv += 'Ngày,Doanh thu\n';
  d.dailyRevenue.forEach(r => { csv += r.date + ',' + r.revenue + '\n'; });
  csv += '\n';

  // Top dresses
  csv += '=== Top Váy (Thuê nhiều) ===\n';
  csv += 'STT,Tên váy,Lần thuê,Doanh thu\n';
  d.topDresses.forEach((r, i) => { csv += (i+1) + ',' + r.ten + ',' + r.count + ',' + r.revenue + '\n'; });
  csv += '\n';

  // Customers
  csv += '=== Top Khách hàng ===\n';
  csv += 'STT,Khách,Đơn,Doanh thu\n';
  d.topCustomers.forEach((c, i) => { csv += (i+1) + ',' + c.name + ',' + c.count + ',' + c.revenue + '\n'; });
  csv += '\n';

  // Cost
  csv += '=== Chi phí & Lợi nhuận ===\n';
  csv += 'Chi phí vận chuyển,' + d.totalShip + '\n';
  csv += 'Chi phí khác,' + d.totalOther + '\n';
  csv += 'Lợi nhuận ròng,' + d.netProfit + '\n\n';

  // Forecast
  csv += '=== Dự báo ===\n';
  csv += 'Tuần tới,' + d.nextWeekOrders + '\n';
  csv += 'Tháng tới,' + d.nextMonthOrders + '\n';

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dashboard_' + month + '_' + year + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function goDetail(maDon) {
  const o = (db.don || []).find(d => (d.Ma_Don || d.id) === maDon);
  if (o) { openOrderDetail(o.Ma_Don || o.id); go('v-orders'); }
}
