# 👶 BABY STEPS - Complete Build Guide

Hướng dẫn từng bước nhỏ để build và deploy app Aura Rental + Booking Form. Mỗi bước đều có thể làm được trong vài phút.

---

## 📋 TỔNG QUAN

```
┌─────────────────────────────────────────────────────────────┐
│  APP GỒM 2 PHẦN:                                          │
│                                                             │
│  1. APP CHÍNH (index.html + app.js + styles.css)           │
│     → Admin/Nhân viên dùng để quản lý                     │
│                                                             │
│  2. BOOKING FORM (booking-form.html)                       │
│     → Khách hàng tự điền qua link                         │
│                                                             │
│  3. GOOGLE SHEETS (Database)                               │
│     → Lưu raw data + sync đa thiết bị                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 🚀 BƯỚC 1: KIỂM TRA FILES (2 phút)

### Files cần có:

```
Aura Rental/
├── index.html           ✅ App chính
├── booking-form.html    ✅ Form cho khách
├── app.js               ✅ Logic
├── styles.css           ✅ Style
├── sw.js                ✅ Service worker (PWA)
├── manifest.json        ✅ PWA manifest
├── icon-192.svg         ✅ Icon nhỏ
├── icon-512.svg         ✅ Icon lớn
└── icon-maskable-512.svg
```

### Test local:

```bash
# Mở Terminal, cd vào folder
cd "/Users/nguyenhien/Hienrrr/Apps/Aura Rental"

# Chạy server
python3 -m http.server 8765

# Mở browser
open http://localhost:8765
```

✅ Nếu thấy giao diện app → Bước 1 OK

---

# 🌐 BƯỚC 2: DEPLOY LÊN NETLIFY (3 phút)

### Cách nhanh nhất - Drag & Drop:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Mở: https://app.netlify.com/drop                       │
│  2. Đăng nhập (Google/GitHub)                              │
│  3. KÉO THƯ MỤC "Aura Rental" vào vùng Drop              │
│  4. Đợi ~30 giây deploy                                    │
│  5. Copy URL: https://xxx.netlify.app                       │
└─────────────────────────────────────────────────────────────┘
```

### Sau khi deploy:

- ✅ URL app chính: `https://xxx.netlify.app`
- ✅ URL booking form: `https://xxx.netlify.app/booking-form.html`

### Test:

```
1. Mở URL app → Thấy Calendar
2. Bấm tab "Váy" → Thấy danh sách váy mẫu
3. Bấm nút "Mới" → Thấy form đẹp
4. Mở URL booking-form.html → Thấy form cho khách
```

---

# 📊 BƯỚC 3: TẠO GOOGLE SHEETS (5 phút)

### Tạo Spreadsheet:

```
1. Mở: https://sheets.google.com
2. Click "Blank" → Đặt tên "Aura Rental Database"
3. Tạo 7 tabs (click + bên dưới):
   - DON_HANG
   - DON_HANG_VAY
   - KHO_VAY
   - PHU_KIEN
   - THANH_TOAN
   - FORM
   - SYNC_LOG
```

### Paste Headers cho mỗi Tab:

**DON_HANG** (click A1, paste):
```
Ma_Don	Trang_Thai_Don	Insta_Khach	SDT	Goi_Thue	Ngay_Lay	Gio_Lay	Ngay_Tra	Hinh_Thuc_Coc	Hinh_Thuc_Nhan	Dia_Chi	Su_Kien	Ghi_Chu	Chi_Phi_Khac	Trang_Thai_Hoan_Coc	Ngay_Tao	dhvs	Ma_PK	_ts	_deleted
```

**DON_HANG_VAY**:
```
Ma_DHV	Ma_Don	Ma_Vay	_ts
```

**KHO_VAY**:
```
Ma_Vay	Ten_Vay	Size	Gia_Vay_Goc	Gia_Thue_12h	Gia_Thue_1_Ngay	Gia_Thue_3_Ngay	Anh_Vay	Ghi_Chu	So_Lan_Thue	_ts
```

**PHU_KIEN**:
```
Ma_PK	Ten_PK	Loai	So_Luong_Tong	Gia_Thue_12h	Gia_Thue_1_Ngay	Gia_Thue_3_Ngay	Anh_PK	Ghi_Chu	_ts
```

**THANH_TOAN**:
```
Ma_TT	Ngay_TT	Ma_Don	Tien_Coc	Chi_Phi_Khac	Ghi_Chu	_ts
```

**FORM**:
```
id	Insta_Khach	SDT	Ngay_Lay	Gio_Lay	Su_Kien	Ngay_Tao	_ts
```

**SYNC_LOG**:
```
Timestamp	Device	Action	Records	Status	Note
```

---

# ⚙️ BƯỚC 4: DEPLOY APPS SCRIPT (3 phút)

```
1. Trong Google Sheets → Extensions → Apps Script
2. Xóa code mặc định → Paste code từ file AppsScript_SyncAPI.gs
3. Save (Ctrl+S)
4. Deploy → New deployment:
   - Type: Web app
   - Execute as: Me
   - Who has access: Anyone
5. Authorize → Allow
6. Copy Web App URL: https://script.google.com/macros/s/XXX/exec
```

---

# 🔗 BƯỚC 5: KẾT NỐI APP VỚI GOOGLE SHEETS (2 phút)

