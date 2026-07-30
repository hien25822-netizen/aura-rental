# SECURITY — Aura Rental

## 🔐 Triết lý bảo mật

Aura Rental được thiết kế theo 3 nguyên tắc:

1. **Defense in depth** — nhiều lớp bảo vệ chồng lên nhau, không phụ thuộc 1 lớp duy nhất
2. **Least privilege** — user chỉ có quyền tối thiểu cần thiết
3. **Fail safe** — khi có lỗi, mặc định là chặn chứ không cho qua

## 🗝️ Supabase Keys

### Anon Key (PUBLIC)
- Hiển thị công khai trong `index.html`, `booking-form.html`, `supabase-app.js`
- **Không phải lỗ hổng** — đây là pattern chuẩn của Supabase
- Bảo vệ bởi Row Level Security (RLS) — không có policy = không đọc/ghi được
- Ví dụ: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi...`

### Service Role Key (BÍ MẬT — KHÔNG BAO GIỜ ĐẨY LÊN GIT)
- Có full quyền trên database, bypass RLS
- Chỉ dùng cho: migration, reset script, admin tasks
- **Lưu trong `.env` (gitignore)** hoặc password manager
- Lộ = rotate NGAY + check git history (`git log -p -- .env`)
- Lấy từ: Supabase Dashboard → Settings → API → `service_role` (secret)

### Cấu trúc `.env` (KHÔNG commit)
```bash
SUPABASE_URL=https://mmiygzcljqayrfomxkkk.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...  # service_role key, KHÔNG phải anon key
```

## 🛡️ Row Level Security (RLS)

Mọi bảng đều bật RLS. Policy matrix:

| Bảng | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| profiles (auth) | ✅ | trigger | own | ❌ |
| dresses/accessories/orders/payments/bookings (staff) | ✅ | ✅ | ✅ | ❌ |
| dresses/.../payments/bookings (owner) | ✅ | ✅ | ✅ | ✅ |
| bookings (anon customer form) | ❌ | ✅ | ❌ | ❌ |
| booking_dresses / booking_accessories (anon) | ❌ | ✅ | ❌ | ❌ |
| junction tables (auth) | ✅ | ✅ | ✅ | ✅ |

Helper functions:
- `public.current_user_role()` → trả về role của user hiện tại
- `public.is_owner()` → check user có phải owner không

Cả 2 dùng `SECURITY DEFINER` + `STABLE` + `set search_path = public` — chống SQL injection + cache được.

## 🚨 Honeypot (Booking Form)

`booking-form.html` có 1 input ẩn `name="website"` (CSS `position: absolute; left: -9999px`):
- Real user không thấy → không điền
- Bot scan form → fill tất cả input
- Submit handler check `form.website.value !== ''` → silent reject (giả success)

## 🔑 Auth Bootstrap

2 accounts tạo qua Supabase Dashboard → Authentication → Users:
- **1 owner** (Phuong) — quản lý shop
- **1 staff** — share chung cho 3-4 nhân viên dùng chung (1 tài khoản dùng nhiều người)

Workflow:
1. Vào Supabase Dashboard → Authentication → Users → Add user (2 lần, auto-generate password)
2. Copy password ngay → paste vào 1Password/Bitwarden (KHÔNG gửi qua email)
3. Trigger `handle_new_user` tự tạo profile với `role='staff'` mặc định
4. Chạy migration `002_bootstrap_owner.sql` để gán `role='owner'` cho email Phuong
5. Share password staff cho nhân viên qua Signal/Zalo (không qua SMS/email)

**Tại sao 2 account không phải 5?**
- 3-4 staff dùng chung 1 account → đơn giản, không cần quản lý 5 password
- Nếu cần thu hồi quyền 1 người → đổi password staff → người đó không vào được
- Staff vẫn có full CRUD, không xoá cứng được (chỉ owner xoá được)

## 🆘 Nếu Service Role Key bị lộ

1. **Rotate ngay** — Supabase Dashboard → Settings → API → Generate new service_role key
2. **Update `.env`** với key mới
3. **Check git history**:
   ```bash
   git log -p -- .env
   # Nếu thấy key → git filter-branch hoặc BFG Repo-Cleaner
   ```
4. **Đổi tất cả script dùng key cũ**
5. **Audit Supabase logs** xem có hoạt động đáng ngờ không

## 📋 Backup Strategy

Manual weekly backup (xem `BACKUP_GUIDE.md`):
- Chủ nhật hàng tuần: `node --env-file=.env export-all.js`
- Output: `backup-YYYY-MM-DD.json`
- Upload vào Google Drive folder "Aura Rental Backups"
- Giữ 4 tuần gần nhất, xoá cái cũ hơn

## 🧪 Pre-commit Hook (Optional)

Cài `gitleaks` để ngăn commit key:
```bash
brew install gitleaks
# Tạo .gitleaks.toml (custom rules cho Supabase JWT)
# Pre-commit hook tự động scan trước khi commit
```

## 📞 Liên hệ khi có sự cố

Nếu phát hiện lỗ hổng hoặc hoạt động đáng ngờ:
1. Rotate Supabase keys
2. Check `auth.users` xem có user lạ không
3. Check Supabase logs → Logs → API
4. Doc lại incident + report
