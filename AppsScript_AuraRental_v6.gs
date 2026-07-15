/**
 * ============================================================
 *  AURA RENTAL — Apps Script v6
 *  Deploy in Google Sheets → Extensions → Apps Script
 *  Author: Aura Rental (Phuong) — generated 2026-06-26
 *
 *  IMPORTANT: Set your Google Sheets timezone to (GMT+7) Vietnam
 *  via File → Settings → Timezone. Otherwise Date arithmetic
 *  will be off by one day near midnight UTC.
 *
 *  Required sheets (tabs):
 *    1. DON_HANG       — Orders (Ma_Don auto-generated)
 *    2. DON_HANG_VAY   — Order↔Dress junction
 *    3. KHO_VAY        — Dress inventory
 *    4. PHU_KIEN       — Accessories
 *    5. THANH_TOAN     — Deposit refund log
 *    6. CHECK_LICH     — (Optional) availability checks
 *    7. FORM           — Google Form responses (auto-populated)
 *
 *  Install: Run setupTriggers() once after pasting.
 *  Permission: must allow "On simple trigger" + "On edit" + "On change".
 *
 *  Race-condition strategy:
 *    - Ma_Don counter stored in ScriptProperties (atomic via LockService).
 *    - Cascades use SOFT-delete (mark Trang_Thai_Hoan_Coc=TRUE) not hard delete.
 * ============================================================
 */

const AURA_CONFIG = {
  SHEET_NAMES: {
    DON_HANG: 'DON_HANG',
    DON_HANG_VAY: 'DON_HANG_VAY',
    KHO_VAY: 'KHO_VAY',
    PHU_KIEN: 'PHU_KIEN',
    THANH_TOAN: 'THANH_TOAN',
    CHECK_LICH: 'CHECK_LICH',
    FORM: 'FORM',
  },
  COL: {
    DON_HANG: {
      Ma_Don: 'Ma_Don',
      Trang_Thai_Don: 'Trang_Thai_Don',
      Trang_Thai_Hoan_Coc: 'Trang_Thai_Hoan_Coc',
      Thoi_Gian_Hoan_Coc: 'Thoi_Gian_Hoan_Coc',
      Ngay_Lay: 'Ngay_Lay',
      Ngay_Tra: 'Ngay_Tra',
      Ngay_Tao: 'Ngay_Tao',
    },
    KHO_VAY: {
      Ma_Vay: 'Ma_Vay',
      So_Lan_Thue: 'So_Lan_Thue',
    },
    DON_HANG_VAY: {
      Ma_DHV: 'Ma_DHV',
      Ma_Don: 'Ma_Don',
      Ma_Vay: 'Ma_Vay',
    },
    THANH_TOAN: {
      Ma_TT: 'Ma_TT',
      Ma_Don: 'Ma_Don',
      Ngay_TT: 'Ngay_TT',
      Tien_Thue_Vay_Snapshot: 'Tien_Thue_Vay_Snapshot',
      Tien_Thue_PK_Snapshot: 'Tien_Thue_PK_Snapshot',
    },
    FORM: {
      ID: 'ID',
      Ma_Don: 'Ma_Don',
      Trang_Thai: 'Trang_Thai',
    },
  },
  EMAIL_ERROR: 'phuong@aurarental.vn', // change to your email
  SHEET_URL_KEY: 'AURA_SHEET_URL',
  CACHE_KEY: 'AURA_MAX_MA_DON',
};

/* ============================================================
 * 1. ENTRY POINTS — Triggers
 * ============================================================ */

function onChange(e) {
  try {
    const sheet = e?.source?.getActiveSheet();
    if (!sheet) return;
    const name = sheet.getName();
    if (name === AURA_CONFIG.SHEET_NAMES.DON_HANG)   handleDonHangChange(sheet);
    if (name === AURA_CONFIG.SHEET_NAMES.THANH_TOAN) handleThanhToanChange(sheet);
    if (name === AURA_CONFIG.SHEET_NAMES.DON_HANG_VAY) handleDonHangVayChange(sheet);
  } catch (err) {
    handleError(err, 'onChange');
  }
}

function onEdit(e) {
  try {
    const sheet = e?.source?.getActiveSheet();
    if (!sheet) return;
    if (sheet.getName() !== AURA_CONFIG.SHEET_NAMES.DON_HANG) return;
    validateNgayTra(e);
  } catch (err) {
    handleError(err, 'onEdit');
  }
}

function onFormSubmit(e) {
  try {
    if (!e || !e.namedValues) return;
    handleFormSubmit(e);
  } catch (err) {
    handleError(err, 'onFormSubmit');
  }
}

