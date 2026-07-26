-- Migration: Allow anon role to read/write orders, dresses, accessories
-- Context: Aura Rental app uses anon key (no auth login). Current RLS
-- policies only allow 'authenticated' role, so all writes from the app
-- silently fail (UPDATE returns 0 rows, INSERT returns 42501).
-- This drops the restrictive policies and recreates them for both
-- 'anon' and 'authenticated' roles.

-- ============================================================
-- DROP existing restrictive policies
-- ============================================================
drop policy if exists "Dresses are viewable by authenticated users" on public.dresses;
drop policy if exists "Authenticated users can manage dresses" on public.dresses;
drop policy if exists "Accessories are viewable by authenticated users" on public.accessories;
drop policy if exists "Authenticated users can manage accessories" on public.accessories;
drop policy if exists "Orders are viewable by authenticated users" on public.orders;
drop policy if exists "Authenticated users can manage orders" on public.orders;
drop policy if exists "Order dresses are viewable by authenticated users" on public.order_dresses;
drop policy if exists "Authenticated users can manage order dresses" on public.order_dresses;
drop policy if exists "Order accessories are viewable by authenticated users" on public.order_accessories;
drop policy if exists "Authenticated users can manage order accessories" on public.order_accessories;
drop policy if exists "Payments are viewable by authenticated users" on public.payments;
drop policy if exists "Authenticated users can manage payments" on public.payments;

-- ============================================================
-- RECREATE for both anon + authenticated
-- ============================================================

-- Dresses
create policy "Dresses are viewable by anon and authenticated"
  on public.dresses for select
  to anon, authenticated
  using (deleted_at is null);

create policy "Anon and authenticated users can manage dresses"
  on public.dresses for all
  to anon, authenticated
  using (deleted_at is null);

-- Accessories
create policy "Accessories are viewable by anon and authenticated"
  on public.accessories for select
  to anon, authenticated
  using (deleted_at is null);

create policy "Anon and authenticated users can manage accessories"
  on public.accessories for all
  to anon, authenticated
  using (deleted_at is null);

-- Orders
create policy "Orders are viewable by anon and authenticated"
  on public.orders for select
  to anon, authenticated
  using (deleted_at is null);

create policy "Anon and authenticated users can manage orders"
  on public.orders for all
  to anon, authenticated
  using (deleted_at is null);

-- Order-dress relations
create policy "Order dresses are viewable by anon and authenticated"
  on public.order_dresses for select
  to anon, authenticated
  using (true);

create policy "Anon and authenticated users can manage order dresses"
  on public.order_dresses for all
  to anon, authenticated
  using (true);

-- Order-accessory relations
create policy "Order accessories are viewable by anon and authenticated"
  on public.order_accessories for select
  to anon, authenticated
  using (true);

create policy "Anon and authenticated users can manage order accessories"
  on public.order_accessories for all
  to anon, authenticated
  using (true);

-- Payments
create policy "Payments are viewable by anon and authenticated"
  on public.payments for select
  to anon, authenticated
  using (true);

create policy "Anon and authenticated users can manage payments"
  on public.payments for all
  to anon, authenticated
  using (true);
