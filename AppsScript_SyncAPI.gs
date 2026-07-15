/**
 * ============================================================
 *  AURA RENTAL — Sync API v1
 *  File riêng, paste vào Apps Script CÙNG với file v6
 *  Hoặc paste vào 1 Apps Script project riêng để tách biệt.
 *
 *  Endpoints (Web App):
 *    GET  ?action=pull&since=<ms>     → trả về data mới hơn since
 *    GET  ?action=ping                 → health check
 *    POST {action: 'push', records:[]} → ghi delta lên Sheets
 *
 *  Schema:
 *    Mỗi record có field _ts = lastModified (epoch ms).
 *    Conflict: bản có _ts lớn hơn thắng.
 *
 *  Setup:
 *    1. Mở Google Sheets của Aura Rental (đã có 7 tab theo v6)
 *    2. Thêm tab mới: SYNC_LOG (để debug, tự tạo nếu chưa có)
 *    3. Extensions → Apps Script → New file → paste code này
 *    4. Deploy → New deployment → Web app
 *       - Execute as: Me
 *       - Who has access: Anyone (hoặc "Anyone with Google account" nếu muốn bảo mật hơn)
 *    5. Copy URL → paste vào SYNC.WEB_APP_URL trong app.js
 *
 *  Quota Google Sheets Web App:
 *    - 200,000 requests/ngày (FREE) — quá đủ cho 6 thiết bị
 *    - Mỗi pull ~5KB → cache tốt, không lo nghẽn
 * ============================================================
 */

const SYNC_CONFIG = {
  SHEET_TABS: {
    KHO_VAY: 'KHO_VAY',
    PHU_KIEN: 'PHU_KIEN',
    DON_HANG: 'DON_HANG',
    DON_HANG_VAY: 'DON_HANG_VAY',
    THANH_TOAN: 'THANH_TOAN',
    FORM: 'FORM',
    SYNC_LOG: 'SYNC_LOG',
  },
  COL_TS: '_ts',
  COL_DELETED: '_deleted',  // soft-delete marker
};

function setupSync() {
  const ss = SpreadsheetApp.getActive();
  // Tạo SYNC_LOG nếu chưa có
  let log = ss.getSheetByName(SYNC_CONFIG.SHEET_TABS.SYNC_LOG);
  if (!log) {
    log = ss.insertSheet(SYNC_CONFIG.SHEET_TABS.SYNC_LOG);
    log.appendRow(['Timestamp', 'Device', 'Action', 'Records', 'Status', 'Note']);
  }
  SpreadsheetApp.getUi().alert('✅ Sync setup done. Now Deploy → New deployment → Web app.');
}

/* ============================================================
 *  HTTP ENTRY POINTS
 * ============================================================ */

function doGet(e) {
  try {
    const action = e.parameter.action || 'ping';
    if (action === 'ping') return json_({ ok: true, ts: Date.now(), app: 'Aura Rental Sync API v1' });
    if (action === 'pull') return json_(pull_(Number(e.parameter.since) || 0));
    if (action === 'full') return json_(pullAll_());
    return json_({ error: 'Unknown action: ' + action });
  } catch (err) {
    log_('GET', '?', action, 0, 'ERROR', err.message);
    return json_({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    if (action === 'push') return json_(push_(data.records || [], data.device || 'unknown'));
    if (action === 'pull') return json_(pull_(Number(data.since) || 0));
    return json_({ error: 'Unknown action: ' + action });
  } catch (err) {
    log_('POST', '?', '?', 0, 'ERROR', err.message);
    return json_({ error: err.message });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  PULL — trả về records mới hơn `since` (epoch ms)
 *  Multi-device safe: chỉ lấy rows có _ts > since
 * ============================================================ */

function pull_(since) {
  const ss = SpreadsheetApp.getActive();
  const out = {
    serverTs: Date.now(),
    since: since,
    updates: {},   // table → [rows có _ts > since]
    deleted: {},  // table → [ids bị xóa]
  };

  const tables = ['KHO_VAY', 'PHU_KIEN', 'DON_HANG', 'DON_HANG_VAY', 'THANH_TOAN', 'FORM'];
  tables.forEach(table => {
    const sheet = ss.getSheetByName(table);
    if (!sheet || sheet.getLastRow() < 2) {
      out.updates[table] = [];
      return;
    }
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const tsIdx = headers.indexOf('_ts');
    const delIdx = headers.indexOf('_deleted');
    const idIdx = headers.findIndex(h => /ma_|_id|key/i.test(String(h)));

    const updated = [];
    const deleted = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowTs = tsIdx >= 0 ? Number(row[tsIdx] || 0) : 0;
      const isDeleted = delIdx >= 0 && row[delIdx] === true;
      if (rowTs > since) {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = row[j]; });
        if (isDeleted) {
          if (idIdx >= 0) deleted.push(String(row[idIdx]));
        } else {
          updated.push(obj);
        }
      }
    }
    out.updates[table] = updated;
    if (deleted.length) out.deleted[table] = deleted;
  });

  log_('PULL', '?', 'pull', Object.values(out.updates).reduce((s, a) => s + a.length, 0), 'OK', `since=${since}`);
  return out;
}

function pullAll_() {
  // Dùng cho lần đầu sync (no data on device yet)
  return pull_(0);
}

/* ============================================================
 *  PUSH — ghi delta từ client
 *  Client gửi { table, rows } → script merge bằng _ts
 *
 *  Conflict resolution:
 *    - Nếu row chưa có → append
 *    - Nếu row đã có:
 *      - _ts mới > _ts cũ → update
 *      - _ts mới <= _ts cũ → skip (giữ bản mới hơn)
 *    - Nếu _deleted = true → soft-delete (set flag)
 * ============================================================ */

function push_(records, device) {
  const ss = SpreadsheetApp.getActive();
  const stats = { appended: 0, updated: 0, skipped: 0, deleted: 0 };

  // records: { table: [{...row}], deleted: { table: [ids] } }
  if (records.deleted) {
    Object.keys(records.deleted).forEach(table => {
      const ids = records.deleted[table] || [];
      if (ids.length) {
        const n = softDelete_(ss, table, ids, device);
        stats.deleted += n;
      }
    });
  }

  if (records.tables) {
    Object.keys(records.tables).forEach(table => {
      const rows = records.tables[table] || [];
      if (!rows.length) return;
      rows.forEach(row => {
        const result = mergeRow_(ss, table, row);
        stats[result]++;
      });
    });
  }

  log_('PUSH', device, 'push', stats.appended + stats.updated + stats.skipped + stats.deleted, 'OK',
    'A:' + stats.appended + ' U:' + stats.updated + ' S:' + stats.skipped + ' D:' + stats.deleted);

  return { ok: true, ts: Date.now(), stats };
}

function mergeRow_(ss, table, row) {
  const sheet = ss.getSheetByName(table);
  if (!sheet) return 'skipped';

  const data = sheet.getDataRange().getValues();
  if (data.length < 1) return 'skipped';
  const headers = data[0];

  const tsIdx = headers.indexOf('_ts');
  const idIdx = findIdIdx_(headers);
  if (idIdx < 0) return 'skipped';

  const newId = String(row[headers[idIdx]] || '');
  const newTs = tsIdx >= 0 ? Number(row[headers[tsIdx]] || Date.now()) : Date.now();

  // Find existing row
  let existingRow = -1;
  let existingTs = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === newId) {
      existingRow = i + 1;  // 1-based for Sheets API
      existingTs = tsIdx >= 0 ? Number(data[i][tsIdx] || 0) : 0;
      break;
    }
  }

  if (existingRow < 0) {
    // Append new row
    const newRow = headers.map(h => row[h] !== undefined ? row[h] : '');
    sheet.appendRow(newRow);
    return 'appended';
  }

  if (newTs <= existingTs) return 'skipped';

  // Update existing row
  const updated = headers.map(h => row[h] !== undefined ? row[h] : data[existingRow - 1][headers.indexOf(h)]);
  sheet.getRange(existingRow, 1, 1, headers.length).setValues([updated]);
  return 'updated';
}

