# Hướng dẫn triển khai Aura Rental

> **Dành cho:** Phương (chủ shop) — người sẽ tự tay dựng hệ thống quản lý cho thuê váy.
> **Đọc kỹ trước khi bắt đầu.** Mỗi bước đều có đường dẫn click chính xác — cứ làm theo thứ tự là xong.

---

## 1. Tổng quan

### Bạn sẽ làm gì?

Bạn sẽ dựng một hệ thống quản lý cho thuê váy gồm **3 lớp**:

| Lớp | Là gì | Vai trò |
|-----|-------|---------|
| 🟢 **Google Sheets** | Bảng tính trên Google Drive | Lưu trữ dữ liệu gốc (7 bảng) |
| 🟡 **Apps Script** | Đoạn code chạy nền trong Sheet | Tự động sinh mã đơn, validate ngày, đồng bộ ledger |
| 🔵 **AppSheet** | App chạy trên điện thoại | Giao diện cho nhân viên dùng hàng ngày |

### Mất bao lâu?

Khoảng **45 phút** nếu làm liền một mạch, không bị ngắt. Nếu bị ngắt giữa chừng, cứ mở lại từ bước đang dở.

### Bạn cần chuẩn bị gì trước?

- [x] Tài khoản Google (Gmail) — đang dùng cho shop
- [x] Tài khoản AppSheet — đăng ký miễn phí tại [appsheet.com](https://about.appsheet.com/sign-up/) (dùng chính Gmail shop)
- [x] Điện thoại Android hoặc iPhone — để test app sau khi tạo xong
- [x] 3 file tài liệu nằm trong thư mục dự án (`/Users/nguyenhien/Hienrrr/Apps/Aura Rental/`):
  - `docs/formulas/googlesheet_formulas.md` — schema 7 bảng
  - `docs/formulas/appscript_code.md` — code Apps Script (đã có sẵn, copy từ đây)
  - `docs/formulas/appsheet_formulas.md` — công thức AppSheet

> 💡 **Mẹo:** Mở 3 file tài liệu trên bằng VS Code hoặc trình soạn thảo text để dễ copy. **Đừng đóng tab Google Sheet và AppSheet giữa các bước** — sẽ mất phiên đăng nhập.

---

## 2. Bước 1 — Tạo Google Sheet (5 phút)

### Click path chính xác:

1. Mở trình duyệt → vào [sheets.new](https://sheets.new) (gõ trực tiếp vào thanh địa chỉ)
2. Đợi Google tạo sheet trắng
3. Đặt tên sheet: gõ **"Aura Rental"** vào ô tiêu đề góc trên bên trái (chỗ đang hiện "Untitled spreadsheet")
4. Nhấn **Enter** để lưu tên

### Tạo 7 bảng (tab):

5. Nhìn xuống **dưới cùng màn hình**, thấy dãy tab: `Sheet1`
6. Click chuột phải vào `Sheet1` → **Rename** → gõ `orders` → Enter
7. Click dấu **+** bên trái dãy tab để thêm tab mới → đặt tên lần lượt:
   - `order_dresses`
   - `dresses`
   - `accessories`
   - `payments`
   - `availability_checks`
   - `form_submissions`

> ✅ **Sau bước này bạn phải có đúng 7 tab** theo đúng thứ tự snake_case như trên (chữ thường, có dấu gạch dưới).

### Paste header row cho từng bảng:

8. Mở file `docs/formulas/googlesheet_formulas.md` trong VS Code
9. Với **mỗi bảng**, copy dòng header (dòng đầu tiên của bảng đó) và paste vào **ô A1** của tab tương ứng trong Google Sheet
10. Lặp lại cho cả 7 bảng

> 📋 **Ví dụ:** Tab `orders` → copy dòng `OrderId, CustomerId, OrderDate, ...` → paste vào ô A1 của tab `orders` trong Sheet.

> ⚠️ **Lưu ý quan trọng:** Tên cột phải **chính xác từng chữ** (PascalCase, không dấu Tiếng Việt). Sai một chữ là AppScript báo lỗi.

### Lưu lại:

11. Sheet tự động save lên Google Drive, không cần bấm gì thêm.

---

## 3. Bước 2 — Paste Apps Script (10 phút)

### File Apps Script nằm ở đâu?

Source code đã có sẵn trong file:
```
/Users/nguyenhien/Hienrrr/Apps/Aura Rental/docs/formulas/appscript_code.md
```

Bạn **copy toàn bộ nội dung code** (từ phần `## Configuration Constants` trở đi) — bỏ qua phần markdown giải thích ở trên.

### Click path để paste vào Sheet:

1. Trong Google Sheet `Aura Rental` vừa tạo, **click menu `Extensions`** ở thanh trên cùng
2. Click **`Apps Script`** (dòng gần cuối menu)
3. Trình duyệt mở tab mới → đây là **Apps Script Editor**
4. Bạn sẽ thấy file `Code.gs` mặc định với nội dung mẫu `function myFunction() {}`
5. **Chọn toàn bộ** nội dung mẫu (Ctrl+A / Cmd+A) → **xóa** (Delete)
6. Quay lại VS Code → mở `docs/formulas/appscript_code.md` → **copy toàn bộ phần code** (bỏ qua phần `## ⚠️ EXPERIMENTAL` và các heading markdown, chỉ lấy khối code bắt đầu từ `const CONFIG = {`)
7. **Paste** vào Apps Script Editor

### Đổi tên file:

8. Click chuột vào tên `Code.gs` ở panel bên trái
9. Đổi thành **`AppsScript_AuraRental.gs`** → nhấn Enter

### Cập nhật email chủ shop:

10. Trong khối `CONFIG = { ... }` ở đầu file, tìm dòng `OWNER_EMAIL`
11. Đổi thành **email thật của Phương** (email sẽ nhận thông báo lỗi nếu script gặp sự cố)

### Authorize (cấp quyền cho script):

12. Click **biểu tượng đĩa mềm 💾** (Save) hoặc Ctrl+S / Cmd+S
13. Nhìn lên **thanh trên cùng**, có dropdown đang hiện chữ `setupTriggers` (hoặc tên hàm nào đó)
14. Nếu chưa đúng, click dropdown đó → chọn **`setupTriggers`**
15. Click nút **`Run`** ▶️ bên cạnh dropdown
16. **Lần đầu chạy sẽ hiện popup "Authorization required"** — làm theo:
    - Click **"Review Permissions"**
    - Chọn **tài khoản Google** của shop
    - Nếu Google cảnh báo "This app isn't verified" → click **"Advanced"** (góc dưới bên trái) → **"Go to Aura Rental (unsafe)"**
    - Click **"Allow"**
17. Đợi 5–10 giây → ở panel **"Execution Log"** phía dưới, hiện ✅ xanh là thành công

### Verify triggers đã cài:

18. Click **biểu tượng đồng hồ ⏰** ở panel bên trái (Triggers)
19. Bạn phải thấy **đúng 3 trigger** cho 3 hàm:
    - `onChangeHandler`
    - `onEditHandler`
    - `onFormSubmitHandler`

> 🎉 **Xong bước 2!** Apps Script giờ đang chạy nền — tự động sinh mã đơn khi bạn tạo đơn mới.

---

## 4. Bước 3 — Tạo AppSheet app (5 phút)

### Click path:

1. Mở tab mới trong trình duyệt → vào [appsheet.com](https://www.appsheet.com/)
2. Đăng nhập bằng **cùng Gmail** đã dùng cho Google Sheet
3. Ở trang chủ AppSheet, click nút **`+ Create`** (góc trên bên trái)
4. Click **`App`** (không chọn "Workflow" hay "Dashboard")
5. Click **`Start with existing data`** → **`Google Sheets`**
6. Trong danh sách Google Drive hiện ra, tìm và chọn file **`Aura Rental`** vừa tạo ở Bước 1
7. AppSheet tự động scan → hiện popup **"Which tables would you like to include?"**
8. **Tick chọn tất cả 7 bảng**:
   - ☐ orders
   - ☐ order_dresses
   - ☐ dresses
   - ☐ accessories
   - ☐ payments
   - ☐ availability_checks
   - ☐ form_submissions
9. Click **`Connect`** (góc dưới bên phải)
10. AppSheet tự động tạo app với 7 bảng → đợi 30–60 giây để nó load xong

> 💡 Sau bước này bạn sẽ thấy AppSheet mở **App Editor** (khung đen bên trái + preview bên phải).

---

## 5. Bước 4 — Cấu hình 7 bảng (15 phút)

Mở file tham chiếu: `docs/formulas/appsheet_formulas.md` — mở bằng VS Code, để song song với AppSheet editor.

### Với mỗi bảng, làm theo thứ tự:

#### 5.1. Vào Data → Tables

1. Trong AppSheet editor (khung đen bên trái), click menu **`Data`** → **`Tables`**
2. Bạn sẽ thấy danh sách 7 bảng

#### 5.2. Cấu hình từng bảng

**Click vào từng bảng** theo thứ tự và làm các bước sau (tra cứu chi tiết trong `appsheet_formulas.md`):

| Bảng | Cột cần đánh dấu Key | Cột cần thêm công thức |
|------|----------------------|------------------------|
| `orders` | OrderId | Status (enum), TotalRentalFee (formula) |
| `order_dresses` | OrderDressId | RentalPrice (formula) |
| `dresses` | DressId | Status (enum), RentalPrice (number) |
| `accessories` | AccessoryId | Status (enum) |
| `payments` | PaymentId | Amount (number), Direction (enum) |
| `availability_checks` | CheckId | Result (enum) |
| `form_submissions` | SubmissionId | Status (enum) |

**Click path cho mỗi bảng:**

3. Click vào **tên bảng** trong danh sách
4. Ở cột bên phải, tìm **mục "Column structure"** → click để mở rộng
5. Với **cột làm khóa chính** (xem bảng trên) → click vào ô đó → đánh dấu ✅ **`Key`** + ✅ **`Label`** (nếu muốn hiện tên)
6. Với **cột cần công thức** → click vào cột → chuyển sang tab **`Formula`** (ở panel bên phải) → paste công thức từ `appsheet_formulas.md` vào ô `Spreadsheet formula` hoặc `App formula`

> 📋 **Ví dụ chi tiết cho bảng `orders`:**
> - Click bảng `orders`
> - Tìm cột `OrderId` → check ✅ `Key`
> - Tìm cột `Status` → ở tab **`Type`** chọn **`Enum`** → ở **`Values`** gõ: `Preparing, Currently Renting, Returning, Overdue, Completed, Cancelled`
> - Tìm cột `TotalRentalFee` → ở tab **`Formula`** paste công thức: `[RentalFee] + [LateFee]` (tra cứu công thức chính xác trong `appsheet_formulas.md`)

7. **Lặp lại** cho 6 bảng còn lại
8. Sau mỗi bảng, nhìn góc trên bên phải → click **`Save`** (💾)

### Thêm Ref column (để xóa mềm):

9. Với mỗi bảng, tìm cột `IsDeleted` (nếu chưa có thì bỏ qua — chỉ cần cho `orders` và `order_dresses`)
10. Đánh dấu đây là cột `Yes/No` (Boolean)

### Verify:

11. Quay lại **`Data` → `Tables`** → click từng bảng xem cấu trúc cột đúng chưa
12. Mở **`Data` → `Columns`** → check rằng các cột `Key` được highlight xanh

> ⚠️ **Lưu ý:** Một số công thức trong `appsheet_formulas.md` dùng syntax `[ColumnName]` (AppSheet) — copy **nguyên văn** không sửa.

---

## 6. Bước 5 — Tạo 9 view (5 phút)

Mở `docs/formulas/appsheet_formulas.md` → kéo xuống phần **"Views"** để tham chiếu công thức và filter cho từng view.

### Click path để vào phần Views:

1. Trong AppSheet editor, click menu **`UX`** → **`Views`** (ở panel bên trái)
2. Bạn sẽ thấy danh sách các view hiện có (AppSheet tự tạo 1-2 view mặc định)

### Tạo 9 view theo thứ tự:

**Click `+ New View`** cho mỗi view dưới đây:

| # | Tên view | Loại | Bảng nguồn | Mục đích |
|---|----------|------|------------|----------|
| 1 | **Calendar** | Calendar | orders | Lịch thuê theo ngày |
| 2 | **Orders** | Table | orders | Danh sách đơn hàng |
| 3 | **OrderDetail** | Detail | orders | Chi tiết 1 đơn |
| 4 | **RefundDeposit** | Form | payments | Form hoàn cọc |
| 5 | **CashLedger** | Table | payments | Sổ thu chi |
| 6 | **Dresses** | Gallery | dresses | Kho váy (dạng lưới ảnh) |
| 7 | **DressDetail** | Detail | dresses | Chi tiết 1 váy |
| 8 | **Accessories** | Table | accessories | Danh sách phụ kiện |
| 9 | **AccessoryDetail** | Detail | accessories | Chi tiết 1 phụ kiện |

**Với mỗi view:**

3. Click **`+ New View`** → chọn **loại view** (Table / Detail / Calendar / Form / Gallery)
4. Đặt **tên view** theo bảng trên
5. Chọn **bảng nguồn** (Source table) ở dropdown
6. **(Tùy chọn)** Thêm **filter** nếu cần (ví dụ: view `Calendar` filter `Status != "Completed"`)
7. **(Tùy chọn)** Chọn **cột hiển thị** trong view (Primary view column, Secondary, ...)
8. Click **`Save`**

### Set view làm Main:

9. Sau khi tạo xong 9 view, vào **`UX` → `Navigation`** → kéo thả các view vào **bottom bar** (menu dưới cùng của app) để nhân viên dễ truy cập
10. Nên đặt 4 view chính lên bottom bar: **Calendar**, **Orders**, **Dresses**, **CashLedger**

### Verify:

11. Click nút **`Preview`** (mắt kính 👁️ góc trên bên phải) → app mở trong tab mới
12. Click qua từng view ở bottom bar → đảm bảo không bị lỗi "No data"

> 💡 **Tip:** Format rule (màu sắc cho từng trạng thái) đã được định nghĩa trong `appsheet_formulas.md` — copy sang mục **`UX` → `Format Rules`** nếu muốn đơn hàng "Overdue" tô đỏ, "Currently Renting" tô xanh.

---

## 7. Bước 6 — Test end-to-end (5 phút)

Chạy 10 bước verify sau để đảm bảo hệ thống hoạt động đúng:

### 10 bước test:

| # | Hành động | Kết quả mong đợi |
|---|-----------|------------------|
| 1 | Mở Google Sheet `Aura Rental` → tab `orders` | Có header row đúng |
| 2 | Thêm 1 dòng mới vào `orders` (chỉ cần điền `CustomerName`) | Sau 2-3 giây, cột `OrderId` tự động điền `A00001` |
| 3 | Thêm 1 dòng mới nữa vào `orders` | `OrderId` tự điền `A00002` (không trùng) |
| 4 | Mở AppSheet → view **Orders** | Thấy 2 đơn vừa tạo hiện ra trong danh sách |
| 5 | Click vào 1 đơn → mở **OrderDetail** | Hiện chi tiết đầy đủ |
| 6 | Vào `orders`, điền `PickupDate = 2026-07-01`, `ReturnDate = 2026-06-30` (ngày về trước ngày đi) | Hiện popup cảnh báo lỗi "ReturnDate phải sau PickupDate" |
| 7 | Thêm 1 dòng vào tab `payments` (điền `OrderId`, `Amount = 500000`) | Cột `IsRefunded` tự động = TRUE, `RefundedAt` = giờ hiện tại |
| 8 | Mở AppSheet → view **Calendar** | Thấy đơn hàng hiện ra trên lịch theo ngày |
| 9 | Trong AppSheet, click "+" ở view **Orders** → tạo 1 đơn mới | Đơn mới xuất hiện ngay cả khi chưa có trong Sheet (sync sau 30s) |
| 10 | Trên Sheet, đặt `IsDeleted=TRUE` cho 1 dòng trong `orders` | Tất cả dòng trong `order_dresses` liên quan cũng tự động `IsDeleted=TRUE` |

> ✅ **Nếu cả 10 bước đều đúng** → hệ thống hoạt động hoàn hảo. Sang bước 7.

---

## 8. Bước 7 — Share app với nhân viên

### Lấy link app:

1. Trong AppSheet editor, click **`Share`** (nút ở góc trên bên phải, hoặc menu **`Users`** → **`Share app`**)
2. Trong popup hiện ra:
   - **Phần "Share with collaborators":** gõ email từng nhân viên vào ô "Add collaborators" → Enter → chọn quyền **"User"** (không chọn "Admin")
   - Click **`Save`**
3. AppSheet tự động gửi email mời cho nhân viên — email có **link app**

### Lấy link cài app trên điện thoại:

**Cách 1 — AppSheet mobile app (khuyến nghị):**

1. Nhân viên mở email mời trên điện thoại
2. Click link trong email → AppSheet yêu cầu **cài app AppSheet** từ App Store / Google Play
3. Tải app **"AppSheet"** (miễn phí) → đăng nhập bằng Gmail cá nhân (cùng email đã được share)
4. Sau khi đăng nhập → app Aura Rental xuất hiện trong danh sách → click mở

**Cách 2 — AppSheet mobile install link:**

1. Trong AppSheet editor, click **`Manage` → `Deploy` → `Install`** (góc trên bên phải)
2. Copy **link "Mobile install link"**
3. Gửi link qua Zalo/Messenger cho nhân viên
4. Nhân viên mở link trên điện thoại → tự động mở App Store / Google Play → cài app

### Cài đặt ban đầu cho nhân viên:

5. Sau khi cài app, nhân viên mở **AppSheet app** trên điện thoại
6. Đăng nhập bằng Gmail đã được share quyền
7. Tìm app **"Aura Rental"** trong danh sách → click mở
8. Cho phép **thông báo** (Notifications) khi AppSheet hỏi — để nhận cảnh báo đơn hàng mới

### Share cho chủ shop (Phương):

9. Trong AppSheet, **`Users` → `Share app`** → thêm email của Phương → chọn quyền **"Admin"**
10. Phương có toàn quyền xem/sửa/xóa + quản lý user

### Kiểm tra quyền truy cập Google Sheet:

11. Mở Google Sheet `Aura Rental` → nút **Share** (góc trên bên phải)
12. Thêm email từng nhân viên vào với quyền **"Editor"** — để họ sửa được Sheet khi cần fix data

---

## 9. Troubleshooting — 5 lỗi thường gặp

### ❌ Lỗi 1: "Authorization required" khi chạy `setupTriggers`

**Nguyên nhân:** Apps Script chưa được cấp quyền truy cập Google Sheet, Mail, Script Properties.

**Cách fix:**

1. Quay lại Apps Script editor (mở từ Google Sheet → `Extensions` → `Apps Script`)
2. Chạy lại hàm `setupTriggers`
3. Popup "Authorization required" hiện ra → click **`Review Permissions`**
4. Chọn đúng **tài khoản Gmail** của shop
5. Nếu thấy cảnh báo "This app isn't verified":
   - Click **`Advanced`** (link nhỏ ở góc dưới bên trái)
   - Click **`Go to Aura Rental (unsafe)`**
   - Click **`Allow`**
6. Đợi 5-10 giây → check Execution Log có ✅ xanh

---

### ❌ Lỗi 2: OrderId bị trùng (2 dòng cùng có `A00017`)

**Nguyên nhân:** Counter `AURA_ORDER_COUNTER` trong Script Properties bị mất hoặc sai.

**Cách fix:**

1. Trong Apps Script editor, menu bên trái → click **`Project Settings`** (biểu tượng bánh răng ⚙️)
2. Cuộn xuống phần **`Script Properties`**
3. Tìm dòng `AURA_ORDER_COUNTER` — nếu **không có** hoặc **sai** thì click **`Add property`**:
   - Property: `AURA_ORDER_COUNTER`
   - Value: **số lớn nhất hiện có trong cột OrderId** (bỏ chữ `A`, chỉ lấy phần số). Ví dụ nếu thấy `A00017` thì gõ `17`
4. Click **`Save`**
5. Quay lại Sheet, thêm dòng mới vào `orders` → OrderId tiếp theo sẽ đúng (`A00018`)

---

### ❌ Lỗi 3: "Cannot read property 'indexOf' of undefined"

**Nguyên nhân:** Tên sheet hoặc tên cột bị đổi/sai so với `CONFIG` trong script.

**Cách fix:**

1. Mở Apps Script editor → xem **Execution Log** (phía dưới) → tìm dòng báo lỗi — nó sẽ ghi rõ **sheet nào** đang lỗi
2. Mở Google Sheet → check **tên tab** có đúng không (so sánh với `CONFIG.SHEETS` trong file `appscript_code.md`)
3. Mở tab bị lỗi → check **dòng 1** (header row) có đúng tên cột không (so sánh với `CONFIG.COLUMNS`)
4. Tên phải **chính xác từng chữ**, kể cả chữ hoa/thường. Ví dụ: `OrderId` ≠ `orderid`
5. Sửa xong → chạy lại trigger (Save trong Apps Script)

---

### ❌ Lỗi 4: AppSheet không hiện data / báo "No data"

**Nguyên nhân:** AppSheet chưa sync từ Google Sheet, hoặc user chưa có quyền truy cập Sheet.

**Cách fix:**

1. Trong AppSheet editor, click menu **`Data`** → tab từng bảng → kiểm tra **Source** có đúng URL Google Sheet không
2. Click **`Sync`** (icon đồng bộ ở panel preview bên phải) → đợi 30 giây
3. Nếu vẫn "No data":
   - Mở Google Sheet → click **Share** → check email của bạn đã được thêm với quyền **Viewer** hoặc **Editor** chưa
   - Nếu là nhân viên mới: thêm email vào Share với quyền **Editor** → quay lại AppSheet → Sync lại

---

### ❌ Lỗi 5: Đơn mới tạo trong AppSheet không xuất hiện trong Google Sheet (hoặc ngược lại)

**Nguyên nhân:** AppSheet dùng caching, hoặc trigger Apps Script bị tắt.

**Cách fix:**

1. **AppSheet → Sheet bị chậm:**
   - Trong AppSheet preview, click icon **Sync** (đồng bộ) → đợi 1-2 phút
   - AppSheet mặc định sync mỗi 30 giây, nhưng có thể delay nếu mạng chậm
2. **Sheet → AppSheet không thấy data mới:**
   - Mở Apps Script editor → check **Triggers** (đồng hồ ⏰) → đảm bảo 3 trigger vẫn còn (không bị xóa vô tình)
   - Nếu trigger bị xóa → chạy lại hàm `setupTriggers` (là idempotent — chạy nhiều lần không sao)
3. **Vẫn không sync được:**
   - Mở Google Sheet → check kết nối internet
   - Refresh trang (F5) cả Google Sheet và AppSheet
   - Cuối cùng: tắt App → mở lại trên điện thoại

---

## 🎉 Hoàn thành!

Bạn đã có hệ thống Aura Rental chạy trên Google Sheet + AppSheet. Nếu gặp lỗi ngoài 5 case trên, tham khảo thêm ở `docs/formulas/appscript_code.md` (mục Troubleshooting ở cuối file).

**Bước tiếp theo (sau khi deploy xong):**

1. Nhập dữ liệu 120 váy thật vào bảng `dresses`
2. Nhập phụ kiện vào bảng `accessories`
3. Tạo 2-3 đơn hàng mẫu để nhân viên tập thao tác
4. Chạy pilot 1 tuần với 1 nhân viên trước khi rollout toàn shop
5. Review Cash Ledger cuối tuần để đảm bảo số liệu khớp sổ tay

---

**File path:** `/Users/nguyenhien/Hienrrr/Apps/Aura Rental/BUILD_GUIDE.md`
**Tác giả:** Hướng dẫn nội bộ Aura Rental — cập nhật: 2026-06-27