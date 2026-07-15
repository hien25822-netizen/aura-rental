# Aura Rental — Hướng dẫn Deploy Trọn gói

Hệ thống cho **6+ thiết bị** (1 shop phone + 1 Phương + 5 nhân viên) đồng bộ real-time qua Google Sheets.

**Thời gian: 30–45 phút** (lần đầu). Sau đó thêm thiết bị mới chỉ mất 2 phút.

---

## 📋 Checklist — Bạn cần chuẩn bị

- [ ] Tài khoản Google (Gmail) của shop — dùng để tạo Google Sheet
- [ ] Trình duyệt Chrome hoặc Safari
- [ ] 5–10 phút để làm theo từng bước

**Không cần:**
- ❌ Cài đặt phần mềm
- ❌ Biết lập trình
- ❌ Trả phí (Google Sheets + Netlify đều FREE)

---

## PHẦN 1: Tạo Google Sheets (database chung)

### Bước 1.1 — Tạo Sheet mới

1. Mở https://sheets.google.com → đăng nhập Gmail shop
2. Click **+ Blank** (trống) để tạo Sheet mới
3. Đặt tên: **`Aura Rental Database`** (click vào "Untitled spreadsheet" góc trên bên trái)

### Bước 1.2 — Đặt múi giờ Việt Nam (QUAN TRỌNG)

1. Vào **File → Settings** (Cài đặt)
2. Tab **General** → mục **Timezone** chọn **`(GMT+7) Bangkok, Hanoi, Jakarta`**
3. Click **Save settings**

> ⚠️ Nếu không đặt, ngày tháng sẽ bị lệch 1 ngày.

### Bước 1.3 — Tạo 7 tab theo schema

Bạn cần tạo 7 tab với header mỗi tab như bảng dưới. Cách nhanh nhất:

**Cách A — Paste từng dòng header:**

Click vào tab mặc định (Sheet1), click chuột phải → Rename thành `DON_HANG`. Sau đó vào ô A1 paste dòng:

```
Ma_Don	Trang_Thai_Don	Insta_Khach	SDT	Ma_PK	Goi_Thue	Ngay_Lay	Gio_Lay	Ngay_Tra	Hinh_Thuc_Coc	Hinh_Thuc_Nhan	Dia_Chi	Chi_Phi_Khac	Trang_Thai_Hoan_Coc	Ghi_Chu	Thoi_Gian_Hoan_Coc	Ngay_Tao	_ts	_deleted
```

Bấm Enter → 19 cột sẽ tự tách ra theo tab.

Lặp lại cho 6 tab còn lại. Nhấn **+** dưới cùng bên trái để thêm tab mới.

**Header của 7 tab:**

| Tab | Headers (dòng 1) |
|---|---|
| `DON_HANG` | Ma_Don, Trang_Thai_Don, Insta_Khach, SDT, Ma_PK, Goi_Thue, Ngay_Lay, Gio_Lay, Ngay_Tra, Hinh_Thuc_Coc, Hinh_Thuc_Nhan, Dia_Chi, Chi_Phi_Khac, Trang_Thai_Hoan_Coc, Ghi_Chu, Thoi_Gian_Hoan_Coc, Ngay_Tao, _ts, _deleted |
| `DON_HANG_VAY` | Ma_DHV, Ma_Don, Ma_Vay, _ts, _deleted |
| `KHO_VAY` | Ma_Vay, Ten_Vay, Size, Gia_Vay_Goc, Gia_Thue_12h, Gia_Thue_1_Ngay, Gia_Thue_3_Ngay, Anh_Vay, Ghi_Chu, So_Lan_Thue, _ts, _deleted |
| `PHU_KIEN` | Ma_PK, Ten_PK, Loai, So_Luong_Tong, Gia_Thue_12h, Gia_Thue_1_Ngay, Gia_Thue_3_Ngay, Anh_PK, Ghi_Chu, _ts, _deleted |
| `THANH_TOAN` | Ma_TT, Ngay_TT, Ma_Don, Tien_Coc, Chi_Phi_Khac, Ghi_Chu, Tien_Thue_Vay_Snapshot, Tien_Thue_PK_Snapshot, _ts, _deleted |
| `FORM` | ID, Dau_thoi_gian, Ten_Instagram, So_dien_thoai, Vay_Size, Phu_kien, Goi_thue, Ngay_lay, Gio_lay, Hinh_thuc_nhan, Dia_chi, Hinh_thuc_coc, Su_kien, Ma_Don, Ngay_Tao, Trang_Thai, Ghi_Chu_NV, _ts, _deleted |
| `SYNC_LOG` | Timestamp, Method, Device, Action, Records, Status, Note |

