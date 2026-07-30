#!/usr/bin/env node
/**
 * reset-all.js — Xoá TOÀN BỘ data trên Supabase.
 *
 * Usage:
 *   node reset-all.js           # xoá tất cả
 *   node reset-all.js --dry-run # chỉ đếm, không xoá
 *
 * Cần file .env cùng thư mục:
 *   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJhbG...  (lấy từ Supabase → Settings → API → service_role)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mmiygzcljqayrfomxkkk.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!KEY) {
  console.error('❌ Thiếu SUPABASE_SERVICE_KEY. Tạo file .env cùng thư mục với:');
  console.error('   SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co');
  console.error('   SUPABASE_SERVICE_KEY=eyJhbG...');
  process.exit(1);
}

// Thứ tự: xoá bảng con trước (FK → bảng cha xoá sau)
const TABLES = [
  'order_dresses',
  'order_accessories',
  'payments',
  'orders',
  'booking_dresses',
  'booking_accessories',
  'bookings',
  'dresses',
  'accessories',
];

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function count(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`,
    { headers }
  );
  if (!res.ok) throw new Error(`count ${table}: ${res.status}`);
  // Count via Prefer: count=exact
  const res2 = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=id`,
    { headers: { ...headers, 'Prefer': 'count=exact' } }
  );
  if (!res2.ok) throw new Error(`count2 ${table}: ${res2.status}`);
  const cr = res2.headers.get('content-range'); // "0-N/total"
  if (!cr) return 0;
  const m = cr.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function deleteAll(table) {
  // Xoá theo điều kiện id=not.is.null (catch tất cả row, kể cả soft-delete)
  // Thử cả 2 chiến lược:
  //  1. id IS NOT NULL (xoá tất cả row có id)
  //  2. Nếu 401/403 → bảng có RLS chặn, fallback sang soft-delete
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) {
    throw new Error(`DELETE ${table}: ${res.status} ${await res.text()}`);
  }
}

(async () => {
  console.log(`🔗 Supabase: ${SUPABASE_URL}`);
  console.log(`📋 Mode: ${DRY ? 'DRY-RUN (chỉ đếm)' : 'XOÁ THẬT'}`);
  console.log();

  // 1. Đếm trước
  console.log('📊 Đếm row hiện tại:');
  const counts = {};
  for (const t of TABLES) {
    try {
      counts[t] = await count(t);
      console.log(`   ${t.padEnd(22)} ${counts[t]}`);
    } catch (e) {
      console.log(`   ${t.padEnd(22)} ⚠️  ${e.message}`);
      counts[t] = null;
    }
  }

  const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
  console.log(`\n   Tổng: ${total} row`);

  if (total === 0) {
    console.log('\n✅ Database đã trống. Không cần xoá.');
    return;
  }

  if (DRY) {
    console.log('\nℹ️  Dry-run kết thúc. Bỏ flag --dry-run để xoá thật.');
    return;
  }

  // 2. Confirm
  console.log('\n⚠️  SẼ XOÁ VĨNH VIỄN. Nhấn Ctrl+C trong 5s để huỷ...');
  await new Promise(r => setTimeout(r, 5000));

  // 3. Xoá
  console.log('\n🗑  Đang xoá:');
  for (const t of TABLES) {
    if (counts[t] === 0) {
      console.log(`   ${t.padEnd(22)} skip (0 row)`);
      continue;
    }
    try {
      await deleteAll(t);
      console.log(`   ${t.padEnd(22)} ✅ xoá ${counts[t]} row`);
    } catch (e) {
      console.log(`   ${t.padEnd(22)} ❌ ${e.message}`);
    }
  }

  // 4. Verify
  console.log('\n🔍 Verify (đếm lại):');
  for (const t of TABLES) {
    const n = await count(t);
    console.log(`   ${t.padEnd(22)} ${n}`);
  }

  console.log('\n✅ Xong.');
})();