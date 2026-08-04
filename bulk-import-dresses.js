#!/usr/bin/env node
/**
 * bulk-import-dresses.js — Parse inventory.xlsx + upsert vào Supabase dresses table.
 *
 * Usage:
 *   node bulk-import-dresses.js
 *
 * Luôn xoá toàn bộ váy cũ rồi insert lại từ V001.
 */

'use strict';

const fs = require('fs');
const zlib = require('zlib');

// Load .env file — use absolute path to avoid cwd issues
const envPath = '/Users/nguyenhien/Hienrrr/Apps/Aura Rental/.env';
if (fs.existsSync(envPath)) {
  console.log('   Loading .env from:', envPath);
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  });
} else {
  console.error('❌ .env not found at:', envPath);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mmiygzcljqayrfomxkkk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.argv.includes('--dry-run');
const XLSX_PATH = process.argv.find(a => a.endsWith('.xlsx')) ||
  '/Users/nguyenhien/Hienrrr/Apps/Aura Rental/inventory.xlsx';

console.log('🚀 Bắt đầu bulk-import-dresses...');
console.log('   SUPABASE_URL:', SUPABASE_URL);
console.log('   KEY loaded:', KEY ? '✅ (' + KEY.substring(0, 20) + '...)' : '❌ MISSING');
console.log('   XLSX_PATH:', XLSX_PATH);

if (!KEY) {
  console.error('❌ Thiếu SUPABASE_SERVICE_KEY. Kiểm tra file .env:');
  console.error('   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co');
  console.error('   SUPABASE_SERVICE_KEY=eyJhbG...');
  process.exit(1);
}

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates',
};

// ─── XLSX ZIP Parser (no npm) ─────────────────────────────────────────────────

async function parseXlsx(path) {
  const buf = fs.readFileSync(path);

  const entries = {};
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Invalid ZIP: no EOCD');

  const numEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ci = cdOffset;
  for (let e = 0; e < numEntries; e++) {
    if (buf.readUInt32LE(ci) !== 0x02014b50) throw new Error('Invalid CD entry at ' + ci);
    const compression = buf.readUInt16LE(ci + 10);
    const compressedSize = buf.readUInt32LE(ci + 20);
    const nameLen = buf.readUInt16LE(ci + 28);
    const extraLen = buf.readUInt16LE(ci + 30);
    const commentLen = buf.readUInt16LE(ci + 32);
    const localOffset = buf.readUInt32LE(ci + 42);
    const name = buf.toString('utf8', ci + 46, ci + 46 + nameLen);
    ci += 46 + nameLen + extraLen + commentLen;

    const lfhSig = buf.readUInt32LE(localOffset);
    if (lfhSig !== 0x04034b50) continue;
    const lfhNameLen = buf.readUInt16LE(localOffset + 26);
    const lfhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lfhNameLen + lfhExtraLen;

    let data;
    if (compression === 0) {
      data = buf.slice(dataStart, dataStart + compressedSize);
    } else if (compression === 8) {
      const compressed = buf.slice(dataStart, dataStart + compressedSize);
      try {
        data = zlib.inflateSync(compressed);
      } catch {
        data = zlib.inflateRawSync(compressed);
      }
    } else {
      continue;
    }
    entries[name] = data;
  }

  let sharedStrings = [];
  if (entries['xl/sharedStrings.xml']) {
    const xml = entries['xl/sharedStrings.xml'].toString('utf8');
    sharedStrings = parseSharedStrings(xml);
  }

  const sheetKeys = Object.keys(entries).filter(k => k.match(/xl\/worksheets\/sheet1\.xml/));
  if (!sheetKeys.length) throw new Error('Không tìm thấy sheet1');
  const sheetXml = entries[sheetKeys[0]].toString('utf8');
  const rows = parseSheet(sheetXml, sharedStrings);

  return rows;
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    const tValues = [];
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRegex.exec(m[1])) !== null) {
      tValues.push(t[1]);
    }
    strings.push(tValues.join(''));
  }
  return strings;
}