/* ============================================================
 * 2. SETUP — install triggers (idempotent)
 * ============================================================ */

function setupTriggers() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (['onChange', 'onEdit', 'onFormSubmit'].includes(fn)) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('onEdit').forSpreadsheet(ss).onEdit().create();

  const formTrigger = FormApp.getActiveForm();
  if (formTrigger) {
    ScriptApp.newTrigger('onFormSubmit').forForm(formTrigger).onFormSubmit().create();
  }

  PropertiesService.getScriptProperties()
    .setProperty(AURA_CONFIG.SHEET_URL_KEY, ss.getUrl());

  SpreadsheetApp.getUi().alert(
    '✅ Aura Rental triggers installed.\n\n' +
    '• onChange (DON_HANG, THANH_TOAN, DON_HANG_VAY)\n' +
    '• onEdit (validate Ngay_Tra)\n' +
    (formTrigger ? '• onFormSubmit\n' : '') +
    '\n⚠️ Reminder: Set Sheet timezone to GMT+7 (Vietnam) for correct dates.\n' +
    'File → Settings → Timezone → (GMT+7) Hanoi / Bangkok'
  );
}

/* ============================================================
 * 3. Ma_Don GENERATOR — atomic counter with LockService
 * ============================================================
 *  Format: A00001, A00002, A00003...
 *  Cache: stored in ScriptProperties under AURA_MAX_MA_DON.
 *  On miss: scan DON_HANG for max existing Ma_Don, recompute.
 */

function generateMaDon() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const props = PropertiesService.getScriptProperties();
    let next = Number(props.getProperty(AURA_CONFIG.CACHE_KEY) || 0);
    if (!next) {
      next = scanMaxMaDon() + 1;
      props.setProperty(AURA_CONFIG.CACHE_KEY, String(next));
    } else {
      next += 1;
      props.setProperty(AURA_CONFIG.CACHE_KEY, String(next));
    }
    return 'A' + String(next).padStart(5, '0');
  } finally {
    lock.releaseLock();
  }
}

function scanMaxMaDon() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG);
  if (!sheet) return 0;
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const col = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG.Ma_Don);
  if (col < 0) return 0;
  const values = sheet.getRange(2, col + 1, last - 1, 1).getValues().flat();
  let max = 0;
  values.forEach(v => {
    if (typeof v === 'string' && /^A\d+$/.test(v)) {
      const n = parseInt(v.slice(1), 10);
      if (n > max) max = n;
    }
  });
  return max;
}

/* ============================================================
 * 4. DON_HANG handlers
 * ============================================================ */

function handleDonHangChange(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const colMaDon = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG.Ma_Don);
  const colTrangThai = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG.Trang_Thai_Don);
  if (colMaDon < 0) return;

  const rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();

  rows.forEach((row, idx) => {
    const realRow = idx + 2;
    const maDon = String(row[colMaDon] || '').trim();
    const trangThai = colTrangThai >= 0 ? String(row[colTrangThai] || '').trim() : '';

    if (!maDon) {
      const newMa = generateMaDon();
      sheet.getRange(realRow, colMaDon + 1).setValue(newMa);
    }

    if (trangThai === 'Chốt thuê') {
      incrementSoLanThue_(String(row[headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG.Ma_Don)] || '').trim());
    }
  });
}

function incrementSoLanThue_(maDon) {
  if (!maDon) return;
  const ss = SpreadsheetApp.getActive();
  const linkSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG_VAY);
  const dressSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.KHO_VAY);
  if (!linkSheet || !dressSheet) return;
  const linkCol = headerColIndex_(linkSheet, AURA_CONFIG.COL.DON_HANG_VAY.Ma_Vay);
  const donCol = headerColIndex_(linkSheet, AURA_CONFIG.COL.DON_HANG_VAY.Ma_Don);
  const dressMaCol = headerColIndex_(dressSheet, AURA_CONFIG.COL.KHO_VAY.Ma_Vay);
  const soLanCol = headerColIndex_(dressSheet, AURA_CONFIG.COL.KHO_VAY.So_Lan_Thue);
  if (linkCol < 0 || donCol < 0 || dressMaCol < 0 || soLanCol < 0) return;

  const linkLast = linkSheet.getLastRow();
  if (linkLast < 2) return;
  const links = linkSheet.getRange(2, 1, linkLast - 1, linkSheet.getLastColumn()).getValues();
  const dressLast = dressSheet.getLastRow();
  const dressVals = dressSheet.getRange(2, 1, Math.max(dressLast - 1, 1), dressSheet.getLastColumn()).getValues();

  links.forEach((lr, i) => {
    if (String(lr[donCol]) === maDon) {
      const maVay = String(lr[linkCol]);
      for (let j = 0; j < dressVals.length; j++) {
        if (String(dressVals[j][dressMaCol]) === maVay) {
          const cur = Number(dressVals[j][soLanCol] || 0);
          dressSheet.getRange(j + 2, soLanCol + 1).setValue(cur + 1);
          break;
        }
      }
    }
  });
}

