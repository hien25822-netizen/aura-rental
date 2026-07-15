/**
 * ============================================================
 * AURA RENTAL — Data Migration Script
 * Migrate localStorage → Supabase
 *
 * Usage:
 *   1. Open app in browser
 *   2. Open DevTools Console (F12)
 *   3. Paste entire script and press Enter
 *   4. Follow prompts
 * ============================================================
 */

const MIGRATE_STORE = 'aura_db_v2';

async function migrateToSupabase() {
  // Use SupabaseService if available, else use window.supabase directly
  if (!window.SupabaseService) {
    console.warn('⚠️ SupabaseService not loaded - using window.supabase directly');
    window.SupabaseService = {
      fetchDresses: async () => {
        const { data } = await window.supabase.from('dresses').select('*').is('deleted_at', null);
        return (data || []).map(d => ({
          _dbId: d.id, id: d.id, Ma_Vay: d.ma_vay, Ten_Vay: d.ten_vay
        }));
      },
      fetchAccessories: async () => {
        const { data } = await window.supabase.from('accessories').select('*').is('deleted_at', null);
        return (data || []).map(a => ({
          _dbId: a.id, id: a.id, Ma_PK: a.ma_pk, Ten_PK: a.ten_pk
        }));
      }
    };
  }

  if (!window.SupabaseService?.isConfigured && !window._supabaseClient) {
    console.error('❌ Supabase not configured. Check APP_CONFIG.');
    return;
  }

  console.log('🚀 Starting migration...');

  // 1. Load localStorage data
  const stored = localStorage.getItem(MIGRATE_STORE);
  if (!stored) {
    console.error('❌ No localStorage data found.');
    return;
  }

  let localData;
  try {
    localData = JSON.parse(stored);
  } catch (e) {
    console.error('❌ Failed to parse localStorage:', e);
    return;
  }

  console.log('📦 Local data found:', {
    dresses: localData.vay?.length || 0,
    accessories: localData.pk?.length || 0,
    orders: localData.don?.length || 0,
    payments: localData.tt?.length || 0
  });

  // 2. Confirm migration
  const confirmed = confirm(
    '🚀 BẮT ĐẦU MIGRATE?\n\n' +
    `• Váy: ${localData.vay?.length || 0}\n` +
    `• Phụ kiện: ${localData.pk?.length || 0}\n` +
    `• Đơn: ${localData.don?.length || 0}\n` +
    `• Thanh toán: ${localData.tt?.length || 0}\n\n` +
    '⚠️ Dữ liệu trùng lặp sẽ bị bỏ qua.'
  );

  if (!confirmed) {
    console.log('❌ Migration cancelled.');
    return;
  }

  // 3. Migrate dresses
  console.log('\n👗 Migrating dresses...');
  let dressesMigrated = 0;
  let dressesSkipped = 0;

  for (const dress of (localData.vay || [])) {
    try {
      // Check if already exists by ma_vay
      const existing = await window.supabase
        .from('dresses')
        .select('id')
        .eq('ma_vay', dress.Ma_Vay)
        .maybeSingle();

      if (existing) {
        dressesSkipped++;
        console.log(`  ⏭️  Skip: ${dress.Ten_Vay} (${dress.Ma_Vay})`);
        continue;
      }

      const { data, error } = await window.supabase
        .from('dresses')
        .insert([{
          ma_vay: dress.Ma_Vay,
          ten_vay: dress.Ten_Vay,
          size: dress.Size,
          gia_vay_goc: dress.Gia_Vay_Goc || 0,
          gia_thue_12h: dress.Gia_Thue_12h || 0,
          gia_thue_1_ngay: dress.Gia_Thue_1_Ngay || 0,
          gia_thue_3_ngay: dress.Gia_Thue_3_Ngay || 0,
          anh_vay: dress.Anh_Vay || '',
          ghi_chu: dress.Ghi_Chu || '',
          so_lan_thue: dress.So_Lan_Thue || 0
        }])
        .select()
        .single();

      if (error) throw error;

      dressesMigrated++;
      console.log(`  ✅ Migrated: ${dress.Ten_Vay} (${dress.Ma_Vay})`);
    } catch (err) {
      console.error(`  ❌ Error migrating dress ${dress.Ma_Vay}:`, err.message);
    }
  }

  // 4. Migrate accessories
  console.log('\n💍 Migrating accessories...');
  let accMigrated = 0;
  let accSkipped = 0;

  for (const acc of (localData.pk || [])) {
    try {
      const existing = await window.supabase
        .from('accessories')
        .select('id')
        .eq('ma_pk', acc.Ma_PK)
        .maybeSingle();

      if (existing) {
        accSkipped++;
        console.log(`  ⏭️  Skip: ${acc.Ten_PK} (${acc.Ma_PK})`);
        continue;
      }

      const { data, error } = await window.supabase
        .from('accessories')
        .insert([{
          ma_pk: acc.Ma_PK,
          ten_pk: acc.Ten_PK,
          loai: acc.Loai,
          so_luong_tong: acc.So_Luong_Tong || 1,
          gia_thue_12h: acc.Gia_Thue_12h || 0,
          gia_thue_1_ngay: acc.Gia_Thue_1_Ngay || 0,
          gia_thue_3_ngay: acc.Gia_Thue_3_Ngay || 0,
          anh_pk: acc.Anh_PK || '',
          ghi_chu: acc.Ghi_Chu || ''
        }])
        .select()
        .single();

      if (error) throw error;

      accMigrated++;
      console.log(`  ✅ Migrated: ${acc.Ten_PK} (${acc.Ma_PK})`);
    } catch (err) {
      console.error(`  ❌ Error migrating accessory ${acc.Ma_PK}:`, err.message);
    }
  }

  // 5. Fetch migrated items to build lookup maps
  console.log('\n📋 Building lookup maps...');
  const dresses = await window.SupabaseService.fetchDresses();
  const accessories = await window.SupabaseService.fetchAccessories();

  const dressMap = {};
  dresses.forEach(d => dressMap[d.Ma_Vay] = d._dbId || d.id);

  const accMap = {};
  accessories.forEach(a => accMap[a.Ma_PK] = a._dbId || a.id);

  console.log('  Dress map:', Object.keys(dressMap).length, 'items');
  console.log('  Accessory map:', Object.keys(accMap).length, 'items');

  // 6. Migrate orders with relations
  console.log('\n📦 Migrating orders...');
  let ordersMigrated = 0;
  let ordersSkipped = 0;

  for (const order of (localData.don || [])) {
    try {
      // Check if already exists
      const existing = await window.supabase
        .from('orders')
        .select('id')
        .eq('ma_don', order.Ma_Don)
        .maybeSingle();

      if (existing) {
        ordersSkipped++;
        console.log(`  ⏭️  Skip: ${order.Ma_Don}`);
        continue;
      }

      // Insert order
      const { data: newOrder, error: orderErr } = await window.supabase
        .from('orders')
        .insert([{
          ma_don: order.Ma_Don,
          trang_thai_don: order.Trang_Thai_Don || 'Chốt thuê',
          insta_khach: order.Insta_Khach || '',
          sdt: order.SDT || '',
          goi_thue: order.Goi_Thue,
          ngay_lay: order.Ngay_Lay,
          gio_lay: order.Gio_Lay || '09:00',
          ngay_tra: order.Ngay_Tra,
          hinh_thuc_coc: order.Hinh_Thuc_Coc || '',
          hinh_thuc_nhan: order.Hinh_Thuc_Nhan || '',
          dia_chi: order.Dia_Chi || '',
          su_kien: order.Su_Kien || '',
          ghi_chu: order.Ghi_Chu || '',
          chi_phi_khac: order.Chi_Phi_Khac || 0,
          trang_thai_hoan_coc: order.Trang_Thai_Hoan_Coc || false,
          thoi_gian_hoan_coc: order.Thoi_Gian_Hoan_Coc || null,
          ngay_tao: order.Ngay_Tao || new Date().toISOString()
        }])
        .select()
        .single();

      if (orderErr) throw orderErr;

      // Insert dress relations
      const dhvs = order.dhvs || order.dressList || [];
      if (dhvs.length) {
        const dressInserts = dhvs
          .filter(d => {
            const maVay = d.vay || d.Ma_Vay;
            return dressMap[maVay];
          })
          .map(d => {
            const maVay = d.vay || d.Ma_Vay;
            return {
              order_id: newOrder.id,
              dress_id: dressMap[maVay]
            };
          })
          .filter(d => d.dress_id);

        if (dressInserts.length) {
          await window.supabase.from('order_dresses').insert(dressInserts);
        }
      }

      // Insert accessory relations
      const pks = order.Ma_PK || order.pks || [];
      if (pks.length) {
        const accInserts = pks
          .filter(maPk => accMap[maPk])
          .map(maPk => ({
            order_id: newOrder.id,
            accessory_id: accMap[maPk]
          }))
          .filter(a => a.accessory_id);

        if (accInserts.length) {
          await window.supabase.from('order_accessories').insert(accInserts);
        }
      }

      ordersMigrated++;
      console.log(`  ✅ Migrated: ${order.Ma_Don} (${order.Insta_Khach || order.SDT})`);
    } catch (err) {
      console.error(`  ❌ Error migrating order ${order.Ma_Don}:`, err.message);
    }
  }

  // 7. Migrate payments
  console.log('\n💰 Migrating payments...');
  let paymentsMigrated = 0;
  let paymentsSkipped = 0;

  for (const payment of (localData.tt || [])) {
    try {
      const existing = await window.supabase
        .from('payments')
        .select('id')
        .eq('ma_tt', payment.Ma_TT)
        .maybeSingle();

      if (existing) {
        paymentsSkipped++;
        console.log(`  ⏭️  Skip: ${payment.Ma_TT}`);
        continue;
      }

      const { data, error } = await window.supabase
        .from('payments')
        .insert([{
          ma_tt: payment.Ma_TT,
          order_id: payment.Ma_Don || payment.order_id,
          ngay_tt: payment.Ngay_TT || payment.ngay,
          tien_coc: payment.Tien_Coc || 0,
          chi_phi_khac: payment.Chi_Phi_Khac || 0,
          ghi_chu: payment.Ghi_Chu || ''
        }])
        .select()
        .single();

      if (error) throw error;

      paymentsMigrated++;
      console.log(`  ✅ Migrated: ${payment.Ma_TT}`);
    } catch (err) {
      console.error(`  ❌ Error migrating payment ${payment.Ma_TT}:`, err.message);
    }
  }

  // 8. Summary
  console.log('\n========================================');
  console.log('📊 MIGRATION COMPLETE!');
  console.log('========================================');
  console.log(`👗 Váy: ${dressesMigrated} migrated, ${dressesSkipped} skipped`);
  console.log(`💍 Phụ kiện: ${accMigrated} migrated, ${accSkipped} skipped`);
  console.log(`📦 Đơn: ${ordersMigrated} migrated, ${ordersSkipped} skipped`);
  console.log(`💰 Thanh toán: ${paymentsMigrated} migrated, ${paymentsSkipped} skipped`);
  console.log('========================================');

  alert(
    '✅ MIGRATE THÀNH CÔNG!\n\n' +
    `👗 Váy: ${dressesMigrated} migrated, ${dressesSkipped} skipped\n` +
    `💍 Phụ kiện: ${accMigrated} migrated, ${accSkipped} skipped\n` +
    `📦 Đơn: ${ordersMigrated} migrated, ${ordersSkipped} skipped\n` +
    `💰 Thanh toán: ${paymentsMigrated} migrated, ${paymentsSkipped} skipped\n\n` +
    'Hãy reload trang để xem dữ liệu mới!'
  );
}

// Run migration
migrateToSupabase();
