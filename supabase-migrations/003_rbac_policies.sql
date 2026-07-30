-- ============================================================
-- Migration 003: RBAC Policies
-- ============================================================
--
-- Thay toàn bộ RLS policies cũ (anon friendly) bằng policies có phân
-- quyền theo role (owner/staff).
--
-- Triết lý:
--   - Staff tin tưởng trong shop, full CRUD mọi bảng
--   - Chỉ chặn DELETE cứng (chỉ owner)
--   - Bookings: anon vẫn được INSERT (customer form public)
--   - Profiles: user update own display_name, owner update role của người khác
--
-- Idempotent — chạy nhiều lần OK.
--
-- Sau migration:
--   1. Chạy file này trong Supabase SQL Editor
--   2. Hard-refresh app
--   3. Test: login owner → xoá váy → OK
--   4. Test: login staff → xoá váy → 403
--
-- ============================================================

-- ============================================================
-- 1. DROP ALL OLD POLICIES (from supabase-rls-setup.sql + 001_anon_rls.sql)
-- ============================================================

-- profiles
drop policy if exists "Anyone can view profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

-- dresses
drop policy if exists "Anyone can view dresses" on public.dresses;
drop policy if exists "Authenticated users can insert dresses" on public.dresses;
drop policy if exists "Authenticated users can update dresses" on public.dresses;
drop policy if exists "Authenticated users can delete dresses" on public.dresses;
drop policy if exists "Dresses are viewable by anon and authenticated" on public.dresses;
drop policy if exists "Anon and authenticated users can manage dresses" on public.dresses;

-- accessories
drop policy if exists "Anyone can view accessories" on public.accessories;
drop policy if exists "Authenticated users can insert accessories" on public.accessories;
drop policy if exists "Authenticated users can update accessories" on public.accessories;
drop policy if exists "Authenticated users can delete accessories" on public.accessories;
drop policy if exists "Accessories are viewable by anon and authenticated" on public.accessories;
drop policy if exists "Anon and authenticated users can manage accessories" on public.accessories;

-- orders
drop policy if exists "Anyone can view orders" on public.orders;
drop policy if exists "Authenticated users can insert orders" on public.orders;
drop policy if exists "Authenticated users can update orders" on public.orders;
drop policy if exists "Authenticated users can delete orders" on public.orders;
drop policy if exists "Orders are viewable by anon and authenticated" on public.orders;
drop policy if exists "Anon and authenticated users can manage orders" on public.orders;

-- order_dresses
drop policy if exists "Anyone can view order dresses" on public.order_dresses;
drop policy if exists "Authenticated users can manage order dresses" on public.order_dresses;
drop policy if exists "Order dresses are viewable by anon and authenticated" on public.order_dresses;
drop policy if exists "Anon and authenticated users can manage order dresses" on public.order_dresses;

-- order_accessories
drop policy if exists "Anyone can view order accessories" on public.order_accessories;
drop policy if exists "Authenticated users can manage order accessories" on public.order_accessories;
drop policy if exists "Order accessories are viewable by anon and authenticated" on public.order_accessories;
drop policy if exists "Anon and authenticated users can manage order accessories" on public.order_accessories;

-- payments
drop policy if exists "Anyone can view payments" on public.payments;
drop policy if exists "Authenticated users can manage payments" on public.payments;
drop policy if exists "Payments are viewable by anon and authenticated" on public.payments;
drop policy if exists "Anon and authenticated users can manage payments" on public.payments;

-- bookings
drop policy if exists "Anyone can view bookings" on public.bookings;
drop policy if exists "Anyone can insert bookings" on public.bookings;
drop policy if exists "Authenticated users can update bookings" on public.bookings;
drop policy if exists "Authenticated users can delete bookings" on public.bookings;

-- booking_dresses
drop policy if exists "Anyone can view booking dresses" on public.booking_dresses;
drop policy if exists "Authenticated users can manage booking dresses" on public.booking_dresses;

-- booking_accessories
drop policy if exists "Anyone can view booking accessories" on public.booking_accessories;
drop policy if exists "Authenticated users to manage booking accessories" on public.booking_accessories;


-- ============================================================
-- 2. HELPER FUNCTIONS (security definer, stable)
-- ============================================================

-- Trả về role của current user
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Check có phải owner không
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'owner' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- 3. PROFILES POLICIES
-- ============================================================

-- SELECT: authenticated (cần để load display_name)
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

-- UPDATE OWN profile (chỉ đổi display_name của mình)
-- Owner có thể update role của người khác (dùng policy thứ 2)
create policy "Users can update own display_name"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT: tự động qua trigger, không cần policy (SECURITY DEFINER bypass)

