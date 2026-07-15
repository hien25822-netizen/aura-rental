# ⚡ QUICK START - Aura Rental

## Bạn chỉ cần làm 3 BƯỚC này:

---

### BƯỚC 1: Deploy lên Netlify (2 phút)

```
1. Mở trình duyệt → https://app.netlify.com/drop
2. Đăng nhập Google/GitHub
3. KÉO THƯ MỤC "Aura Rental" vào vùng Drop
4. Đợi deploy → Copy URL (ví dụ: xxx.netlify.app)
```

**Hoặc tải folder về:**
- Click vào folder "Aura Rental" trong Finder
- Zip lại (chuột phải → Compress)
- Upload file zip lên Netlify

---

### BƯỚC 2: Tạo Google Sheets (3 phút)

```
1. Mở https://sheets.google.com → Tạo Spreadsheet mới
2. Đặt tên: "Aura Rental Database"
3. Tạo 7 tabs: DON_HANG, DON_HANG_VAY, KHO_VAY, PHU_KIEN, THANH_TOAN, FORM, SYNC_LOG
4. Copy headers từ file SYNC_SETUP.md (hoặc dùng nút 📤 trong app để export)
```

**Headers nhanh - paste vào ô A1 của mỗi tab:**

**DON_HANG:**
```
Ma_Don	Trang_Thai_Don	Insta_Khach	SDT	Goi_Thue	Ngay_Lay	Gio_Lay	Ngay_Tra	Hinh_Thuc_Coc	Hinh_Thuc_Nhan	Dia_Chi	Su_Kien	Ghi_Chu	Chi_Phi_Khac	Trang_Thai_Hoan_Coc	Ngay_Tao	dhvs	Ma_PK	_ts	_deleted
```

**DON_HANG_VAY:**
```
Ma_DHV	Ma_Don	Ma_Vay	_ts
```

**KHO_VAY:**
```
Ma_Vay	Ten_Vay	Size	Gia_Vay_Goc	Gia_Thue_12h	Gia_Thue_1_Ngay	Gia_Thue_3_Ngay	Anh_Vay	Ghi_Chu	So_Lan_Thue	_ts
```

**PHU_KIEN:**
```
Ma_PK	Ten_PK	Loai	So_Luong_Tong	Gia_Thue_12h	Gia_Thue_1_Ngay	Gia_Thue_3_Ngay	Anh_PK	Ghi_Chu	_ts
```

**THANH_TOAN:**
```
Ma_TT	Ngay_TT	Ma_Don	Tien_Coc	Chi_Phi_Khac	Ghi_Chu	_ts
```

**FORM:**
```
id	Insta_Khach	SDT	Ngay_Lay	Gio_Lay	Su_Kien	Ngay_Tao	_ts
```

**SYNC_LOG:**
```
Timestamp	Device	Action	Records	Status	Note
```

---

### BƯỚC 3: Deploy Apps Script (2 phút)

```
1. Trong Google Sheets → Extensions → Apps Script
2. Tạo project mới → Paste code từ file "AppsScript_SyncAPI.gs"
3. Save (Ctrl+S)
4. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone
5. Authorize → Copy Web App URL
```

---

### BƯỚC 4: Cập nhật URL vào App (1 phút)

```
1. Mở file "app.js" trong thư mục Aura Rental
2. Tìm dòng: WEB_APP_URL: '',
3. Paste URL vào giữa '':
   WEB_APP_URL: 'https://script.google.com/macros/s/XXXXX/exec',
4. Save file
5. Upload lại lên Netlify (kéo thư mục vào Netlify)
```

---

### ✅ XONG! Bây giờ:

- 🌐 Mở app: `xxx.netlify.app`
- 📱 Cài đặt trên điện thoại (Safari → Add to Home Screen)
- 👥 Share URL cho nhân viên
- 🔗 Share booking form: `xxx.netlify.app/booking-form.html` cho khách tự đặt

---

## 🔗 Booking Form cho Khách

```
┌─────────────────────────────────────────────────────────────┐
│  FORM ĐẶT THUÊ TỰ ĐỘNG                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Share link: xxx.netlify.app/booking-form.html       │
│  2. Khách tự điền thông tin:                             │
│     • Tên Instagram, SĐT                                  │
│     • Chọn váy (hiển thị từ Kho váy)                    │
│     • Chọn gói (12h / 1 ngày / 3 ngày)                 │
│     • Ngày & giờ lấy                                     │
│     • Phụ kiện (tùy chọn)                              │
│     • Hình thức nhận, cọc, sự kiện                      │
│                                                             │
│  3. Sau khi khách gửi:                                   │
│     → Thông tin tự động lưu vào localStorage            │
│     → Admin thấy trong tab "📋 Đặt mới"                 │
│     → Sync lên Google Sheets                              │
│                                                             │
│  4. Real-time:                                           │
│     → Khi thêm váy mới vào Kho → KHÁCH THẤY NGAY        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 App Features

| Tính năng | Mô tả |
|-----------|--------|
| 📅 Calendar | Xem lịch thuê theo ngày/tháng |
| 📦 Orders | Quản lý đơn hàng |
| 📋 Đặt mới | Xem đơn từ form khách |
| 👗 Dresses | Kho váy + hình ảnh |
| 💍 Accessories | Phụ kiện + số lượng |
| 🔍 Check! | Kiểm tra trống theo ngày |
| 📤 Export | Xuất data ra Google Sheets |
| 🔗 Booking Form | Form cho khách tự đặt |
| 🔄 Sync | Đồng bộ đa thiết bị |

---

## 🆘 Cần giúp?

- **DEPLOY_GUIDE.md** - Hướng dẫn chi tiết
- **SYNC_SETUP.md** - Setup Google Sheets
- **MCP_SETUP.md** - Cài MCP servers

---

**App đã sẵn sàng! 🚀**