### Cập nhật app.js:

```
1. Mở file app.js trong folder Aura Rental
2. Tìm dòng (Ctrl+F):
   WEB_APP_URL: '',  // ← Paste URL sau khi deploy Apps Script
3. Sửa thành:
   WEB_APP_URL: 'https://script.google.com/macros/s/XXX/exec',
4. Save file
5. Re-upload lên Netlify (kéo folder vào)
```

### Test sync:

```
1. Mở app
2. Tạo 1 đơn hàng mới
3. Đợi 10-30 giây
4. Kiểm tra Google Sheets tab DON_HANG → Thấy đơn mới
5. Kiểm tra tab SYNC_LOG → Thấy log push
```

✅ Nếu data sync → Hoàn thành!

---

# 📱 BƯỚC 6: CÀI APP TRÊN ĐIỆN THOẠI (1 phút)

### iPhone:

```
1. Mở app trên Safari
2. Bấm nút Share (⬆️)
3. Chọn "Add to Home Screen"
4. Tên: "Aura Rental"
5. Bấm Add
```

### Android:

```
1. Mở app trên Chrome
2. Bấm menu (⋮)
3. Chọn "Install app" hoặc "Add to Home Screen"
```

---

# 👥 BƯỚC 7: SHARE BOOKING FORM CHO KHÁCH (1 phút)

### Cách 1: Copy link trực tiếp

```
Link booking form: https://xxx.netlify.app/booking-form.html
```

### Cách 2: Share từ app

```
1. Mở app chính
2. Bấm nút 🔗 trên header
3. Copy link
4. Gửi qua Zalo/Instagram cho khách
```

### Test booking form:

```
1. Mở booking-form.html
2. Điền form test
3. Submit
4. Quay lại app chính → Tab "Đơn" → Filter "📋 Đặt mới"
5. Thấy đơn mới
```

---

# 🎨 BƯỚC 8: TÙY CHỈNH UX/UI (Optional)

### Cập nhật App:

```bash
# Sửa file
code "/Users/nguyenhien/Hienrrr/Apps/Aura Rental/styles.css"

# Hoặc dùng text editor bất kỳ
```

### Các điểm có thể tùy chỉnh:

| File | Tùy chỉnh |
|------|-----------|
| `styles.css` | Màu sắc, font, spacing |
| `index.html` | Thêm/bớt tab |
| `app.js` | Thay đổi logic |
| `booking-form.html` | Câu hỏi form |

### Sau khi sửa → Re-deploy:

```
1. Sửa file local
2. Vào Netlify → Site → Deploys
3. Kéo thư mục mới vào Deploy page
4. Hoặc: Git push → Netlify auto-deploy
```

---

# 📊 BƯỚC 9: BACKUP DATA ĐỊNH KỲ

### Backup tự động (qua Google Sheets):

```
Google Sheets tự động save mỗi khi có thay đổi.
History: File → Version history → xem các version cũ
```

### Backup thủ công:

```
1. Mở app chính
2. Bấm nút 📤 trên header
3. Chọn loại data muốn export
4. Paste vào Excel/Google Sheets mới
```

---

# 🚨 TROUBLESHOOTING

### ❌ App không sync

```
→ Kiểm tra WEB_APP_URL đã paste đúng chưa
→ Kiểm tra Apps Script đã Deploy chưa
→ Kiểm tra "Who has access: Anyone"
→ Xem tab SYNC_LOG có lỗi gì
```

### ❌ Khách không thấy váy mới

```
→ Form khách load từ localStorage
→ Admin cần refresh form (F5)
→ Hoặc: Form tự động update mỗi 5 giây
```

### ❌ Lỗi 403 / Permission denied

```
→ Apps Script cần Authorize lại
→ Vào Apps Script → Run → setupSync → Authorize
```

### ❌ Data bị mất

```
→ Restore từ Google Sheets (version history)
→ Hoặc: Nhập lại từ backup Excel
```

---

# ✅ CHECKLIST HOÀN THÀNH

```
□ Bước 1: Test app local
□ Bước 2: Deploy lên Netlify
□ Bước 3: Tạo Google Sheets với 7 tabs
□ Bước 4: Deploy Apps Script
□ Bước 5: Paste URL vào app.js + re-deploy
□ Bước 6: Cài app trên điện thoại
□ Bước 7: Share booking form cho khách
□ Bước 8: Tùy chỉnh UX/UI (optional)
□ Bước 9: Setup backup định kỳ
```

---

# 🎓 TIPS & BEST PRACTICES

1. **Test trước khi deploy**: Luôn test local trước
2. **Backup thường xuyên**: Export data mỗi tuần
3. **Monitor SYNC_LOG**: Kiểm tra log để phát hiện lỗi
4. **Share link qua Zalo**: Khách dễ click hơn
5. **Thêm ảnh cho váy**: Giúp khách nhận biết dễ hơn
6. **Kiểm tra calendar mỗi sáng**: Tránh conflict

---

# 📞 SUPPORT

Nếu gặp vấn đề:
1. Đọc file CLAUDE.md (project rules)
2. Đọc SYNC_SETUP.md (sync details)
3. Đọc DEPLOY_GUIDE.md (deploy chi tiết)
4. Check SYNC_LOG trong Google Sheets

---

**Hoàn thành 9 bước → App + Booking Form chạy mượt mà! 🚀**