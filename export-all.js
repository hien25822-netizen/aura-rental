#!/usr/bin/env node
/**
 * export-all.js — Dump toàn bộ data từ Supabase ra file JSON.
 *
 * Usage:
 *   node --env-file=.env export-all.js
 *   node --env-file=.env export-all.js --out backup-2026-08-03.json
 *
 * Cần file .env cùng thư mục:
 *   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJhbG...  (lấy từ Supabase → Settings → API → service_role)
 *
 * Output: file JSON chứa 9 bảng + metadata (timestamp, version).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mmiygzcljqayrfomxkkk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;

if (!KEY) {
  console.error('❌ Thiếu SUPABASE_SERVICE_KEY. Tạo file .env cùng thư mục:');
  console.error('   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co');
  console.error('   SUPABASE_SERVICE_KEY=eyJhbG...');
  process.exit(1);
}

// Thứ tự: bảng cha trước (để khi import có thể check FK)
const TABLES = [
  'dresses',
  'accessories',
  'orders',
  'order_dresses',
  'order_accessories',
  'payments',
  'bookings',
  'booking_dresses',
  'booking_accessories',
];

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
};

async function fetchTable(table) {
  // Supabase REST: GET /rest/v1/<table>?select=* — limit mặc định 1000, dùng pagination
  // Tăng limit lên max (1000) và loop nếu cần
  let all = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id&offset=${offset}&limit=${pageSize}`,
      { headers }
    );
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseOut() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--out');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return `backup-${todayStamp()}.json`;
}

(async () => {
  console.log(`🔗 Supabase: ${SUPABASE_URL}`);
  console.log(`📦 Exporting...\n`);

  const data = {
    _meta: {
      exportedAt: new Date().toISOString(),
      source: SUPABASE_URL,
      version: 1,
      tables: TABLES,
    },
  };

  let total = 0;
  for (const t of TABLES) {
    try {
      const rows = await fetchTable(t);
      data[t] = rows;
      total += rows.length;
      console.log(`   ${t.padEnd(22)} ${String(rows.length).padStart(5)} row`);
    } catch (e) {
      console.log(`   ${t.padEnd(22)} ❌ ${e.message}`);
      data[t] = [];
    }
  }

  const filename = parseOut();
  const fs = require('fs');
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));

  const sizeKB = (fs.statSync(filename).size / 1024).toFixed(1);
  console.log(`\n✅ Đã ghi ${total} row → ${filename} (${sizeKB} KB)`);
  console.log(`\n📋 Bước tiếp:`);
  console.log(`   - Upload vào Google Drive folder "Aura Rental Backups"`);
  console.log(`   - Giữ 4 tuần gần nhất, xoá file cũ hơn`);
})();