#!/usr/bin/env node
/**
 * bulk-import-dresses.js — Parse inventory.xlsx + upsert vào Supabase dresses table.
 *
 * Usage:
 *   node --env-file=.env bulk-import-dresses.js [--dry-run]
 *
 * Đọc inventory.xlsx bằng built-in zlib + DOMParser (không cần npm package).
 * Map cột: Tên → ten_vay, Size → size, Giá gốc → gia_vay_goc,
 *          12h → gia_thue_12h, 1 ngày → gia_thue_1_ngay,
 *          3 ngày → gia_thue_3_ngay, ategory → ghi_chu.
 */

'use strict';

const fs = require('fs');
const zlib = require('zlib');

// Load .env file manually (Node < 20 compat)
const envPath = '.env';
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mmiygzcljqayrfomxkkk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.argv.includes('--dry-run');
const XLSX_PATH = process.argv.find(a => a.endsWith('.xlsx')) ||
  '/Users/nguyenhien/Hienrrr/Apps/Aura Rental/inventory.xlsx';

if (!KEY) {
  console.error('❌ Thiếu SUPABASE_SERVICE_KEY. Tạo file .env cùng thư mục:');
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

  // Parse ZIP via central directory (more reliable than local headers)
  const entries = {};

  // Find End of Central Directory record
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

  // Walk central directory
  let ci = cdOffset;
  for (let e = 0; e < numEntries; e++) {
    if (buf.readUInt32LE(ci) !== 0x02014b50) throw new Error('Invalid CD entry at ' + ci);
    const compression = buf.readUInt16LE(ci + 10);
    const compressedSize = buf.readUInt32LE(ci + 20);
    const uncompressedSize = buf.readUInt32LE(ci + 24);
    const nameLen = buf.readUInt16LE(ci + 28);
    const extraLen = buf.readUInt16LE(ci + 30);
    const commentLen = buf.readUInt16LE(ci + 32);
    const localOffset = buf.readUInt32LE(ci + 42);
    const name = buf.toString('utf8', ci + 46, ci + 46 + nameLen);
    ci += 46 + nameLen + extraLen + commentLen;

    // Read local file header to get actual data offset + data descriptor flag
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
        // Try raw deflate (no header)
        data = zlib.inflateRawSync(compressed);
      }
    } else {
      continue;
    }
    entries[name] = data;
  }

  // Get shared strings
  let sharedStrings = [];
  if (entries['xl/sharedStrings.xml']) {
    const xml = entries['xl/sharedStrings.xml'].toString('utf8');
    sharedStrings = parseSharedStrings(xml);
  }

  // Get worksheet (first sheet)
  const sheetKeys = Object.keys(entries).filter(k => k.match(/xl\/worksheets\/sheet1\.xml/));
  if (!sheetKeys.length) throw new Error('Không tìm thấy sheet1');
  const sheetXml = entries[sheetKeys[0]].toString('utf8');
  const rows = parseSheet(sheetXml, sharedStrings);

  return rows;
}

function parseSharedStrings(xml) {
  const strings = [];
  // Match each <si> element containing <t>...</t>
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    // Extract all <t> values within this <si>
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
  // Split by </c> — each segment ends with the content before </c>
  // The opening <c...> tag is somewhere in the segment.
  // Use lastIndexOf to find the LAST <c ...> in the segment (handles nested cells).
  const segments = xml.split('</c>');
  const allCells = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const actualStart = seg.lastIndexOf('<c ');
    if (actualStart === -1) continue;

    const tagStr = seg.slice(actualStart);
    // Match: <c r="COL ROW" ATTRS>
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

  // Group by row number
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
  // Handle decimal numbers like "1800000.0" → 1800000
  const s = str.toString().trim();
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) {
    // Remove dots/commas/spaces, then handle decimal
    const intPart = s.slice(0, dotIdx).replace(/[^\d]/g, '');
    const decPart = s.slice(dotIdx + 1).replace(/[^\d]/g, '');
    // Only use integer part (e.g. "1800000.0" → 1800000, not 18000000)
    return parseInt(intPart, 10) || 0;
  }
  const cleaned = s.replace(/[^\d]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function rowToDress(rowObj) {
  const cells = rowObj.cells;
  // Map columns from actual XLSX structure:
  // A=image, B=Tên, C=Size, D=Ghi chú, E=Giá gốc, F=12h, G=1 ngày, H=3 ngày
  const get = (col) => (cells.find(c => c.col === col) || { val: '' }).val.trim();

  const rawSize = get('C');
  // Normalize size to match CHECK constraint: S, M, L, XL, Free size
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
    // Fallback: check if it contains a known size
    const up = rawSize.toUpperCase();
    if (up.includes('S') && up.includes('M') && !up.includes('L')) size = 'Free size';
    else if (up.includes('M') && up.includes('L')) size = 'Free size';
    else if (up.includes('S') && up.includes('L')) size = 'Free size';
    else size = 'Free size'; // default fallback
  }

  const ten_vay = capitalize(get('B'));
  const ghi_chu = get('D');
  const gia_vay_goc = parsePrice(get('E'));
  const gia_thue_12h = parsePrice(get('F'));
  const gia_thue_1_ngay = parsePrice(get('G'));
  const gia_thue_3_ngay = parsePrice(get('H'));

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

  console.log(`   Total rows (incl. header): ${rawRows.length}`);

  // Filter to data rows (skip rows 1-4 = header/totals/empty, keep row 5+)
  const dataRows = rawRows.filter(r => r.rowNum >= 5 && r.cells.length > 0 && r.cells.some(c => c.val.trim()));

  // Parse to dresses
  const dresses = dataRows.map(rowToDress).filter(d => d.ten_vay && d.ten_vay.length > 0);

  // Validate
  const noName = dresses.filter(d => !d.ten_vay);
  if (noName.length) console.log(`⚠️  ${noName.length} rows without ten_vay — skipped`);

  console.log(`   Data rows: ${dresses.length}`);

  // Show first 10
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
    console.log('   Run without --dry-run to insert.');
    return;
  }

  // Get next ma_vay id
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dresses?select=ma_vay&order=ma_vay.desc&limit=1`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
  const existing = await res.json();
  let nextNum = 1;
  if (existing && existing.length > 0) {
    const last = existing[0].ma_vay;
    nextNum = parseInt(last.replace(/\D/g, ''), 10) + 1;
  }
  console.log(`\n🔢 Next ma_vay starts at V${String(nextNum).padStart(3, '0')}`);

  // Build insert rows with V001-V141 IDs
  const insertRows = dresses.map((d, i) => ({
    ma_vay: `V${String(nextNum + i).padStart(3, '0')}`,
    ten_vay: d.ten_vay,
    size: d.size,
    gia_vay_goc: d.gia_vay_goc,
    gia_thue_12h: d.gia_thue_12h,
    gia_thue_1_ngay: d.gia_thue_1_ngay,
    gia_thue_3_ngay: d.gia_thue_3_ngay,
    ghi_chu: d.ghi_chu || '',
    anh_vay: null,
  }));

  console.log(`\n📥 Upserting ${insertRows.length} dresses with correct prices...`);
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/dresses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(insertRows),
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error(`❌ Insert failed (${insertRes.status}):`, err);
    process.exit(1);
  }

  console.log(`✅ Upserted ${insertRows.length} dresses with correct prices (V${String(nextNum).padStart(3, '0')} → V${String(nextNum + insertRows.length - 1).padStart(3, '0')})`);
  console.log('\n📋 Bước tiếp:');
  console.log('   - Mở web app → hard refresh → tab Váy để verify');
})();