> 💡 Hai cột `_ts` và `_deleted` ở cuối mỗi tab là bắt buộc — dùng cho sync. Đừng xóa.

### Bước 1.4 — Copy URL Sheet

Copy URL trên thanh địa chỉ trình duyệt, dạng:
```
https://docs.google.com/spreadsheets/d/1AbCdEfGh.../edit
```

Lưu lại — sẽ cần ở bước sau.

---

## PHẦN 2: Cài Apps Script (API sync)

### Bước 2.1 — Mở Apps Script

Trong Google Sheet vừa tạo, vào menu **Extensions → Apps Script**.

Một tab mới mở ra — đây là nơi viết code cho Google Sheet.

### Bước 2.2 — Paste code

Xóa hết code mặc định trong file `Code.gs`, paste nội dung file **`AppsScript_SyncAPI.gs`** vào:

1. Mở file `AppsScript_SyncAPI.gs` trên máy bằng TextEdit hoặc VS Code
2. **Ctrl+A** (chọn tất cả) → **Ctrl+C** (copy)
3. Quay lại tab Apps Script → click vào ô code → **Ctrl+A** (chọn tất cả code cũ) → **Delete**
4. **Ctrl+V** (paste code mới vào)
5. **Ctrl+S** để lưu, đặt tên project: **`Aura Rental Sync`**

### Bước 2.3 — Chạy setupSync

1. Trong Apps Script, dropdown function chọn **`setupSync`**
2. Click nút **▶ Run** (phía trên)
3. Lần đầu sẽ hỏi cấp quyền → click **Review Permissions** → chọn tài khoản Google shop → **Allow**
4. Nếu thành công sẽ hiện popup "Sync setup done"

### Bước 2.4 — Deploy thành Web App

1. Trong Apps Script, click nút **🚀 Deploy** (góc trên bên phải) → **New deployment**
2. Click biểu tượng bánh răng ⚙️ bên trái nút **Select type** → chọn **Web app**
3. Điền:
   - **Description**: `Aura Rental Sync API v1`
   - **Execute as**: `Me` (tài khoản của bạn)
   - **Who has access**: `Anyone` (nếu muốn đơn giản) hoặc `Anyone with Google account` (bảo mật hơn)
4. Click **Deploy**
5. **Copy URL Web App** — dạng:
   ```
   https://script.google.com/macros/s/AKfycbz.../exec
   ```
6. Lưu URL này lại — sẽ cần dán vào app.

### Bước 2.5 — Test API hoạt động

Mở trình duyệt, paste URL trên vào thanh địa chỉ + thêm `?action=ping`:

```
https://script.google.com/macros/s/AKfycbz.../exec?action=ping
```

Nếu thấy hiện ra dạng:
```json
{"ok":true,"ts":1234567890,"app":"Aura Rental Sync API v1"}
```

→ **Thành công!** API đang chạy.

---

## PHẦN 3: Deploy web app lên Netlify

### Bước 3.1 — Chuẩn bị file

Đảm bảo thư mục `/Users/nguyenhien/Hienrrr/Apps/Aura Rental/` có đủ file:

```
Aura Rental/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── sw.js
├── AppsScript_SyncAPI.gs
├── AppsScript_AuraRental_v6.gs
└── README_DEPLOY.md
```

