const STORE = 'aura_v7';

/* ============================================================
 *  SYNC CONFIG — multi-device real-time
 *  Paste Web App URL từ Google Apps Script deploy vào đây.
 *  Xem hướng dẫn trong README_DEPLOY.md
 * ============================================================ */
const SYNC = {
 WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbx_R_hOEMbrGnOJPEFQOfQX5DPD6a7VrF6_tfkunyNR/exec',
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

let db = JSON.parse(localStorage.getItem(STORE) || '{}');
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
  if (goi === '3 ngày') return addD(lay, 3); // Trả sau 3 ngày (02→05)
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
  if (kind === 'dress' && (rec.Ma_Vay || rec.Ten_Vay)) return rec;
  if (kind === 'pk' && (rec.Ma_PK || rec.Ten_PK)) return rec;
  if (kind === 'payment' && rec.Ma_TT !== undefined) return rec;

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
    return {
      Ma_Vay: rec.ma,
      Ten_Vay: rec.ten,
      Size: rec.size,
      Gia_Vay_Goc: rec.goc,
      Gia_Thue_12h: rec.t12,
      Gia_Thue_1_Ngay: rec.t1,
      Gia_Thue_3_Ngay: rec.t3,
      Anh_Vay: rec.anh || '',
      Ghi_Chu: rec.gchu,
      So_Lan_Thue: rec.sl || 0,
      _ts: rec._ts || Date.now(),
    };
  }
  if (kind === 'pk') {
    return {
      Ma_PK: rec.ma,
      Ten_PK: rec.ten,
      Loai: rec.loai,
      So_Luong_Tong: rec.sl || 1,
      Gia_Thue_12h: rec.t12,
      Gia_Thue_1_Ngay: rec.t1,
      Gia_Thue_3_Ngay: rec.t3,
      Anh_PK: rec.anh || '',
      Ghi_Chu: rec.gchu,
      _ts: rec._ts || Date.now(),
    };
  }
  if (kind === 'payment') {
    return {
      Ma_TT: rec.id || ('TT' + Date.now()),
      Ngay_TT: rec.ngay?.slice(0, 10),
      Ma_Don: rec.ma,
      Tien_Coc: rec.tienCoc,
      Chi_Phi_Khac: rec.chiphi,
      Ghi_Chu: rec.ghichu,
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
  if (!don || !don.dhvs) return [];
  return don.dhvs.map(x => {
    // Prefer already-resolved name (from Supabase booking sync)
    if (x.Ten_Vay) return x.Ten_Vay;
    // Fall back to local dress lookup
    const key = x.Ma_Vay || x.vay;
    const v = db.vay.find(d => (d.Ma_Vay || d.ma) === key);
    return v ? (v.Ten_Vay || v.ten) : '';
  }).filter(Boolean);
}
function donTienThueVay(don) {
  if (!don) return 0;
  const g = don.Goi_Thue === '12h' ? 'Gia_Thue_12h' : don.Goi_Thue === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay';
  return (don.dhvs || []).reduce((s, x) => {
    const key = x.Ma_Vay || x.vay;
    const v = db.vay.find(d => (d.Ma_Vay || d.ma) === key);
    return s + (v ? Number(v[g] || 0) : 0);
  }, 0);
}
function donTienThuePK(don) {
  if (!don) return 0;
  const g = don.Goi_Thue === '12h' ? 'Gia_Thue_12h' : don.Goi_Thue === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay';
  return (don.Ma_PK || don.pks || []).reduce((s, id) => {
    const key = typeof id === 'object' ? (id.Ma_PK || '') : id;
    const p = db.pk.find(d => (d.Ma_PK || d.ma) === key);
    return s + (p ? Number(p[g] || 0) : 0);
  }, 0);
}
function donCocGoiY(don) {
  if (!don) return 0;
  const tong = (don.dhvs || []).reduce((s, x) => {
    const key = x.Ma_Vay || x.vay;
    const v = db.vay.find(d => (d.Ma_Vay || d.ma) === key);
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
    const has = (o.dhvs || []).some(x => (x.vay || x.Ma_Vay) === ma);
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
function toast(msg, type = '') {
  const t = el('div', { class: 'toast ' + type, text: msg });
  $('#toast-wrap').appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

/* ============================================================
 *  MODAL helpers
 * ============================================================ */
function openModal(id) { $('#' + id).classList.add('show'); }
function closeModal(id) { $('#' + id).classList.remove('show'); }
function closeAllModals() { $$('.modal').forEach(m => m.classList.remove('show')); }
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
  const titleMap = { 'v-cal': 'Lịch thuê', 'v-orders': 'Đơn hàng', 'v-kho': 'Kho váy', 'v-pk': 'Phụ kiện', 'v-avail': 'Check!', 'v-soc': 'Sổ thu/chi' };
  $('#title').textContent = titleMap[view] || '';
  $('#fab-add').style.display = (view === 'v-kho' || view === 'v-pk') ? 'flex' : 'none';
  if (view === 'v-cal') renderCal();
  else if (view === 'v-orders') renderOrders();
  else if (view === 'v-kho') renderKho();
  else if (view === 'v-pk') renderPk();
  else if (view === 'v-avail') renderAvail();
  else if (view === 'v-soc') renderSoc();
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

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(y, m, d);
    const isToday = cellDate.toDateString() === today.toDateString();
    const cellDateStr = isoOf(cellDate);

    // Count orders by type for this day
    const layOrders = db.don.filter(o => !isHoanOrder(o) && (o.Ngay_Lay || o.lay) === cellDateStr);
    const traOrders = db.don.filter(o => {
      if (o.hoan || o.Trang_Thai_Hoan_Coc) return false;
      const goi = o.Goi_Thue || o.goi;
      const tra = ngayTraThuc(goi, o.Ngay_Lay || o.lay);
      return tra && isoOf(tra) === cellDateStr;
    });
    const thueOrders = db.don.filter(o => {
      if (o.hoan || o.Trang_Thai_Hoan_Coc) return false;
      const goi = o.Goi_Thue || o.goi;
      const lay = o.Ngay_Lay || o.lay;
      const tra = ngayTraThuc(goi, lay);
      if (!tra) return false;
      return lay !== cellDateStr && isoOf(tra) !== cellDateStr &&
             statusForDate(o, cellDateStr) !== null;
    });

    const hasLay = layOrders.length > 0;
    const hasTra = traOrders.length > 0;
    const hasThue = thueOrders.length > 0;

    let indicatorsHtml = '';
    if (hasLay || hasTra || hasThue) {
      indicatorsHtml = '<div class="day-indicators">';
      if (layOrders.length > 0) indicatorsHtml += `<span class="day-dot green">${layOrders.length}</span>`;
      if (traOrders.length > 0) indicatorsHtml += `<span class="day-dot red">${traOrders.length}</span>`;
      if (thueOrders.length > 0) indicatorsHtml += `<span class="day-dot yellow">${thueOrders.length}</span>`;
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
    // Find first lay day in this month
    for (let d = 1; d <= new Date(y2, m2 + 1, 0).getDate(); d++) {
      const cellDate = new Date(y2, m2, d);
      const hasLay = db.don.some(o => {
        if (o.hoan || o.Trang_Thai_Hoan_Coc) return false;
        const lay = new Date(o.Ngay_Lay || o.lay);
        return lay.toDateString() === cellDate.toDateString();
      });
      if (hasLay) {
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
        oninput="dayViewSearch = this.value; renderDayFiltered();" />
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
  const tenVayMore = tenVay.length > 1 ? ` +${tenVay.length - 1}` : '';
  const tenPK = (o.Ma_PK || o.pks || []).map(pk => {
    const key = typeof pk === 'object' ? (pk.Ma_PK || '') : pk;
    const p = db.pk.find(x => (x.Ma_PK || x.ma) === key);
    return p ? (p.Ten_PK || p.ten) : (typeof pk === 'object' ? pk.Ten_PK : '?');
  }).filter(Boolean).join(', ') || '';
  const sdt = o.SDT || o.sdt || '';
  const ins = o.Insta_Khach || o.insta || '';
  const goi = o.Goi_Thue || o.goi || '';
  const is12h = goi === '12h';
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayTra = ngayTraThuc(goi, ngayLay);
  const ngayLayDisplay = isoToVN(ngayLay);
  const ngayTraDisplay = ngayTra ? isoToVN(ngayTra) : '—';

  // Color based on group
  const color = group === 'lay' ? '#10b981' : group === 'tra' ? '#ef4444' : '#f59e0b';
  const bgColor = group === 'lay' ? '#d1fae5' : group === 'tra' ? '#fee2e2' : '#fef3c7';

  // Dress image
  const firstDressId = (o.dhvs || [])[0]?.vay;
  const firstDress = firstDressId && db.vay.find(v => (v.Ma_Vay || v.ma) === firstDressId);
  const dressImg = firstDress?.Anh_Vay || firstDress?.anh || '';

  return `
    <div class="day-order-card" onclick="openOrderDetail('${id}')">
      <div class="day-card-left" style="background: ${bgColor}; border-left: 3px solid ${color};">
        <div class="day-card-avatar">
          ${dressImg ? `<img src="${dressImg}" alt="">` : `<span>${(tenVayPrimary[0] || 'V').toUpperCase()}</span>`}
        </div>
      </div>
      <div class="day-card-content">
        <div class="day-card-header">
          <span class="day-card-name">${escapeHtml(tenVayPrimary)}${tenVayMore}</span>
          ${is12h ? '<span class="day-card-badge badge-12h">12h</span>' : `<span class="day-card-badge">${goi}</span>`}
        </div>
        <div class="day-card-type">
          <span class="day-type-badge day-type-${(o.Trang_Thai_Don || o.type || 'Chốt thuê').replace(/\s/g, '').toLowerCase()}">${o.Trang_Thai_Don || o.type || 'Chốt thuê'}</span>
        </div>
        ${ins ? `<div class="day-card-customer">${escapeHtml(ins)}</div>` : ''}
        ${sdt ? `<div class="day-card-phone">📞 ${escapeHtml(sdt)}</div>` : ''}
        ${tenPK ? `<div class="day-card-pk">💍 ${escapeHtml(tenPK)}</div>` : ''}
        <div class="day-card-dates">
          <span class="date-chip">
            <span style="color:${color}">📦</span>
            Lấy: ${ngayLayDisplay}
          </span>
          <span class="date-chip">
            <span style="color:${color}">🔄</span>
            Trả: ${ngayTraDisplay}
          </span>
        </div>
      </div>
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
    const tenVayMore = tenVay.length > 1 ? ` +${tenVay.length - 1}` : '';
    const tenPK = (o.Ma_PK || o.pks || []).map(pk => {
      const p = db.pk.find(x => (x.Ma_PK || x.ma) === pk);
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
    const firstDress = firstDressId && db.vay.find(v => (v.Ma_Vay || v.ma) === firstDressId);
    const dressImg = firstDress?.Anh_Vay || firstDress?.anh || '';

    const card = el('div', { class: 'order-card', style: dimmed });
    card.onclick = () => openOrderDetail(o.Ma_Don || o.id);

    // Status bar ở trên card
    if (statusBarColor) {
      const statusBar = el('div', {
        class: 'order-status-bar',
        style: `background: ${statusBarColor}; padding: 6px 14px; display: flex; align-items: center; gap: 6px;`
      });
      statusBar.innerHTML = `<span style="font-size:14px">${statusIcon}</span><span style="font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.05em">${statusText}</span>`;
      card.appendChild(statusBar);
    }

    // HEAD: dress image + name + package badge
    const head = el('div', { class: 'order-card-head' });
    const imgWrap = el('div', { class: 'dress-img' });
    if (dressImg) imgWrap.appendChild(el('img', { src: dressImg, alt: '' }));
    else imgWrap.textContent = (tenVayPrimary[0] || 'V').toUpperCase();
    head.appendChild(imgWrap);
    const headText = el('div', { class: 'head-text' });
    headText.appendChild(el('div', { class: 'dress-name', text: tenVayPrimary + tenVayMore }));
    // Type badge + gói badge trên cùng dòng
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

    // BODY: tên khách + SĐT + thời gian theo format mới
    const body = el('div', { class: 'order-card-body' });
    body.appendChild(rowKV('Khách', custName, true));
    body.appendChild(rowKV('SĐT', sdt, true));
    body.appendChild(rowKV('Thời gian', `${isoToVN(ngayLay)} → ${isoToVN(ngayTra)}`, false));
    card.appendChild(body);

    // FOOT: type pill lớn, nổi bật + clickable
    const foot = el('div', { class: 'order-card-foot' });
    const typeLabel = el('span', {
      style: 'font-size:11px;color:#86868b;font-weight:500;margin-right:auto'
    });
    typeLabel.textContent = 'Loại:';
    foot.appendChild(typeLabel);

    const typePill = el('button', {
      class: 'type-pill ' + typeClass(type),
    });
    typePill.type = 'button';
    typePill.innerHTML = `<span style="font-size:10px;margin-right:4px">✏️</span>${type}`;
    typePill.onclick = (e) => {
      e.stopPropagation();
      openTypePicker(o);
    };
    foot.appendChild(typePill);

    if (o.Ma_Don || o.id) {
      const maSpan = el('span', { style: 'font-size:11px;color:#86868b;font-family:var(--font-mono);margin-left:8px' });
      maSpan.textContent = o.Ma_Don || o.id;
      foot.appendChild(maSpan);
    }
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
  if (type === 'Fitting xa') return 'FittingXa';
  if (type === 'Đặt ship') return 'DatShip';
  if (type === 'Fitting') return 'Fitting';
  return 'ChotThue';
}

function openTypePicker(o) {
  const id = o.Ma_Don || o.id;
  const types = ['Chốt thuê', 'Fitting', 'Fitting xa', 'Đặt ship'];
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
window.setOrderType = (id, type) => {
  const o = db.don.find(x => (x.Ma_Don || x.id) === id);
  if (!o) return;
  o.Trang_Thai_Don = type;
  if (o.Trang_Thai_Don === 'Đặt ship' || o.Trang_Thai_Don === 'Fitting xa') {
    // Auto-suggest Hinh_Thuc_Nhan
    o.Hinh_Thuc_Nhan = o.Hinh_Thuc_Nhan || 'Đặt ship';
  }
  save();
  closeModal('m-confirm');
  toast('Đã đổi loại đơn → ' + type, 'success');
};

/* ============================================================
 *  ORDERS VIEW
 * ============================================================ */
let curOrderFilter = 'all';
let curOrderTypeFilter = 'type-all';
let curOrderSearch = '';
function renderOrders() {
  const list = $('#order-list');
  list.innerHTML = '';
  const today = new Date();
  const todayIso = isoOf(today);

  let arr = db.don.slice();
  // Filter
  if (curOrderFilter === 'all') arr = arr.filter(o => !isHoanOrder(o));
  else if (curOrderFilter === 'today') arr = arr.filter(o => !isHoanOrder(o) && ((o.Ngay_Lay || o.lay) === todayIso || (o.Ngay_Tra || o.tra) === todayIso));
  else if (curOrderFilter === 'week') {
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    arr = arr.filter(o => {
      if (isHoanOrder(o)) return false;
      const lay = o.Ngay_Lay || o.lay;
      return lay && lay >= todayIso && lay <= isoOf(weekEnd);
    });
  }
  else if (curOrderFilter === 'preparing') arr = arr.filter(o => !isHoanOrder(o) && statusForDate(o, todayIso) === 'Chuan_Bi');
  else if (curOrderFilter === 'renting') arr = arr.filter(o => !isHoanOrder(o) && statusForDate(o, todayIso) === 'Dang_Thue');
  else if (curOrderFilter === 'returning') arr = arr.filter(o => !isHoanOrder(o) && statusForDate(o, todayIso) === 'Tra_Ve');
  else if (curOrderFilter === 'overdue') arr = arr.filter(o => !isHoanOrder(o) && statusForDate(o, todayIso) === 'Qua_Han');
  else if (curOrderFilter === 'refunded') arr = arr.filter(o => isHoanOrder(o));
  else if (curOrderFilter === 'deposited') arr = arr.filter(o => !isHoanOrder(o) && (o.Hinh_Thuc_Coc || o.coc)); // Có cọc, chưa hoàn
  else if (curOrderFilter === 'new-booking') arr = arr.filter(o => (o.Ma_Don || o.id || '').startsWith('B')); // Đơn từ form booking

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
        const v = db.vay.find(v => (v.Ma_Vay || v.ma) === x.vay);
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
    list.appendChild(el('div', { class: 'empty', html: '<div class="icon">📭</div><div class="title">Chưa có đơn nào</div><div>Bấm + để tạo đơn mới</div>' }));
    return;
  }

  // Group orders by Ngay_Lay for display
  const ordersByDate = {};
  arr.forEach(o => {
    let dateKey = o.Ngay_Lay || o.lay || 'unknown';
    // Nếu filter "Hôm nay" và đơn có Ngay_Tra = hôm nay, hiển thị dưới "Hôm nay"
    if (curOrderFilter === 'today') {
      const ngayTra = o.Ngay_Tra || o.Ngay_Tra_Thuc || o.tra;
      if (ngayTra === todayIso) dateKey = todayIso;
    }
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
      card.classList.add('stagger-item');
      card.style.animationDelay = `${i * 50}ms`;
      list.appendChild(card);
    });
  });
}

// Order card for list view - detailed with dates
function OrderCardListCard(o, refDate = new Date()) {
  const id = o.Ma_Don || o.id || '';
  const tenVay = donTenVay(o);
  const tenVayPrimary = tenVay[0] || 'Chưa chọn váy';
  const tenVayMore = tenVay.length > 1 ? ` +${tenVay.length - 1}` : '';
  const tenPK = (o.Ma_PK || o.pks || []).map(pk => {
    const key = typeof pk === 'object' ? (pk.Ma_PK || '') : pk;
    const p = db.pk.find(x => (x.Ma_PK || x.ma) === key);
    return p ? (p.Ten_PK || p.ten) : (typeof pk === 'object' ? pk.Ten_PK : '?');
  }).filter(Boolean).join(', ') || '';
  const ngayLay = o.Ngay_Lay || o.lay || '';
  const ngayLayDisplay = isoToVN(ngayLay);
  const goi = o.Goi_Thue || o.goi || '';
  const ngayTra = ngayTraThuc(goi, ngayLay);
  const ngayTraDisplay = ngayTra ? isoToVN(ngayTra) : '—';
  const sdt = o.SDT || o.sdt || '';
  const ins = o.Insta_Khach || o.insta || '';
  const is12h = goi === '12h';
  const status = statusForDate(o, isoOf(refDate));

  // Status color
  let statusColor = '#f59e0b';
  if (status === 'Chuan_Bi') statusColor = '#10b981';
  else if (status === 'Tra_Ve') statusColor = '#ef4444';
  else if (status === 'Qua_Han') statusColor = '#6b7280';
  else if (is12h && status === 'Dang_Thue_12h') statusColor = 'linear-gradient(135deg, #10b981, #ef4444)';

  // Dress image
  const firstDressId = (o.dhvs || [])[0]?.vay;
  const firstDress = firstDressId && db.vay.find(v => (v.Ma_Vay || v.ma) === firstDressId);
  const dressImg = firstDress?.Anh_Vay || firstDress?.anh || '';

  const type = o.Trang_Thai_Don || o.type || 'Chốt thuê';

  const card = document.createElement('div');
  card.className = `order-list-card status-${status === 'Chuan_Bi' ? 'lay' : status === 'Tra_Ve' ? 'tra' : status === 'Qua_Han' ? 'qua' : 'dang'}`;
  card.onclick = () => openOrderDetail(id);

  card.innerHTML = `
    <div class="olc-main-row">
      <div class="olc-avatar">
        ${dressImg ? `<img src="${dressImg}" alt="">` : `<span>${(tenVayPrimary[0] || 'V').toUpperCase()}</span>`}
      </div>
      <div class="olc-content">
        <div class="olc-header">
          <span class="olc-name">${escapeHtml(tenVayPrimary)}${tenVayMore}</span>
          ${is12h ? '<span class="olc-badge">12h</span>' : `<span class="olc-badge">${goi}</span>`}
        </div>
        <div class="olc-customer-row">
          ${ins ? `<span class="olc-customer">${escapeHtml(ins)}</span>` : ''}
          ${sdt ? `<span class="olc-phone">${escapeHtml(sdt)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="olc-dates">
      <span class="olc-date-chip lay">
        <span>📦</span> ${ngayLayDisplay}
      </span>
      <span class="olc-date-sep">→</span>
      <span class="olc-date-chip tra">
        <span>🔄</span> ${ngayTraDisplay}
      </span>
    </div>
    <div class="olc-type-row">
      <span class="olc-type-label">Loại:</span>
      <button type="button" class="type-pill ${typeClass(type)}" data-type-btn>${type}</button>
      <span class="olc-id">${id}</span>
    </div>
  `;

  // Type pill click → mở picker
  const typeBtn = card.querySelector('[data-type-btn]');
  if (typeBtn) {
    typeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTypePicker(o);
    });
  }

  return card;
}

$('#search').oninput = e => { curOrderSearch = e.target.value; renderOrders(); };
$$('#order-chips button').forEach(b => b.onclick = () => {
  $$('#order-chips button').forEach(x => x.classList.toggle('on', x === b));
  curOrderFilter = b.dataset.f;
  renderOrders();
});

$$('#order-type-chips button').forEach(b => b.onclick = () => {
  $$('#order-type-chips button').forEach(x => x.classList.toggle('on', x === b));
  curOrderTypeFilter = b.dataset.f;
  renderOrders();
});

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
  arr.sort((a, b) => (b.So_Lan_Thue || b.sl || 0) - (a.So_Lan_Thue || a.sl || 0));

  const list = $('#kho-list');
  list.innerHTML = '';
  list.className = 'gallery';

  if (!arr.length) {
    list.className = '';
    list.appendChild(el('div', { class: 'empty', html: '<div class="icon">👗</div><div class="title">Kho trống</div><div>Bấm + để thêm váy đầu tiên</div>' }));
    return;
  }

  arr.forEach(v => {
    const tenVay = v.Ten_Vay || v.ten || '';
    const size = v.Size || v.size || '';
    const goc = v.Gia_Vay_Goc || v.goc || 0;
    const sl = v.So_Lan_Thue || v.sl || 0;
    const busy = isVayBusy(v.Ma_Vay || v.ma, isoOf(today), '1 ngày');
    const item = el('div', { class: 'gallery-item' });
    const thumb = el('div', { class: 'gallery-thumb' });
    if (v.Anh_Vay || v.anh) thumb.appendChild(el('img', { src: v.Anh_Vay || v.anh, alt: '' }));
    else thumb.appendChild(el('div', { text: tenVay[0] || 'V' }));
    if (busy) thumb.appendChild(el('div', { class: 'gallery-busy', text: 'ĐANG THUÊ' }));
    item.appendChild(thumb);
    const info = el('div', { class: 'gallery-info' });
    info.appendChild(el('div', { class: 'gallery-name', text: tenVay || '—' }));
    info.appendChild(el('div', { class: 'gallery-sub', text: 'Size ' + size + ' · ' + sl + ' lượt' }));
    info.appendChild(el('div', { class: 'gallery-price', text: fmtVND(goc) }));
    item.appendChild(info);
    item.onclick = () => openEditItem('vay', v.Ma_Vay || v.ma);
    list.appendChild(item);
  });
}
$('#search-kho').oninput = renderKho;
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
  let arr = db.pk.slice();
  if (curPkFilter) arr = arr.filter(p => (p.Loai || p.loai) === curPkFilter);
  if (search) arr = arr.filter(p => (p.Ten_PK || p.ten || '').toLowerCase().includes(search));
  arr.sort((a, b) => (a.Loai || a.loai || '').localeCompare(b.Loai || b.loai || ''));

  const list = $('#pk-list');
  list.innerHTML = '';
  list.className = 'gallery';

  if (!arr.length) {
    list.className = '';
    list.appendChild(el('div', { class: 'empty', html: '<div class="icon">💍</div><div class="title">Chưa có phụ kiện</div><div>Bấm + để thêm</div>' }));
    return;
  }

  arr.forEach(p => {
    const ten = p.Ten_PK || p.ten || '';
    const loai = p.Loai || p.loai || '';
    const sl = p.So_Luong_Tong || p.sl || 1;
    const item = el('div', { class: 'gallery-item' });
    const thumb = el('div', { class: 'gallery-thumb' });
    if (p.Anh_PK || p.anh) thumb.appendChild(el('img', { src: p.Anh_PK || p.anh, alt: '' }));
    else thumb.appendChild(el('div', { text: ten[0] || 'P' }));
    thumb.appendChild(el('div', { class: 'gallery-stock', text: 'x' + sl }));
    item.appendChild(thumb);
    const info = el('div', { class: 'gallery-info' });
    info.appendChild(el('div', { class: 'gallery-name', text: ten || '—' }));
    info.appendChild(el('div', { class: 'gallery-sub', text: loai + ' · 1 ngày ' + fmtVND(p.Gia_Thue_1_Ngay || p.t1 || 0) }));
    item.appendChild(info);
    item.onclick = () => openEditItem('pk', p.Ma_PK || p.ma);
    list.appendChild(item);
  });
}
$('#search-pk').oninput = renderPk;
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
    toast('Đã cập nhật', 'success');
  } else {
    if (isVay) {
      const dress = { Ma_Vay: uid('V'), Ten_Vay: data.Ten_Vay, Size: data.Size, Gia_Vay_Goc: data.Gia_Vay_Goc, Gia_Thue_12h: data.Gia_Thue_12h, Gia_Thue_1_Ngay: data.Gia_Thue_1_Ngay, Gia_Thue_3_Ngay: data.Gia_Thue_3_Ngay, Anh_Vay: data.Anh_Vay || '', Ghi_Chu: data.Ghi_Chu, So_Lan_Thue: 0 };
      db.vay.push(dress);
    } else {
      const pk = { Ma_PK: uid('P'), Ten_PK: data.Ten_PK, Loai: data.Loai, So_Luong_Tong: data.So_Luong_Tong, Gia_Thue_12h: data.Gia_Thue_12h, Gia_Thue_1_Ngay: data.Gia_Thue_1_Ngay, Gia_Thue_3_Ngay: data.Gia_Thue_3_Ngay, Anh_PK: data.Anh_PK || '', Ghi_Chu: data.Ghi_Chu };
      db.pk.push(pk);
    }
    toast('Đã thêm', 'success');
  }
  save();
  closeModal('m-edit-item');
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
  if (!confirm(msg)) return;
  db[table] = db[table].filter(x => (kind === 'vay' ? x.Ma_Vay || x.ma : x.Ma_PK || x.ma) !== id);
  save();
  closeModal('m-edit-item');
  toast(`Đã xóa ${name}`, 'success');
  if (curView === 'v-kho') renderKho();
  else if (curView === 'v-pk') renderPk();
};

/* ============================================================
 *  AVAILABILITY (Check!) - Improved UX
 * ============================================================ */
let availState = {
  type: 'vay',  // 'vay' or 'pk'
  goi: '1 ngày',
  date: null,    // Date object
  dateStr: null  // ISO string
};

function initAvail() {
  availState.date = new Date();
  availState.dateStr = isoOf(availState.date);
  renderCalMini();
  renderAvail();
  bindQuickDates();
}

// Open date picker for custom date selection
window.openDatePicker = function() {
  const input = document.createElement('input');
  input.type = 'date';
  input.value = availState.dateStr || isoOf(new Date());
  input.style.position = 'absolute';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.showPicker ? input.showPicker() : input.focus();
  input.onchange = () => {
    if (input.value) {
      availState.date = new Date(input.value + 'T00:00:00');
      availState.dateStr = input.value;
      renderCalMini();
      renderAvail();
    }
    document.body.removeChild(input);
  };
  input.onblur = () => {
    if (document.body.contains(input)) document.body.removeChild(input);
  };
};

function bindQuickDates() {
  document.querySelectorAll('.quick-date-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.date;
      const today = new Date();
      today.setHours(0,0,0,0);
      let target;
      if (type === 'today') target = today;
      else if (type === 'tomorrow') { target = new Date(today); target.setDate(target.getDate() + 1); }
      else if (type === 'weekend') {
        // Find next Saturday
        target = new Date(today);
        const day = target.getDay();
        const diff = day === 6 ? 0 : (day === 0 ? -1 : 6 - day);
        target.setDate(target.getDate() + diff);
      }
      availState.date = target;
      availState.dateStr = isoOf(target);
      renderCalMini();
      renderAvail();
    };
  });
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
    <button class="cal-mini-nav" onclick="calMiniPrev()">‹</button>
    <span class="cal-mini-month">Tháng ${m+1}/${y}</span>
    <button class="cal-mini-nav" onclick="calMiniNext()">›</button>
  </div>`;

  html += '<div class="cal-mini-grid">';
  ['T2','T3','T4','T5','T6','T7','CN'].forEach(day => {
    html += `<div class="cal-mini-head">${day}</div>`;
  });

  for (let i = 0; i < startDow; i++) html += '<div></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(y, m, day);
    const isToday = cellDate.toDateString() === today.toDateString();
    const isSelected = cellDate.toDateString() === d.toDateString();
    const hasOrders = db.don.some(o => !isHoanOrder(o) && statusForDate(o, isoOf(cellDate)));

    html += `<div class="cal-mini-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasOrders ? 'has-events' : ''}"
      onclick="selectCalMiniDate(${y}, ${m}, ${day})">${day}</div>`;
  }

  html += '</div>';
  cal.innerHTML = html;
}

window.calMiniPrev = () => {
  availState.date = new Date(availState.date.getFullYear(), availState.date.getMonth() - 1, 1);
  availState.dateStr = isoOf(availState.date);
  renderCalMini();
};

window.calMiniNext = () => {
  availState.date = new Date(availState.date.getFullYear(), availState.date.getMonth() + 1, 1);
  availState.dateStr = isoOf(availState.date);
  renderCalMini();
};

window.selectCalMiniDate = (y, m, d) => {
  availState.date = new Date(y, m, d);
  availState.dateStr = isoOf(availState.date);
  document.getElementById('av-date-display').textContent = `${String(d).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}`;
  renderCalMini();
  renderAvail();
};

window.switchAvailType = (type) => {
  availState.type = type;
  document.querySelectorAll('.toggle-group .toggle-btn[data-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderAvail();
};

window.switchAvailGoi = (goi) => {
  availState.goi = goi;
  document.querySelectorAll('.toggle-group .toggle-btn[data-goi]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.goi === goi);
  });
  renderAvail();
};

// Search filter for check tab
window.filterCheckItems = function(search) {
  availState.searchTerm = search.toLowerCase().trim();
  renderAvail();
};

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
  const items = arr.map(x => {
    const id = x.Ma_Vay || x.Ma_PK || x.ma;
    const busy = isVay ? isVayBusy(id, date, goi) : isPkBusy(id, date, goi);
    const ten = x.Ten_Vay || x.Ten_PK || x.ten;
    const size = x.Size || x.Loai || x.size || '';
    const anh = x.Anh_Vay || x.Anh_PK || x.anh || '';
    const gia = x.Gia_Thue_1_Ngay || x.Gia_Thue_3_Ngay || x.t1 || x.t3 || 0;

    // Find current renter info
    let renterInfo = null;
    if (busy) {
      const order = db.don.find(o => {
        if (o.hoan || o.Trang_Thai_Hoan_Coc) return false;
        if (isVay) {
          return (o.dhvs || []).some(d => (d.vay || d.Ma_Vay) === id);
        } else {
          return (o.Ma_PK || o.pks || []).includes(id);
        }
      });
      if (order) {
        renterInfo = {
          insta: order.Insta_Khach || order.insta || '?',
          sdt: order.SDT || order.sdt || '',
          ngayLay: order.Ngay_Lay || order.lay || '',
          ngayTra: isoToVN(ngayTraThuc(order.Goi_Thue || order.goi, order.Ngay_Lay || order.lay)),
          goi: order.Goi_Thue || order.goi || ''
        };
      }
    }

    return { ...x, id, ten, size, anh, gia, busy, renterInfo };
  }).filter(x => {
    if (!searchTerm) return true;
    return x.ten.toLowerCase().includes(searchTerm);
  });

  const freeCount = items.filter(x => !x.busy).length;
  const busyCount = items.filter(x => x.busy).length;

  // Summary
  const summary = document.getElementById('avail-summary');
  if (summary) {
    summary.innerHTML = `
      <div class="avail-summary-card ${freeCount > 0 ? 'available' : 'full'}">
        <div class="avail-count">
          <span class="count-num">${freeCount}</span>
          <span class="count-label">${isVay ? 'váy' : 'phụ kiện'} trống</span>
        </div>
        <div class="avail-date">${isoToVN(date)} · ${goi}</div>
      </div>
    `;
  }

  // List
  const list = document.getElementById('avail-list');
  if (list) {
    // Sort: free first, then busy
    items.sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? 1 : -1;
      return a.ten.localeCompare(b.ten);
    });

    list.innerHTML = items.map(x => {
      const renterHtml = x.renterInfo ? `
        <div class="renter-info">
          <span class="renter-name">👤 ${escapeHtml(x.renterInfo.insta)}</span>
          <span class="renter-dates">📅 ${isoToVN(x.renterInfo.ngayLay)} → ${x.renterInfo.ngayTra}</span>
        </div>
      ` : '';

      return `
      <div class="avail-item ${x.busy ? 'busy' : 'free'}">
        <div class="avail-item-img">
          ${x.anh ? `<img src="${x.anh}" alt="" />` : `<span>${(x.ten || '?')[0]}</span>`}
        </div>
        <div class="avail-item-info">
          <div class="avail-item-name">${escapeHtml(x.ten)}</div>
          <div class="avail-item-meta">${escapeHtml(x.size)} · ${fmtVND(x.gia)}</div>
          ${renterHtml}
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
  const tenPK = (o.Ma_PK || o.pks || []).map(pk => {
    const p = db.pk.find(x => (x.Ma_PK || x.ma) === pk);
    return p ? (p.Ten_PK || p.ten) : '?';
  }).join(', ') || '—';
  const ngayLay = o.Ngay_Lay || o.lay;
  const ngayTra = ngayTraThuc(o.Goi_Thue || o.goi, ngayLay);
  const tienVay = donTienThueVay(o);
  const tienPK = donTienThuePK(o);
  const tong = tienVay + tienPK;
  const cocGoiY = donCocGoiY(o);
  const status = statusForDate(o, isoOf(new Date()));
  const dressImgs = (o.dhvs || []).map(x => {
    const v = db.vay.find(v => (v.Ma_Vay || v.ma) === x.vay);
    return v?.Anh_Vay || v?.anh || '';
  }).filter(Boolean);

  // Format dates properly
  const ngayLayDisplay = isoToVN(ngayLay);
  const ngayTraDisplay = isoToVN(ngayTra);
  const gioLay = o.Gio_Lay || o.gio || '';

  // Pick first dress for avatar
  const firstDressId = (o.dhvs || [])[0]?.vay;
  const firstDress = firstDressId && db.vay.find(v => (v.Ma_Vay || v.ma) === firstDressId);
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
          <span class="value">${escapeHtml(o.SDT || o.sdt || '—')}</span>
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
            const vay = db.vay.find(x => (x.Ma_Vay || x.ma) === ((o.dhvs || [])[i]?.vay || (o.dhvs || [])[i]?.Ma_Vay));
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
          <div id="eo-vays" class="eo-pills-container">${vayPills}</div>
        </div>

        <!-- Accessories -->
        <div class="eo-section">
          <div class="eo-section-title">💍 Phụ kiện</div>
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
      <button type="submit" class="btn btn-primary" onclick="document.getElementById('eo-form').requestSubmit()">Lưu thay đổi</button>
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

  closeModal('m-detail');
  openModal('m-edit-order');

  window.recalcTra = () => {
    const goi = frm('goi').value;
    const lay = frm('lay').value;
    if (!goi || !lay) return;
    frm('tra').value = isoOf(ngayTraThuc(goi, lay));
  };
  function frm(name) { return document.querySelector(`#eo-form [name="${name}"]`); }
}