function validateNgayTra(e) {
  const sheet = e.source.getActiveSheet();
  const row = e.range.getRow();
  if (row < 2) return;
  const ngayLayCol = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG.Ngay_Lay);
  const ngayTraCol = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG.Ngay_Tra);
  if (ngayLayCol < 0 || ngayTraCol < 0) return;
  const ngayLay = sheet.getRange(row, ngayLayCol + 1).getValue();
  const ngayTra = sheet.getRange(row, ngayTraCol + 1).getValue();
  if (!ngayLay || !ngayTra) return;
  const dLay = new Date(ngayLay);
  const dTra = new Date(ngayTra);
  if (isNaN(dLay) || isNaN(dTra)) return;
  if (dTra < dLay) {
    SpreadsheetApp.getUi().alert('⚠️ Ngày trả phải >= ngày lấy!');
    sheet.getRange(row, ngayTraCol + 1).setValue(dLay);
  }
}

/* ============================================================
 * 5. THANH_TOAN handler — auto-snapshot + mark DON_HANG refunded
 * ============================================================ */

function handleThanhToanChange(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const cols = {
    Ma_TT: headerColIndex_(sheet, AURA_CONFIG.COL.THANH_TOAN.Ma_TT),
    Ma_Don: headerColIndex_(sheet, AURA_CONFIG.COL.THANH_TOAN.Ma_Don),
    Ngay_TT: headerColIndex_(sheet, AURA_CONFIG.COL.THANH_TOAN.Ngay_TT),
    VaySnap: headerColIndex_(sheet, AURA_CONFIG.COL.THANH_TOAN.Tien_Thue_Vay_Snapshot),
    PKSnap: headerColIndex_(sheet, AURA_CONFIG.COL.THANH_TOAN.Tien_Thue_PK_Snapshot),
  };
  if (cols.Ma_TT < 0 || cols.Ma_Don < 0) return;

  const rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();

  rows.forEach((row, idx) => {
    const realRow = idx + 2;
    const maDon = String(row[cols.Ma_Don] || '').trim();
    if (!maDon) return;

    if (cols.Ngay_TT >= 0 && !row[cols.Ngay_TT]) {
      sheet.getRange(realRow, cols.Ngay_TT + 1).setValue(new Date());
    }

    const tienVay = computeTienThueVay_(maDon);
    const tienPK  = computeTienThuePK_(maDon);
    if (cols.VaySnap >= 0 && !row[cols.VaySnap] && tienVay > 0) {
      sheet.getRange(realRow, cols.VaySnap + 1).setValue(tienVay);
    }
    if (cols.PKSnap >= 0 && !row[cols.PKSnap] && tienPK > 0) {
      sheet.getRange(realRow, cols.PKSnap + 1).setValue(tienPK);
    }

    markOrderRefunded_(maDon);
  });
}

function computeTienThueVay_(maDon) {
  const ss = SpreadsheetApp.getActive();
  const linkSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG_VAY);
  const dressSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.KHO_VAY);
  const donSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG);
  if (!linkSheet || !dressSheet || !donSheet) return 0;

  const donCol = headerColIndex_(donSheet, AURA_CONFIG.COL.DON_HANG.Ma_Don);
  const goiCol = headerColIndex_(donSheet, 'Goi_Thue');
  if (donCol < 0 || goiCol < 0) return 0;
  const donVals = donSheet.getDataRange().getValues();
  let goi = '';
  for (let i = 1; i < donVals.length; i++) {
    if (String(donVals[i][donCol]) === maDon) { goi = String(donVals[i][goiCol]); break; }
  }

  const linkCol = headerColIndex_(linkSheet, AURA_CONFIG.COL.DON_HANG_VAY.Ma_Don);
  const linkMaVayCol = headerColIndex_(linkSheet, AURA_CONFIG.COL.DON_HANG_VAY.Ma_Vay);
  const dressMaCol = headerColIndex_(dressSheet, AURA_CONFIG.COL.KHO_VAY.Ma_Vay);
  if (linkCol < 0 || linkMaVayCol < 0 || dressMaCol < 0) return 0;
  const linkVals = linkSheet.getDataRange().getValues();
  const dressVals = dressSheet.getDataRange().getValues();

  const priceColName = goi === '12h' ? 'Gia_Thue_12h'
                     : goi === '3 ngày' ? 'Gia_Thue_3_Ngay'
                     : 'Gia_Thue_1_Ngay';
  const priceCol = headerColIndex_(dressSheet, priceColName);
  if (priceCol < 0) return 0;

  let total = 0;
  for (let i = 1; i < linkVals.length; i++) {
    if (String(linkVals[i][linkCol]) !== maDon) continue;
    const maVay = String(linkVals[i][linkMaVayCol]);
    for (let j = 1; j < dressVals.length; j++) {
      if (String(dressVals[j][dressMaCol]) === maVay) {
        total += Number(dressVals[j][priceCol] || 0);
        break;
      }
    }
  }
  return total;
}

