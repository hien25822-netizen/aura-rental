/**
 * supabase-upload-all.js
 * Upload tất cả váy + phụ kiện từ localStorage lên Supabase.
 *
 * Cách dùng: Mở app Aura Rental → F12 → Console → paste toàn bộ script này → Enter.
 *
 * LƯU Ý: Sau khi import Excel xong, chạy script này để đẩy toàn bộ lên Supabase.
 */

(async () => {
  if (!window.SupabaseService || !window.SupabaseService.isConfigured()) {
    console.error('❌ SupabaseService chưa sẵn sàng hoặc chưa đăng nhập. Đợi app load xong và đăng nhập Supabase trước.');
    return;
  }

  // App dùng key 'aura_v8' làm localStorage store
  const STORE_KEY = 'aura_v8';
  const db = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');

  const dresses = db.vay || [];
  const accessories = db.pk || [];

  console.log(`📦 localStorage ${STORE_KEY}: ${dresses.length} váy, ${accessories.length} phụ kiện`);

  const existingDresses = dresses.filter(v => v._dbId);
  const newDresses = dresses.filter(v => !v._dbId);
  const existingAcc = accessories.filter(p => p._dbId);
  const newAcc = accessories.filter(p => !p._dbId);
  console.log(`👗 Váy: ${existingDresses.length} đã có _dbId (sẽ bỏ qua), ${newDresses.length} cần upload`);
  console.log(`💍 PK:  ${existingAcc.length} đã có _dbId (sẽ bỏ qua), ${newAcc.length} cần upload`);

  if (newDresses.length === 0 && newAcc.length === 0) {
    console.warn('⚠️ Không có gì mới để upload. Hãy import Excel trước rồi thử lại.');
    return;
  }

  // ========== UPLOAD DRESSES ==========
  if (newDresses.length > 0) {
    console.log(`\n👗 Đang upload ${newDresses.length} váy...`);
    try {
      const result = await window.SupabaseService.createDressBatch(newDresses);
      console.log(`✅ Váy: upload xong (${result.count}/${newDresses.length})`);
      // Gán _dbId cho local dress dựa trên Ma_Vay
      const supDresses = await window.SupabaseService.fetchDresses();
      newDresses.forEach(localV => {
        const sup = supDresses.find(s => s.Ma_Vay === localV.Ma_Vay);
        if (sup) {
          localV._dbId = sup._dbId;
          localV.id = sup._dbId;
        }
      });
      console.log(`   Đã gán _dbId cho ${newDresses.length} váy trong localStorage`);
    } catch (err) {
      console.error('❌ Lỗi upload váy:', err);
      return;
    }
  }

  // ========== UPLOAD ACCESSORIES ==========
  if (newAcc.length > 0) {
    console.log(`\n💍 Đang upload ${newAcc.length} phụ kiện...`);
    try {
      const result = await window.SupabaseService.createAccessoryBatch(newAcc);
      console.log(`✅ PK: upload xong (${result.count}/${newAcc.length})`);
      // Gán _dbId cho local accessory dựa trên Ma_PK
      const supAcc = await window.SupabaseService.fetchAccessories();
      newAcc.forEach(localP => {
        const sup = supAcc.find(s => s.Ma_PK === localP.Ma_PK);
        if (sup) {
          localP._dbId = sup._dbId;
          localP.id = sup._dbId;
        }
      });
      console.log(`   Đã gán _dbId cho ${newAcc.length} phụ kiện trong localStorage`);
    } catch (err) {
      console.error('❌ Lỗi upload phụ kiện:', err);
      return;
    }
  }

  // ========== PERSIST BACK TO LOCALSTORAGE ==========
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
  console.log('\n💾 Đã lưu localStorage với _dbId mới.');

  // ========== VERIFY ==========
  const verifyDresses = await window.SupabaseService.fetchDresses();
  const verifyAcc = await window.SupabaseService.fetchAccessories();
  console.log(`\n🎉 Trên Supabase hiện có: ${verifyDresses.length} váy, ${verifyAcc.length} phụ kiện.`);
  console.log('   F5 trang để thấy dữ liệu đồng bộ.');
})();