### Bước 3.2 — Dán URL API vào app.js

Mở file `app.js` bằng TextEdit hoặc VS Code, tìm dòng:
```js
WEB_APP_URL: '',  // ← Paste URL sau khi deploy Apps Script
```

Thay bằng URL bạn vừa copy:
```js
WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbz.../exec',
```

**Lưu file** (Ctrl+S).

### Bước 3.3 — Upload lên Netlify

**Cách A — Netlify Drop (1 phút, không cần tài khoản)**

1. Mở https://app.netlify.com/drop
2. Kéo cả **thư mục** `Aura Rental` (không phải từng file) vào vùng drop
3. Đợi 10–30 giây → sẽ có URL dạng `https://random-name-123.netlify.app`
4. Mở URL đó trên điện thoại để test

**Cách B — Đăng ký tài khoản (khuyến nghị, để đổi tên miền)**

1. Vào https://app.netlify.com → đăng ký bằng email
2. Click **Add new site → Deploy manually**
3. Kéo thư mục vào
4. Sau khi deploy, vào **Site settings → Change site name** để đổi thành `aura-rental` → URL thành `https://aura-rental.netlify.app`

### Bước 3.4 — Test trên điện thoại

1. Mở URL Netlify trên Safari/Chrome iPhone
2. App sẽ hiện ra — kiểm tra:
   - Calendar hiện 3 đơn mẫu
   - Thử tạo đơn mới
   - **Quan trọng**: Mở F12 (Chrome desktop) hoặc dùng trình duyệt Safari Developer → xem indicator ở góc trên bên phải có hiện **🟢 Synced** không. Nếu có → đã connect được Sheets.

---

## PHẦN 4: Cài đặt như App trên điện thoại

### iPhone (Safari)

1. Mở URL Netlify bằng Safari
2. Bấm nút **Share** (hình vuông có mũi tên lên) ở dưới
3. Kéo xuống chọn **Add to Home Screen**
4. Đặt tên: `Aura Rental`
5. Bấm **Add**
6. Icon Aura Rental xuất hiện trên màn hình chính — mở như app thật

### Android (Chrome)

1. Mở URL bằng Chrome
2. Bấm menu **⋮** (3 chấm) → **Install app** (hoặc **Add to Home Screen**)
3. Xác nhận **Install**
4. App xuất hiện trong app drawer

### Sau khi cài

- Icon app độc lập, không hiện thanh URL
- Chạy full-screen, mượt như native app
- Hoạt động offline (service worker sẽ dùng cache)

---

## PHẦN 5: Thêm thiết bị mới (NV mới vào shop)

Khi có nhân viên mới:

1. Mở URL `https://aura-rental.netlify.app` trên điện thoại NV
2. Add to Home Screen (như trên)
3. Đăng nhập lần đầu → app sẽ tự **pull toàn bộ data** từ Google Sheets về (~5 giây)
4. Sau đó mỗi 30 giây tự sync — mọi thay đổi của NV khác sẽ hiện ra

**Không cần tạo tài khoản**, không cần nhập mật khẩu. Ai có URL đều dùng được.

> ⚠️ Nếu muốn giới hạn chỉ NV mới vào được: trong Apps Script deployment đổi `Who has access` từ `Anyone` thành `Anyone with Google account`. Khi đó NV phải đăng nhập Gmail trước khi mở được.

---

## PHẦN 6: Vận hành hàng ngày

### Quy trình nhân viên

1. **Check lịch buổi sáng**: Mở app → Calendar
   - Ô xanh = hôm nay có khách lấy → chuẩn bị váy
   - Ô vàng = đang thuê
   - Ô đỏ = hôm nay khách trả → đón váy về
2. **Khách gọi đến đặt đơn**: Bấm `+ New` → điền form → Lưu
3. **Khách đến lấy/trả**: Click vào đơn → xem chi tiết → nút Hoàn cọc khi trả
4. **Hết ca**: Bấm ra ngoài → app tự sync trong nền