window.saveEditOrder = function(id) {
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
  // Dresses
  const vayIds = $$('#eo-vays .eo-pill.selected').map(p => p.dataset.vay);
  o.dhvs = vayIds.map(v => ({ vay: v }));
  // Accessories
  const pkIds = $$('#eo-pks .eo-pill.selected').map(p => p.dataset.pk);
  o.Ma_PK = pkIds;
  save();
  closeModal('m-edit-order');
  toast('Đã lưu đơn', 'success');
  refreshCurView();
};

window.deleteOrder = function(id) {
  if (!confirm('Xóa đơn này? Hành động không thể hoàn tác.')) return;
  db.don = db.don.filter(x => (x.Ma_Don || x.id) !== id);
  db.dhv = (db.dhv || []).filter(x => (x.Ma_Don || x.id) !== id);
  save();
  closeModal('m-detail');
  toast('Đã xóa đơn', 'success');
  refreshCurView();
};

function refreshCurView() {
  if (curView === 'v-cal') renderCal();
  else if (curView === 'v-orders') renderOrders();
  else if (curView === 'v-kho') renderKho();
  else if (curView === 'v-pk') renderPk();
  else if (curView === 'v-soc') renderSoc();
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
  if (hoan < 0 && !confirm(`Hoàn cọc ÂM (${fmtVND(hoan)}). Tiếp tục?`)) return;

  refundDon.hoan = true;
  refundDon.Trang_Thai_Hoan_Coc = true;
  refundDon.time_hoan = new Date().toISOString();
  refundDon.chiphi = cp;

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
  closeModal('m-refund');
  toast('Đã hoàn cọc', 'success');
  refreshCurView();

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
      const v = db.vay.find(x => (x.Ma_Vay || x.ma) === (dhv.vay || dhv.Ma_Vay));
      if (v) {
        const ten = v.Ten_Vay || v.ten || '';
        const gia = v[g] || 0;
        itemsHtml += `<div class="r-item"><span class="r-item-name">${escapeHtml(ten)} <span class="r-item-size">(Size ${v.Size || v.size || '-'})</span></span><span class="r-item-price">${fmtVND(gia)}</span></div>`;
      }
    });
  }

  const pkIds = o.Ma_PK || o.pks || [];
  pkIds.forEach(pkId => {
    const p = db.pk.find(x => (x.Ma_PK || x.ma) === pkId);
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
        <div class="rss-logo-wrap">
          <div class="rss-logo-text">Aura Rental</div>
        </div>
        <div class="rss-title">PHIẾU HOÀN CỌC</div>
        <div class="rss-code">${id}</div>
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
          <span class="rss-pay-label">💰 Tiền cọc</span>
          <span class="rss-pay-value rss-green">${fmtVND(coc)}</span>
        </div>
        <div class="rss-payment-row">
          <span class="rss-pay-label">👗 Tiền thuê</span>
          <span class="rss-pay-value rss-red">−${fmtVND(tong)}</span>
        </div>
        ${cp > 0 ? `<div class="rss-payment-row"><span class="rss-pay-label">🚚 Phí khác</span><span class="rss-pay-value rss-red">−${fmtVND(cp)}</span></div>` : ''}
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

    // Get exact dimensions
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: width,
      height: height
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
      const ten = p.Ten_PK || p.ten;
      const loai = p.Loai || p.loai;
      const anh = p.Anh_PK || p.anh || '';
      const imgHtml = anh ? '<img src="' + anh + '">' : '💍';
      const safeTen = escapeHtml(ten);
      const safeLoai = escapeHtml(loai);
      pkItemsHtml += '<div class="form-new-chip" data-pk="' + id + '" data-ten="' + ten.toLowerCase() + '" onclick="window.toggleNewPK(\'' + id + '\', this)">' +
        '<input type="checkbox" name="pks" value="' + id + '">' +
        '<span class="form-new-chip-check"></span>' +
        '<div class="form-new-chip-img">' + imgHtml + '</div>' +
        '<div class="form-new-chip-name">' + safeTen + '</div>' +
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

window.saveNewOrder = function() {
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
  db.don.unshift(order);
  // Increment So_Lan_Thue
  vayIds.forEach(v => {
    const dress = db.vay.find(x => (x.Ma_Vay || x.ma) === v);
    if (dress) (dress.So_Lan_Thue = (dress.So_Lan_Thue || 0) + 1);
  });
  save();
  closeModal('m-new');
  toast(`Đã tạo đơn ${id}`, 'success');
  if (curView !== 'v-orders') go('v-orders');
  else renderOrders();
};

/* ============================================================
 *  CASH BOOK (SỔ THU/CHI)
 * ============================================================ */
let curSocSearch = '';
function renderSoc() {
  const list = $('#soc-list');
  list.innerHTML = '';
  const q = curSocSearch.toLowerCase().trim();
  let arr = (db.tt || []).slice();
  if (q) arr = arr.filter(t => (t.ma || '').toLowerCase().includes(q) || (t.ten || '').toLowerCase().includes(q));
  arr.sort((a, b) => (b.ngay || '').localeCompare(a.ngay || ''));

  const totalCoc = arr.reduce((s, t) => s + (t.tienCoc || 0), 0);
  const totalHoan = arr.reduce((s, t) => s + Math.max(0, t.hoan || 0), 0);
  const totalChi = arr.reduce((s, t) => s + (t.chiphi || 0), 0);

  if (!arr.length) {
    list.appendChild(el('div', { class: 'empty', html: '<div class="icon">💰</div><div class="title">Chưa có giao dịch</div>' }));
    return;
  }

  // Summary
  const sum = el('div', { class: 'card', style: 'background:linear-gradient(135deg,#fef3c7,#fde68a);border:none' });
  sum.innerHTML = `
    <div class="kv"><span class="lbl">Tổng cọc</span><span class="val price">${fmtVND(totalCoc)}</span></div>
    <div class="kv"><span class="lbl">Tổng hoàn</span><span class="val price">${fmtVND(totalHoan)}</span></div>
    <div class="kv"><span class="lbl">Tổng chi khác</span><span class="val price">${fmtVND(totalChi)}</span></div>
  `;
  list.appendChild(sum);

  arr.forEach(t => {
    const card = el('div', { class: 'card row' });
    card.style.cursor = 'pointer';
    card.onclick = () => {
      const msg = Calc_textGuiKhach(t);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(msg).then(() => toast('Đã copy tin Zalo', 'success'));
      } else {
        alert(msg);
      }
    };
    const tenVay = donTenVay(db.don.find(d => (d.Ma_Don || d.id) === t.ma) || {});
    card.innerHTML = `
      <div class="grow">
        <b>${escapeHtml(t.ma)} · ${escapeHtml(t.ten || '—')}</b>
        <small>${isoToVN(t.ngay?.slice(0, 10))} · ${escapeHtml(tenVay.join(', ') || '—')}</small>
      </div>
      <div style="text-align:right">
        <div class="price" style="color:${(t.hoan||0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtVND(t.hoan)}</div>
        <small class="muted">cọc ${fmtVND(t.tienCoc)}</small>
      </div>
    `;
    list.appendChild(card);
  });
}
$('#search-soc').oninput = e => { curSocSearch = e.target.value; renderSoc(); };

function Calc_textGuiKhach(t) {
  const hoan = t.hoan || 0;
  if (hoan < 0) return `⚠️ CHECK: Hoàn cọc âm = ${fmtVND(hoan)}`;
  return `Dạ nàng đã cọc ${fmtVND(t.tienCoc)} • Hoàn lại: ${fmtVND(hoan)} • Nàng gửi STK ngân hàng để shop CK nha.`;
}

/* ============================================================
 *  REFUND ORDERS LIST (Đơn đã hoàn cọc) - Full Screen
 * ============================================================ */
let curRefundSearch = '';

function openRefundOrders() {
  curRefundSearch = '';
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

  arr.forEach(o => {
    const id = o.Ma_Don || o.id || '';
    const ins = o.Insta_Khach || o.insta || '—';
    const sdt = o.SDT || o.sdt || '—';
    const ngayHoan = o.time_hoan ? isoToVN(o.time_hoan.slice(0, 10)) : isoToVN(o.Ngay_Tao?.slice(0, 10));
    const thoiGianHoan = o.time_hoan ? o.time_hoan.slice(0, 16).replace('T', ' ') : '';

    const card = document.createElement('div');
    card.className = 'refund-order-card';
    card.onclick = () => {
      closeModal('m-refund-orders');
      openOrderDetail(id);
    };

    card.innerHTML = `
      <div class="refund-order-header">
        <span class="refund-order-id">${id}</span>
        <span class="refund-order-date">${ngayHoan}</span>
      </div>
      <div class="refund-order-customer">${escapeHtml(ins)}</div>
      <div class="refund-order-phone">📞 ${escapeHtml(sdt)}</div>
      <div class="refund-order-time">
        <span>⏰</span>
        <span>Hoàn lúc: ${thoiGianHoan}</span>
      </div>
    `;
    list.appendChild(card);
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
        else if (view === 'v-kho') renderKho();
        else if (view === 'v-pk') renderPk();
        else if (view === 'v-soc') renderSoc();
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

setTimeout(() => Sync.start(), 1500);

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
    list.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px">Chưa có đơn hoàn cọc nào.</p>';
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
 *  CHECK FOR PENDING BOOKINGS
 * ============================================================ */
function checkPendingBookings() {
  const pending = localStorage.getItem('aura_pending_bookings');
  if (pending === 'true') {
    localStorage.removeItem('aura_pending_bookings');
    const bookings = JSON.parse(localStorage.getItem('aura_bookings') || '[]');
    if (bookings.length > 0) {
      toast(`📋 Có ${bookings.length} đơn đặt thuê mới!`, 'success');
    }
  }
}

// Check on app load
checkPendingBookings();

// Check periodically (every 30 seconds)
setInterval(checkPendingBookings, 30000);

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
  checkPendingBookings();
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

// Khởi tạo app — gọi view mặc định
go('v-cal');