function parseSheet(xml, sharedStrings) {
  const segments = xml.split('</c>');
  const allCells = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const actualStart = seg.lastIndexOf('<c ');
    if (actualStart === -1) continue;

    const tagStr = seg.slice(actualStart);
    const tagMatch = /^<c\s+r="([A-Z]+)(\d+)"([^>]*)>/.exec(tagStr);
    if (!tagMatch) continue;

    const col = tagMatch[1];
    const rowNum = parseInt(tagMatch[2], 10);
    const attrs = tagMatch[3];
    const inner = seg.slice(actualStart + tagMatch[0].length);
    const isShared = attrs.includes('t="s"');
    const vMatch = /<v>([^<]*)<\/v>/.exec(inner);
    const val = vMatch ? vMatch[1].trim() : '';

    if (val !== '') {
      allCells.push({ rowNum, col, val: isShared ? (sharedStrings[parseInt(val, 10)] || '') : val });
    }
  }

  const byRow = {};
  for (const cell of allCells) {
    if (!byRow[cell.rowNum]) byRow[cell.rowNum] = [];
    byRow[cell.rowNum].push({ col: cell.col, val: cell.val });
  }

  return Object.keys(byRow).sort((a, b) => a - b).map(rowNum => ({
    rowNum: parseInt(rowNum, 10),
    cells: byRow[rowNum],
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function parsePrice(str) {
  if (!str) return 0;
  const s = str.toString().trim();
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) {
    const intPart = s.slice(0, dotIdx).replace(/[^\d]/g, '');
    return parseInt(intPart, 10) || 0;
  }
  const cleaned = s.replace(/[^\d]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function rowToDress(rowObj) {
  const cells = rowObj.cells;
  // Columns: A=Tên váy, B=Size, C=Giá gốc, D=12h, E=1 ngày, F=3 ngày, G=Ghi chú
  const get = (col) => (cells.find(c => c.col === col) || { val: '' }).val.trim();

  const rawSize = get('B');
  const sizeMap = {
    'S': 'S', 's': 'S',
    'M': 'M', 'm': 'M',
    'L': 'L', 'l': 'L',
    'XL': 'XL', 'xl': 'XL', 'Xl': 'XL',
    'FREE': 'Free size', 'FREE SIZE': 'Free size', 'Free': 'Free size',
    'free': 'Free size', 'free size': 'Free size', 'freesize': 'Free size',
    'Freesize': 'Free size',
    'S/M': 'Free size', 's/m': 'Free size', 'S/M/L': 'Free size',
    'M/L': 'Free size', 'm/l': 'Free size',
    'S/L': 'Free size', 's/l': 'Free size',
  };
  let size = sizeMap[rawSize.trim()] || sizeMap[rawSize.trim().toUpperCase()];
  if (!size) {
    const up = rawSize.toUpperCase();
    if ((up.includes('S') && up.includes('M') && !up.includes('L')) ||
        (up.includes('M') && up.includes('L')) ||
        (up.includes('S') && up.includes('L'))) {
      size = 'Free size';
    } else {
      size = 'Free size';
    }
  }

  const ten_vay = capitalize(get('A'));
  const ghi_chu = get('G');
  const gia_vay_goc = parsePrice(get('C'));
  const gia_thue_12h = parsePrice(get('D'));
  const gia_thue_1_ngay = parsePrice(get('E'));
  const gia_thue_3_ngay = parsePrice(get('F'));

  return { ten_vay, size, ghi_chu, gia_vay_goc, gia_thue_12h, gia_thue_1_ngay, gia_thue_3_ngay };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`📊 Parsing: ${XLSX_PATH}`);

  let rawRows;
  try {
    rawRows = await parseXlsx(XLSX_PATH);
  } catch (e) {
    console.error('❌ Parse error:', e.message);
    process.exit(1);
  }

  console.log(`   Total rows: ${rawRows.length}`);

  // Skip header row 1, keep row 2+
  const dataRows = rawRows.filter(r => r.rowNum >= 2 && r.cells.length > 0 && r.cells.some(c => c.val.trim()));
  const dresses = dataRows.map(rowToDress).filter(d => d.ten_vay && d.ten_vay.length > 0);

  const noName = dresses.filter(d => !d.ten_vay);
  if (noName.length) console.log(`⚠️  ${noName.length} rows without ten_vay — skipped`);

  console.log(`   Data rows: ${dresses.length}`);

  console.log('\n📋 Preview (first 10):');
  dresses.slice(0, 10).forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.ten_vay} | ${d.size} | gốc:${d.gia_vay_goc} | 12h:${d.gia_thue_12h} | 1d:${d.gia_thue_1_ngay} | 3d:${d.gia_thue_3_ngay}`);
    if (d.ghi_chu) console.log(`      ghi_chú: ${d.ghi_chu.substring(0, 60)}`);
  });

  if (dresses.length > 10) {
    console.log(`   ... và ${dresses.length - 10} váy nữa`);
  }

  if (DRY) {
    console.log(`\nℹ️  Dry-run: ${dresses.length} dresses would be inserted.`);
    return;
  }

  // Step 1: Fetch existing dresses + find max ma_vay
  console.log(`\n🔄 Cập nhật giá váy trong Supabase...`);
  console.log(`   (Nếu fetch thất bại do network, dùng trình duyệt: open debug-sync.html)`);

  const allExisting = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/dresses?select=id,ma_vay,ten_vay&limit=100&offset=${offset}`, {
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
    });
    const data = await res.json();
    if (!data || !data.length) break;
    allExisting.push(...data);
    console.log(`   Trang ${Math.floor(offset/100)+1}: +${data.length} = ${allExisting.length} tổng`);
    if (data.length < 100) break;
  }
  const existing = allExisting;
  console.log(`   Tìm thấy ${existing.length} váy trong Supabase.`);

  // Xoá hết váy cũ trước khi insert mới (đảm bảo chỉ còn data từ file Excel này)
  console.log(`\n🗑️  Xoá ${existing.length} váy cũ...`);
  for (const ex of existing) {
    await fetch(`${SUPABASE_URL}/rest/v1/dresses?id=eq.${ex.id}`, {
      method: 'DELETE',
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
    });
  }
  console.log(`   ✅ Đã xoá ${existing.length} váy cũ.`);

  // Tất cả váy từ XLSX đều là insert mới (vì đã xoá hết cũ rồi)
  const insertRows = dresses.map((d, i) => ({
    ma_vay: `V${String(i + 1).padStart(3, '0')}`,
    ten_vay: d.ten_vay,
    size: d.size,
    gia_vay_goc: d.gia_vay_goc,
    gia_thue_12h: d.gia_thue_12h,
    gia_thue_1_ngay: d.gia_thue_1_ngay,
    gia_thue_3_ngay: d.gia_thue_3_ngay,
    ghi_chu: d.ghi_chu || '',
    anh_vay: null,
  }));

  console.log(`   📥 Inserting ${insertRows.length} váy mới...`);
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/dresses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(insertRows),
  });
  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error(`   ❌ Insert failed (${insertRes.status}):`, err);
  } else {
    console.log(`   ✅ Inserted ${insertRows.length} váy.`);
  }

  console.log(`\n✅ Xong! Đã xoá ${existing.length} váy cũ, thêm ${insertRows.length} váy mới.`);
  console.log('\n📋 Bước tiếp:');
  console.log('   - Mở web app → hard refresh (Cmd+Shift+R) → tab Váy để verify');
  return;
});
