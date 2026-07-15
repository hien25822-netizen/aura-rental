# Hướng dẫn Migration Aura Rental → Supabase

## Tổng quan

Hướng dẫn này giúp bạn chuyển đổi Aura Rental từ localStorage/Google Sheets sang Supabase để có database thực sự và hỗ trợ multi-user.

---

## Bước 1: Tạo tài khoản Supabase (10 phút)

### 1.1 Đăng ký Supabase

1. Truy cập [supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Đăng ký với GitHub hoặc email
4. **Quan trọng:** Chọn region **Singapore** hoặc **Bangkok** (gần Việt Nam nhất)

### 1.2 Tạo Project mới

1. Click **"New Project"**
2. Điền thông tin:
   - **Name:** `aura-rental`
   - **Database Password:** Tạo password mạnh, lưu lại
   - **Region:** Singapore (sg-sin1)
3. Click **"Create new project"**
4. Đợi project khởi tạo (~2 phút)

### 1.3 Lấy Credentials

1. Trong project dashboard, vào **Settings** → **API**
2. Copy các giá trị:
   - **Project URL:** `https://xxxxx.supabase.co`
   - **anon/public key:** Bắt đầu bằng `eyJ...`

---

## Bước 2: Setup Database Schema (5 phút)

### 2.1 Mở SQL Editor

1. Trong Supabase dashboard, vào **SQL Editor**
2. Click **"New Query"**

### 2.2 Chạy Schema

1. Copy toàn bộ nội dung file `supabase-schema.sql`
2. Paste vào SQL Editor
3. Click **"Run"**
4. Đợi thành công (sẽ thấy dòng "Success" màu xanh)

### 2.3 Enable Realtime

1. Vào **Database** → **Replication**
2. Enable các bảng:
   - [x] orders
   - [x] order_dresses
   - [x] order_accessories
   - [x] dresses
   - [x] accessories
   - [x] payments
   - [x] bookings

---

## Bước 3: Setup Authentication (5 phút)

### 3.1 Enable Email Auth

1. Vào **Authentication** → **Providers**
2. Đảm bảo **Email** đã được enable

### 3.2 Configure URL

1. Vào **Authentication** → **URL Configuration**
2. Thêm vào **Redirect URLs**:
   - `https://localhost:8765/*` (local dev)
   - `https://your-domain.com/*` (khi deploy)
   - `https://*.vercel.app/*` (nếu dùng Vercel)

### 3.3 Tạo tài khoản Admin

1. Vào **Authentication** → **Users**
2. Click **"Invite user"**
3. Nhập email của bạn (đây sẽ là tài khoản owner)
4. Họ sẽ nhận được email để set password

---

## Bước 4: Cấu hình App (2 phút)

### 4.1 Tạo file config

1. Copy file `config-example.js` thành `config.js`
2. Mở `config.js`
3. Thay thế:
   ```javascript
   supabaseUrl: 'https://xxxxx.supabase.co',  // URL từ bước 1.3
   supabaseKey: 'eyJ...'                      // Key từ bước 1.3
   ```

### 4.2 Verify Config

Mở app trong browser, bạn sẽ thấy:
- Banner màu cam nếu chưa có config: "Demo Mode"
- Nếu có config: Sẽ hiện màn hình đăng nhập

---

## Bước 5: Migration dữ liệu (15-30 phút)

### 5.1 Export dữ liệu hiện tại

**Trên máy tính đang dùng app:**

1. Mở app Aura Rental
2. Mở DevTools (F12 hoặc Cmd+Option+I)
3. Copy-paste đoạn code sau vào Console:

```javascript
// Export all data
const data = {
  don: db.don,
  vay: db.vay,
  pk: db.pk,
  tt: db.tt
};
console.log('=== AURA DATA EXPORT ===');
console.log(JSON.stringify(data, null, 2));
console.log('=== END EXPORT ===');

// Also copy to clipboard
navigator.clipboard.writeText(JSON.stringify(data, null, 2));
alert('Data copied! Check console (F12) for JSON output.');
```

4. Copy JSON output từ Console
5. Lưu vào file `migration-data.json`

### 5.2 Chạy Migration Script

1. Tạo file `migrate.html` với nội dung:

```html
<!DOCTYPE html>
<html>
<head><title>Aura Migration</title></head>
<body>
<h1>Aura Rental Migration</h1>
<textarea id="data" placeholder="Paste exported JSON here" style="width:100%;height:200px"></textarea>
<button onclick="migrate()">Start Migration</button>
<pre id="log"></pre>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SERVICE_ROLE_KEY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function migrate() {
  const data = JSON.parse(document.getElementById('data').value);
  const log = document.getElementById('log');
  const addLog = msg => log.textContent += msg + '\n';

  // Migrate Dresses
  addLog('Migrating dresses...');
  for (const v of data.vay || []) {
    await sb.from('dresses').upsert({
      ma_vay: v.Ma_Vay || v.ma,
      ten_vay: v.Ten_Vay || v.ten,
      size: v.Size || v.size || 'S',
      gia_vay_goc: v.Gia_Vay_Goc || 0,
      gia_thue_12h: v.Gia_Thue_12h || 0,
      gia_thue_1_ngay: v.Gia_Thue_1_Ngay || 0,
      gia_thue_3_ngay: v.Gia_Thue_3_Ngay || 0,
      anh_vay: v.Anh_Vay || '',
      ghi_chu: v.Ghi_Chu || '',
      so_lan_thue: v.So_Lan_Thue || 0
    });
    addLog('  ✓ ' + (v.Ten_Vay || v.ten));
  }

  // Migrate Accessories
  addLog('Migrating accessories...');
  for (const p of data.pk || []) {
    await sb.from('accessories').upsert({
      ma_pk: p.Ma_PK || p.ma,
      ten_pk: p.Ten_PK || p.ten,
      loai: p.Loai || p.loai || 'Khác',
      gia_thue_12h: p.Gia_Thue_12h || 0,
      gia_thue_1_ngay: p.Gia_Thue_1_Ngay || 0,
      gia_thue_3_ngay: p.Gia_Thue_3_Ngay || 0
    });
    addLog('  ✓ ' + (p.Ten_PK || p.ten));
  }

  // Get dress/accessory ID maps
  const dressMap = new Map();
  const accMap = new Map();
  const { data: dresses } = await sb.from('dresses').select('id,ma_vay');
  dresses.forEach(d => dressMap.set(d.ma_vay, d.id));
  const { data: accs } = await sb.from('accessories').select('id,ma_pk');
  accs.forEach(a => accMap.set(a.ma_pk, a.id));

  // Migrate Orders
  addLog('Migrating orders...');
  for (const o of data.don || []) {
    const dressIds = (o.dhvs || []).map(d => dressMap.get(d.vay)).filter(Boolean);
    const accIds = (o.Ma_PK || []).map(a => accMap.get(typeof a === 'string' ? a : a.Ma_PK)).filter(Boolean);

    const { data: newOrder } = await sb.from('orders').insert({
      ma_don: o.Ma_Don || o.id,
      trang_thai_don: o.Trang_Thai_Don || 'Chốt thuê',
      insta_khach: o.Insta_Khach,
      sdt: o.SDT,
      goi_thue: o.Goi_Thue,
      ngay_lay: o.Ngay_Lay,
      gio_lay: o.Gio_Lay || '09:00',
      ngay_tra: o.Ngay_Tra,
      hinh_thuc_coc: o.Hinh_Thuc_Coc,
      hinh_thuc_nhan: o.Hinh_Thuc_Nhan,
      dia_chi: o.Dia_Chi,
      su_kien: o.Su_Kien,
      ghi_chu: o.Ghi_Chu,
      chi_phi_khac: o.Chi_Phi_Khac || 0,
      trang_thai_hoan_coc: o.Trang_Thai_Hoan_Coc || false
    }).select().single();

    if (newOrder && dressIds.length) {
      await sb.from('order_dresses').insert(dressIds.map(did => ({ order_id: newOrder.id, dress_id: did })));
    }
    if (newOrder && accIds.length) {
      await sb.from('order_accessories').insert(accIds.map(aid => ({ order_id: newOrder.id, accessory_id: aid })));
    }
    addLog('  ✓ ' + (o.Ma_Don || o.id));
  }

  addLog('✅ Migration complete!');
}
</script>
</body>
</html>
```

3. Thay thế `YOUR_SUPABASE_URL` và `YOUR_SERVICE_ROLE_KEY`
4. Mở file trong browser
5. Paste JSON data đã export
6. Click **"Start Migration"**

### 5.3 Verify Migration

1. Vào Supabase Dashboard → **Table Editor**
2. Kiểm tra các bảng có dữ liệu:
   - dresses: 4 records (nếu có 4 váy)
   - accessories: 2 records
   - orders: 3 records
   - order_dresses: có relations
   - order_accessories: có relations

---

## Bước 6: Deploy App (10 phút)

### Option A: Vercel (Khuyến nghị)

1. Upload code lên GitHub repo mới
2. Vào [vercel.com](https://vercel.com)
3. Import GitHub repo
4. Deploy settings:
   - Framework: None
   - Build Command: (để trống)
   - Output Directory: `.`
5. Deploy!

### Option B: Netlify

1. Drag folder chứa code vào [app.netlify.com](https://app.netlify.com)
2. Deploy!

### Option C: GitHub Pages

1. Push code lên GitHub
2. Settings → Pages → Enable
3. Deploy từ branch `main`

---

## Troubleshooting

### Lỗi "Failed to fetch" trong console

**Nguyên nhân:** CORS policy hoặc network issue

**Giải pháp:**
1. Kiểm tra Supabase URL đúng
2. Kiểm tra đã thêm domain vào Redirect URLs (Authentication → URL Configuration)

### Lỗi "Invalid login credentials"

**Nguyên nhân:** Sai password hoặc user chưa được tạo

**Giải pháp:**
1. Kiểm tra email/password đúng
2. Nếu dùng Invite, check email inbox spam
3. Hoặc tạo user mới trong Authentication → Users

### Dữ liệu không sync

**Nguyên nhân:** Realtime chưa được enable

**Giải pháp:**
1. Vào Database → Replication
2. Enable tất cả tables cần sync

---

## Checklist sau Migration

- [ ] Đăng nhập thành công
- [ ] Tất cả váy hiển thị đúng
- [ ] Tất cả phụ kiện hiển thị đúng
- [ ] Tất cả đơn hàng hiển thị đúng
- [ ] Calendar hiển thị đúng màu
- [ ] Tạo đơn mới → sync sang Supabase
- [ ] Thử trên 2 thiết bị khác nhau
- [ ] Realtime sync hoạt động

---

## Liên hệ hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra Console (F12) để xem error messages
2. Check Supabase Dashboard logs
3. Liên hệ: [Telegram support group]
