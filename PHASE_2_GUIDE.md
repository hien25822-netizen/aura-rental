# Phase 2 — Chạy RLS RBAC Migration

## 🎯 Mục tiêu
- Thay toàn bộ policy cũ (cho cả anon + authenticated full quyền) → policies phân quyền theo role
- Staff có full CRUD trừ hard-delete
- Chỉ owner mới DELETE cứng

## 📋 Bước 1 — Chuẩn bị trước khi chạy

### 1.1. Xác nhận đã tạo 2 users
Vào Supabase Dashboard → Authentication → Users. Cần thấy:
- 1 owner (email Phuong, ví dụ `phuong@aura.vn`)
- 1 staff (email bất kỳ — share chung cho 3-4 nhân viên)

Nếu chưa tạo → vào Add user → auto-generate password → copy password → paste vào password manager.

### 1.2. Đã chạy `002_bootstrap_owner.sql` chưa?
Nếu chưa → làm theo `PHASE_2_GUIDE.md` (mục "Bước tiếp — Gán owner cho Phuong") trước khi tiếp tục.

### 1.3. Verify owner đã có role='owner'
Vào Supabase SQL Editor, chạy:
```sql
select email, role, created_at
from public.profiles
order by role desc, email;
```
Phải thấy:
- 1 row với role='owner' (email của Phuong)
- 1 row với role='staff' (account share cho nhân viên)

## 🚀 Bước 2 — Chạy migration RBAC

### 2.1. Mở Supabase SQL Editor
- Vào https://supabase.com/dashboard/project/mmiygzcljqayrfomxkkk/sql/new

### 2.2. Paste nội dung file `supabase-migrations/003_rbac_policies.sql`
- Mở file đó trong editor
- Ctrl+A → Ctrl+C
- Paste vào SQL Editor
- Click **Run** (hoặc Ctrl+Enter)

### 2.3. Kết quả mong đợi
- Phần "Success. No rows returned" (cho các drop/create)
- Ở cuối có 2 bảng:
  - Bảng `policy_count`: ~28-30 policy trên 10 bảng
  - Bảng `verify`: `am_i_owner=true, my_role='owner'` (nếu đang login owner)

⚠️ **Nếu lỗi "policy already exists"**: Mở `003_rbac_policies.sql`, paste lại, run lại — idempotent.

⚠️ **Nếu lỗi "function already exists"**: Bình thường — `create or replace` đã có sẵn.

⚠️ **Nếu lỗi permission "must be owner of table"**: Bình thường — bỏ qua, Supabase tự xử lý.

## 🧪 Bước 3 — Test trên SQL Editor

### 3.1. Test owner có thể DELETE
```sql
-- Test owner role
select public.is_owner() as am_i_owner;
-- Expect: am_i_owner = true

-- Check policy count
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;
-- Expect: 10 tables, mỗi bảng 2-4 policy
```

### 3.2. Test staff bị chặn DELETE
```sql
-- Switch sang staff role bằng cách set JWT claims giả
set request.jwt.claim.sub to '<staff-uuid>';  -- thay UUID staff thật

-- Thử DELETE
delete from dresses where id = (select id from dresses limit 1);
-- Expect: ERROR 42501 (insufficient_privilege) hoặc row count = 0
```

### 3.3. Reset lại owner role
```sql
reset request.jwt.claim.sub;
```

## 🌐 Bước 4 — Test trên web app

### 4.1. Hard refresh
- Vào https://aura-rental-app.vercel.app (hoặc domain hiện tại)
- Ctrl+Shift+R (hoặc Cmd+Shift+R trên Mac)
- Đăng nhập lại

### 4.2. Test owner có thể xoá váy
1. Login bằng account owner (Phuong)
2. Vào tab "Váy"
3. Click xoá 1 váy bất kỳ → confirm
4. Váy biến mất → ✅ OK

### 4.3. Test staff bị chặn xoá
1. Logout
2. Login bằng account staff
3. Vào tab "Váy"
4. Click xoá 1 váy → confirm
5. Toast đỏ: "Không có quyền xoá" hoặc "Lỗi 403" → ✅ OK

### 4.4. Test staff CRUD vẫn hoạt động
1. Staff thêm 1 váy mới → ✅ OK
2. Staff sửa tên váy → ✅ OK
3. Staff tạo đơn hàng → ✅ OK
4. Staff sửa đơn → ✅ OK

## 🛟 Rollback (nếu có sự cố)

Nếu migration làm app lỗi, rollback bằng cách:

### Cách 1 — Drop toàn bộ policies
```sql
-- Drop tất cả policy hiện tại
do $$
declare
  r record;
begin
  for r in (select schemaname, tablename, policyname from pg_policies where schemaname = 'public') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Sau đó chạy lại file cũ: supabase-rls-setup.sql (cho authenticated-only)
```

### Cách 2 — Restore từ `001_anon_rls.sql` (full quyền cho anon)
```sql
-- Chạy lại file 001_anon_rls.sql để có policy cũ (anon full quyền)
```

## ✅ Done!
Sau khi test OK, Phase 2 hoàn thành. Tiếp tục Phase 3 (bảo mật bổ sung) hoặc Phase 4 (realtime cleanup) theo plan.