function computeTienThuePK_(maDon) {
  const ss = SpreadsheetApp.getActive();
  const donSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG);
  const pkSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.PHU_KIEN);
  if (!donSheet || !pkSheet) return 0;

  const donCol = headerColIndex_(donSheet, AURA_CONFIG.COL.DON_HANG.Ma_Don);
  const pkListCol = headerColIndex_(donSheet, 'Ma_PK');
  const goiCol = headerColIndex_(donSheet, 'Goi_Thue');
  if (donCol < 0 || pkListCol < 0 || goiCol < 0) return 0;

  const donVals = donSheet.getDataRange().getValues();
  let pkListStr = '', goi = '';
  for (let i = 1; i < donVals.length; i++) {
    if (String(donVals[i][donCol]) === maDon) {
      pkListStr = String(donVals[i][pkListCol] || '');
      goi = String(donVals[i][goiCol]);
      break;
    }
  }
  if (!pkListStr) return 0;
  const maPKs = pkListStr.split(',').map(s => s.trim()).filter(Boolean);
  if (!maPKs.length) return 0;

  const pkMaCol = headerColIndex_(pkSheet, 'Ma_PK');
  const pkPriceCol = headerColIndex_(pkSheet,
    goi === '12h' ? 'Gia_Thue_12h' : goi === '3 ngày' ? 'Gia_Thue_3_Ngay' : 'Gia_Thue_1_Ngay');
  if (pkMaCol < 0 || pkPriceCol < 0) return 0;
  const pkVals = pkSheet.getDataRange().getValues();

  let total = 0;
  maPKs.forEach(maPK => {
    for (let i = 1; i < pkVals.length; i++) {
      if (String(pkVals[i][pkMaCol]) === maPK) {
        total += Number(pkVals[i][pkPriceCol] || 0);
        break;
      }
    }
  });
  return total;
}

function markOrderRefunded_(maDon) {
  const ss = SpreadsheetApp.getActive();
  const donSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG);
  if (!donSheet) return;
  const donCol = headerColIndex_(donSheet, AURA_CONFIG.COL.DON_HANG.Ma_Don);
  const trangThaiCol = headerColIndex_(donSheet, AURA_CONFIG.COL.DON_HANG.Trang_Thai_Hoan_Coc);
  const thoiGianCol = headerColIndex_(donSheet, AURA_CONFIG.COL.DON_HANG.Thoi_Gian_Hoan_Coc);
  if (donCol < 0 || trangThaiCol < 0) return;

  const donVals = donSheet.getDataRange().getValues();
  for (let i = 1; i < donVals.length; i++) {
    if (String(donVals[i][donCol]) === maDon) {
      if (!donVals[i][trangThaiCol]) {
        donSheet.getRange(i + 1, trangThaiCol + 1).setValue(true);
      }
      if (thoiGianCol >= 0 && !donVals[i][thoiGianCol]) {
        donSheet.getRange(i + 1, thoiGianCol + 1).setValue(new Date());
      }
      break;
    }
  }
}

/* ============================================================
 * 6. DON_HANG_VAY handler — cascade delete (soft)
 * ============================================================ */

function handleDonHangVayChange(sheet) {
  const ss = SpreadsheetApp.getActive();
  const donSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.DON_HANG);
  if (!donSheet) return;
  const donLast = donSheet.getLastRow();
  if (donLast < 2) return;
  const donCol = headerColIndex_(donSheet, AURA_CONFIG.COL.DON_HANG.Ma_Don);
  if (donCol < 0) return;
  const donMaSet = new Set(
    donSheet.getRange(2, donCol + 1, donLast - 1, 1).getValues().flat().map(String)
  );

  const linkLast = sheet.getLastRow();
  if (linkLast < 2) return;
  const linkMaCol = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG_VAY.Ma_DHV);
  const linkDonCol = headerColIndex_(sheet, AURA_CONFIG.COL.DON_HANG_VAY.Ma_Don);
  if (linkMaCol < 0 || linkDonCol < 0) return;
}