function softDelete_(ss, table, ids, device) {
  const sheet = ss.getSheetByName(table);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = findIdIdx_(headers);
  const tsIdx = headers.indexOf('_ts');
  const delIdx = headers.indexOf('_deleted');
  if (idIdx < 0 || delIdx < 0) return 0;

  let count = 0;
  ids.forEach(id => {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(id)) {
        sheet.getRange(i + 1, delIdx + 1).setValue(true);
        if (tsIdx >= 0) sheet.getRange(i + 1, tsIdx + 1).setValue(Date.now());
        count++;
        break;
      }
    }
  });
  return count;
}

function findIdIdx_(headers) {
  // Tìm cột ID — ưu tiên: Ma_Vay, Ma_PK, Ma_Don, Ma_TT, Ma_DHV, ID
  const priority = ['Ma_Vay', 'Ma_PK', 'Ma_Don', 'Ma_TT', 'Ma_DHV', 'ID'];
  for (const p of priority) {
    const idx = headers.indexOf(p);
    if (idx >= 0) return idx;
  }
  return -1;
}

/* ============================================================
 *  LOG — ghi lịch sử sync vào tab SYNC_LOG
 * ============================================================ */

function log_(method, device, action, count, status, note) {
  try {
    const ss = SpreadsheetApp.getActive();
    const log = ss.getSheetByName(SYNC_CONFIG.SHEET_TABS.SYNC_LOG);
    if (!log) return;
    log.appendRow([
      new Date(),
      method,
      device || '?',
      action || '?',
      count || 0,
      status || '?',
      note || '',
    ]);
    // Trim log to last 1000 rows
    if (log.getLastRow() > 1100) {
      log.deleteRows(2, log.getLastRow() - 1000);
    }
  } catch (e) {
    // Silent fail — logging không được làm crash sync
  }
}

/* ============================================================
 *  TRIGGERS — auto-cleanup
 * ============================================================ */

function setupAll() {
  setupSync();
  // (Setup từ AppsScript_AuraRental_v6.gs sẽ chạy riêng)
}

/* ============================================================
 *  MAINTENANCE
 * ============================================================ */

function getSyncStats() {
  const ss = SpreadsheetApp.getActive();
  const stats = {};
  ['KHO_VAY', 'PHU_KIEN', 'DON_HANG', 'DON_HANG_VAY', 'THANH_TOAN', 'FORM'].forEach(t => {
    const s = ss.getSheetByName(t);
    stats[t] = s ? s.getLastRow() - 1 : 0;
  });
  return stats;
}

function wipeAllData() {
  // ⚠️ NGUY HIỂM — xóa toàn bộ data, giữ header
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    'XÓA TOÀN BỘ DATA?',
    'Hành động này KHÔNG THỂ hoàn tác. Tất cả đơn hàng, váy, phụ kiện sẽ bị xóa.\n\nBạn có chắc?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  ['KHO_VAY', 'PHU_KIEN', 'DON_HANG', 'DON_HANG_VAY', 'THANH_TOAN', 'FORM'].forEach(t => {
    const s = ss.getSheetByName(t);
    if (s && s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
  });
  ui.alert('✅ Đã xóa toàn bộ data. Tất cả thiết bị sẽ tự đồng bộ về rỗng trong 30 giây.');
}