### Đồng bộ hoạt động thế nào?

| Hành động | Thời gian hiện trên thiết bị khác |
|---|---|
| NV A tạo đơn mới | Tối đa 30 giây |
| NV B thêm váy mới | Tối đa 30 giây |
| Phương hoàn cọc | Tối đa 30 giây |
| Mất wifi → có lại | Tự đẩy lên khi online (1-2 giây) |

### Nếu 2 người sửa cùng lúc

Hệ thống so sánh `_ts` (timestamp). **Bản có thời gian sửa mới hơn sẽ thắng**.

Ví dụ:
- 10:00:00 — NV A thêm váy "Váy A" vào Sheets
- 10:00:15 — NV B cũng thêm váy "Váy B" (khác ID)
- → Cả 2 đều hiện trên mọi thiết bị (vì ID khác nhau, không xung đột)

- 10:00:00 — NV A sửa giá váy X thành 1.000.000đ
- 10:00:15 — NV B sửa cùng váy X thành 1.200.000đ
- → Cuối cùng mọi người thấy 1.200.000đ (của B, mới hơn)

---

## PHẦN 7: Xử lý sự cố

### App không sync (indicator đỏ "Offline")

1. Kiểm tra wifi/4G
2. Thử pull xuống để refresh (kéo calendar xuống)
3. Nếu vẫn lỗi → vào F12 Console xem lỗi gì
4. Lỗi thường gặp: `WEB_APP_URL` chưa paste đúng → kiểm tra lại

### Mất dữ liệu

1. Mở Google Sheet — **toàn bộ data vẫn còn ở đây**
2. Kiểm tra tab `SYNC_LOG` xem log sync gần nhất
3. Bấm **wipeAllData** trong Apps Script để reset (chỉ khi cần)

### App chậm / giật

1. Clear cache: F12 → Application → Clear storage
2. Pull-to-refresh thay vì đợi auto-sync
3. Sau 6 tháng, archive các đơn đã hoàn cọc quá 1 năm (xóa khỏi active view)

### Thay đổi Web App URL

Nếu bạn redeploy Apps Script (đổi code), URL sẽ đổi. Cập nhật lại:
1. Copy URL mới
2. Sửa `WEB_APP_URL` trong `app.js`
3. Upload lại lên Netlify (kéo thư mục vào lại)

---

## PHẦN 8: Mở rộng khi shop lớn

Khi lên 1000+ đơn/tháng, bạn có thể:

- **Google Sheets Database → Google Cloud Firestore** (real-time DB, miễn phí 1GB)
- **Thêm thanh toán online** (VNPay, MoMo) qua webhook
- **App native** (React Native / Flutter) thay vì PWA
- **Phân quyền** (NV chỉ thấy đơn của mình, Phương thấy tất cả)

Tôi có thể làm tiếp các bước này khi bạn cần.

---

## Chi phí vận hành

| Hạng mục | Chi phí |
|---|---|
| Google Sheets | FREE (đến 5 triệu rows) |
| Google Apps Script | FREE (200,000 lệnh/ngày — bạn dùng ~3,000/ngày) |
| Netlify hosting | FREE (100GB bandwidth/tháng — đủ cho 6 users) |
| Domain `aurarental.vn` (tùy chọn) | ~300,000đ/năm |
| **Tổng** | **0đ** (nếu dùng domain Netlify free) hoặc **300k/năm** (nếu mua domain .vn) |

---

## Bước tiếp theo

Sau khi deploy xong, bạn có thể:
1. Test với 2 điện thoại cùng lúc — mở cùng URL, thử tạo đơn trên máy A, đợi 30s thấy trên máy B
2. Add 3 điện thoại còn lại cho nhân viên
3. Theo dõi 1 tuần — nếu có vấn đề gì nhắn tôi

Chúc shop vận hành mượt mà! 🚀