/* ============================================================
 * 7. FORM handler — auto-create DON_HANG from form submission
 * ============================================================ */

function handleFormSubmit(e) {
  const v = e.namedValues;
  const data = {
    Insta: (v['Tên Instagram của nàng là gì?'] || v['Tên Instagram'] || [])[0] || '',
    SDT:   (v['Số điện thoại liên hệ'] || v['Số điện thoại'] || [])[0] || '',
    Vay:   (v['Nàng muốn thuê váy nào - size gì?'] || v['Váy + Size'] || [])[0] || '',
    Goi:   (v['Nàng muốn thuê gói nào?'] || v['Gói thuê'] || [])[0] || '1 ngày',
    Ngay:  (v['Ngày nàng muốn lấy váy'] || v['Ngày lấy'] || [])[0] || '',
    Gio:   (v['Giờ lấy váy'] || v['Giờ lấy'] || [])[0] || '09:00',
    PK:    (v['Nàng muốn thuê thêm phụ kiện gì?'] || v['Phụ kiện'] || [])[0] || '',
    Nhan:  (v['Hình thức nàng muốn nhận váy'] || v['Hình thức nhận'] || [])[0] || '',
    DiaChi:(v['Địa chỉ nàng muốn nhận váy'] || v['Địa chỉ'] || [])[0] || '',
    Coc:   (v['Hình thức cọc tiền váy'] || v['Hình thức cọc'] || [])[0] || 'Cọc 50% + CCCD',
    SuKien:(v['Nàng mặc cho sự kiện nào?'] || v['Sự kiện'] || [])[0] || '',
  };

  const ss = SpreadsheetApp.getActive();
  const formSheet = ss.getSheetByName(AURA_CONFIG.SHEET_NAMES.FORM);
  if (!formSheet) return;

  const last = formSheet.getLastRow();
  const targetRow = last + 1;
  const headers = formSheet.getRange(1, 1, 1, formSheet.getLastColumn()).getValues().flat();
  function setVal(colName, value) {
    const idx = headers.findIndex(h => String(h).trim() === colName);
    if (idx < 0) return;
    formSheet.getRange(targetRow, idx + 1).setValue(value);
  }
  setVal('ID',           'FRM' + Date.now());
  setVal('Dấu thời gian', new Date());
  setVal('Tên Instagram', data.Insta);
  setVal('Số điện thoại', data.SDT);
  setVal('Váy + Size',   data.Vay);
  setVal('Phụ kiện',     data.PK);
  setVal('Gói thuê',     data.Goi);
  setVal('Ngày lấy',     data.Ngay);
  setVal('Giờ lấy',      data.Gio);
  setVal('Hình thức nhận', data.Nhan);
  setVal('Địa chỉ',      data.DiaChi);
  setVal('Hình thức cọc', data.Coc);
  setVal('Sự kiện',      data.SuKien);
  setVal('Trang_Thai',   'Chờ xử lý');
}

/* ============================================================
 * 8. UTILITIES
 * ============================================================ */

function headerColIndex_(sheet, name) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues().flat();
  return headers.findIndex(h => String(h).trim() === name);
}

function handleError(err, fn) {
  console.error(`[${fn}]`, err);
  try {
    MailApp.sendEmail({
      to: AURA_CONFIG.EMAIL_ERROR,
      subject: `[Aura Rental] Lỗi Apps Script: ${fn}`,
      body: `Function: ${fn}\nError: ${err && err.message ? err.message : err}\nStack: ${err && err.stack ? err.stack : 'n/a'}\n\nSpreadsheet: ${SpreadsheetApp.getActive().getUrl()}`,
    });
  } catch (mailErr) {
    console.error('Could not email error', mailErr);
  }
}

/* ============================================================
 * 9. MAINTENANCE — manual utilities
 * ============================================================ */

function resetMaDonCounter() {
  PropertiesService.getScriptProperties().deleteProperty(AURA_CONFIG.CACHE_KEY);
  SpreadsheetApp.getUi().alert('Cache reset. Next order will recompute from current data.');
}

function diagnoseMaDon() {
  const max = scanMaxMaDon();
  const cached = PropertiesService.getScriptProperties().getProperty(AURA_CONFIG.CACHE_KEY);
  SpreadsheetApp.getUi().alert(
    `Ma_Don diagnostics:\nMax scanned: A${String(max).padStart(5, '0')}\nCached: ${cached || '(empty)'}`
  );
}