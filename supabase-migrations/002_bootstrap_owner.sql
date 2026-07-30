-- Migration 002: Gán role='owner' cho 1 email cụ thể
--
-- Cách dùng:
--   1. Vào Supabase Dashboard → Authentication → Users → Add user (5 lần)
--   2. Trigger handle_new_user tự tạo profile với role='staff' mặc định
--   3. Đổi email OWNER_EMAIL bên dưới thành email thật của Phuong (owner)
--   4. Chạy file này trong SQL Editor (idempotent — chạy nhiều lần OK)
--
-- Sau migration:
--   - Phuong có role='owner' (full quyền)
--   - 4 staff giữ role='staff' (chỉ chặn DELETE cứng)

-- ============================================================
-- Bootstrap owner
-- ============================================================

do $$
declare
  owner_email text := 'phuong@aura.vn';  -- ← THAY EMAIL PHUONG THẬT VÀO ĐÂY
  owner_count int;
begin
  -- 1. Nếu user đã có profile → update role thành owner
  update public.profiles
    set role = 'owner', updated_at = now()
    where email = owner_email and role <> 'owner';

  get diagnostics owner_count = row_count;
  if owner_count > 0 then
    raise notice '✅ Đã gán role=owner cho % (%)', owner_email, owner_count;
  else
    raise notice '⚠️  Không tìm thấy profile với email % — kiểm tra user đã đăng ký chưa', owner_email;
  end if;
end $$;

-- ============================================================
-- Verify
-- ============================================================
select id, email, display_name, role, created_at
from public.profiles
order by role desc, email;
