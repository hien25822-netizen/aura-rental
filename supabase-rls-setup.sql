-- ============================================================
-- AURA RENTAL — RLS Setup (Development Mode)
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.dresses enable row level security;
alter table public.accessories enable row level security;
alter table public.orders enable row level security;
alter table public.order_dresses enable row level security;
alter table public.order_accessories enable row level security;
alter table public.payments enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_dresses enable row level security;
alter table public.booking_accessories enable row level security;

-- ============================================================
-- HELPER: Drop existing policies (for clean re-run)
-- ============================================================

-- Drop all existing policies (they'll be recreated below)
drop policy if exists "Anyone can view profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Anyone can view dresses" on public.dresses;
drop policy if exists "Authenticated users can insert dresses" on public.dresses;
drop policy if exists "Authenticated users can update dresses" on public.dresses;
drop policy if exists "Authenticated users can delete dresses" on public.dresses;
drop policy if exists "Anyone can view accessories" on public.accessories;
drop policy if exists "Authenticated users can insert accessories" on public.accessories;
drop policy if exists "Authenticated users can update accessories" on public.accessories;
drop policy if exists "Authenticated users can delete accessories" on public.accessories;
drop policy if exists "Anyone can view orders" on public.orders;
drop policy if exists "Authenticated users can insert orders" on public.orders;
drop policy if exists "Authenticated users can update orders" on public.orders;
drop policy if exists "Authenticated users can delete orders" on public.orders;
drop policy if exists "Anyone can view order dresses" on public.order_dresses;
drop policy if exists "Authenticated users can manage order dresses" on public.order_dresses;
drop policy if exists "Anyone can view order accessories" on public.order_accessories;
drop policy if exists "Authenticated users can manage order accessories" on public.order_accessories;
drop policy if exists "Anyone can view payments" on public.payments;
drop policy if exists "Authenticated users can manage payments" on public.payments;
drop policy if exists "Anyone can view bookings" on public.bookings;
drop policy if exists "Anyone can insert bookings" on public.bookings;
drop policy if exists "Authenticated users can update bookings" on public.bookings;
drop policy if exists "Authenticated users can delete bookings" on public.bookings;
drop policy if exists "Anyone can view booking dresses" on public.booking_dresses;
drop policy if exists "Authenticated users can manage booking dresses" on public.booking_dresses;
drop policy if exists "Anyone can view booking accessories" on public.booking_accessories;
drop policy if exists "Authenticated users can manage booking accessories" on public.booking_accessories;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

create policy "Anyone can view profiles"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================
-- DRESSES POLICIES
-- ============================================================

create policy "Anyone can view dresses"
  on public.dresses for select
  using (deleted_at is null);

create policy "Authenticated users can insert dresses"
  on public.dresses for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update dresses"
  on public.dresses for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete dresses"
  on public.dresses for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- ACCESSORIES POLICIES
-- ============================================================

create policy "Anyone can view accessories"
  on public.accessories for select
  using (deleted_at is null);

create policy "Authenticated users can insert accessories"
  on public.accessories for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update accessories"
  on public.accessories for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete accessories"
  on public.accessories for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- ORDERS POLICIES
-- ============================================================

create policy "Anyone can view orders"
  on public.orders for select
  using (deleted_at is null);

create policy "Authenticated users can insert orders"
  on public.orders for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update orders"
  on public.orders for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete orders"
  on public.orders for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- ORDER_DRESSES POLICIES
-- ============================================================

create policy "Anyone can view order dresses"
  on public.order_dresses for select
  using (true);

create policy "Authenticated users can manage order dresses"
  on public.order_dresses for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- ORDER_ACCESSORIES POLICIES
-- ============================================================

create policy "Anyone can view order accessories"
  on public.order_accessories for select
  using (true);

create policy "Authenticated users can manage order accessories"
  on public.order_accessories for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- PAYMENTS POLICIES
-- ============================================================

create policy "Anyone can view payments"
  on public.payments for select
  using (true);

create policy "Authenticated users can manage payments"
  on public.payments for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- BOOKINGS POLICIES
-- ============================================================

create policy "Anyone can view bookings"
  on public.bookings for select
  using (true);

create policy "Anyone can insert bookings"
  on public.bookings for insert
  with check (true);

create policy "Authenticated users can update bookings"
  on public.bookings for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete bookings"
  on public.bookings for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- BOOKING_DRESSES POLICIES
-- ============================================================

create policy "Anyone can view booking dresses"
  on public.booking_dresses for select
  using (true);

create policy "Authenticated users can manage booking dresses"
  on public.booking_dresses for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- BOOKING_ACCESSORIES POLICIES
-- ============================================================

create policy "Anyone can view booking accessories"
  on public.booking_accessories for select
  using (true);

create policy "Authenticated users to manage booking accessories"
  on public.booking_accessories for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- VERIFY SETUP
-- ============================================================
select 'RLS Policies setup successfully!' as status;