-- ============================================================
-- 4. DRESSES POLICIES
-- ============================================================

-- SELECT: authenticated (bỏ qua deleted)
create policy "Authenticated users can view dresses"
  on public.dresses for select
  to authenticated
  using (deleted_at is null);

-- INSERT: authenticated (cả owner + staff)
create policy "Authenticated users can insert dresses"
  on public.dresses for insert
  to authenticated
  with check (auth.uid() is not null);

-- UPDATE: authenticated
create policy "Authenticated users can update dresses"
  on public.dresses for update
  to authenticated
  using (deleted_at is null);

-- DELETE: chỉ owner (chặn hard-delete)
create policy "Only owner can hard-delete dresses"
  on public.dresses for delete
  to authenticated
  using (public.is_owner());

-- ============================================================
-- 5. ACCESSORIES POLICIES
-- ============================================================

create policy "Authenticated users can view accessories"
  on public.accessories for select
  to authenticated
  using (deleted_at is null);

create policy "Authenticated users can insert accessories"
  on public.accessories for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "Authenticated users can update accessories"
  on public.accessories for update
  to authenticated
  using (deleted_at is null);

create policy "Only owner can hard-delete accessories"
  on public.accessories for delete
  to authenticated
  using (public.is_owner());

-- ============================================================
-- 6. ORDERS POLICIES
-- ============================================================

create policy "Authenticated users can view orders"
  on public.orders for select
  to authenticated
  using (deleted_at is null);

create policy "Authenticated users can insert orders"
  on public.orders for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "Authenticated users can update orders"
  on public.orders for update
  to authenticated
  using (deleted_at is null);

create policy "Only owner can hard-delete orders"
  on public.orders for delete
  to authenticated
  using (public.is_owner());

-- ============================================================
-- 7. ORDER_DRESSES POLICIES
-- ============================================================

-- SELECT: không cần (theo order), nhưng để cho query tiện
create policy "Authenticated users can view order_dresses"
  on public.order_dresses for select
  to authenticated
  using (true);

-- ALL: authenticated
create policy "Authenticated users can manage order_dresses"
  on public.order_dresses for all
  to authenticated
  using (auth.uid() is not null);

-- ============================================================
-- 8. ORDER_ACCESSORIES POLICIES
-- ============================================================

create policy "Authenticated users can view order_accessories"
  on public.order_accessories for select
  to authenticated
  using (true);

create policy "Authenticated users can manage order_accessories"
  on public.order_accessories for all
  to authenticated
  using (auth.uid() is not null);

-- ============================================================
-- 9. PAYMENTS POLICIES
-- ============================================================

create policy "Authenticated users can view payments"
  on public.payments for select
  to authenticated
  using (true);

create policy "Authenticated users can insert payments"
  on public.payments for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "Authenticated users can update payments"
  on public.payments for update
  to authenticated
  using (true);

create policy "Only owner can hard-delete payments"
  on public.payments for delete
  to authenticated
  using (public.is_owner());

-- ============================================================
-- 10. BOOKINGS POLICIES (Customer form public, internal data private)
-- ============================================================

-- INSERT: anon + authenticated (customer không cần login)
create policy "Anyone can insert bookings"
  on public.bookings for insert
  to anon, authenticated
  with check (true);

-- SELECT: authenticated only
create policy "Authenticated users can view bookings"
  on public.bookings for select
  to authenticated
  using (true);

-- UPDATE: authenticated (staff chuyển status)
create policy "Authenticated users can update bookings"
  on public.bookings for update
  to authenticated
  using (auth.uid() is not null);

-- DELETE: chỉ owner
create policy "Only owner can hard-delete bookings"
  on public.bookings for delete
  to authenticated
  using (public.is_owner());

-- ============================================================
-- 11. BOOKING_DRESSES + BOOKING_ACCESSORIES (junction cho booking form)
-- ============================================================

create policy "Authenticated users can view booking_dresses"
  on public.booking_dresses for select
  to authenticated
  using (true);

create policy "Anyone can insert booking_dresses"
  on public.booking_dresses for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated users can manage booking_dresses"
  on public.booking_dresses for all
  to authenticated
  using (auth.uid() is not null);

create policy "Authenticated users can view booking_accessories"
  on public.booking_accessories for select
  to authenticated
  using (true);

create policy "Anyone can insert booking_accessories"
  on public.booking_accessories for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated users can manage booking_accessories"
  on public.booking_accessories for all
  to authenticated
  using (auth.uid() is not null);

-- ============================================================
-- VERIFY
-- ============================================================

-- Đếm policy mới tạo
select schemaname, tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by schemaname, tablename
order by tablename;

-- Verify helper functions
select public.is_owner() as am_i_owner, public.current_user_role() as my_role;
