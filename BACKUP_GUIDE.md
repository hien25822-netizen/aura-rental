# Backup Guide — Aura Rental

## 🎯 Mục tiêu
- Dump toàn bộ data Supabase ra JSON mỗi tuần
- Lưu vào Google Drive, giữ 4 tuần gần nhất
- Phục hồi nhanh khi cần (disaster recovery)

## 📋 Bước 1 — Chuẩn bị

### 1.1. Tạo file `.env` (nếu chưa có)
Tạo file `.env` cùng thư mục với project:
```bash
SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...  # service_role key
```
Lấy `service_role` key từ: Supabase Dashboard → Settings → API → `service_role` (secret).

⚠️ **KHÔNG commit `.env` vào git.** Verify `.env` đã có trong `.gitignore`.

### 1.2. Tạo folder Google Drive
- Mở Google Drive → New Folder → "Aura Rental Backups"
- Share với chính mình (nếu dùng personal account)

## 🚀 Bước 2 — Export (chạy mỗi Chủ nhật)

```bash
cd "/Users/nguyenhien/Hienrrr/Apps/Aura Rental"
node --env-file=.env export-all.js
```

Output:
```
🔗 Supabase: https://mmiygzcljqayrfomxkkk.supabase.co
📦 Exporting...

   dresses                  45 row
   accessories              18 row
   orders                  312 row
   order_dresses           480 row
   order_accessories        92 row
   payments                310 row
   bookings                 24 row
   booking_dresses          24 row
   booking_accessories       8 row

✅ Đã ghi 1313 row → backup-2026-08-03.json (412.5 KB)
```

## 📤 Bước 3 — Upload lên Google Drive

1. Mở folder "Aura Rental Backups"
2. Kéo thả file `backup-2026-08-03.json` vào
3. Đổi tên file (nếu muốn) để sort theo ngày

## 🗑 Bước 4 — Dọn file cũ
- Giữ 4 tuần gần nhất (4 file mới nhất)
- Xoá các file cũ hơn 1 tháng

## 🔄 Bước 5 — Restore (khi cần disaster recovery)

### 5.1. CẢNH BÁO
**`import-all.js` GHI ĐÈ dữ liệu hiện tại.** Chạy sai → mất data mới nhất!

### 5.2. Workflow
```bash
# 1. Verify file backup còn nguyên
ls -la backup-2026-08-03.json

# 2. Dry-run trước (chỉ đếm, không ghi)
node --env-file=.env import-all.js --file backup-2026-08-03.json --dry-run

# 3. Nếu OK → restore thật
node --env-file=.env import-all.js --file backup-2026-08-03.json
```

### 5.3. Verify
1. Mở web app
2. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
3. Check calendar + đơn + váy + phụ kiện hiển thị đúng
4. Cross-check 1-2 đơn quan trọng

## 🧪 Disaster Drill (chạy 1 lần/năm)

Mục đích: verify backup không bị hỏng, restore flow hoạt động.

```bash
# 1. Tạo project Supabase test (free tier)
# 2. Tạo schema mới (chạy supabase-schema.sql)
# 3. Export từ prod → import vào test
node --env-file=.env.prod export-all.js --out test-backup.json
SUPABASE_URL=https://test-project.supabase.co \
SUPABASE_SERVICE_KEY=eyJhbG... \
node import-all.js --file test-backup.json --dry-run

# 4. So sánh row count
# 5. Nếu khớp → backup OK
```

## 📅 Lịch backup đề xuất

| Tần suất | Ngày | Hành động |
|---|---|---|
| Hàng tuần | Chủ nhật | Export + upload Drive |
| Hàng tháng | Ngày 1 | Verify folder Drive, xoá file cũ |
| Hàng năm | Tháng 1 | Disaster drill với project test |

## 🆘 Troubleshooting

### `❌ Thiếu SUPABASE_SERVICE_KEY`
→ File `.env` không có hoặc không đúng tên field. Check `SUPABASE_SERVICE_KEY=...` (không phải `SUPABASE_ANON_KEY`).

### `❌ count2 orders: 401`
→ Service role key sai. Lấy lại từ Supabase Dashboard.

### `❌ FK constraint violation khi restore`
→ File backup quá cũ, schema đã thay đổi. Cần dùng backup mới hơn.

### Restore xong nhưng web không hiển thị
→ Hard refresh (Ctrl+Shift+R). Service worker có thể cache localStorage cũ.

## 🔐 Bảo mật

- `.env` chứa service_role key → KHÔNG commit, KHÔNG share
- File backup chứa data khách hàng (tên, SĐT) → KHÔNG share public
- Google Drive folder → chỉ share với chính mình hoặc team owner

## 📞 Liên hệ

Nếu cần hỗ trợ → ping Phuong hoặc check `SECURITY.md`.