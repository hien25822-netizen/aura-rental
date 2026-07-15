# 🔄 Hướng dẫn Sync Data sang Google Sheets

## Tổng quan

App sẽ tự động đồng bộ data (đơn hàng, váy, phụ kiện) sang Google Sheets. Tất cả thiết bị (điện thoại, tablet) sẽ luôn có dữ liệu giống nhau.

**Thời gian setup: ~10 phút**

---

## Bước 1: Tạo Google Sheets

1. Mở [sheets.google.com](https://sheets.google.com)
2. Tạo Spreadsheet mới → đặt tên: **Aura Rental Database**
3. Copy **Spreadsheet ID** từ URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

---

## Bước 2: Tạo các Tabs (Sheets)

Trong Spreadsheet, tạo các tabs sau:

| Tab Name | Mục đích |
|----------|----------|
| `DON_HANG` | Danh sách đơn hàng |
| `DON_HANG_VAY` | Chi tiết váy trong mỗi đơn |
| `KHO_VAY` | Danh sách váy |
| `PHU_KIEN` | Danh sách phụ kiện |
| `THANH_TOAN` | Lịch sử thanh toán |
| `FORM` | Form đặt lịch |
| `SYNC_LOG` | Log đồng bộ (tự tạo) |

### Cách tạo tab mới:
- Click **+** ở dưới cùng của Google Sheets
- Hoặc: Insert → Sheet

---

## Bước 3: Thêm Header cho mỗi Tab

### DON_HANG (Đơn hàng)
Row 1 (header):
```
Ma_Don	Trang_Thai_Don	Insta_Khach	SDT	Goi_Thue	Ngay_Lay	Gio_Lay	Ngay_Tra	Hinh_Thuc_Coc	Hinh_Thuc_Nhan	Dia_Chi	Su_Kien	Ghi_Chu	Chi_Phi_Khac	Trang_Thai_Hoan_Coc	Thoi_Gian_Hoan_Coc	Ngay_Tao	dhvs	Ma_PK	_ts	_deleted
```

### DON_HANG_VAY (Chi tiết váy)
Row 1:
```
Ma_DHV	Ma_Don	Ma_Vay	_ts
```

### KHO_VAY (Kho váy)
Row 1:
```
Ma_Vay	Ten_Vay	Size	Gia_Vay_Goc	Gia_Thue_12h	Gia_Thue_1_Ngay	Gia_Thue_3_Ngay	Anh_Vay	Ghi_Chu	So_Lan_Thue	_ts
```

### PHU_KIEN (Phụ kiện)
Row 1:
```
Ma_PK	Ten_PK	Loai	So_Luong_Tong	Gia_Thue_12h	Gia_Thue_1_Ngay	Gia_Thue_3_Ngay	Anh_PK	Ghi_Chu	_ts
```

### THANH_TOAN (Thanh toán)
Row 1:
```
Ma_TT	Ngay_TT	Ma_Don	Tien_Coc	Chi_Phi_Khac	Ghi_Chu	_ts
```

### FORM
Row 1:
```
id	Insta_Khach	SDT	Ngay_Lay	Gio_Lay	Su_Kien	Ngay_Tao	_ts
```

### SYNC_LOG (Log sync)
Row 1:
```
Timestamp	Device	Action	Records	Status	Note
```

---

## Bước 4: Deploy Apps Script

1. Trong Google Sheets → **Extensions** → **Apps Script**
2. Tạo project mới hoặc xóa code cũ
3. Copy code từ file `AppsScript_SyncAPI.gs` và paste vào
4. **Save** (Ctrl+S)
5. Click **Deploy** → **New deployment**
   - Type: **Web app**
   - Description: `Aura Rental Sync v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**
7. **Authorize** và cho phép quyền
8. **Copy Web App URL** (dạng: `https://script.google.com/macros/s/XXXXX/exec`)

---

## Bước 5: Cập nhật App

1. Mở file `app.js` trong project
2. Tìm dòng:
   ```javascript
   const SYNC = {
     WEB_APP_URL: '',  // ← Paste URL vào đây
   ```
3. Paste URL vào giữa `''`:
   ```javascript
   WEB_APP_URL: 'https://script.google.com/macros/s/XXXXX/exec',
   ```
4. **Save** file

---

## Bước 6: Test Sync

1. Mở app trên điện thoại/tablet
2. Tạo 1 đơn hàng mới
3. Sau 5-10 giây, kiểm tra Google Sheets
   - Tab DON_HANG → đơn mới sẽ xuất hiện
4. Nếu thấy dữ liệu → **Sync thành công!** ✅

---

## Xem Log Sync

Trong Google Sheets → tab **SYNC_LOG**:
- Timestamp: Thời gian sync
- Action: PULL (đọc) / PUSH (ghi)
- Records: Số bản ghi
- Status: OK / ERROR

---

## Troubleshooting

### ❌ "Sync disabled" hiển thị
- Chưa paste URL vào `SYNC.WEB_APP_URL`
- Kiểm tra lại URL có đúng format `https://script.google.com/macros/s/.../exec`

### ❌ Data không sync
1. Kiểm tra tab SYNC_LOG có lỗi không
2. Đảm bảo headers chính xác (copy đúng từ bảng trên)
3. Thử deploy lại Apps Script (Deploy → Manage deployments → Edit → New deployment)

### ❌ Lỗi quyền truy cập
- Khi deploy chọn "Anyone" (không phải "Only myself")
- Re-authorize nếu cần

---

## Tốc độ Sync

- **Pull (đọc)**: Mỗi 30 giây tự động
- **Push (ghi)**: Ngay khi có thay đổi (debounce 800ms)
- **Pull thủ công**: Kéo xuống refresh (nếu có)

---

## Backup Data

Google Sheets là backup tự động. Có thể:
- Download as Excel: File → Download → Microsoft Excel
- Export PDF cho báo cáo
- Dùng như nguồn data gốc nếu cần reset app
