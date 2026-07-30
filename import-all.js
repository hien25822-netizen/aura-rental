#!/usr/bin/env node
/**
 * import-all.js — Restore data từ file JSON backup lên Supabase.
 *
 * Usage:
 *   node --env-file=.env import-all.js --file backup-2026-08-03.json
 *   node --env-file=.env import-all.js --file backup-2026-08-03.json --dry-run
 *
 * CẢNH BÁO: Script này GHI ĐÈ dữ liệu hiện tại. Dùng cẩn thận!
 *
 * Cần file .env cùng thư mục:
 *   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJhbG...  (lấy từ Supabase → Settings → API → service_role)
 *
 * Thứ tự restore:
 *   1. Bảng cha (dresses, accessories, orders) — không có FK
 *   2. Bảng con có FK → cha (order_*, payments, booking_*)
 *
 * Upsert theo `id` → idempotent, chạy nhiều lần OK.
 */

const fs = require('fs');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mmiygzcljqayrfomxkkk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!KEY) {
  console.error('❌ Thiếu SUPABASE_SERVICE_KEY. Tạo file .env cùng thư mục:');
  console.error('   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co');
  console.error('   SUPABASE_SERVICE_KEY=eyJhbG...');
  process.exit(1);
}

// Thứ tự restore: cha trước, con sau (FK → cha phải tồn tại)
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
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates', // upsert by PK
};

function parseFile() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--file');
  if (idx === -1 || !args[idx + 1]) {
    console.error('❌ Thiếu --file <path>. Ví dụ:');
    console.error('   node --env-file=.env import-all.js --file backup-2026-08-03.json');
    process.exit(1);
  }
  return args[idx + 1];
}

async function upsertTable(table, rows) {
  if (!rows || rows.length === 0) return 0;
  // Supabase upsert: POST /rest/v1/<table> with Prefer: resolution=merge-duplicates
  // Chia batch 500 row/lần để tránh timeout
  const batchSize = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}`,
      { method: 'POST', headers, body: JSON.stringify(batch) }
    );
    if (!res.ok) {
      throw new Error(`${table}: ${res.status} ${await res.text()}`);
    }
    total += batch.length;
  }
  return total;
}

(async () => {
  const filename = parseFile();
  console.log(`🔗 Supabase: ${SUPABASE_URL}`);
  console.log(`📂 File: ${filename}`);
  console.log(`📋 Mode: ${DRY ? 'DRY-RUN (chỉ đếm)' : 'RESTORE THẬT'}\n`);

  if (!fs.existsSync(filename)) {
    console.error(`❌ Không tìm thấy file: ${filename}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));

  if (data._meta) {
    console.log(`📅 Backup date: ${data._meta.exportedAt}`);
    console.log(`   Source: ${data._meta.source}`);
    console.log(`   Version: ${data._meta.version}\n`);
  }

  // Đếm trước
  console.log('📊 Sẽ restore:');
  let grandTotal = 0;
  for (const t of TABLES) {
    const n = (data[t] || []).length;
    grandTotal += n;
    console.log(`   ${t.padEnd(22)} ${String(n).padStart(5)} row`);
  }
  console.log(`\n   Tổng: ${grandTotal} row`);

  if (grandTotal === 0) {
    console.log('\n⚠️  File trống. Không có gì để restore.');
    return;
  }

  if (DRY) {
    console.log('\nℹ️  Dry-run kết thúc. Bỏ flag --dry-run để restore thật.');
    return;
  }

  // Confirm
  console.log('\n⚠️  SẼ GHI ĐÈ DỮ LIỆU HIỆN TẠI. Nhấn Ctrl+C trong 5s để huỷ...');
  await new Promise(r => setTimeout(r, 5000));

  // Restore theo thứ tự
  console.log('\n📥 Đang restore:');
  for (const t of TABLES) {
    const rows = data[t] || [];
    if (rows.length === 0) {
      console.log(`   ${t.padEnd(22)} skip (0 row)`);
      continue;
    }
    try {
      const n = await upsertTable(t, rows);
      console.log(`   ${t.padEnd(22)} ✅ upsert ${n} row`);
    } catch (e) {
      console.log(`   ${t.padEnd(22)} ❌ ${e.message}`);
    }
  }

  console.log('\n✅ Restore xong.');
  console.log('\n📋 Bước tiếp:');
  console.log('   - Mở web app → hard refresh (Ctrl+Shift+R)');
  console.log('   - Verify data hiển thị đúng');
})();